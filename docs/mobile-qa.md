# Mobile app QA checklist

Use this before TestFlight / Play Internal Testing releases.

## Environment

- [ ] Production WebView URL loads (`https://gradfit.tech` or staging)
- [ ] `NEXT_PUBLIC_API_URL` on Vercel points to live backend
- [ ] Backend `MOBILE_APP_URL_SCHEME=ai.gradfit.app` (default)

## Core flows (real device)

- [ ] Cold start + splash hide
- [ ] Bottom tab navigation (Try-On, Design, Stylist, Closet, Account)
- [ ] `/try` — upload person + garment, sticky generate CTA, result modal
- [ ] Native camera capture on RefImageDropzone (Design / Stylist / try-on uploads)
- [ ] Closet — tabs sticky, outfit builder stacks on phone
- [ ] Design / Stylist — prompt drawer opens, generate works (~60–120s)
- [ ] OAuth sign-in (Google/GitHub/Facebook) returns via deep link
- [ ] Stripe Checkout + billing portal open in in-app browser and return to app

## Edge cases

- [ ] Backend warmup spinner on slow cold start
- [ ] Try-on polling completes on poor network
- [ ] Offline / API error copy is readable
- [ ] Keyboard does not cover login / try-on form fields
- [ ] Safe areas on notched iPhone + gesture nav Android

## Store metadata

- [ ] Privacy policy URL: `/privacy`
- [ ] Screenshots from **mobile layouts** (390px width), not desktop
- [ ] iOS: export compliance, privacy nutrition labels
- [ ] Android: Data safety form, target SDK meets Play requirements

## Build commands

```bash
npm run mobile:sync
npm run mobile:ios      # Archive in Xcode → TestFlight
npm run mobile:android  # Build → Play Internal Testing
```
