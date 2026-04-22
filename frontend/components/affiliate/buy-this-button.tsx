"use client"

import { useEffect, useState } from "react"
import { ExternalLink, Loader2, ShoppingBag, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { affiliateApi, type AffiliateLinkPayload } from "@/lib/api"

type Variant = "inline" | "card"

type Props = {
  garmentId?: number
  tryonId?: number
  /** When garmentId is absent, pass the raw retailer URL directly. */
  sourceUrl?: string | null
  variant?: Variant
  className?: string
  /** Hide the button entirely when there's no retailer URL to link to. */
  hideWhenNoSource?: boolean
}

// Renders the "Buy this" affiliate CTA shown on every try-on result.
// Behaviour:
//   1. On mount, resolves the affiliate URL (GET /api/affiliate/resolve).
//      This is a cheap lookup that tells us the merchant label + whether
//      a commission exists, so we can render nice UX before the click.
//   2. On click, logs the click via POST /api/affiliate/click (for
//      attribution) and opens the returned URL in a new tab.
//   3. Always shows the FTC-required disclosure copy the backend returns.
export function BuyThisButton({
  garmentId,
  tryonId,
  sourceUrl,
  variant = "inline",
  className,
  hideWhenNoSource = false,
}: Props) {
  const [link, setLink] = useState<AffiliateLinkPayload | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isOpening, setIsOpening] = useState(false)

  useEffect(() => {
    let mounted = true
    const resolve = async () => {
      if (!garmentId && !sourceUrl) {
        if (mounted) setLink(null)
        return
      }
      try {
        setIsResolving(true)
        if (garmentId) {
          const res = await affiliateApi.resolve(garmentId)
          if (mounted) setLink(res.data.link)
        } else if (sourceUrl) {
          // No server round-trip when we only have a raw URL: we'll
          // resolve + log together on click.
          if (mounted) {
            setLink({
              original_url: sourceUrl,
              affiliate_url: sourceUrl,
              merchant: hostnameOf(sourceUrl),
              network: "direct",
              commission_rate_pct: null,
              disclosure_text: "",
              has_commission: false,
            })
          }
        }
      } catch {
        if (mounted) setLink(null)
      } finally {
        if (mounted) setIsResolving(false)
      }
    }
    void resolve()
    return () => {
      mounted = false
    }
  }, [garmentId, sourceUrl])

  const hasUrl = Boolean(link?.original_url)
  if (!hasUrl && hideWhenNoSource) return null

  const handleClick = async () => {
    try {
      setIsOpening(true)
      const res = await affiliateApi.click({
        garment_id: garmentId,
        tryon_id: tryonId,
        url: garmentId ? undefined : sourceUrl || undefined,
      })
      const url = res.data.link.affiliate_url
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer")
      }
    } catch {
      // Fallback: open whatever we resolved, even if logging failed.
      if (link?.affiliate_url) {
        window.open(link.affiliate_url, "_blank", "noopener,noreferrer")
      }
    } finally {
      setIsOpening(false)
    }
  }

  if (variant === "card") {
    return (
      <div
        className={`surface-panel rounded-2xl border border-border p-5 space-y-3 ${className || ""}`}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Love the fit?
        </div>
        <div>
          <p className="font-display text-lg font-semibold leading-tight">
            Buy this from{" "}
            <span className="text-gradient">
              {link?.merchant || "the retailer"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Opens in a new tab. {link?.disclosure_text || ""}
          </p>
        </div>
        <Button
          onClick={handleClick}
          disabled={!hasUrl || isResolving || isOpening}
          size="lg"
          className="w-full pulse-glow"
        >
          {isOpening ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : (
            <ShoppingBag className="size-4 mr-2" />
          )}
          Buy this
          <ExternalLink className="size-3.5 ml-2 opacity-70" />
        </Button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className || ""}`}>
      <Button
        onClick={handleClick}
        disabled={!hasUrl || isResolving || isOpening}
        variant="default"
        size="sm"
        className="w-fit"
      >
        {isOpening ? (
          <Loader2 className="size-3.5 animate-spin mr-2" />
        ) : (
          <ShoppingBag className="size-3.5 mr-2" />
        )}
        Buy this{link?.merchant ? ` on ${link.merchant}` : ""}
        <ExternalLink className="size-3 ml-1.5 opacity-70" />
      </Button>
      {link?.disclosure_text && (
        <p className="text-[10px] text-muted-foreground leading-snug max-w-xs">
          {link.disclosure_text}
        </p>
      )}
    </div>
  )
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "Retailer"
  }
}
