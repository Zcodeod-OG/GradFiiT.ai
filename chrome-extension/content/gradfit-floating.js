/* GradFiT floating "Try with my photo" launcher.
 *
 * Mount-on-demand content-script module. It does NOT auto-mount on page
 * load (by user request - the always-on bottom-right logo was distracting).
 * Instead:
 *   - The extension popup's "Try this page" button sends a
 *     `gradfitTryThisPage` runtime message, which is the only trigger that
 *     mounts the shadow-DOM host + drawer on the active tab.
 *   - Closing the drawer with the x button tears the host back down so the
 *     page stays clean when the user isn't actively doing a try-on.
 *
 * Uses the real `/api/tryon/generate` pipeline with `quality: 'fast'`
 * (Fashn.ai v1.6 performance mode) so Quick Try shows the actual try-on
 * result instead of a mock mannequin.
 */

(function () {
  if (window.__gradfitFloatingMounted) return;
  window.__gradfitFloatingMounted = true;

  const STORAGE_KEYS = {
    snapshot: 'gradfit_user_snapshot',
    token: 'tryon_user_token',
  };
  const APP_URL = 'http://localhost:3000';
  const API_URL = 'http://localhost:8000';
  const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);

  let snapshot = null;
  let token = null;
  let host = null;
  let shadow = null;
  let buttonEl = null;
  let drawerEl = null;
  let resultImgEl = null;
  let activeTryOnId = null;
  let activeGarmentId = null;
  let activeSourceUrl = null;
  let pollTimer = null;
  let hasMounted = false;
  let contextInvalidated = false;

  // ------------------------------------------------------------------
  // Extension-context survival helpers. Mirrors the logic in
  // content/content.js - see that file for the full explanation.
  // ------------------------------------------------------------------
  function isExtensionContextValid() {
    try {
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_e) {
      return false;
    }
  }
  function markContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    if (pollTimer) { try { clearTimeout(pollTimer); } catch (_e) {} pollTimer = null; }
  }
  function safeSendMessage(payload) {
    if (!isExtensionContextValid()) { markContextInvalidated(); return; }
    try { chrome.runtime.sendMessage(payload); } catch (_e) { markContextInvalidated(); }
  }

  /* ----------------- DOM helpers ----------------- */
  function mountHost() {
    if (hasMounted) return;
    hasMounted = true;

    host = document.createElement('div');
    host.id = 'gradfit-floating-host';
    host.style.cssText = 'all: initial; position: fixed; right: 0; bottom: 0; width: 0; height: 0; z-index: 2147483646;';
    (document.body || document.documentElement).appendChild(host);
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host, * { box-sizing: border-box; }
        .gradfit-btn {
          all: unset;
          position: fixed;
          right: 22px;
          bottom: 22px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-weight: 700;
          font-size: 14px;
          color: white;
          border-radius: 999px;
          background: linear-gradient(135deg, #4F7CFF 0%, #0EA5E9 50%, #34D399 100%);
          box-shadow: 0 18px 48px rgba(79, 124, 255, 0.32);
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
          user-select: none;
        }
        .gradfit-btn:hover { transform: translateY(-2px); box-shadow: 0 22px 56px rgba(79, 124, 255, 0.4); }
        .gradfit-btn[disabled] { opacity: 0.6; cursor: progress; }
        .gradfit-btn__avatar {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.2);
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.65);
        }
        .gradfit-btn__avatar img { width: 100%; height: 100%; object-fit: cover; }
        .gradfit-btn[data-mode="setup"] { background: #1B2336; }

        .gradfit-drawer {
          position: fixed;
          right: 22px;
          bottom: 78px;
          width: 320px;
          padding: 16px 16px 14px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1B2336;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(14px);
          opacity: 0;
          transform: translateY(8px);
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .gradfit-drawer[data-visible="true"] {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .gradfit-drawer__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }
        .gradfit-drawer__title { font-size: 13px; font-weight: 700; }
        .gradfit-drawer__close {
          all: unset;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          color: #64748b;
          font-size: 16px;
          line-height: 1;
        }
        .gradfit-drawer__close:hover { background: #f1f5f9; color: #0f172a; }
        .gradfit-drawer__stage { font-size: 12px; color: #475569; margin-bottom: 8px; }
        .gradfit-drawer__bar {
          height: 6px;
          width: 100%;
          background: rgba(79, 124, 255, 0.12);
          border-radius: 999px;
          overflow: hidden;
        }
        .gradfit-drawer__fill {
          display: block;
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #4F7CFF, #0EA5E9, #34D399);
          transition: width 0.3s ease;
        }
        .gradfit-drawer__meta {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
          font-variant-numeric: tabular-nums;
        }
        .gradfit-drawer__result {
          margin-top: 12px;
          width: 100%;
          aspect-ratio: 3 / 4;
          border-radius: 12px;
          overflow: hidden;
          background: #f1f5f9;
          display: none;
        }
        .gradfit-drawer__result[data-visible="true"] { display: block; }
        .gradfit-drawer__result img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .gradfit-drawer__cta {
          all: unset;
          display: inline-block;
          margin-top: 10px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 700;
          color: #0F172A;
          background: rgba(79, 124, 255, 0.12);
          border-radius: 8px;
          cursor: pointer;
        }
        .gradfit-drawer__cta:hover { background: rgba(79, 124, 255, 0.2); }
        .gradfit-drawer__cta--ghost {
          background: transparent;
          color: #4F7CFF;
          border: 1px solid rgba(79, 124, 255, 0.35);
        }
        .gradfit-drawer__cta--ghost:hover { background: rgba(79, 124, 255, 0.08); }
        .gradfit-drawer__disclosure {
          margin-top: 6px;
          font-size: 10px;
          color: rgba(15, 23, 42, 0.55);
          line-height: 1.35;
        }
        .gradfit-drawer__error {
          margin-top: 8px;
          font-size: 11px;
          color: #b91c1c;
          background: #fee2e2;
          padding: 6px 8px;
          border-radius: 8px;
        }
      </style>
      <button class="gradfit-btn" type="button" data-mode="loading" id="gradfit-btn">
        <span class="gradfit-btn__avatar" id="gradfit-avatar"></span>
        <span id="gradfit-label">Loading GradFiT...</span>
      </button>
      <section class="gradfit-drawer" data-visible="false" id="gradfit-drawer">
        <div class="gradfit-drawer__head">
          <span class="gradfit-drawer__title">Try-on in progress</span>
          <button class="gradfit-drawer__close" type="button" id="gradfit-drawer-close" aria-label="Close">&times;</button>
        </div>
        <div class="gradfit-drawer__stage" id="gradfit-drawer-stage">Warming up...</div>
        <div class="gradfit-drawer__bar"><span class="gradfit-drawer__fill" id="gradfit-drawer-fill"></span></div>
        <div class="gradfit-drawer__meta">
          <span id="gradfit-drawer-pct">0%</span>
          <span id="gradfit-drawer-id"></span>
        </div>
        <div class="gradfit-drawer__result" id="gradfit-drawer-result" data-visible="false">
          <img id="gradfit-drawer-result-img" alt="Try-on result" />
        </div>
        <a class="gradfit-drawer__cta" id="gradfit-drawer-open" href="${APP_URL}" target="_blank" rel="noreferrer">Open in dashboard</a>
        <a class="gradfit-drawer__cta gradfit-drawer__cta--ghost" id="gradfit-drawer-buy" href="#" target="_blank" rel="noopener noreferrer" style="display:none">Buy this</a>
        <div class="gradfit-drawer__disclosure" id="gradfit-drawer-disclosure" style="display:none"></div>
        <div class="gradfit-drawer__error" id="gradfit-drawer-error" style="display:none"></div>
      </section>
    `;

    buttonEl = shadow.getElementById('gradfit-btn');
    drawerEl = shadow.getElementById('gradfit-drawer');
    resultImgEl = shadow.getElementById('gradfit-drawer-result-img');
    buttonEl.addEventListener('click', onLaunchClicked);
    shadow.getElementById('gradfit-drawer-close').addEventListener('click', onCloseClicked);
  }

  function unmountHost() {
    if (!hasMounted) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
    buttonEl = null;
    drawerEl = null;
    resultImgEl = null;
    hasMounted = false;
  }

  function onCloseClicked() {
    // Tear down completely when the user is not mid-try-on so the page
    // stays clean until they explicitly trigger Quick Try again.
    if (activeTryOnId) {
      setDrawerVisible(false);
    } else {
      unmountHost();
    }
  }

  function setLabel(text) {
    if (!shadow) return;
    const el = shadow.getElementById('gradfit-label');
    if (el) el.textContent = text;
  }
  function setMode(mode) {
    if (buttonEl) buttonEl.dataset.mode = mode;
  }
  function setBusy(busy) {
    if (!buttonEl) return;
    if (busy) buttonEl.setAttribute('disabled', 'true');
    else buttonEl.removeAttribute('disabled');
  }
  function setAvatar(url) {
    if (!shadow) return;
    const avatar = shadow.getElementById('gradfit-avatar');
    if (!avatar) return;
    if (url) {
      avatar.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'You';
      avatar.appendChild(img);
    } else {
      avatar.innerHTML = '';
    }
  }

  function setDrawerVisible(visible) {
    if (drawerEl) drawerEl.dataset.visible = visible ? 'true' : 'false';
  }

  function setDrawerProgress({ pct, stage, error, tryonId }) {
    if (!drawerEl || !shadow) return;
    if (typeof pct === 'number') {
      shadow.getElementById('gradfit-drawer-fill').style.width = `${Math.max(0, Math.min(100, pct))}%`;
      shadow.getElementById('gradfit-drawer-pct').textContent = `${Math.round(pct)}%`;
    }
    if (stage) shadow.getElementById('gradfit-drawer-stage').textContent = stage;
    if (tryonId) {
      shadow.getElementById('gradfit-drawer-id').textContent = `#${tryonId}`;
      shadow.getElementById('gradfit-drawer-open').setAttribute('href', `${APP_URL}/?tryon=${tryonId}`);
    }
    const errEl = shadow.getElementById('gradfit-drawer-error');
    if (error) {
      errEl.style.display = 'block';
      errEl.textContent = error;
    } else {
      errEl.style.display = 'none';
    }
  }

  function setDrawerResult(url) {
    if (!shadow) return;
    const wrap = shadow.getElementById('gradfit-drawer-result');
    if (!wrap || !resultImgEl) return;
    if (url) {
      resultImgEl.src = url;
      wrap.dataset.visible = 'true';
    } else {
      resultImgEl.removeAttribute('src');
      wrap.dataset.visible = 'false';
    }
  }

  // Reveal the affiliate "Buy this" button once the try-on finishes.
  // We resolve the affiliate URL lazily through /api/affiliate/click so
  // the server records attribution for the click and returns the
  // rewritten URL in the same round-trip.
  async function mountBuyThisLink() {
    if (!shadow) return;
    const link = shadow.getElementById('gradfit-drawer-buy');
    const disclosureEl = shadow.getElementById('gradfit-drawer-disclosure');
    if (!link || !disclosureEl) return;
    if (!activeGarmentId && !activeSourceUrl) return;

    try {
      const resp = await fetch(`${API_URL}/api/affiliate/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          garment_id: activeGarmentId || undefined,
          tryon_id: activeTryOnId || undefined,
          // Server prefers garment_id; we include url as a fallback so the
          // click still resolves if the garment record has no source_url.
          url: activeGarmentId ? undefined : activeSourceUrl || undefined,
        }),
      });
      if (!resp.ok) throw new Error(`affiliate/click ${resp.status}`);
      const body = await resp.json();
      const linkData = body?.link || {};
      if (!linkData.affiliate_url) return;

      const merchant = linkData.merchant ? ` on ${linkData.merchant}` : '';
      link.textContent = `Buy this${merchant}`;
      link.setAttribute('href', linkData.affiliate_url);
      link.style.display = 'inline-block';
      if (linkData.disclosure_text) {
        disclosureEl.textContent = linkData.disclosure_text;
        disclosureEl.style.display = 'block';
      }
    } catch (err) {
      // Non-fatal: if the affiliate service errors we fall back to the
      // original page URL so the user can still navigate there.
      if (activeSourceUrl) {
        link.textContent = 'Open product page';
        link.setAttribute('href', activeSourceUrl);
        link.style.display = 'inline-block';
      }
      console.warn('GradFiT floating: affiliate click failed', err);
    }
  }

  /* ----------------- snapshot ----------------- */
  async function loadSnapshot() {
    if (!isExtensionContextValid()) { markContextInvalidated(); return; }
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEYS.snapshot, STORAGE_KEYS.token]);
      snapshot = stored[STORAGE_KEYS.snapshot] || null;
      token = stored[STORAGE_KEYS.token] || null;
      renderButton();
    } catch (err) {
      markContextInvalidated();
      console.warn('GradFiT floating: snapshot load failed', err);
    }
  }

  function renderButton() {
    if (!buttonEl) return;
    if (!token) {
      setMode('setup');
      setLabel('Sign in to GradFiT');
      setAvatar(null);
      return;
    }
    if (!snapshot?.user?.default_person_image_url) {
      setMode('setup');
      setLabel('Set up your photo');
      setAvatar(null);
      return;
    }
    setMode('ready');
    setLabel('Try with my photo');
    setAvatar(
      snapshot.user.default_person_smart_crop_url ||
      snapshot.user.default_person_image_url
    );
  }

  /* ----------------- garment detection ----------------- */
  function findGarmentImageUrl() {
    const candidates = [];

    const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
    if (ogImg) candidates.push({ url: ogImg, score: 8 });

    const imgs = Array.from(document.images || []);
    imgs.forEach((img) => {
      if (!img.src || !img.complete) return;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w < 320 || h < 320) return;
      let score = Math.log2(w * h);
      const cls = (img.className || '').toLowerCase();
      const alt = (img.alt || '').toLowerCase();
      const id = (img.id || '').toLowerCase();
      const hay = `${cls} ${alt} ${id}`;
      if (/product|gallery|hero|main|primary|pdp|garment/.test(hay)) score += 4;
      if (/logo|icon|sprite|banner|avatar|share|social|thumb/.test(hay)) score -= 6;
      candidates.push({ url: img.src, score });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || null;
  }

  function getProductTitle() {
    return (
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('h1')?.textContent?.trim() ||
      document.title ||
      'Garment'
    );
  }

  /* ----------------- launch + poll ----------------- */
  async function onLaunchClicked() {
    if (!token) {
      window.open(`${APP_URL}/login`, '_blank');
      return;
    }
    if (!snapshot?.user?.default_person_image_url) {
      window.open(`${APP_URL}/?settings=photo`, '_blank');
      return;
    }
    if (activeTryOnId) {
      setDrawerVisible(true);
      return;
    }

    const garmentUrl = findGarmentImageUrl();
    if (!garmentUrl) {
      setDrawerVisible(true);
      setDrawerProgress({ pct: 0, stage: 'No product image found on this page.', error: 'Open a product page first.' });
      return;
    }

    setBusy(true);
    setLabel('Starting...');
    setDrawerVisible(true);
    setDrawerResult(null);
    setDrawerProgress({ pct: 5, stage: 'Uploading garment...', error: null });
    activeGarmentId = null;
    activeSourceUrl = null;
    if (shadow) {
      const buyLink = shadow.getElementById('gradfit-drawer-buy');
      const disclosure = shadow.getElementById('gradfit-drawer-disclosure');
      if (buyLink) buyLink.style.display = 'none';
      if (disclosure) disclosure.style.display = 'none';
    }

    try {
      const garmentResp = await fetch(`${API_URL}/api/garments/from-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image_url: garmentUrl,
          name: getProductTitle().slice(0, 80),
          source_url: location.href,
          save_to_closet: false,
        }),
      });
      if (!garmentResp.ok) {
        throw new Error(`Garment registration failed (${garmentResp.status})`);
      }
      const garmentBody = await garmentResp.json();
      const garmentId =
        garmentBody?.data?.id || garmentBody?.id || garmentBody?.garment_id;
      if (!garmentId) throw new Error('No garment_id in response');
      activeGarmentId = garmentId;
      activeSourceUrl = location.href;

      // Quick Try always uses the fastest lane (Fashn v1.6 performance
      // mode, single sample). The balanced/best lanes are opt-in from
      // the web app's /try surface.
      const genResp = await fetch(`${API_URL}/api/tryon/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          garment_id: garmentId,
          quality: 'fast',
          mode: snapshot.user.preferred_tryon_mode || '2d',
        }),
      });
      if (!genResp.ok) {
        let detail = '';
        try {
          const body = await genResp.json();
          detail = body?.detail || body?.error || '';
        } catch (e) {
          /* ignore */
        }
        throw new Error(detail || `Try-on failed (${genResp.status})`);
      }
      const genBody = await genResp.json();
      const tryonId = genBody?.data?.tryon_id || genBody?.tryon_id;
      if (!tryonId) throw new Error('No tryon_id in response');

      activeTryOnId = tryonId;
      setLabel('In progress...');
      setDrawerProgress({ pct: 10, stage: 'Queued', tryonId, error: null });

      safeSendMessage({
        action: 'recordTryOnEvent',
        event: {
          tryonId,
          imageUrl: garmentUrl,
          label: getProductTitle().slice(0, 80),
          sourceUrl: location.href,
          status: 'pending',
          timestamp: new Date().toISOString(),
        },
      });

      pollStatus();
    } catch (err) {
      console.error('GradFiT floating: launch failed', err);
      setDrawerProgress({ pct: 0, stage: 'Could not start try-on', error: err.message });
      setBusy(false);
      setLabel('Try with my photo');
    }
  }

  async function pollStatus() {
    if (!activeTryOnId) return;
    try {
      const resp = await fetch(`${API_URL}/api/tryon/status/${activeTryOnId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await resp.json();
      const data = body?.data || body || {};
      const pct = typeof data.progress === 'number' ? data.progress : 0;
      setDrawerProgress({
        pct,
        stage: data.current_stage || data.status || 'Working...',
        tryonId: activeTryOnId,
        error: data.error_message || null,
      });

      if (TERMINAL.has(data.status)) {
        setBusy(false);
        const resultUrl = data.result_image_url || data.stage1_result_url || null;
        if (data.status === 'completed') {
          setLabel('Done - open result');
          setDrawerResult(resultUrl);
          // Attribution: resolve + log the affiliate click now that the
          // try-on succeeded. This is also what reveals the Buy-this
          // link in the drawer.
          void mountBuyThisLink();
          safeSendMessage({
            action: 'recordTryOnEvent',
            event: {
              tryonId: activeTryOnId,
              imageUrl: resultUrl,
              thumbnail: resultUrl,
              label: getProductTitle().slice(0, 80),
              sourceUrl: location.href,
              status: 'completed',
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          setLabel('Try again');
          setDrawerProgress({ error: data.error_message || 'Try-on failed' });
        }
        activeTryOnId = null;
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        return;
      }

      const delay = data.status === 'postprocessing' ? 1500 : 3000;
      pollTimer = setTimeout(pollStatus, delay);
    } catch (err) {
      console.warn('GradFiT floating: poll failed', err);
      pollTimer = setTimeout(pollStatus, 5000);
    }
  }

  /* ----------------- public messaging ----------------- */
  if (isExtensionContextValid()) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!isExtensionContextValid()) { markContextInvalidated(); return false; }
        if (!msg || msg.action !== 'gradfitTryThisPage') return false;
        (async () => {
          // Lazy-mount: only spawn the floating UI when the user explicitly
          // asks for it from the popup. This keeps normal browsing clean.
          mountHost();
          await loadSnapshot();
          if (!token) {
            window.open(`${APP_URL}/login`, '_blank');
            sendResponse({ ok: false, error: 'Not signed in' });
            return;
          }
          if (!snapshot?.user?.default_person_image_url) {
            window.open(`${APP_URL}/?settings=photo`, '_blank');
            sendResponse({ ok: false, error: 'No saved photo' });
            return;
          }
          const garment = findGarmentImageUrl();
          if (!garment) {
            setDrawerVisible(true);
            setDrawerProgress({ pct: 0, stage: 'No product image found on this page.', error: 'Open a product page first.' });
            sendResponse({ ok: false, error: 'No product image' });
            return;
          }
          onLaunchClicked();
          sendResponse({ ok: true });
        })();
        return true;
      });

      // Only refresh the snapshot while mounted. Avoid waking up on every
      // storage change otherwise (we don't mount until user triggers).
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!isExtensionContextValid()) { markContextInvalidated(); return; }
        if (area !== 'local' || !hasMounted) return;
        if (changes[STORAGE_KEYS.snapshot] || changes[STORAGE_KEYS.token]) {
          void loadSnapshot();
        }
      });
    } catch (_e) {
      markContextInvalidated();
    }
  }

  // Skip iframes entirely - the button is a top-frame surface.
  if (window.top !== window.self) return;
})();
