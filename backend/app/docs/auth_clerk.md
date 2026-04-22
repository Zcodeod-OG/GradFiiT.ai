# Clerk Authentication Setup

## 1. Get Clerk Credentials

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Go to **API Keys**
4. Copy:
   - **Secret Key** (starts with `sk_`)
   - **Publishable Key** (starts with `pk_`)

## 2. Update .env File

```bash
# Clerk Authentication
CLERK_SECRET_KEY=sk_test_your_secret_key_here
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here