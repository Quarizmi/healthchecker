# Account Health Dashboard — Build Status

Written 2026-10-18, right after Phase 1 shipped to production. Meant to let
anyone — a person or another AI — pick this feature up cold: what exists,
exactly what's live right now, and a concrete punch list of what's left.
Companion documents: `DASHBOARD_REQUIREMENTS.md` (the full spec behind every
metric's logic and threshold) and `HANDOFF.md` (the rest of the app —
auth, hosting, infra).

## 1. What this feature is

A 0–100 "account health score" shown at the top of
`/accounts/[customerId]` — qualitative management-quality signals the
owner cares about (is this account being actively managed well), not a
restatement of Google's own metrics or its Optimization Score. Built from
8 metrics defined in `DASHBOARD_REQUIREMENTS.md`, each worth up to 12.5
points, rolling up into one score with a Good/Needs Attention/Critical
tier.

## 2. What's deployed right now

**Live at:** `https://adshealth.quarizmi.com` (production, Google Cloud
Run), also reachable at the raw Cloud Run URL
`https://adshealth-234387825380.europe-west1.run.app`.

**Deployed revision:** `adshealth-00010-rsf`, deployed 2026-10-18 via
`gcloud run deploy adshealth --source . --region europe-west1 --project
quarizmi-health-checker` (same command as every prior deploy in this
project — see `HANDOFF.md` §6).

**Verified live** against the real tuAppbogado account
(customer ID `837-167-8160` / `8371678160`, under manager account
`832-437-9185`): overall score **80/100, "Good"**, all 5 live metrics
returning sensible numbers with no query errors, both locally
(`localhost:3000`) and on the production URL after a fresh sign-in.

### Metric-by-metric status

| # | Metric | Status | Notes |
|---|---|---|---|
| 1 | Campaign-type spend concentration | **Pending** | Needs `conversion_action` (Phase 2) + a `business_type` profile per account |
| 2 | Dedicated brand campaign | **Live** | Config-driven keyword match (`brand`, `marca`), no onboarding step |
| 3 | Keyword utilization rate | **Live** | 30-day window, config-driven curve |
| 4 | Negative keyword coverage | **Live** | All-or-nothing: any uncovered broad-match campaign zeroes this metric |
| 5 | Account activity | **Pending** | Needs `change_event` (Phase 3) |
| 6 | Ad coverage per ad group | **Live** | 2-ad minimum, only ad groups with real impressions count |
| 7 | Conversion tracking integrity | **Pending** | Needs `conversion_action` (Phase 2); also the score **gate** (caps overall score at 40/100 if triggered) — the gate mechanism is live in the aggregator, just can never fire until this metric ships |
| 8 | Budget-constrained campaigns | **Live** | Inferred from `metrics.search_budget_lost_impression_share` > 10% |

3 of 8 pending metrics render as a grey "Pending" card and are excluded
from the score math — the dashboard is honest about what it can't show
yet rather than guessing or crashing.

## 3. What was built — architecture

**New files:**

```
src/config/health-thresholds.json       — all 8 metrics' thresholds, layered by business type / country / industry / customer
src/config/account-profiles.json        — manual per-account facts (business_type, country, industry) — currently just tuAppbogado, business_type unknown
src/lib/health-config.ts                — loads + resolves the layered config (getAccountProfile, resolveThresholds)
src/lib/health-score.ts                 — the scoring engine: types, linearPoints curve math, one score* function per live metric, pendingMetric/errorMetric stubs, aggregateHealthScore
src/app/accounts/[customerId]/_components/HealthDashboard.tsx
src/app/accounts/[customerId]/_components/ScoreRing.tsx
src/app/accounts/[customerId]/_components/SignalCard.tsx
src/app/accounts/[customerId]/_components/MeterBar.tsx
src/app/accounts/[customerId]/_components/fonts.ts   — Manrope/Source Sans 3/JetBrains Mono via next/font/google, scoped to this route
src/app/accounts/[customerId]/health-dashboard.module.css
```

**Modified files:**

- `src/lib/google-ads.ts` — 5 new exported functions (`getKeywordUtilization`,
  `getNegativeKeywordCoverage`, `getAdCoveragePerAdGroup`,
  `getSearchBudgetLostImpressionShare`), each following the file's existing
  conventions exactly (try/catch, `{ ok, ... } | { ok: false, error }`,
  the shared `googleAdsSearch<T>` helper). Metric #2 needed no new
  function — it reuses the existing `listCampaigns`.
- `src/app/accounts/[customerId]/page.tsx` — fetches the 4 new data
  sources in parallel alongside the existing campaigns/auto-apply calls,
  builds the 8-entry metrics array, calls `aggregateHealthScore`, renders
  `<HealthDashboard>` above the existing campaigns/keywords section
  (which is otherwise untouched). `<h1>` changed from "Campaigns for
  {customerId}" to "Account {customerId}" since there are now two major
  sections on the page.

**Design decisions worth knowing if you're extending this:**

