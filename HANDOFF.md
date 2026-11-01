# Marketing Health Checker — Project Handoff

Written 2026-10-18, end of the first working session on this project. This
document is meant to let anyone — a person or another AI — pick this project
up cold and understand what exists, why it's built the way it is, what's
still open, and what to do next. If you're resuming this project, read this
whole file before changing anything.

## 1. What this project is

Quarizmi AdTech, Inc. runs a Google Ads management agency (manager account
`832-437-9185`, legal entity "Quarizmi AdTech SL"). This is the first slice
of a larger internal tool: a web app where someone signs in with their
Google account and sees information about the Google Ads accounts they have
access to, without needing to open the Google Ads UI.

This is step one of "a huge project" the owner (Enrique Aguilera) is
building incrementally, starting deliberately simple.

## 2. Current status (as of end of session)

**Live at:** https://adshealth.quarizmi.com (production, Google Cloud Run)

**Working and confirmed by live testing:**
- Sign in with Google (tested with `automation@quarizmi.com`)
- Lists every Google Ads account the signed-in user can reach, grouped by
  the top-level account and the client accounts managed under it (tested
  against the real Quarizmi AdTech SL manager account — returned the real
  client list: Cuidum, Perfumes Club ES, Stikets ES, totalrenting.es, etc.)
- Clicking an account shows its campaigns with spend in the last 30 days,
  grouped by campaign type (channel), with cost
- Clicking a Search campaign shows its top 5 spending keywords (last 30
  days)

**Built but NOT yet confirmed by live testing** (session ended before the
user could click through):
- "Auto-apply recommendation rules" section on the account page
  (`recommendation_subscription.type` / `.status`) — field names were
  confirmed from Google's documentation (search-indexed excerpts, since the
  docs site itself is JS-rendered and unreadable by our fetch tooling — see
  §4), but never verified against a live API response. If this errors, the
  error message will say exactly what's wrong (this has been true every
  other time so far in this project).
- Top 5 keywords per Search campaign (`keyword_view` resource) — same
  caveat, unverified live.

**Next step for whoever resumes this:** sign in and click through an
account with Search campaigns, confirm both of the above render correctly
or report back the exact error text.

## 3. What we built, in order

