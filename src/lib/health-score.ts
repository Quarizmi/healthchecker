// Account health scoring engine — see DASHBOARD_REQUIREMENTS.md for the full
// spec behind every metric and threshold referenced here.

import type { BusinessType, PmaxShareCapTier, ShoppingPmaxFloorTier } from "./health-config";
import { displayError } from "./error-display";

export type MetricId =
  | "spendConcentration" // #1 — Phase 2 (needs conversion_action)
  | "brandPresence" // #2 — Phase 1
  | "keywordUtilization" // #3 — Phase 1
  | "negativeKeywordCoverage" // #4 — Phase 1
  | "accountActivity" // #5 — Phase 3 (needs change_event)
  | "adCoverage" // #6 — Phase 1
  | "conversionTrackingIntegrity" // #7 — Phase 2 (needs conversion_action)
  | "budgetConstrainedShare"; // #8 — Phase 1

export type MetricStatus = "good" | "warning" | "critical" | "pending";
export type ScoreTier = "good" | "warning" | "critical";

export type MetricResult = {
  id: MetricId;
  title: string;
  status: MetricStatus;
  points: number;
  maxPoints: number;
  value: number | null;
  valueLabel: string;
  meta: string;
  explanation: string;
  /** Longer-form, account-specific writeup for the detail view: what the
   * metric measures, the exact formula/thresholds used, and how this
   * account's own numbers landed where they did. Unlike `explanation`
   * (a fixed one-liner per metric type), this is generated per call so it
   * can cite the actual threshold values and computed figures. */
  methodology: string;
  /** 0-100, only set for percentage-shaped metrics with a meter bar. */
  meterPct?: number;
  /** Optional threshold tick mark position on the meter, 0-100. */
  thresholdTickPct?: number;
};

export type HealthScore = {
  overallScore: number;
  tier: ScoreTier;
  metrics: MetricResult[];
  availableMetricCount: number;
  totalMetricCount: number;
  pendingMetricIds: MetricId[];
  /** True when the account had zero ad spend in the last 30 days — the
   * health check wasn't attempted at all, not just incomplete. */
  noData?: boolean;
};

/** id/title/explanation for all 8 metrics — kept in one place so the
 * "no spend, nothing to evaluate" state can list every metric without
 * duplicating text that lives next to each real scoring function. */
