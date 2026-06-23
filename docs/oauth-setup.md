# OAuth Setup — Google / GitHub / Facebook

The backend already implements the full OAuth 2.0 authorization-code flow
for all three providers — see `backend/app/api/routes/auth_oauth.py` and
`backend/app/services/oauth_login.py`. The frontend already wires up the
buttons (`/login` page + the in-page sign-in dialog on `/try` + the
post-result upsell in `ResultsModal`).

All you have to do is register the app with each provider, copy the
client ID + secret into `backend/.env`, and add the callback URL to the
provider console.

---

## Endpoints (no code changes needed)

| URL | Purpose |
|---|---|
| `GET  /api/auth/oauth/{provider}/authorize` | Redirects the user to the provider's consent screen. |
| `GET  /api/auth/oauth/{provider}/callback` | Provider redirects here after consent. Backend exchanges the code, finds/creates the user, mints a JWT, and 302s the browser to `${FRONTEND_URL}/auth/callback?token=<jwt>`. |
| `/auth/callback` (Next.js) | Stores the token in `localStorage` and redirects to `/`. |

`{provider}` is one of: `google`, `github`, `facebook`.

---

## 1. Google

### Create the OAuth client

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. Pick (or create) a project — e.g. `gradfit-prod`.
3. **APIs & Services → OAuth consent screen**: set User type = External, fill in app name, support email. Add scope `userinfo.email` and `userinfo.profile`. While in testing add your own email to the test users list (or fully publish for unlimited users).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
5. Application type = **Web application**.
6. **Authorized redirect URIs** — add both dev and prod:

```
http://localhost:8000/api/auth/oauth/google/callback
https://api.gradfit.ai/api/auth/oauth/google/callback
```

7. Save. Copy the **Client ID** and **Client secret**.

### Configure backend

Edit `backend/.env`:

```env
GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-yyyyyyyyyyyyyyyyyy
BACKEND_URL=http://localhost:8000           # change for prod
FRONTEND_URL=http://localhost:3000          # change for prod
```

Restart the backend (`npm run dev:backend`).

### Test

Open <http://localhost:3000/login> → click **Continue with Google** → consent → you should land back at `/` signed in.

---

## 2. GitHub

### Create the OAuth app

1. <https://github.com/settings/developers> → **New OAuth App** (or use a GitHub Organization → Settings → Developer settings → OAuth Apps).
2. **Application name**: GradFiT (or whatever you want users to see).
3. **Homepage URL**: `https://gradfit.ai` (prod) or `http://localhost:3000` (dev).
4. **Authorization callback URL** — GitHub allows **only one** URL per app, so create separate apps for dev and prod, OR register the prod URL and use a local proxy. For dev:

```
http://localhost:8000/api/auth/oauth/github/callback
```

5. Click **Register application**.
6. Copy the **Client ID**. Click **Generate a new client secret** and copy that too (you won't see it again).

### Configure backend

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=ghp_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

Restart and test from `/login`.

> **Note**: GitHub does not always return a verified email when the user's
> primary email is private. The backend handles this by calling the
> `/user/emails` endpoint with the `user:email` scope (already configured in
> `oauth_login.py`).

---

## 3. Facebook

### Create the Facebook app

1. <https://developers.facebook.com/apps/> → **Create app** → Use case **Authenticate and request data from users with Facebook Login** → app type **Consumer**.
2. Fill in app display name + contact email → **Create app**.
3. In the left sidebar pick **Add a product → Facebook Login → Set Up → Web**.
4. **Site URL**: `http://localhost:3000` (dev) and `https://gradfit.ai` (prod). You can add multiple under **Settings → Basic**.
5. **Facebook Login → Settings → Valid OAuth Redirect URIs**:

```
http://localhost:8000/api/auth/oauth/facebook/callback
https://api.gradfit.ai/api/auth/oauth/facebook/callback
```

6. Save changes.
7. **Settings → Basic** → copy **App ID** and **App secret** (click Show, enter your FB password).

### Configure backend

```env
FACEBOOK_CLIENT_ID=1234567890123456
FACEBOOK_CLIENT_SECRET=abcdef0123456789abcdef0123456789
```

Restart and test.

> **App Review**: while your app is in *Development* mode only listed
> testers / admins can sign in. To open it to everyone you need to submit
> the `email` permission (auto-approved) and any other scopes (none for
> our flow) through App Review.

---

## Production checklist

1. Change `BACKEND_URL` and `FRONTEND_URL` in `backend/.env` to your prod URLs (e.g. `https://api.gradfit.ai` and `https://gradfit.ai`).
2. Re-register each provider's callback URL using the prod `BACKEND_URL`.
3. Set a strong `OAUTH_STATE_SECRET` (or rely on `SECRET_KEY`); rotate `SECRET_KEY` at the same time you go live.
4. Verify the consent screens look right (logo, support email) — Google specifically requires this for unverified apps.
5. Update CORS: `ALLOWED_ORIGINS` in `backend/.env` should include your prod frontend domain.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `503 OAuth is not configured for <provider>` | Missing client ID or secret in `.env` | Set the two `*_CLIENT_ID` / `*_CLIENT_SECRET` vars and restart. |
| Redirect to `/auth/callback?error=oauth_state_invalid` | Cookie / CSRF state expired (took > 10 min between authorize + callback) | Just sign in again. |
| Provider says "redirect URI mismatch" | The URL you registered with the provider doesn't match `{BACKEND_URL}/api/auth/oauth/{provider}/callback` exactly | Re-check trailing slashes, http vs https, port. |
| Sign-in succeeds but `/api/auth/me` 401s | JWT not stored — check `frontend/app/auth/callback/page.tsx` is being hit and the URL contains `?token=…` | Check the network tab; the JWT comes back in the redirect URL. |
| GitHub callback fails with "no email" | User has private email + we didn't request `user:email` scope | Already handled in `oauth_login.py` — make sure you didn't edit the scope list. |
