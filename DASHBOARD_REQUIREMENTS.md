# Dashboard Requirements — Account Health Score (v0.2)

Written 2026-10-18. This captures the first brainstorming pass on what the
Health Checker shows once someone logs in and picks an account. Status:
metrics 1–8's logic is resolved (see each section below); **Phase 1 of the
build is live in production** as of 2026-10-18 — 5 of the 8 metrics
(#2, #3, #4, #6, #8) are wired up and scoring real accounts; #1, #5, #7
render as "Pending" until Phase 2/3 (see §2.1a and each metric's own
section for what's blocking them).

**Verified live against tuAppbogado (837-167-8160):** overall score 80/100
("Good"). One real bug was caught and fixed during verification: the
keyword-utilization query (`keyword_view` with a date-range filter) returns
one row per keyword per day with impressions, so the raw row count
over-counted distinct keywords (showed 298% before the fix) — fixed with a
dedupe in `getKeywordUtilization` plus a defensive 100% clamp in
`scoreKeywordUtilization`, since a keyword can legitimately get paused
mid-window after serving impressions (real churn, not a bug).

**Known issues found during this verification pass, not fixed (out of
Phase 1's scope):**
- `src/auth.ts` has no refresh-token renewal logic — a long-lived session's
  access token can expire, surfacing as a 401 on every Google Ads API call
  until the user signs out and back in. Pre-existing, not introduced by
  this feature.
- The "Auto-apply recommendation rules" list in
  `src/app/accounts/[customerId]/page.tsx` uses `key={rule.type}`, and the
  browser console showed React "duplicate key" warnings for it against a
  real account — first live confirmation that `recommendation_subscription`
  can return multiple rows with the same `type`. Pre-existing, unrelated to
  the health dashboard.

## 1. Vision

Google Ads' own UI already shows raw performance numbers (cost, clicks,
conversions, Quality Score, Optimization Score, etc.). This dashboard is
deliberately *not* another view of those same numbers. Instead it answers
a different question: **is this account being managed well**, judged
against the owner's own view of good Google Ads account management —
not Google's.

Core design principles:

- **Qualitative over quantitative.** Metrics here are signals of
  management quality/neglect, not raw performance. "Conversions" and
  "cost" are not dashboard metrics on their own — "has anyone touched
  this account in 30 days" is.
- **Context-scaled thresholds, not fixed ones.** What counts as a red
  flag depends on account size (spend/conversion volume). A small account
  spending 80% of budget on Performance Max is a worse signal than a
  large one doing the same, because PMax needs conversion volume to
  optimize. Every threshold below should be designed to scale with
  account size, not be a single hardcoded number.
- **One overall score, 0–100.** All metrics roll up into a single score
  per account, shown prominently, with the 8 underlying signals visible
  as the "why" behind the number.

## 2. The 8 metrics (draft)

Each entry: what it measures, why it signals management quality (not
just performance), the Google Ads API data it needs, and a draft
scoring/threshold note.

### 2.1 Campaign-type spend concentration (scaled to account size & business type) — RESOLVED v0.2

- **Measures:** % of spend by campaign type (Search, Performance Max,
  Shopping, Display, Demand Gen) over the last 30 days, against an
  expected shape that depends on the account's **business type**.
- **Why it matters:** What "too much PMax" means depends on both how
  much conversion data the account has to work with *and* what kind of
  business it is. A heavy PMax/Shopping allocation is a risk signal for
  a lead-gen account (loss of Search control) but can be the *expected,
  healthy* shape for an e-commerce account — so the same number means
  opposite things depending on context. This metric cannot be judged
  from Google Ads data alone; it needs one manually-set fact about the
  account.
- **New account profile field: `business_type`.** `lead_gen` |
  `ecommerce`. Not derivable from the Google Ads API reliably — asked
  directly when an account is first added to the dashboard ("Is this
  client's business lead generation or e-commerce?"). Stored in a
  config file (see §2.1a below), not inferred.
- **Conversion counting:** account-wide, **primary conversion actions
  only** (Google Ads distinguishes primary vs. secondary conversion
  actions; secondary ones — e.g. newsletter signups tracked for
  visibility but not counted toward goals — are excluded). Data source:
  `conversion_action` filtered to primary, joined to `metrics.conversions`
  — same resource §2.7 needs, not yet wired up in `google-ads.ts`.
- **Logic — lead-gen accounts** (PMax share is a ceiling; too high is
  the risk):

  | Primary conversions (30-day, account-wide) | Max acceptable PMax share |
  |---|---|
  | < 50/mo | 20% |
  | ≥ 50/mo | 50% |

- **Logic — e-commerce accounts** (inverted: Shopping/PMax share is a
  *floor*; too low is the risk — the business isn't using the channel
  built for it):

  | Primary conversions (30-day, account-wide) | Min expected Shopping + PMax share |
  |---|---|
  | any | 70% *(provisional — needs calibration against real e-commerce client accounts; not backed by external research the way the lead-gen tiers are)* |

- **Open sub-question, deferred:** Shopping campaigns appearing on a
  lead-gen account (or zero Shopping/PMax on an e-commerce account) may
  deserve their own flag beyond the share-threshold logic above — not
  designed yet, revisit after the first real accounts are scored.

### 2.1a Threshold configuration system (new, cross-cutting infrastructure)

This account-size/business-type logic is the first metric to need
tunable thresholds, but the owner wants this to be general
infrastructure other metrics can plug into later, not something
one-off to §2.1. Requirements:

- **Lives in a config file checked into the repo**, not a database —
  consistent with this project's current scope (no DB yet).
- **Layered overrides, most specific wins:** per-customer override >
  industry > country > business-type default. ("Qualifying" an
  account, in the owner's words, is the conversion-volume tier
  already built into §2.1's logic — not a separate layer.)
- **Two files, two concerns:**
  - An **account profile** file/section: customer ID → `business_type`
    (required), optionally `country`, `industry`. This is manually
    maintained — populated by the onboarding question above.
  - A **thresholds** file/section: the default tables per business
    type (§2.1's two tables), plus optional override blocks keyed by
    country, industry, or a specific customer ID, resolved at read time
    by precedence.
- **Draft shape** (illustrative, not final):

  ```json
  {
    "defaults": {
      "lead_gen": {
        "pmax_share_cap": [
          { "max_conversions_per_month": 50, "max_pmax_share_pct": 20 },
          { "max_conversions_per_month": null, "max_pmax_share_pct": 50 }
        ]
      },
      "ecommerce": {
        "shopping_pmax_share_floor": [
          { "max_conversions_per_month": null, "min_shopping_pmax_share_pct": 70 }
        ]
      }
    },
    "overrides": {
      "by_country": {},
      "by_industry": {},
      "by_customer_id": {}
    },
    "brandDetection": {
      "campaignNameKeywords": ["brand", "marca"]
    }
  }
  ```

  (`brandDetection.campaignNameKeywords` feeds §2.2 — a flat, generic
  list for now; not layered by country/industry/customer like the
  numeric thresholds, since there's no indication yet that it needs to
  be. Revisit if a client turns out to need a conflicting keyword.)

- **Not designed yet:** the onboarding UI/flow where someone sets
  `business_type` (and optionally country/industry) for a new account
  — out of scope for this requirements pass, needed before §2.1 can
  actually ship.

### 2.2 Brand campaign presence — RESOLVED v0.2 (v1 scope: presence only)

- **Measures:** does the account have at least one campaign whose name
  matches a configured brand keyword?
- **Why it matters:** No dedicated brand campaign usually means either
  wasted spend (branded traffic competing inside generic campaigns at
  generic CPCs) or a structural gap in account setup.
- **Detection: automatic, config-driven, no onboarding step.** The
  owner explicitly wants onboarding kept minimal, so this is a
  **case-insensitive substring match of campaign name against a
  configurable keyword list** — not a manual per-account tag. Default
  list: `["brand", "marca"]`. Lives in the same config file as §2.1a's
  thresholds (not hardcoded), so new keywords (other languages, other
  client-specific brand-campaign naming habits) can be added as they
  come up without a code change.
- **Data source:** `campaign` list + `campaign.name` — already
  available via the existing `listCampaigns` query, no new API resource
  needed.
- **Scoring (v1):** binary — Good if ≥1 campaign name matches, Critical
  if none do.
- **Deferred to v2: isolation.** Checking whether brand is *excluded*
  from PMax/generic campaigns (the cannibalization half of the original
  idea) is out of v1 scope — it needs keyword-level analysis across
  every non-brand campaign, and PMax doesn't expose exclusion settings
  via the API the same way Search keywords do (unconfirmed whether it's
  queryable at all). Revisit once presence-only is live and useful.

### 2.3 Keyword utilization rate — RESOLVED v0.2

- **Measures:** % of enabled keywords that received ≥1 impression in the
  last N days.
- **Why it matters:** A large fraction of never-serving keywords signals
  a bloated, "set and forget" keyword list rather than active curation.
- **Lookback window:** 30 days default, **configurable** — add
  `keywordUtilization.lookbackDays` to the thresholds config file
  (§2.1a) rather than hardcoding it.
- **Scoring curve:** >80% utilization = full points (12.5), <50% = zero,
  linear in between.
- **Data source:** `keyword_view` with `metrics.impressions`, compared
  against total enabled keyword count.
- **Open nuance, deferred:** a keyword or campaign added in the last few
  days hasn't had a fair chance to get an impression yet, so a very new
  account/campaign could look artificially bad. Not designed yet —
  possible fix is excluding recently-added keywords from the
  denominator, revisit once real accounts surface this as an actual
  problem rather than a theoretical one.

### 2.4 Negative keyword list coverage — RESOLVED v0.2 (minimal bar, to be deepened later)

- **Measures:** does any Search campaign that has at least one
  broad-match keyword lack negative-keyword coverage entirely — neither
  a shared negative list applied, nor any campaign-level negative
  keywords of its own?
- **Scope:** only Search campaigns containing ≥1 broad-match keyword
  qualify for this check. A campaign running only phrase/exact match
  isn't evaluated.
- **"Covered" means either of:** a shared negative keyword list (`shared_set`
  / `shared_criterion`) attached to the campaign, **or** campaign-level
  negative keywords (`campaign_criterion`, negative, type `KEYWORD`)
  directly on it. Either satisfies the check — not both required.
- **Scoring: binary, all-or-nothing — not a graduated %.** If **any**
  qualifying campaign has zero coverage (neither kind), the whole
  metric scores zero. This is a harder line than most of the other
  metrics here (which roll up to a percentage); the owner was explicit
  that even one uncovered broad-match campaign is a red flag worth a
  zero, not a partial deduction.
- **Data source:** `keyword_view` (match type, to find qualifying
  campaigns) + `shared_criterion`/`shared_set` + `campaign_criterion`
  (negative keywords).
- **Explicitly a minimum bar, not the full picture.** The owner flagged
  that this check only catches the worst case (zero negatives at all) —
  it says nothing about whether the negatives that *do* exist are any
  good. A better measure of negative-keyword *management quality* (not
  just presence) is intentionally deferred — owner to research further
  before this gets refined.

### 2.5 Account activity / neglect signal — RESOLVED v0.2

- **Measures:** % of active campaigns with no qualifying change in the
  last 30 days.
- **Why it matters:** Directly answers "is anyone managing this
  account."
- **What counts as a change — everything except campaign-level
  pause/unpause.** Explicitly confirmed: pausing/unpausing a *keyword*
  or an *ad group* counts as activity; adding negatives, bid changes,
  budget changes, and ad edits all count. The one specific exclusion is
  toggling a **campaign's** own enabled/paused status — that's often
  automated or trivial (seasonal on/off) and doesn't reflect active
  optimization.
- **Lookback window:** 30 days, **configurable** (same pattern as
  §2.3's `lookbackDays`).
- **Scoring:** a curve, same shape as §2.1/§2.3 — default proposal:
  0% stale campaigns = full points (12.5), ≥50% stale = zero, linear
  between. Breakpoints belong in the thresholds config file like
  everything else here, not hardcoded.
- **Data source:** `change_event` resource — **not yet wired up** in
  `google-ads.ts`, and the exact field(s) to distinguish "campaign
  status-only change" from everything else are **unverified against a
  live API response** (same caveat as other not-yet-tested queries in
  this project, see `HANDOFF.md` §4) — `change_event.change_resource_type`
  / `resource_change_operation` look like the right fields based on the
  resource's documented shape, but this needs confirming once actually
  queried.

### 2.6 Ad coverage per ad group — RESOLVED v0.2

- **Measures:** % of (qualifying) ad groups with at least 2 active ads.
- **Why it matters:** Single-ad ad groups are fragile (no A/B signal for
  Smart Bidding to learn from) and often indicate accounts that haven't
  been touched since initial setup.
- **Minimum bar: 2 active ads** (confirmed, not changed from the draft).
- **Scope: only ad groups with actual activity qualify** — an ad group
  with zero impressions in the lookback window is excluded from the
  denominator, so empty/unused ad groups don't skew the percentage.
  Same 30-day-default, configurable lookback pattern as §2.3/§2.5.
- **Ad strength: deferred, not in v1.** Treated as a separate
  signal/metric for later rather than folded into this one now — this
  metric stays purely about ad *count* per ad group.
- **Scoring curve:** same shape as §2.3 — >80% of qualifying ad groups
  meeting the 2-ad bar = full points (12.5), <50% = zero, linear
  between. Breakpoints live in the thresholds config file.
- **Data source:** `ad_group_ad` count per `ad_group`, filtered to
  ad groups with impressions in the lookback window.

### 2.7 Conversion tracking integrity — RESOLVED v0.2

- **Measures:** whether any primary conversion action that's active,
  properly configured, and connected to campaigns is recording zero
  conversions over the last 30 days.
- **Why it matters:** Every audit methodology reviewed treats this as the
  highest-priority signal — if tracking is broken, every other metric
  (including the other 7 here) is built on fiction.
- **Trigger: ANY, not ALL.** Confirmed — one dead primary conversion
  action among several working ones still triggers this (not just
  "all primary conversions are at zero"). Reasoning, in the owner's
  words: if it's active, configured, and connected to campaigns, and
  getting zero data, something's wrong — whether that's broken
  tracking or something that should've been cleaned up and wasn't.
- **New-conversion-action carve-out: confirmed.** Same shape as §2.3's
  new-keyword carve-out — a primary conversion action created very
  recently (within the lookback window) is excluded from the check
  rather than immediately flagged as broken. Exact age cutoff: TBD,
  default to the same lookback window (30 days) for now.
- **Scoring: GATES the overall score, confirmed — not a weighted
  12.5-point component.** If triggered, the overall score is capped
  (draft default: **40/100**) regardless of how the other 7 metrics
  score. The 40/100 cap value itself wasn't explicitly re-confirmed in
  this pass (only the gating approach was) — treat it as the current
  default, adjustable via the thresholds config like everything else.
- **Data source:** `conversion_action` resource (status, `primary_for_goal`,
  and ideally a creation-date field for the age carve-out) — **not yet
  wired up** in `google-ads.ts`, and whether `conversion_action` exposes
  a usable creation timestamp is **unverified against a live API
  response**.

### 2.8 Budget-constrained campaign share — RESOLVED v0.2

- **Measures:** % of active campaigns currently "limited by budget"
  (losing impression share due to the budget cap, not targeting/bids).
- **Why it matters:** A structural/attention signal — is the account
  funded to match its own targeting? Different from a raw performance
  number because it's about account *setup* coherence, not outcomes.
- **Scoring curve, confirmed:** 0% limited = full points (12.5), >40%
  limited = zero, linear between.
- **Business-type interaction: flat for now, but configurable.**
  Unlike §2.1, this metric is *not* split by lead-gen vs. e-commerce
  yet — treated as equally bad for either. But the owner wants the
  threshold (currently that 40% ceiling) to live in the same layered
  config system as §2.1a (global default → industry override → client
  override), so a business-type or per-client split can be added later
  without a code change. Not a business-type split today, just
  config-ready for one.
- **Detection method, confirmed:** inferred from
  `metrics.search_budget_lost_impression_share` crossing a threshold
  (e.g. >10% lost to budget = "limited"), rather than relying on a
  single clean "limited by budget" API field (there isn't one).
- **Data source:** `campaign_budget` + `metrics.search_budget_lost_impression_share`.

## 3. Score composition (draft)

- 8 metrics, each worth up to 12.5 points, summing to 100 — still the
  working assumption for 7 of the 8.
- **§2.7 (conversion tracking) is a hybrid, confirmed:** it still
  contributes its own 12.5 points to the sum like the other 7 when
  passing. But when it's triggered (broken/zero-data primary
  conversion), the **final summed score is additionally capped** at a
  configurable ceiling (draft default 40/100) regardless of what the
  other 7 metrics add up to. So a broken-tracking account can never
  show as "healthy" even if everything else about it looks fine.
- Each metric's dashboard card should show: current status
  (Good/Warning/Critical), the underlying number, and a one-line
  plain-English explanation of why it matters — not just a score
  contribution, so the "why" is visible without digging.

## 4. Open questions (to resolve before/while building)

1. ~~Conversion-volume tiers for §2.1~~ — **resolved**, see §2.1/§2.1a.
   Remaining sub-items: the 70% e-commerce floor is provisional and
   needs calibration against real accounts; the onboarding flow for
   setting `business_type` per account isn't designed yet.
2. ~~Gating vs. weighting for §2.7~~ — **resolved**: both — see §3.
   The 40/100 cap value itself is still just a default, not explicitly
   re-confirmed.
3. ~~Brand campaign detection (§2.2)~~ — **resolved**: automatic,
   config-driven keyword matching, no manual tag. Isolation
   (cannibalization check) deferred to v2.
4. **Score history:** is this a point-in-time snapshot each time someone
   opens the account page, or should scores be stored over time to show
   a trend? (Affects whether this needs a database, not just live API
   calls.) **Still fully open** — not discussed in the metric-by-metric
   pass.
5. **Per-metric threshold tuning:** all 8 metrics now have a default
   curve/value and a config file to hold it (§2.1a), but most of those
   defaults (the e-commerce 70% floor especially) are still
   best-guesses, not calibrated against real Quarizmi client accounts.
   Infrastructure is resolved; the actual numbers are an ongoing
   tuning task as real accounts get scored.
6. **New API surfaces needed:** `change_event` (§2.5) and
   `conversion_action` (§2.7) aren't wired up in `google-ads.ts` yet —
   both unverified against live API responses, same caveat as other
   not-yet-tested queries in this project (see `HANDOFF.md` §4). Two
   specific unverified sub-details found during this pass: whether
   `change_event` cleanly distinguishes a campaign-status-only change
   from everything else (§2.5), and whether `conversion_action` exposes
   a usable creation date for the new-conversion-action carve-out
   (§2.7).
7. **Onboarding flow for `business_type`:** not designed — needed before
   §2.1 can actually ship (see §2.1a).
8. **Deferred to v2, each noted in its own section:** brand campaign
   isolation (§2.2), deeper negative-keyword quality beyond
   presence/absence (§2.4), ad strength as its own signal (§2.6).

## 5. Explicitly out of scope for v0.1

- The benched Competitors/Auction Insights feature (see `HANDOFF.md`
  §11) — separate effort, blocked on account access as of 2026-10-18.
- Any cross-account/portfolio view (this is a single-account dashboard
  for now).
- Automated fixes/actions — this dashboard surfaces problems, it doesn't
  act on them.