const METRIC_META: { id: MetricId; title: string; explanation: string; methodology: string }[] = [
  {
    id: "spendConcentration",
    title: "Campaign-type spend concentration",
    explanation:
      "Checks PMax/Shopping share against what's healthy for this account's business type.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "brandPresence",
    title: "Dedicated brand campaign",
    explanation:
      "No dedicated brand campaign usually means wasted spend or a structural gap in account setup.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "keywordUtilization",
    title: "Keyword utilization rate",
    explanation: "A large block of never-serving keywords signals a bloated, set-and-forget list.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "negativeKeywordCoverage",
    title: "Negative keyword coverage",
    explanation:
      "A broad-match campaign with no negatives at all is a minimum-bar red flag, not a partial one.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "accountActivity",
    title: "Account activity",
    explanation: "Directly answers whether anyone has been managing this account recently.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "adCoverage",
    title: "Ad coverage per ad group",
    explanation: "Single-ad ad groups give Smart Bidding nothing to A/B learn from.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "conversionTrackingIntegrity",
    title: "Conversion tracking integrity",
    explanation:
      "Spend-weighted: a campaign counts fully only if every conversion action tied to its goal is actually recording data — a dead or abandoned action inside an active goal drags the score down in proportion to that campaign's spend.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
  {
    id: "budgetConstrainedShare",
    title: "Budget-constrained campaigns",
    explanation: "Shows whether the account is funded to match its own targeting.",
    methodology: "Needs ad spend in the last 30 days before this can be checked.",
  },
];

/** The health check isn't attempted at all for an account with zero spend
 * in the window — this builds the "nothing to evaluate" dashboard instead,
 * one neutral card per metric rather than 8 individual API calls. */
export function buildNoDataHealthScore(maxPoints: number): HealthScore {
  const metrics: MetricResult[] = METRIC_META.map((m) => ({
    id: m.id,
    title: m.title,
    status: "pending",
    points: 0,
    maxPoints,
    value: null,
    valueLabel: "No data",
    meta: "No ad spend in the last 30 days.",
    explanation: m.explanation,
    methodology: m.methodology,
  }));

  return {
    overallScore: 0,
    tier: "critical",
    metrics,
    availableMetricCount: 0,
    totalMetricCount: metrics.length,
    pendingMetricIds: metrics.map((m) => m.id),
    noData: true,
  };
}

/** Every card shows the same error (e.g. "Not signed in.") — used when the
 * health check can't start at all rather than failing metric by metric. */
export function buildErrorHealthScore(errorText: string, maxPoints: number): HealthScore {
  const metrics = METRIC_META.map((m) => errorMetric(m.id, m.title, errorText, maxPoints));
  return aggregateHealthScore(metrics);
}

function tierFor(score: number): ScoreTier {
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

function statusForFraction(fraction: number): MetricStatus {
  if (fraction >= 0.75) return "good";
  if (fraction >= 0.5) return "warning";
  return "critical";
}

/**
 * Linear interpolation between a "zero points" value and a "full points"
 * value. Handles both ascending curves (e.g. utilization: full at 80%, zero
 * at 50%) and descending ones (e.g. staleness: full at 0%, zero at 50%).
 */
function linearPoints(value: number, fullAt: number, zeroAt: number, maxPoints: number): number {
  if (fullAt === zeroAt) return value >= fullAt ? maxPoints : 0;
  const ascending = fullAt > zeroAt;
  const clamped = ascending
    ? Math.min(Math.max(value, zeroAt), fullAt)
    : Math.min(Math.max(value, fullAt), zeroAt);
  const fraction = ascending
    ? (clamped - zeroAt) / (fullAt - zeroAt)
    : (zeroAt - clamped) / (zeroAt - fullAt);
  return Math.round(fraction * maxPoints * 100) / 100;
}

/** A stub result for a metric whose data source isn't wired up yet
 * (Phase 2/3). Keeps the dashboard honest — not counted toward the score,
 * not shown as good/warning/critical. */
export function pendingMetric(args: {
  id: MetricId;
  title: string;
  meta: string;
  explanation: string;
  maxPoints: number;
}): MetricResult {
  return {
    id: args.id,
    title: args.title,
    status: "pending",
    points: 0,
    maxPoints: args.maxPoints,
    value: null,
    valueLabel: "Not yet available",
    meta: args.meta,
    explanation: args.explanation,
    methodology: "This metric's data source isn't wired up yet, so there's nothing to score.",
  };
}

/** A result for a metric whose underlying API call failed — surfaced as a
 * critical card carrying the raw error text, consistent with this app's
 * existing inline-error convention, rather than throwing. */
export function errorMetric(
  id: MetricId,
  title: string,
  errorText: string,
  maxPoints: number
): MetricResult {
  return {
    id,
    title,
    status: "critical",
    points: 0,
    maxPoints,
    value: null,
    valueLabel: "Error",
    meta: displayError(errorText),
    explanation: "This metric couldn't be loaded — see the error above.",
    methodology: "This metric couldn't be scored because the underlying data failed to load.",
  };
}

// --- Metric scoring functions: pure, data in -> MetricResult out ---

/** Picks the first tier whose cap the given conversion count qualifies
 * under (a null max_conversions_per_month tier always matches — it's the
 * catch-all "everyone above the lower tiers" bucket). */
function selectTier<T extends { max_conversions_per_month: number | null }>(
  tiers: T[],
  conversions: number
): T | undefined {
  return tiers.find(
    (t) => t.max_conversions_per_month === null || conversions < t.max_conversions_per_month
  );
}

export function scoreSpendConcentration(
  campaigns: { channelType: string; costMicros: string }[],
  primaryConversionsLast30Days: number,
  businessType: BusinessType,
  thresholds: {
    pmaxShareCap: PmaxShareCapTier[] | null;
    shoppingPmaxShareFloor: ShoppingPmaxFloorTier[] | null;
  },
  maxPoints: number
): MetricResult {
  const totalSpend = campaigns.reduce((sum, c) => sum + Number(c.costMicros), 0);
  const pmaxSpend = campaigns
    .filter((c) => c.channelType === "PERFORMANCE_MAX")
    .reduce((sum, c) => sum + Number(c.costMicros), 0);
  const shoppingSpend = campaigns
    .filter((c) => c.channelType === "SHOPPING")
    .reduce((sum, c) => sum + Number(c.costMicros), 0);

  const base = {
    id: "spendConcentration" as const,
    title: "Campaign-type spend concentration",
  };

  if (totalSpend === 0) {
    return {
      ...base,
      status: "pending",
      points: 0,
      maxPoints,
      value: null,
      valueLabel: "No spend",
      meta: "No campaign spend in the last 30 days to evaluate.",
      explanation:
        "Checks PMax/Shopping share against what's healthy for this account's business type.",
      methodology: "No campaign spend in the last 30 days, so there's nothing to check share against yet.",
    };
  }

  if (businessType === "lead_gen") {
    const tier = selectTier(thresholds.pmaxShareCap ?? [], primaryConversionsLast30Days);
    const cap = tier?.max_pmax_share_pct ?? 100;
    const pmaxPct = (pmaxSpend / totalSpend) * 100;
    // Full points at/under the cap, zero points once PMax share reaches
    // 1.5x the cap — a buffer rather than a hard cliff right at the line.
    const points = linearPoints(pmaxPct, cap, cap * 1.5, maxPoints);
    return {
      ...base,
      status: statusForFraction(points / maxPoints),
      points,
      maxPoints,
      value: pmaxPct,
      valueLabel: `${pmaxPct.toFixed(0)}%`,
      meta: `${pmaxPct.toFixed(0)}% of spend on PMax, ${primaryConversionsLast30Days} primary conversions/mo (lead-gen cap: ${cap}%).`,
      explanation:
        "High PMax share for this account's conversion volume — the algorithm doesn't have enough signal yet to optimize well at this size.",
      methodology: `We total this account's spend over the last 30 days and work out what share went to Performance Max campaigns. With ${primaryConversionsLast30Days} primary conversions/month, the cap we use for this account is ${cap}% — Performance Max tends to need more conversion volume than that to bid well, so going above it usually means the algorithm is running with too little signal. This account is at ${pmaxPct.toFixed(0)}%. Full points apply at or under ${cap}%; points fall off linearly to zero once PMax share reaches ${(cap * 1.5).toFixed(0)}% (1.5x the cap), so there's a buffer rather than a hard cliff right at the line.`,
      meterPct: Math.min(pmaxPct, 100),
      thresholdTickPct: cap,
    };
  }

  // ecommerce
  const tier = selectTier(thresholds.shoppingPmaxShareFloor ?? [], primaryConversionsLast30Days);
  const floor = tier?.min_shopping_pmax_share_pct ?? 0;
  const shoppingPmaxPct = ((shoppingSpend + pmaxSpend) / totalSpend) * 100;
  // Full points at/above the floor, zero points at/below half the floor.
  const points = linearPoints(shoppingPmaxPct, floor, floor / 2, maxPoints);
  return {
    ...base,
    status: statusForFraction(points / maxPoints),
    points,
    maxPoints,
    value: shoppingPmaxPct,
    valueLabel: `${shoppingPmaxPct.toFixed(0)}%`,
    meta: `${shoppingPmaxPct.toFixed(0)}% of spend on Shopping + PMax (e-commerce floor: ${floor}%).`,
    explanation:
      "Low Shopping/PMax share for an e-commerce account — likely underusing the channel built for this business.",
    methodology: `We total this account's spend over the last 30 days and work out what share went to Shopping + Performance Max — the channels built for product-based e-commerce discovery. With ${primaryConversionsLast30Days} primary conversions/month, the floor we use for this account is ${floor}%. This account is at ${shoppingPmaxPct.toFixed(0)}%. Full points apply at or above ${floor}%; points fall off linearly to zero at half that floor (${(floor / 2).toFixed(0)}%).`,
    meterPct: Math.min(shoppingPmaxPct, 100),
    thresholdTickPct: floor,
  };
}

export function scoreBrandPresence(
  campaignIds: string[],
  classifications: Record<string, { isBrand: boolean }>,
  maxPoints: number
): MetricResult {
  const matched = campaignIds.some((id) => classifications[id]?.isBrand);
  return {
    id: "brandPresence",
    title: "Dedicated brand campaign",
    status: matched ? "good" : "critical",
    points: matched ? maxPoints : 0,
    maxPoints,
    value: matched ? 1 : 0,
    valueLabel: matched ? "Present" : "Not found",
    meta: matched
      ? "At least one campaign is classified as a brand campaign."
      : "No campaign is classified as a brand campaign.",
    explanation:
      "No dedicated brand campaign usually means wasted spend or a structural gap in account setup.",
    methodology:
      "We check every campaign's classification — set automatically from this account's configured brand keywords, with manual overrides available in Account settings — for at least one marked as a dedicated brand campaign. This is scored as present/absent rather than a percentage: one dedicated brand campaign already captures nearly all the branded-search value a dedicated setup provides, so there's no meaningful partial credit between \"none\" and \"at least one.\"",
  };
}

export function scoreKeywordUtilization(
  input: { enabledKeywordCount: number; keywordsWithImpressionsCount: number },
  curve: { fullPointsAbovePct: number; zeroPointsBelowPct: number },
  maxPoints: number
): MetricResult {
  // Clamped to 100: a keyword can serve impressions on some days of the
  // window and then get paused before "now", so the raw ratio can exceed
  // 100% on an actively-managed account — that's legitimate churn, not
  // something this metric should ever display as over-utilized.
  const rawPct =
    input.enabledKeywordCount > 0
      ? (input.keywordsWithImpressionsCount / input.enabledKeywordCount) * 100
      : 0;
  const pct = Math.min(rawPct, 100);
  const points = linearPoints(pct, curve.fullPointsAbovePct, curve.zeroPointsBelowPct, maxPoints);
  return {
    id: "keywordUtilization",
    title: "Keyword utilization rate",
    status: statusForFraction(points / maxPoints),
    points,
    maxPoints,
    value: pct,
    valueLabel: `${pct.toFixed(0)}%`,
    meta: `${input.keywordsWithImpressionsCount} of ${input.enabledKeywordCount} enabled keywords served an impression.`,
    explanation:
      "A large block of never-serving keywords signals a bloated, set-and-forget list.",
    methodology: `We compare how many of this account's enabled keywords are actually serving impressions against how many exist. ${input.keywordsWithImpressionsCount} of ${input.enabledKeywordCount} enabled keywords served at least one impression, a ${pct.toFixed(0)}% utilization rate. Full points apply at or above ${curve.fullPointsAbovePct}%; points fall to zero at or below ${curve.zeroPointsBelowPct}%, scaling linearly in between. A keyword that serves on some days and then gets paused can push the raw ratio above 100%, which we clamp back to 100% rather than showing as "over-utilized."`,
    meterPct: pct,
    thresholdTickPct: curve.fullPointsAbovePct,
  };
}

export function scoreNegativeKeywordCoverage(
  input: { qualifyingCampaignIds: string[]; coveredCampaignIds: string[] },
  maxPoints: number
): MetricResult {
  const allCovered =
    input.qualifyingCampaignIds.length === 0 ||
    input.qualifyingCampaignIds.every((id) => input.coveredCampaignIds.includes(id));
  const gapCount = input.qualifyingCampaignIds.length - input.coveredCampaignIds.length;
  return {
    id: "negativeKeywordCoverage",
    title: "Negative keyword coverage",
    status: allCovered ? "good" : "critical",
    points: allCovered ? maxPoints : 0,
    maxPoints,
    value: allCovered ? 1 : 0,
    valueLabel: allCovered ? "Covered" : "Gap found",
    meta: allCovered
      ? "Every broad-match Search campaign has negative keyword coverage."
      : `${gapCount} broad-match campaign(s) with zero negative keyword coverage.`,
    explanation:
      "A broad-match campaign with no negatives at all is a minimum-bar red flag, not a partial one.",
    methodology: `We check every broad-match Search campaign in this account for at least some negative keyword coverage. ${allCovered ? "Every qualifying campaign has at least some negative keyword coverage." : `${gapCount} campaign(s) have zero negatives at all.`} This is a minimum-bar check, not a percentage — a campaign with zero negatives is a structural gap regardless of how thorough its negatives would need to be to call it "complete," so coverage is scored as present/absent rather than partial.`,
  };
}

/** Binary, account-wide: was there any qualifying change (anything other
 * than a campaign being paused/unpaused) anywhere in the account in the
 * last 30 days? Not broken out per campaign — this is about whether the
 * account as a whole is being actively managed. */
export function scoreAccountActivity(hasQualifyingActivity: boolean, maxPoints: number): MetricResult {
  return {
    id: "accountActivity",
    title: "Account activity",
    status: hasQualifyingActivity ? "good" : "critical",
    points: hasQualifyingActivity ? maxPoints : 0,
    maxPoints,
    value: hasQualifyingActivity ? 1 : 0,
    valueLabel: hasQualifyingActivity ? "Active" : "No activity",
    meta: hasQualifyingActivity
      ? "At least one change in the last 30 days beyond a campaign pause/unpause."
      : "No changes in the last 30 days other than campaign pausing/unpausing, if any.",
    explanation: "Directly answers whether anyone has been managing this account recently.",
    methodology: `We look at every change made to this account in the last 30 days and check whether any of them is something other than a campaign being paused or unpaused — pausing/unpausing alone doesn't count, since it can happen automatically or reflect routine budget management rather than active optimization. ${hasQualifyingActivity ? "At least one qualifying change was found." : "No qualifying change was found in the window."} This is scored as active/inactive, not a percentage: either the account shows signs of active management in the window, or it doesn't.`,
  };
}

export function scoreAdCoverage(
  input: { qualifyingAdGroupIds: string[]; adCountByAdGroupId: Record<string, number> },
  minActiveAds: number,
  curve: { fullPointsAbovePct: number; zeroPointsBelowPct: number },
  maxPoints: number
): MetricResult {
  const total = input.qualifyingAdGroupIds.length;
  const meeting = input.qualifyingAdGroupIds.filter(
    (id) => (input.adCountByAdGroupId[id] ?? 0) >= minActiveAds
  ).length;
  const pct = total > 0 ? (meeting / total) * 100 : 0;
  const points = linearPoints(pct, curve.fullPointsAbovePct, curve.zeroPointsBelowPct, maxPoints);
  return {
    id: "adCoverage",
    title: "Ad coverage per ad group",
    status: statusForFraction(points / maxPoints),
    points,
    maxPoints,
    value: pct,
    valueLabel: `${pct.toFixed(0)}%`,
    meta: `${meeting} of ${total} active ad groups have ${minActiveAds}+ enabled ads.`,
    explanation: "Single-ad ad groups give Smart Bidding nothing to A/B learn from.",
    methodology: `We check every ad group in this account that's eligible to carry multiple ads for whether it has at least ${minActiveAds} enabled ads — Smart Bidding needs more than one ad per ad group to actually A/B learn what performs best. ${meeting} of ${total} qualifying ad groups meet that bar, a ${pct.toFixed(0)}% coverage rate. Full points apply at or above ${curve.fullPointsAbovePct}%; points fall to zero at or below ${curve.zeroPointsBelowPct}%, scaling linearly in between.`,
    meterPct: pct,
    thresholdTickPct: curve.fullPointsAbovePct,
  };
}

/**
 * Spend-weighted: for each campaign with traffic, looks at every conversion
 * action tied to its configured goal (custom goal, campaign-specific
 * category goals, or the account-wide default) and what fraction of them
 * actually recorded a conversion *for that campaign* in the window. A
 * campaign where every action in its goal is converting counts fully;
 * zero of N counts for nothing — partial credit in between. Each
 * campaign's fraction is then weighted by its own share of total spend
 * across judged campaigns, so a dead action buried in a $5 campaign barely
 * moves the score, while the same thing in a campaign carrying half the
 * account's spend moves it a lot.
 *
 * Campaigns with no conversion actions in their goal at all (an empty goal
 * category with nothing matched) are excluded entirely — there's nothing
 * to judge, so they're neither a pass nor a fail.
 */
export function scoreConversionTrackingIntegrity(
  campaigns: {
    id: string;
    costMicros: string;
    goals: { actions: { conversionsLast30Days: number }[] }[];
  }[],
  curve: { fullPointsAbovePct: number; zeroPointsBelowPct: number },
  maxPoints: number
): MetricResult {
  const judged = campaigns
    .map((c) => {
      const actions = c.goals.flatMap((g) => g.actions);
      return {
        spend: Number(c.costMicros),
        total: actions.length,
        converting: actions.filter((a) => a.conversionsLast30Days > 0).length,
      };
    })
    .filter((c) => c.total > 0);

  const totalSpend = judged.reduce((sum, c) => sum + c.spend, 0);

  const base = {
    id: "conversionTrackingIntegrity" as const,
    title: "Conversion tracking integrity",
  };

  if (totalSpend === 0) {
    return {
      ...base,
      status: "pending",
      points: 0,
      maxPoints,
      value: null,
      valueLabel: "No spend",
      meta: "No campaign spend with a trackable conversion goal in the last 30 days to evaluate.",
      explanation:
        "Spend-weighted: a campaign counts fully only if every conversion action tied to its goal is actually recording data.",
      methodology:
        "No campaign spend with a trackable conversion goal in the last 30 days, so there's nothing to check conversion actions against yet.",
    };
  }

  const weightedFraction =
    judged.reduce((sum, c) => sum + (c.converting / c.total) * c.spend, 0) / totalSpend;
  const pct = weightedFraction * 100;
  const points = linearPoints(pct, curve.fullPointsAbovePct, curve.zeroPointsBelowPct, maxPoints);

  const brokenCampaigns = judged.filter((c) => c.converting < c.total);
  const brokenSpendPct = (brokenCampaigns.reduce((sum, c) => sum + c.spend, 0) / totalSpend) * 100;

  return {
    ...base,
    status: statusForFraction(points / maxPoints),
    points,
    maxPoints,
    value: pct,
    valueLabel: `${pct.toFixed(0)}%`,
    meta: `${brokenCampaigns.length} of ${judged.length} campaigns (${brokenSpendPct.toFixed(0)}% of spend) have a conversion action in their goal with zero conversions.`,
    explanation:
      "Spend-weighted: a campaign counts fully only if every conversion action tied to its goal is actually recording data — a dead or abandoned action inside an active goal drags the score down in proportion to that campaign's spend.",
    methodology: `For every campaign in this account with spend and a conversion goal, we look at each conversion action tied to that goal and check whether it recorded any conversions in the last 30 days. A campaign counts fully only if every action in its goal is converting; it counts for nothing if none are. Each campaign's fraction is then weighted by its own share of total judged spend, so a dead action in a small campaign barely moves the score while the same issue in the account's biggest campaign moves it a lot. ${brokenCampaigns.length} of ${judged.length} judged campaigns (${brokenSpendPct.toFixed(0)}% of judged spend) have at least one dead action in their goal, giving a spend-weighted integrity score of ${pct.toFixed(0)}%. Full points apply at or above ${curve.fullPointsAbovePct}%; points fall to zero at or below ${curve.zeroPointsBelowPct}%. Campaigns with no conversion actions in their goal at all aren't judged — there's nothing to check.`,
    meterPct: pct,
    thresholdTickPct: curve.fullPointsAbovePct,
  };
}

export function scoreBudgetConstrainedShare(
  campaigns: { lostToBudgetShare: number }[],
  limitedThresholdPct: number,
  curve: { fullPointsAtLimitedPct: number; zeroPointsAtLimitedPct: number },
  maxPoints: number
): MetricResult {
  const total = campaigns.length;
  const limited = campaigns.filter((c) => c.lostToBudgetShare * 100 > limitedThresholdPct).length;
  const pct = total > 0 ? (limited / total) * 100 : 0;
  const points = linearPoints(
    pct,
    curve.fullPointsAtLimitedPct,
    curve.zeroPointsAtLimitedPct,
    maxPoints
  );
  return {
    id: "budgetConstrainedShare",
    title: "Budget-constrained campaigns",
    status: statusForFraction(points / maxPoints),
    points,
    maxPoints,
    value: pct,
    valueLabel: `${pct.toFixed(0)}%`,
    meta: `${limited} of ${total} Search campaigns are losing impression share to budget.`,
    explanation: "Shows whether the account is funded to match its own targeting.",
    methodology: `We check every Search campaign in this account for how much impression share it's losing specifically to budget (not to rank or other factors) — a campaign losing more than ${limitedThresholdPct}% of impression share to budget counts as budget-constrained. ${limited} of ${total} Search campaigns cross that bar, a ${pct.toFixed(0)}% constrained rate. Full points apply at or below ${curve.fullPointsAtLimitedPct}%; points fall to zero at or above ${curve.zeroPointsAtLimitedPct}%, scaling linearly in between.`,
    meterPct: pct,
    thresholdTickPct: curve.zeroPointsAtLimitedPct,
  };
}

// --- Aggregator ---

/** Sums points across every non-pending metric for the raw 0-100 score. */
export function aggregateHealthScore(metrics: MetricResult[]): HealthScore {
  const available = metrics.filter((m) => m.status !== "pending");
  const pending = metrics.filter((m) => m.status === "pending");
  const earnedPoints = available.reduce((sum, m) => sum + m.points, 0);
  const possiblePoints = available.reduce((sum, m) => sum + m.maxPoints, 0);
  const overallScore = possiblePoints > 0 ? (earnedPoints / possiblePoints) * 100 : 0;

  return {
    overallScore: Math.round(overallScore),
    tier: tierFor(overallScore),
    metrics,
    availableMetricCount: available.length,
    totalMetricCount: metrics.length,
    pendingMetricIds: pending.map((m) => m.id),
  };
}
