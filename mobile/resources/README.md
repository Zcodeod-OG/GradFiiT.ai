# Store icon & splash assets

Place source artwork here before generating platform assets.

## Required source files

| File | Size | Notes |
|------|------|-------|
| `icon.png` | 1024×1024 | Square, no transparency for iOS App Store |
| `splash.png` | 2732×2732 | Centered logo on `#f8f9fc` background |

## Generate platform assets

After adding source files:

```bash
npm install -g @capacitor/assets
cd mobile
npx capacitor-assets generate --iconBackgroundColor '#f8f9fc' --splashBackgroundColor '#f8f9fc'
npx cap sync
```

## Android adaptive icon

Provide a foreground layer with safe padding (center 66% of canvas). Background color: `#f8f9fc`.

## iOS

- App Store Connect requires 1024×1024 marketing icon
- Privacy manifest: `ios/App/App/PrivacyInfo.xcprivacy` (add when enabling analytics tracking)

Until final brand assets exist, the default Capacitor template icons are used for internal testing only.
