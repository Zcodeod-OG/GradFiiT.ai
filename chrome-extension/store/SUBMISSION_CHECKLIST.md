# Submission checklist

Complete in order. Same ZIP for all Chromium stores unless noted.

## Before you start

- [ ] Confirm **support@gradfit.tech** is monitored
- [ ] Deploy frontend so these URLs return 200:
  - [ ] https://gradfit.tech/extension/privacy
  - [ ] https://gradfit.tech/privacy
  - [ ] https://gradfit.tech/support
  - [ ] https://gradfit.tech/extension
- [ ] Production API stable: https://gradfit-ai.onrender.com
- [ ] Capture 3–5 screenshots ([SCREENSHOTS.md](./SCREENSHOTS.md))
- [ ] Build store ZIP:

```bash
cd chrome-extension
GRADFIT_APP_URL=https://gradfit.tech \
GRADFIT_API_URL=https://gradfit-ai.onrender.com \
GRADFIT_STORE_BUILD=1 \
bash scripts/package-store.sh
```

---

## 1. Chrome Web Store

1. [ ] Register [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time)
2. [ ] **New item** → Upload `dist/gradfit-extension-v*.zip`
3. [ ] Listing from [STORE_LISTING.md](./STORE_LISTING.md)
4. [ ] Privacy policy URL: `https://gradfit.tech/extension/privacy`
5. [ ] Single purpose: [SINGLE_PURPOSE.md](./SINGLE_PURPOSE.md)
6. [ ] Privacy practices: [DATA_PRACTICES.md](./DATA_PRACTICES.md)
7. [ ] Permission justifications: [PERMISSION_JUSTIFICATION.md](./PERMISSION_JUSTIFICATION.md)
8. [ ] Screenshots uploaded
9. [ ] Remote code: **No** (API calls only; no remote scripts in extension package)
10. [ ] Optional reviewer notes: [REVIEW_NOTES.md](./REVIEW_NOTES.md)
11. [ ] Submit for review (typically 1–7 days)
12. [ ] After approval: copy public Chrome Web Store URL into [extension page](https://gradfit.tech/extension) and marketing

---

## 2. Microsoft Edge Add-ons

**Option A — Import from Chrome (after CWS approval)**

1. [ ] [Partner Center](https://partner.microsoft.com/dashboard) → Edge extensions
2. [ ] Import from Chrome Web Store listing

**Option B — Upload ZIP directly**

1. [ ] Partner Center → Submit new extension
2. [ ] Upload same ZIP as Chrome
3. [ ] Reuse listing copy and privacy URL
4. [ ] Submit for review

---

## 3. Opera Add-ons

1. [ ] [Opera Developer](https://addons.opera.com/developer/) account
2. [ ] Submit new extension → Upload same ZIP
3. [ ] Listing + privacy URL (Opera may ask permission explanations — use [PERMISSION_JUSTIFICATION.md](./PERMISSION_JUSTIFICATION.md))
4. [ ] Submit for review

---

## 4. Brave Software Store

1. [ ] [Brave Developer Dashboard](https://brave.com/developers/) (or current Brave publisher portal)
2. [ ] Submit extension package (same ZIP) OR document Chrome Web Store install for Brave users until native listing is live
3. [ ] Same privacy and support URLs

**Note:** Brave users can often install extensions from the Chrome Web Store; native Brave listing is optional.

---

## After all approvals

- [ ] Update store install links on https://gradfit.tech/extension
- [ ] Announce release (blog, email, social)
- [ ] Tag release in [CHANGELOG.md](./CHANGELOG.md) with store URLs
- [ ] Monitor support@gradfit.tech for reviewer/user issues

## Version bumps

1. Bump `version` in `manifest.json`
2. Update [CHANGELOG.md](./CHANGELOG.md)
3. Re-run `package-store.sh`
4. Upload new ZIP to each store dashboard
