# GradFiT Chrome Extension

Manifest V3 browser extension for virtual try-on on fashion websites. Works with the GradFiT web app at [gradfit.tech](https://gradfit.tech).

## Features

- Try on from product images on retailer sites (sidebar + quick preview)
- Closet-aware style recommendations (glow highlight)
- Combo Studio (top + bottom across tabs)
- Buy-this affiliate links after try-on
- Sign-in sync with gradfit.tech

## Development install

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select this `chrome-extension` folder
4. Sign in at http://localhost:3000 or https://gradfit.tech (token syncs automatically)

## Configuration

URLs are set in [`config.js`](config.js). For local dev, defaults include `localhost` origins. To point at production:

```bash
GRADFIT_APP_URL=https://gradfit.tech \
GRADFIT_API_URL=https://gradfit-ai.onrender.com \
bash scripts/build.sh
```

## Store publishing (Chrome, Edge, Opera, Brave)

Full kit: **[store/README.md](store/README.md)**

Build submission ZIP (production only, no localhost):

```bash
GRADFIT_APP_URL=https://gradfit.tech \
GRADFIT_API_URL=https://gradfit-ai.onrender.com \
bash scripts/package-store.sh
```

Output: `dist/gradfit-extension-v<version>.zip`

Required public URLs before submit:

| URL | Purpose |
|-----|---------|
| https://gradfit.tech/extension/privacy | Store privacy policy |
| https://gradfit.tech/support | Support |
| https://gradfit.tech | Homepage |

## File structure

```
chrome-extension/
├── manifest.json
├── config.js              # App/API URLs (build-time)
├── popup/
├── content/               # Page overlays + sidebar
├── background/            # Service worker
├── assets/                # Icons 16/48/128
├── shared/brand.css
├── scripts/
│   ├── build.sh           # Rewrite config URLs
│   └── package-store.sh   # Store ZIP
└── store/                 # Listing copy, checklists, privacy
```

## Icons

`assets/icon-16.png`, `icon-48.png`, `icon-128.png` (required for stores).

## License

Copyright © GradFiT. All rights reserved.
