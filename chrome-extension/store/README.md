# GradFiT extension — store publishing kit

Documentation and scripts to publish the Chromium extension to **Chrome Web Store**, **Microsoft Edge Add-ons**, **Opera Add-ons**, and **Brave Software Store**.

## Quick start

1. Read [SUBMISSION_CHECKLIST.md](./SUBMISSION_CHECKLIST.md).
2. Build the store ZIP: `GRADFIT_STORE_BUILD=1 bash scripts/package-store.sh`
3. Capture screenshots per [SCREENSHOTS.md](./SCREENSHOTS.md).
4. Copy listing text from [STORE_LISTING.md](./STORE_LISTING.md).
5. Use public URLs (must be live before submit):
   - Privacy: https://gradfit.tech/extension/privacy
   - Homepage: https://gradfit.tech
   - Support: https://gradfit.tech/support

## Files in this folder

| File | Use |
|------|-----|
| [SUBMISSION_CHECKLIST.md](./SUBMISSION_CHECKLIST.md) | Step-by-step per store |
| [STORE_LISTING.md](./STORE_LISTING.md) | Title, descriptions, category |
| [SINGLE_PURPOSE.md](./SINGLE_PURPOSE.md) | Chrome Web Store single-purpose field |
| [PERMISSION_JUSTIFICATION.md](./PERMISSION_JUSTIFICATION.md) | Permission explanations for reviewers |
| [DATA_PRACTICES.md](./DATA_PRACTICES.md) | Chrome privacy practices form |
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | Extension privacy (mirror of site) |
| [SCREENSHOTS.md](./SCREENSHOTS.md) | Screenshot sizes and scenes |
| [SUPPORT.md](./SUPPORT.md) | Support contact template |
| [REVIEW_NOTES.md](./REVIEW_NOTES.md) | Notes for store reviewers |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

## Build artifact

```bash
cd chrome-extension
GRADFIT_APP_URL=https://gradfit.tech \
GRADFIT_API_URL=https://gradfit-ai.onrender.com \
GRADFIT_STORE_BUILD=1 \
bash scripts/package-store.sh
```

Output: `dist/gradfit-extension-v<version>.zip`
