# OAuth sign-in (Google, GitHub, Facebook)

Backend-driven authorization code flow: the browser is redirected to the identity provider, then back to the API callback, which issues the same JWT as email/password login and redirects to the frontend.

## Environment

Set in the API `.env` (see `backend/.env.example`):

- `BACKEND_URL` — public origin of this FastAPI app (must match redirect URLs in each provider console).
- `FRONTEND_URL` — where users land after login (`{FRONTEND_URL}/auth/callback?token=...`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`
- Optional: `OAUTH_STATE_SECRET` (defaults to `SECRET_KEY`).

## Redirect URLs to register

Use your real API host in production; local dev examples:

| Provider | Authorized redirect / callback URL |
|----------|--------------------------------------|
| Google   | `{BACKEND_URL}/api/auth/oauth/google/callback` |
| GitHub   | `{BACKEND_URL}/api/auth/oauth/github/callback` |
| Facebook | `{BACKEND_URL}/api/auth/oauth/facebook/callback` |

Examples for local development:

- `http://localhost:8000/api/auth/oauth/google/callback`
- `http://localhost:8000/api/auth/oauth/github/callback`
- `http://localhost:8000/api/auth/oauth/facebook/callback`

Google allows `http://localhost` for dev web clients. GitHub and Meta accept localhost callback URLs for development apps.

## Provider consoles (short checklist)

1. **Google Cloud Console** — APIs & Services → Credentials → OAuth 2.0 Client ID (Web application). Add authorized redirect URIs above. Scopes used: `openid email profile`.
2. **GitHub** — Settings → Developer settings → OAuth Apps. Set “Authorization callback URL” to the GitHub row above. Scopes: `read:user`, `user:email` (primary **verified** email is required for account linking).
3. **Meta for Developers** — App → Facebook Login → Settings. Add “Valid OAuth Redirect URIs”. Enable “Use Strict Mode for redirect URIs” in Advanced settings when you are ready for production.

## Facebook / Meta app review

The `email` permission often works in **development** for testers and admins. In **production**, Meta commonly requires **App Review** for `email` (and sometimes `public_profile` beyond defaults). Until review is approved, production users may sign in without an email from Graph; our backend then rejects signup with a clear error (“verified email” policy). Plan for review screenshots, privacy policy URL, and data-use disclosure before launch.

## Security notes

- `state` is a short-lived signed JWT (PKCE for Google and GitHub).
- JWT is returned in the query string on redirect; prefer HTTPS everywhere in production. A future hardening step is a one-time exchange code instead of passing the access JWT in the URL.