1. **Scaffolded a Next.js app** (TypeScript, App Router) in this directory.
   `create-next-app` refused the folder name "Health Checker" (capital
   letters / space aren't valid npm package names), so it was scaffolded in
   a temp directory under a valid name and the files were moved in.
2. **Google sign-in** via Auth.js (`next-auth@5` beta), requesting the
   `https://www.googleapis.com/auth/adwords` scope. Code: `src/auth.ts`,
   route handler at `src/app/api/auth/[...nextauth]/route.ts`.
3. **Google Cloud project** `quarizmi-health-checker`, owned by
   `eaguilera@gmail.com`, created from scratch. Google Ads API enabled.
   OAuth consent screen configured (External, currently "Testing" status).
   OAuth client ("Marketing Health Checker (local dev)") created with both
   `http://localhost:3000` and `https://adshealth.quarizmi.com` as
   authorized origins/redirect URIs, so local dev and production both work
   off one client.
4. **`src/lib/google-ads.ts`** — all Google Ads API calls, plain `fetch`
   against the REST API (no official client library, since the call volume
   here is low and simple):
   - `listAccessibleCustomers` — raw `customers:listAccessibleCustomers`
   - `listManagedAccounts` — for each accessible account, queries
     `customer_client` one level down to show the hierarchy (who manages
     whom), not just a flat ID list
   - `listCampaigns` — campaigns with `metrics.cost_micros > 0` over
     `LAST_30_DAYS`
   - `listAutoApplyRules` — `recommendation_subscription` type/status
     (unverified live, see §2)
   - `listTopKeywords` — top 5 by cost from `keyword_view` for one campaign
     (unverified live, see §2)
5. **Pages:**
   - `src/app/page.tsx` — sign-in/out, account list (links into accounts)
   - `src/app/accounts/[customerId]/page.tsx` — auto-apply rules +
     campaigns (grouped by channel, with nested top keywords for Search
     campaigns)
6. **Deployed to Google Cloud Run**, then put behind a custom domain — see
   §5 for why and how.

## 4. Doubts, problems, and how they were resolved

- **Next.js 16 "Cache Components"** (on by default from `create-next-app`)
  broke prerendering because the home page reads auth cookies on every
  request. Disabled `cacheComponents`/`partialPrefetching` in
  `next.config.ts` rather than restructuring the app around it — not worth
  the complexity for this app's size.
- **Post-login redirect to `http://localhost:8080` in production.**
  `auth()`/`signIn()` called from Server Components/Actions (as opposed to
  the `/api/auth/*` route handler) couldn't reliably detect the real
  incoming host, and fell back to a guess built from `process.env.PORT`
  (Cloud Run sets `PORT=8080` internally for the container). Fixed by
  setting an explicit `AUTH_URL` env var in production. `AUTH_TRUST_HOST=true`
  alone was not sufficient.
- **Google Ads API version v22 got deprecated mid-project.** We built
  against v22; partway through, Google started rejecting it ("Version v22
  is deprecated. Requests to this version will be blocked.") — this lined
  up with v22's known October 2026 sunset date. Bumped to v25 in
  `google-ads.ts`.
- **Real manager account (832-437-9185) blocked with 403
  `PERMISSION_DENIED`: "The Google Cloud project is only approved for use
  with test accounts"** — even though the developer token itself showed
  "Basic Access" in the legacy Google Ads UI → API Center page. Turned out
  Google has since migrated **access-level management to Google Cloud
  Console, per-project**, independent of the developer token's own
  approval — the legacy Ads API Center page now explicitly says "Developer
  tokens are no longer required... API access levels are now managed
  exclusively in the Google Cloud Console. The levels displayed on this
  page may no longer be accurate." The fix: Cloud Console → APIs & Services
  → Google Ads API → **Access levels** → applied for "Explorer" (instant,
  no form) → unlocked production-account access (2,880 ops/day). This is
  the single most important gotcha to know about if anything about access
  levels looks confusing later — **trust the Cloud Console page, not the
  old Ads UI API Center page.**
- **`Map.groupBy` needs Node ≥21.** Added `"engines": {"node": ">=21"}` to
  `package.json` so Cloud Run's buildpack doesn't silently pick an older
  Node and break at runtime.
- **Google's own API docs site (`developers.google.com/google-ads/...`) is
  heavily JS-rendered** — our web-fetch tooling only ever got the
  navigation sidebar, never the actual field tables. Field names for
  `recommendation_subscription` and `keyword_view` were confirmed from
  search-engine-indexed excerpts of those same pages instead of reading
  them directly. This is why §2 flags those two features as unverified —
  the working pattern throughout this project has been: ship the
  best-known-correct query, and let the real API's error message (which
  has been reliably specific every time) tell us exactly what's wrong if
  it's off.

## 5. Decisions made, and why

- **Stack: Next.js**, chosen over plain Node/Express at the very start —
  one project for both the UI and the OAuth/API server-side logic.
- **New Google Cloud project**, not reusing an existing one — keeps this
  tool's resources (and its Google Ads API access level) isolated.
- **Hosting: Google Cloud Run**, not Vercel or Cloudflare Workers — chosen
  specifically to keep the app's hosting in the same Google Cloud project
  as the OAuth client and the Google Ads API access level, rather than
  splitting infrastructure across providers.
- **Custom domain via a Load Balancer + static IP, not Cloud Run's built-in
  domain mapping.** Cloud Run's own domain mapping only gives you a CNAME
  target, not a fixed IP. The owner specifically wanted a plain Cloudflare
  **A record** pointing at a fixed IP, so we built: reserved static IP →
  Serverless NEG → backend service → URL map → Google-managed SSL cert →
  HTTPS proxy → forwarding rule (port 443), plus a second HTTP→HTTPS
  redirect rule (port 80). See §6 for the exact resource names.
- **Subdomain: `adshealth.quarizmi.com`** (chosen over `healthcheck.`).
- **OAuth test user: `automation@quarizmi.com`**, not the owner's personal
  Google accounts — matches the mailbox the company already uses for
  Google Ads manager-account automation (see the top-level Quarizmi
  AdTech, Inc. `CLAUDE.md` for that existing convention).
- **Deferred: full OAuth verification / CASA security assessment / Basic
  Ads API access level.** The owner's reasoning: the plan is to build out a
  lot more functionality before going through Google's multi-week
  verification process, since scope changes mid-review would complicate
  things. Current setup (Testing publishing status + Explorer access
  level) is sufficient for internal use by a handful of people for now. See
  §7 for exactly what's required when this gets picked back up.
- **API version pinned, not "latest"** — `v25`, chosen deliberately one
  version behind the newest (`v26`, announced ~6 days before this session)
  to avoid being on a version that might not yet be fully stable/rolled
  out everywhere.

## 6. Infrastructure — exact current state

All of the following lives in Google Cloud project **`quarizmi-health-checker`**
(owned by `eaguilera@gmail.com`), region `europe-west1` unless noted:

| Resource | Name | Purpose |
|---|---|---|
| Cloud Run service | `adshealth` | Runs the Next.js app (deployed via `gcloud run deploy --source .`, Buildpacks, no Dockerfile) |
| OAuth client | "Marketing Health Checker (local dev)" | Client ID `234387825380-46p91aed12pkcqddu693f3lsgtb6tr5v...` |
| Reserved static IP (global) | `adshealth-ip` | `136.81.176.55` |
| Serverless NEG | `adshealth-neg` | Points at the Cloud Run service |
| Backend service (global) | `adshealth-backend` | |
| URL map | `adshealth-urlmap` | Default service → `adshealth-backend` |
| Managed SSL cert (global) | `adshealth-cert` | For `adshealth.quarizmi.com`, ACTIVE |
| Target HTTPS proxy | `adshealth-https-proxy` | |
| Forwarding rule (443) | `adshealth-https-rule` | Bound to `adshealth-ip` |
| URL map (redirect) | `adshealth-http-redirect` | Redirects HTTP → HTTPS |
| Target HTTP proxy | `adshealth-http-proxy` | |
| Forwarding rule (80) | `adshealth-http-rule` | Bound to `adshealth-ip` |

**Cloud Run environment variables** (set via `gcloud run services update
--update-env-vars`, not committed to git): `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST=true`, `AUTH_URL=https://adshealth.quarizmi.com`,
`GOOGLE_ADS_DEVELOPER_TOKEN`. Actual secret values are **not** repeated here
— read them from Cloud Run directly if needed:
```
gcloud run services describe adshealth --region europe-west1 \
  --project quarizmi-health-checker --format="value(spec.template.spec.containers[0].env)"
```

**To redeploy after a code change:**
```
gcloud run deploy adshealth --source . --region europe-west1 \
  --project quarizmi-health-checker
```

**Local dev:** `.env.local` (gitignored) has the same variables filled in
(minus `AUTH_URL`, which isn't needed for localhost). `.env.local.example`
documents every variable. Run `npm run dev`, open `http://localhost:3000`.

### Who manages the subdomain

`quarizmi.com`'s DNS lives on **Cloudflare**, managed directly by Enrique
through the Cloudflare dashboard — not by any automation set up for this
project. The owner added the A record (`adshealth` → `136.81.176.55`,
**DNS only / grey-cloud, not proxied**) themselves after being given the
IP. It must stay un-proxied: Google's managed SSL cert needs to reach the
domain directly to validate and renew; Cloudflare's proxy would break that.
There is no Cloudflare API credential or automation wired into this
project — any future DNS change here needs to go through Enrique or
whoever has Cloudflare dashboard access.

### Google Ads API access

- **Access level:** Explorer (not Basic/Standard) — 2,880 operations/day on
  production accounts, 15,000/day on test accounts. Set in Cloud Console
  under APIs & Services → Google Ads API → Access levels (**not** the old
  Google Ads UI → Admin → API center page — see §4).
- **Developer token** is set (`GOOGLE_ADS_DEVELOPER_TOKEN`), provided by the
  owner from the company's existing Google Ads API Center setup. Google's
  own UI now says developer tokens are "no longer required" for the API —
  we haven't tested removing it; it's still being sent on every request and
  everything works, so this is a "works, revisit later" item, not a bug.

## 7. What's deferred, and the full checklist for when it's picked back up

The owner explicitly decided to **not** pursue any of this yet, because the
plan is to add more functionality first and avoid scope churn during a
multi-week Google review. When ready:

1. **App homepage** (public URL describing the app) — currently blank in
   OAuth branding settings.
2. **Privacy policy** — public, real. This is a legal document representing
   the company; draft it but get it reviewed by Quarizmi's actual
   legal/business side before publishing, don't treat an AI-drafted version
   as final.
3. **Terms of service** — optional but recommended, same caveat as above.
4. **Scopes justification** — written explanation for Google's review of
   why the app needs the `adwords` scope.
5. **Demo video** — screen recording of the OAuth consent flow and how the
   scope is used, for Google's verification review (usually an unlisted
   YouTube link).
6. **CASA security assessment** — required for restricted scopes like
   `adwords`. Real third-party security review; may involve real cost and
   time. Biggest unknown in this list.
7. **Brand Verification** on the Cloud project — required before Basic Ads
   API access level can even be applied for (separate from OAuth
   verification above).
8. Switch OAuth consent screen publishing status Testing → **In
   production**, then formally submit for verification. Google review
   typically takes weeks, often with back-and-forth questions.

Until then: to let a new person use the app, just add their Google account
as a test user in Cloud Console → Google Auth Platform → Audience → Test
users. No Google review needed for that.

## 8. Questions asked during this session, and the answers given

| Question | Answer |
|---|---|
| Tech stack? | Next.js |
| New Google Cloud project, or reuse one? | New |
| Agree to Google API Services: User Data Policy? | Confirmed |
| Which Google account should own the GCP project? | `eaguilera@gmail.com` |
| Which subdomain? | `adshealth.quarizmi.com` |
| Hosting platform? | Google Cloud (specifically Cloud Run + a Load Balancer + static IP, once clarified — see §5) |
| Which Google account(s) as OAuth test users? | `automation@quarizmi.com` |
| Developer token value? | Provided directly by the owner, wired into `.env.local` and Cloud Run env vars, never echoed back in chat |
| Who should be able to use the app (re: full verification)? | "Anyone, without being pre-approved" — but then the owner decided to defer the whole verification process until more functionality exists (see §7) |

## 9. Technologies in use

- **Next.js 16** (App Router, TypeScript, Turbopack), **React 19**
- **Auth.js** (`next-auth@5` beta) for Google OAuth
- **Google Ads API** (REST, currently `v25`) via plain `fetch` — no
  official client library
- **Google Cloud:** Cloud Run (hosting), Compute Engine load-balancing
  resources (static IP, Serverless NEG, backend service, URL map, managed
  SSL cert, HTTPS/HTTP proxies, forwarding rules), Cloud Build / Artifact
  Registry (via Buildpacks, triggered by `gcloud run deploy --source`)
- **Cloudflare** — DNS only, for the `quarizmi.com` zone (A record for
  `adshealth`), managed manually by the owner
- **Node.js ≥21** (pinned via `package.json` `engines`, required for
  `Map.groupBy`)

## 10. Not yet done / explicitly out of scope so far

- No git repository has been initialized for this project yet.
- No automated tests — every feature so far has been verified by the owner
  manually signing in on the live production URL and reporting back exact
  output/errors.
- No removal/testing of the (possibly now-unnecessary) developer token
  header.
- No decision yet on what comes after keywords/auto-apply-rules — ask the
  owner what's next.

## 11. Benched: "Competitors" feature on the account page

The owner wants a "Competitors" button/section on the account detail page
(`src/app/accounts/[customerId]/page.tsx`) showing competitor/auction-insight
data for that account. **Benched as of 2026-10-18** — no implementation yet,
tracked here so it isn't lost.

**Why it's benched:** the Google Ads API has no endpoint for Auction
Insights data (confirmed by web search 2026-10-18 — third-party reporting
tools DashThis and Swydo both state Google has never exposed it via the
REST/gRPC API, and it's also absent from Google Ads Scripts' `AdsApp`
reporting surface). This is a long-standing, still-current gap, not
something recently added to `google-ads.ts`'s query set — there's no query
to "try and let the error message tell us what's wrong" the way other
features in this project were built (see §4's closing note), because there
is no API resource to query at all.

**Options found, none implemented yet:**
1. **Scheduled Google Sheets export** (most promising / most "official"):
   Google Ads UI → Auction Insights report → Download → Google Sheets, can
   be scheduled recurring. The app could then read that Sheet via the
   Google Sheets API. Would need the user's Google OAuth scope extended to
   include Sheets read access (currently only requests the `adwords`
   scope — see `src/auth.ts`), plus a way to know which Sheet URL
   corresponds to which account.
2. **CSV export + manual/automated upload** — same underlying UI-only
   export, just without the Sheets middleman. More manual, no scheduling.
3. **Browser automation** (e.g. Claude in Chrome) to periodically open the
   report and scrape/download it — fragile, not suitable for an always-on
   hosted app; could work as a one-off/manual refresh path if nothing else
   pans out.
4. **Third-party competitive-intelligence APIs** (SEMrush, SpyFu,
   SimilarWeb, etc.) — give *estimated* competitor data, not the real
   Auction Insights numbers Google computes; would need a paid API key per
   vendor. Not evaluated in detail — only noted as an option.

**Next step when this is picked back up:** decide between option 1
(Sheets-based pipeline) and option 4 (third-party estimate data) as the
data source — they produce different kinds of answers to "who are our
competitors" — then scope the OAuth/infra changes needed before writing
any code.

**Owner's preferred direction (2026-10-18): option 1, Sheets-based
pipeline.** Mechanics worked out so far:
- **Setup (manual, per account, no API for this step):** in the Google Ads
  UI, open the account's Auction Insights report → Download → Google
  Sheets → Schedule (recurring). Per third-party guides (Swydo), each
  scheduled run writes a fresh Sheet into Google Drive; Google's own help
  center confirms scheduled account reports run around 1 A.M. in the
  account's time zone. There is no way to create this schedule via the API
  — it has to be clicked through once per client account, and re-checked if
  it ever silently stops (Google can cancel stale/failing scheduled
  exports).
- **App side:**
  - `src/auth.ts` needs an added OAuth scope (`spreadsheets.readonly` or
    `drive.readonly`) on top of the existing `adwords` scope — a new
    consent screen, and one more scope to justify later during the
    deferred Google verification review (§7).
  - Need a `customerId → Sheet ID` mapping maintained by hand — nothing in
    the exported Sheet's metadata/filename ties it back to the Google Ads
    customer ID automatically.
  - A new function, parallel to the existing pattern in `google-ads.ts`,
    calling the Sheets API's `spreadsheets.values.get` to read the latest
    rows.
  - Known data quirk: Google reports "<10%" instead of a number for small
    competitors — needs cleanup before any numeric comparison (one
    third-party guide suggests substituting 5%).
- **Tradeoff vs. third-party APIs (option 4):** this gets real,
  Google-computed numbers, at the cost of manual per-account setup that
  can't be automated, a new OAuth scope, and up to a day's data lag.

**First real attempt (2026-10-18), blocked on account access — here's
exactly where it stopped:**

Tried setting up the first scheduled export for the **tuAppbogado** client
account (837-167-8160) via browser automation in the Google Ads UI, signed
in as `automation@quarizmi.com`. Progress and findings:

- **Granularity:** The Auction Insights report has no "segment by ad
  group" breakout — Segment only offers None/Time/Device. The report is
  always one aggregated table of competitor domains vs. rates, computed
  over whatever scope you filter to. So "ad group-level" granularity means
  *filtering* the report to all ad groups (Campaigns → Ad groups → select
  all 178 on a single page — multi-page select isn't supported for this
  report, so the page size had to be bumped to 200 rows first — then
  "Auction insights" from the selection toolbar), not a per-ad-group
  breakdown in the output. This filtered-to-all-178-ad-groups view was
  reached and confirmed working.
- **Export format:** Download → Schedule → format "Google Sheets" (not
  CSV/Excel/PDF) was selected, confirming it's a one-time Drive-share
  notification, not a recurring email, and the file lands in the
  recipient's **My Drive**, not a shared location.
- **Blocker: the "Recipient" field.** Scheduling (even to Google Sheets)
  requires a Recipient, and this field only accepts emails that are
  **already explicit users on that specific child account's own Access and
  Security page** — manager-account access via the MCC link does *not*
  count, even though it grants full operational access in every other part
  of the UI. Confirmed this the hard way: neither `automation@quarizmi.com`
  (the signed-in manager-account user) nor `eaguilera@gmail.com` validated,
  despite both having real access to the account through the manager
  hierarchy. The only valid recipients Google Ads offered were three
  users already on the account: `david.plaza@tuappbogado.es`,
  `tuappbogado@gmail.com`, `tuappbogadopublisem@gmail.com` — none of which
  the owner has login credentials for, so picking one would mean the Sheet
  becomes unreachable without a manual re-share afterward.
- **Also note:** adding `automation@quarizmi.com` as a user directly on
  this account requires admin rights the owner didn't have to hand on this
  particular account — the owner is working on getting someone to grant
  that access.
- **Decision:** wait for `automation@quarizmi.com` to be added as a proper
  user (not a one-off workaround email) on the tuAppbogado account, so the
  same recipient can be reused for every future client account's scheduled
  export, consistent with how that mailbox is already the standard for all
  of Quarizmi's Google Ads automation (see the top-level `CLAUDE.md`).

**To resume:** once `automation@quarizmi.com` is confirmed as a user on
tuAppbogado (or whichever account comes next), redo: Campaigns → Ad
groups → set rows-per-page to 200 (or whatever covers the full ad group
count) → select-all checkbox → Auction insights → Download → Schedule →
set format to **Google Sheets**, frequency to **Weekly**, Recipient to
`automation@quarizmi.com`. The frequency dropdown and recipient field
hadn't been fully completed when this was benched — only format (Google
Sheets) and the ad-group-level filter were confirmed working.

## 12. Session addendum — 2026-10-27

New since §2–§11 above (which still describe the dashboard feature as of
2026-10-18 and are otherwise unchanged):

- **Public GitHub repo added.** The app's source (minus the admin/CRM
  system and internal docs) is now also pushed to
  `github.com/Quarizmi/healthchecker` (public, MIT-licensed). This is a
  deliberate sanitized subset, not a mirror, kept in manual sync by
  choice — no CI/CD between it and production. Full details, exclusion
  list, and credentials in this project's memory
  (`healthchecker_github_split` — see the Claude memory index for this
  project).
- **Login/home page redesigned** (`src/app/page.tsx`,
  `src/app/page.module.css`): signed-out view is now a centered card with
  the Quarizmi logo, a short "Health Checker" title, "Google Ads Account
  Health Checker" tagline, and a one-paragraph explanation above the
  Google sign-in button, replacing the old plain heading + single
  sentence.
- **Fixed a footer bug** (`src/app/_components/Footer.tsx`): "Sign out"
  and "Revoke access" were showing even when no one was signed in. Footer
  is now `async`, reads the session, and only renders those two links
  inside `{session?.user && (...)}`; the copyright line always shows.
- **Added Google Tag Manager** (`GTM-KVKTT5J6`) site-wide via
  `src/app/layout.tsx` — standard loader `<Script>` in `<head>` plus the
  `<noscript>` iframe fallback right after `<body>`, so it's present on
  every page without per-page wiring.
- **Deployed to production**, revision `adshealth-00039-rhz`, same
  `gcloud run deploy adshealth --source .` command as always (§6). All
  three changes above are live at `adshealth.quarizmi.com`.
- Also installed and authenticated `gcloud` CLI on this machine for the
  first time this session (account `eaguilera@gmail.com` — see §6 and the
  GitHub-split memory note for why that account specifically).
