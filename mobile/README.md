# GradFiiT Mobile (Capacitor)

Native iOS + Android shell that loads the production Next.js app in a WebView.

## Prerequisites

- Node.js 20+
- **Android:** Android Studio + SDK 34+
- **iOS:** Xcode 15+ (full Xcode, not Command Line Tools only) + CocoaPods

## Setup

```bash
# From repo root
npm run mobile:install
cd mobile && npx cap sync
```

## Development

Point the WebView at your local Next dev server (same Wi‑Fi):

```bash
export CAPACITOR_SERVER_URL=http://192.168.x.x:3000
cd mobile && npx cap sync
npm run mobile:android   # or mobile:ios
```

Production default: `https://gradfit.tech` (see `capacitor.config.ts`).

## Scripts (repo root)

| Script | Action |
|--------|--------|
| `npm run mobile:install` | Install Capacitor deps in `mobile/` |
| `npm run mobile:sync` | Copy web assets + sync native projects |
| `npm run mobile:ios` | Open Xcode |
| `npm run mobile:android` | Open Android Studio |

## Native features

Plugins are registered in `mobile/package.json` and initialized from the web app via `frontend/lib/platform.ts`:

- Camera — garment / reference uploads
- Browser — OAuth + Stripe Checkout
- App — deep link `ai.gradfit.app://auth/callback`
- StatusBar, SplashScreen, Keyboard

## Store assets

Replace placeholder icons in `resources/` before submission. See `resources/README.md` and `docs/mobile-qa.md`.

## App ID

- Bundle ID: `ai.gradfit.app`
- URL scheme: `ai.gradfit.app://auth/callback` (OAuth return from native sign-in)
