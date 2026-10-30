# Marketing Health Checker

First slice of a bigger tool: sign in with Google, see which Google Ads
accounts you have access to.

## How it works

1. User signs in with Google OAuth (via [Auth.js](https://authjs.dev)),
   requesting the `https://www.googleapis.com/auth/adwords` scope.
2. The app calls the Google Ads API's `listAccessibleCustomers` endpoint with
   the user's access token to list every Google Ads customer ID they can
   reach (directly or through a manager account).
3. The IDs are shown on the page. No ad data is read yet — this is just the
   "do you have Google Ads accounts at all" check.

## One-time setup (Google Cloud)

1. **Create a Google Cloud project** at console.cloud.google.com (or reuse
   one you already have for this).
2. **Configure the OAuth consent screen** (APIs & Services > OAuth consent
   screen). "External" user type is fine for testing; add your own Google
   account as a test user while the app is unpublished.
3. **Create an OAuth 2.0 Client ID** (APIs & Services > Credentials > Create
   Credentials > OAuth client ID > Web application):
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy the Client ID and Client Secret into `.env.local`.
4. **Apply for a Google Ads API developer token** in the
   [Google Ads API Center](https://ads.google.com/aw/apicenter) on the
   Quarizmi manager account (832-437-9185). Notes:
   - A **test token** works immediately but only against Google Ads *test*
     accounts, not real ones — fine for verifying the code path, not for
     checking a real user's accounts.
   - **Basic access** is required to query real accounts and needs a short
     Google review (usually a business day or so, not instant).
   - Put the approved token in `GOOGLE_ADS_DEVELOPER_TOKEN` in `.env.local`.

## Local setup

```bash
cp .env.local.example .env.local
npx auth secret   # fills in AUTH_SECRET
# then fill in AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN
npm run dev
```

Open http://localhost:3000.

## Production deployment

Live at **https://adshealth.quarizmi.com**, running on Cloud Run in the
`quarizmi-health-checker` GCP project (region `europe-west1`), fronted by a
Google global external HTTPS Load Balancer so the app sits behind a fixed IP
(rather than Cloud Run's own domain-mapping, which only hands out a CNAME).

Infra, all in project `quarizmi-health-checker`:
- Cloud Run service: `adshealth`
- Reserved static IP: `adshealth-ip` (global) — put this IP in Cloudflare as
  an **A record** for `adshealth`, set to **DNS only** (grey cloud, not
  proxied). Google's managed SSL cert needs to validate directly; proxying
  through Cloudflare breaks that.
- Serverless NEG → backend service → URL map → Google-managed SSL cert
  (`adshealth-cert`, auto-provisions once the DNS record above resolves) →
  HTTPS proxy → forwarding rule on port 443
- A second URL map/proxy/forwarding rule on port 80 redirects HTTP to HTTPS

Cloud Run env vars also include `AUTH_URL=https://adshealth.quarizmi.com`.
Without it, `auth()`/`signIn()` calls made from Server Components/Actions
(as opposed to the `/api/auth/*` route handler) can't always detect the real
incoming host and fall back to a guess built from `process.env.PORT` —
surfacing as a post-login redirect to `http://localhost:8080` (Cloud Run's
internal container port). `AUTH_TRUST_HOST=true` alone wasn't enough to
avoid this.

To redeploy after code changes:

```bash
gcloud run deploy adshealth --source . --region europe-west1 \
  --project quarizmi-health-checker
```

(Env vars are already set on the Cloud Run service — this won't wipe them
unless you pass `--set-env-vars`/`--env-vars-file` again.) The OAuth client's
authorized origins/redirect URIs already include both the localhost and
`adshealth.quarizmi.com` variants, so local dev keeps working.

## Stack

- Next.js (App Router, TypeScript)
- Auth.js (next-auth) for Google OAuth
- Google Ads API REST endpoint for `listAccessibleCustomers` (no client
  library — plain `fetch`, since this first slice only needs one call)