- Config is **statically imported JSON**, not read from disk at runtime —
  `resolveJsonModule` in `tsconfig.json` already supports this, and this
  project's deploy flow is fully manual anyway, so "edit JSON, redeploy"
  matches how everything else here already works.
- The scoring engine supports a `"pending"` status distinct from
  good/warning/critical from day one, specifically so metrics #1/#5/#7
  could ship later without any rework to the aggregator, types, or UI —
  confirmed working as designed.
- The conversion-tracking gate (metric #7) is wired into
  `aggregateHealthScore` as a no-op in Phase 1 (`gate: { triggered: false,
  ... }`) — when Phase 2 ships a real scoring function for it, the
  aggregator itself needs zero changes.
- Fonts are loaded in a route-scoped module
  (`_components/fonts.ts`), not `layout.tsx`, so pages that never render
  the dashboard (like sign-in) don't pay for 3 extra font families.

## 4. What needs to be fixed

### Bugs found during live verification, already fixed

- **Keyword utilization showed 298%** before the fix — the `keyword_view`
  query is date-range-filtered, so a keyword with impressions on multiple
  days came back as multiple rows; raw row count was used instead of a
  distinct count. Fixed: `getKeywordUtilization` now dedupes by criterion
  ID, and `scoreKeywordUtilization` additionally clamps the result to
  100% defensively (a keyword can legitimately get paused mid-window
  after serving impressions — real churn, not a bug, but the UI should
  never show over 100% regardless of cause).

### Bugs found, NOT fixed (pre-existing, outside this feature's scope)

- **`src/auth.ts` has no refresh-token renewal logic.** Confirmed live: a
  stale production session returned `401 UNAUTHENTICATED` from the Google
  Ads API on every card until signing out and back in. `account.refresh_token`
  is issued (scope requests `access_type: "offline"`) but nothing in
  `auth.ts`'s `jwt` callback uses it to renew an expired `access_token`.
  Fix would live entirely in `src/auth.ts`'s `jwt` callback — check token
  expiry, call Google's token endpoint with the refresh token if expired.
- **Duplicate React keys in the "Auto-apply recommendation rules" list** —
  `src/app/accounts/[customerId]/page.tsx` uses `key={rule.type}` for
  `autoApplyResult.rules.map(...)`. Console showed React's "duplicate key"
  warning against the real tuAppbogado account — first live confirmation
  that `recommendation_subscription` can return multiple rows sharing the
  same `type`. Trivial fix (e.g. index-suffixed key), just not done since
  it's unrelated to this feature.

### Phase 2 — not started

Wire up `conversion_action` (new `listConversionActions`-style function in
`google-ads.ts`), then replace the `pendingMetric(...)` calls for metrics
#1 and #7 in `page.tsx` with real scoring functions in `health-score.ts`.
Nothing else needs to change — the aggregator, types, and UI already
support this.

**Blocking sub-task:** tuAppbogado's `business_type` (lead_gen vs
ecommerce) is unknown — `account-profiles.json` has it as `null`.
Metric #1 can't score for this account until someone answers that,
even after Phase 2 ships the query.

### Phase 3 — not started

Wire up `change_event` (new `listChangeEvents`-style function), replace
the `accountActivity` `pendingMetric` the same way. The hardest part flagged
in advance: distinguishing a campaign-status-only change (excluded, per
the resolved spec) from every other kind of change (included) —
`change_event.change_resource_type` / `resource_change_operation` look
like the right fields based on the resource's documented shape, but this
is **unverified against a live API response**.

### Design decisions still open (from `DASHBOARD_REQUIREMENTS.md` §4)

- **Score history/trending** — not designed at all. Is this a
  point-in-time snapshot each time someone opens the account page (current
  behavior), or should scores be stored over time to show a trend? Would
  need a database — there isn't one yet.
- **Threshold calibration** — most defaults (especially the e-commerce
  70% Shopping/PMax floor) are best-guesses, not calibrated against real
  Quarizmi client accounts yet.
- **`business_type` onboarding** — no UI/flow exists for setting it;
  right now it's a manual edit to `account-profiles.json`.
- **Dark mode** — written correctly per the token pattern (light values
  on `:root`, dark values under `@media (prefers-color-scheme: dark)`
  scoped to `.dashboard`), but not visually confirmed — no way to toggle
  OS color scheme through the browser automation tools available in this
  session.

### Deferred to v2 (explicitly out of scope, not bugs)

- Brand campaign **isolation** (metric #2) — only presence is checked;
  whether brand is excluded from PMax/generic campaigns isn't.
- Negative keyword **quality** beyond presence/absence (metric #4) — the
  current check only catches the worst case (zero negatives at all).
- **Ad strength** as its own signal (metric #6) — this metric is purely
  about ad count per ad group right now.

## 5. How to verify any of this yourself

No test framework exists in this project (matches its established
pattern — see `HANDOFF.md` §10). To check current behavior:

```bash
npm run dev
# sign in as automation@quarizmi.com, open:
# http://localhost:3000/accounts/8371678160?loginCustomerId=8324379185
```

Or just visit `https://adshealth.quarizmi.com/accounts/8371678160?loginCustomerId=8324379185`
directly and sign in there.
