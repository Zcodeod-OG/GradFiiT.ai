"""Affiliate URL rewriter.

Given a raw retailer URL (e.g. the H&M product page the Chrome
extension captured), return an equivalent URL that attributes the
traffic to our affiliate account. The rewriter is intentionally simple
for launch -- it does tag injection on Amazon and EarnKaro-style
deep-link wrapping for Indian fashion aggregators. Deeper network
integrations (CJ/Awin REST APIs, Rakuten, Impact) can slot in later as
new `MerchantRule` entries without changing any callers.

Design goals:

* **Deterministic** -- no external HTTP calls in the hot path. Every
  rewrite is a pure string operation, so latency stays under 1ms per
  click. Network-based link generation (e.g. Awin's `createLink` API)
  can be layered in front of this service later with a cache.
* **Graceful fallback** -- if we don't recognise the merchant or the
  network env vars are missing, we return the original URL unchanged
  with `network="direct"`, `commission_rate=0`. The user still gets a
  "Buy this" button; we just don't earn on that click.
* **Attribution-friendly** -- every rewritten URL carries our
  `AFFILIATE_GENERIC_SUBID` so we can reconcile conversions back to
  GradFiT in the network's dashboard.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AffiliateLink:
    original_url: str
    affiliate_url: str
    merchant: str
    network: str  # "amazon_us" | "amazon_in" | "earnkaro" | "cuelinks" | "direct"
    commission_rate_pct: Optional[float]  # rough ballpark, not a contract
    disclosure_text: str


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


def _replace_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    # Keep existing query params but overwrite ours. `keep_blank_values`
    # so we don't accidentally strip retailer-required flags.
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params[key] = value
    new_query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def _host_matches(host: str, suffix: str) -> bool:
    host = host.lower().lstrip(".")
    suffix = suffix.lower().lstrip(".")
    return host == suffix or host.endswith("." + suffix)


# ──────────────────────────────────────────────────────────────────────
# Merchant-specific rewriters
# ──────────────────────────────────────────────────────────────────────


def _rewrite_amazon(url: str, parsed_host: str) -> Optional[AffiliateLink]:
    """Amazon Associates uses simple `?tag=` injection."""
    if _host_matches(parsed_host, "amazon.com"):
        tag = (settings.AFFILIATE_AMAZON_US_TAG or "").strip()
        network = "amazon_us"
    elif _host_matches(parsed_host, "amazon.in"):
        tag = (settings.AFFILIATE_AMAZON_IN_TAG or "").strip()
        network = "amazon_in"
    elif _host_matches(parsed_host, "amazon.co.uk"):
        tag = (settings.AFFILIATE_AMAZON_UK_TAG or "").strip()
        network = "amazon_uk"
    else:
        return None

    if not tag:
        return None

    rewritten = _replace_query_param(url, "tag", tag)
    return AffiliateLink(
        original_url=url,
        affiliate_url=rewritten,
        merchant="Amazon",
        network=network,
        commission_rate_pct=4.5,  # Fashion category, midpoint estimate
        disclosure_text=settings.AFFILIATE_DISCLOSURE_TEXT,
    )


def _rewrite_earnkaro(url: str, merchant_label: str) -> Optional[AffiliateLink]:
    """Wrap an Indian retailer URL in EarnKaro's deep-link redirector.

    EarnKaro expects `https://ekaro.in/enkr2020/?url=<encoded>&ref=<token>`.
    When no token is configured we bail out and let the caller return
    the URL as `network=direct` (still functional, no commission).
    """
    token = (settings.AFFILIATE_EARNKARO_TOKEN or "").strip()
    if not token:
        return None
    from urllib.parse import quote

    wrapped = (
        "https://ekaro.in/enkr2020/?url="
        + quote(url, safe="")
        + f"&ref={token}"
        + f"&subid={settings.AFFILIATE_GENERIC_SUBID or 'gradfit'}"
    )
    return AffiliateLink(
        original_url=url,
        affiliate_url=wrapped,
        merchant=merchant_label,
        network="earnkaro",
        commission_rate_pct=7.0,
        disclosure_text=settings.AFFILIATE_DISCLOSURE_TEXT,
    )


def _rewrite_cuelinks(url: str, merchant_label: str) -> Optional[AffiliateLink]:
    """Fallback wrapper for any supported retailer via CueLinks."""
    cid = (settings.AFFILIATE_CUELINKS_CID or "").strip()
    if not cid:
        return None
    from urllib.parse import quote

    wrapped = (
        f"https://linksredirect.com/?cid={cid}"
        + f"&source={settings.AFFILIATE_GENERIC_SUBID or 'gradfit'}"
        + "&url="
        + quote(url, safe="")
    )
    return AffiliateLink(
        original_url=url,
        affiliate_url=wrapped,
        merchant=merchant_label,
        network="cuelinks",
        commission_rate_pct=5.0,
        disclosure_text=settings.AFFILIATE_DISCLOSURE_TEXT,
    )


# Merchant table. Each entry is (matcher, label, rewriter). The first
# matching rewriter that returns a link wins. Rewriters returning None
# fall through to the next entry (e.g. missing env token falls through
# to CueLinks which falls through to `direct`).
@dataclass(frozen=True)
class MerchantRule:
    host_suffix: str
    label: str
    rewrite: Callable[[str, str], Optional[AffiliateLink]]


def _ek(label: str) -> Callable[[str, str], Optional[AffiliateLink]]:
    def _inner(url: str, _host: str) -> Optional[AffiliateLink]:
        return _rewrite_earnkaro(url, label)

    return _inner


def _cl(label: str) -> Callable[[str, str], Optional[AffiliateLink]]:
    def _inner(url: str, _host: str) -> Optional[AffiliateLink]:
        return _rewrite_cuelinks(url, label)

    return _inner


MERCHANT_RULES: list[MerchantRule] = [
    # Global marketplaces
    MerchantRule("amazon.com", "Amazon", _rewrite_amazon),
    MerchantRule("amazon.in", "Amazon India", _rewrite_amazon),
    MerchantRule("amazon.co.uk", "Amazon UK", _rewrite_amazon),
    # India-focused fashion (EarnKaro first, CueLinks fallback)
    MerchantRule("myntra.com", "Myntra", _ek("Myntra")),
    MerchantRule("ajio.com", "AJIO", _ek("AJIO")),
    MerchantRule("nykaa.com", "Nykaa", _ek("Nykaa")),
    MerchantRule("nykaafashion.com", "Nykaa Fashion", _ek("Nykaa Fashion")),
    MerchantRule("flipkart.com", "Flipkart", _ek("Flipkart")),
    MerchantRule("meesho.com", "Meesho", _cl("Meesho")),
    MerchantRule("tatacliq.com", "Tata CLiQ", _cl("Tata CLiQ")),
    # Global fashion (CueLinks as a safe default, can upgrade to CJ/Awin later)
    MerchantRule("hm.com", "H&M", _cl("H&M")),
    MerchantRule("zara.com", "Zara", _cl("Zara")),
    MerchantRule("asos.com", "ASOS", _cl("ASOS")),
    MerchantRule("nike.com", "Nike", _cl("Nike")),
    MerchantRule("adidas.com", "Adidas", _cl("Adidas")),
    MerchantRule("uniqlo.com", "Uniqlo", _cl("Uniqlo")),
    MerchantRule("shein.com", "SHEIN", _cl("SHEIN")),
    MerchantRule("levi.com", "Levi's", _cl("Levi's")),
    MerchantRule("mango.com", "Mango", _cl("Mango")),
]


# ──────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────


def detect_merchant(url: str) -> Optional[str]:
    """Return the human-readable merchant label (or None)."""
    if not url:
        return None
    host = (urlparse(url).netloc or "").lower()
    if not host:
        return None
    for rule in MERCHANT_RULES:
        if _host_matches(host, rule.host_suffix):
            return rule.label
    return None


def rewrite_to_affiliate(url: Optional[str]) -> AffiliateLink:
    """Core entry point. Always returns a link; falls back to the
    original URL (network=direct) when rewriting isn't possible."""
    original = (url or "").strip()
    if not original.startswith(("http://", "https://")):
        # Return a direct link with the raw URL even if malformed -- the
        # frontend will render the button disabled for empty/invalid
        # source URLs.
        return AffiliateLink(
            original_url=original,
            affiliate_url=original,
            merchant=detect_merchant(original) or "Retailer",
            network="direct",
            commission_rate_pct=0.0,
            disclosure_text=settings.AFFILIATE_DISCLOSURE_TEXT,
        )

    host = (urlparse(original).netloc or "").lower()
    for rule in MERCHANT_RULES:
        if _host_matches(host, rule.host_suffix):
            try:
                link = rule.rewrite(original, host)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "Affiliate rewrite failed for %s (%s): %s",
                    rule.label,
                    host,
                    exc,
                )
                link = None
            if link:
                return link
            # Rule matched but no token configured; keep scanning for a
            # generic fallback (CueLinks) before giving up.

    # Generic CueLinks fallback for known fashion-adjacent hosts we
    # didn't enumerate, when CueLinks is configured.
    merchant_label = detect_merchant(original) or "Retailer"
    cl_link = _rewrite_cuelinks(original, merchant_label)
    if cl_link:
        return cl_link

    return AffiliateLink(
        original_url=original,
        affiliate_url=original,
        merchant=merchant_label,
        network="direct",
        commission_rate_pct=0.0,
        disclosure_text=settings.AFFILIATE_DISCLOSURE_TEXT,
    )


def supported_networks_summary() -> dict:
    """Used by the admin UI / diagnostics endpoint."""
    return {
        "amazon_us_configured": bool(settings.AFFILIATE_AMAZON_US_TAG),
        "amazon_in_configured": bool(settings.AFFILIATE_AMAZON_IN_TAG),
        "amazon_uk_configured": bool(settings.AFFILIATE_AMAZON_UK_TAG),
        "earnkaro_configured": bool(settings.AFFILIATE_EARNKARO_TOKEN),
        "cuelinks_configured": bool(settings.AFFILIATE_CUELINKS_CID),
    }
