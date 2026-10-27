# Health Checker

Connect your Google Ads account. Get a grade from 0 to 100. See exactly
what to fix.

Health Checker is a free, open-source audit tool by [Quarizmi](https://quarizmi.com).
Sign in with Google, pick a Google Ads account you have access to, and it
grades the account on qualitative management-quality signals — is this
account being actively managed well — rather than restating Google's own
metrics or its Optimization Score.

## How it works

1. Sign in with Google OAuth (via [Auth.js](https://authjs.dev)), requesting
   the `https://www.googleapis.com/auth/adwords` scope.
2. The app calls the Google Ads API to list every account you have access
   to (directly or through a manager account) and lets you pick one.
3. It pulls that account's campaigns, keywords, ad groups, and budget data
   and scores 8 management-quality metrics (brand campaign presence,
   keyword utilization, negative keyword coverage, ad coverage per ad
   group, budget-constrained campaigns, and more), each worth up to 12.5
   points, rolling up into one 0–100 score with a Good / Needs Attention /
   Critical tier.
4. Metrics the app can't yet compute for a given account (e.g. conversion
   tracking integrity, account activity — both need API data this project
   hasn't wired up yet) render as "Pending" and are excluded from the score
   math, rather than guessing.

## Features

- **Instant grade** — results right after connecting, no manual setup.
- **Per-metric breakdown** — see exactly which signals are strong and which
  are weak, with the threshold logic behind each one.
- **Honest about gaps** — a metric the app can't compute yet shows as
  "Pending," never a fabricated number.

## One-time setup (Google Cloud)

1. **Create a Google Cloud project** at console.cloud.google.com (or reuse
   one you already have).
2. **Configure the OAuth consent screen** (APIs & Services > OAuth consent
   screen). "External" user type is fine for testing; add your own Google
   account as a test user while the app is unpublished.
3. **Create an OAuth 2.0 Client ID** (APIs & Services > Credentials > Create
   Credentials > OAuth client ID > Web application):
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Copy the Client ID and Client Secret into `.env.local`.
4. **Apply for a Google Ads API developer token** in the
   [Google Ads API Center](https://ads.google.com/aw/apicenter) on your own
   manager account. Notes:
   - A **test token** works immediately but only against Google Ads *test*
     accounts, not real ones — fine for verifying the code path, not for
     checking a real account.
   - **Basic access** is required to query real accounts and needs a short
     Google review (usually a business day or so, not instant).
   - Put the approved token in `GOOGLE_ADS_DEVELOPER_TOKEN` in `.env.local`.
5. **Set up Firestore** (used to persist per-account settings like business
   type) in the same GCP project, and authenticate locally with
   `gcloud auth application-default login`.

## Local setup

```bash
cp .env.local.example .env.local
npx auth secret   # fills in AUTH_SECRET
# then fill in AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN
npm run dev
```

Open http://localhost:3000.

## Deploying

This runs well on Cloud Run:

```bash
gcloud run deploy healthchecker --source . --region <your-region> \
  --project <your-gcp-project>
```

Set `AUTH_URL` to your production URL in the Cloud Run service's env vars —
without it, `auth()`/`signIn()` calls from Server Components/Actions can
fall back to a guessed host and misdirect the post-login redirect.

## Stack

- Next.js (App Router, TypeScript)
- Auth.js (next-auth) for Google OAuth
- Google Ads API (REST)
- Firestore for per-account settings

## Fix it yourself, or work with us

Every recommendation the tool surfaces is yours to implement. If you'd
rather have experts handle it, Quarizmi can implement the recommendations
for you — get in touch at [quarizmi.com](https://quarizmi.com).

## Related projects

Quarizmi also maintains an open-source paid-search suite built around
long-tail keywords:

- [EKEP](https://github.com/Quarizmi/ekep) — discovers long-tail keywords
- [Bidbot](https://github.com/Quarizmi/bidbot) — decides bids and which
  keywords to turn on or off
- [Usable](https://github.com/Quarizmi/usable) — builds full campaigns with
  the user in the loop
- [Magneto](https://github.com/Quarizmi/magneto) — writes high-relevance
  ads for every keyword

## Contributing

Contributions are welcome. Please open an issue to discuss a change before
submitting a pull request.

## License

Released under the MIT License. © 2026 Quarizmi AdTech.
