import Link from "next/link";
import { auth } from "@/auth";
import {
  listAutoApplyRules,
  listCampaigns,
  getKeywordUtilization,
  getNegativeKeywordCoverage,
  getAdCoveragePerAdGroup,
  getSearchBudgetLostImpressionShare,
  getCustomerInfo,
  getSearchCampaignNetworkSettings,
  getPrimaryConversions,
  getAccountActivity,
  getCampaignConversionGoalSettings,
  getPrimaryDomain,
} from "@/lib/google-ads";
import { resolveThresholds } from "@/lib/health-config";
import {
  classifyNewCampaigns,
  getOrCreateAccountSettings,
  updateAccountSettings,
  type CampaignBrandClassification,
} from "@/lib/account-settings";
import {
  aggregateHealthScore,
  buildNoDataHealthScore,
  buildErrorHealthScore,
  errorMetric,
  scoreSpendConcentration,
  scoreBrandPresence,
  scoreKeywordUtilization,
  scoreNegativeKeywordCoverage,
  scoreAccountActivity,
  scoreAdCoverage,
  scoreConversionTrackingIntegrity,
  scoreBudgetConstrainedShare,
  type MetricResult,
} from "@/lib/health-score";
import { HealthDashboard } from "./_components/HealthDashboard";
import { DebugPanel } from "./_components/DebugPanel";
import { GearIcon } from "../../_components/GearIcon";
import { recordHealthCheckView } from "@/lib/crm";
import styles from "../../page.module.css";
import type { AutoApplyRulesResult, SearchNetworkSettingsResult } from "@/lib/google-ads";
import type { HealthScore } from "@/lib/health-score";
import type { Session } from "next-auth";

export type SpendByChannelType = { channelType: string; costMicros: number; pct: number };

/** Groups campaign spend by channel type (SEARCH, PERFORMANCE_MAX, ...) and
 * turns each into a share of total spend, highest first. */
function computeSpendByChannelType(
  campaigns: { channelType: string; costMicros: string }[],
  totalSpendMicros: number
): SpendByChannelType[] {
  const costByType: Record<string, number> = {};
  for (const c of campaigns) {
    costByType[c.channelType] = (costByType[c.channelType] ?? 0) + Number(c.costMicros);
  }
  return Object.entries(costByType)
    .map(([channelType, costMicros]) => ({
      channelType,
      costMicros,
      pct: totalSpendMicros > 0 ? (costMicros / totalSpendMicros) * 100 : 0,
    }))
    .sort((a, b) => b.costMicros - a.costMicros);
}

/** Looks up the account's site domain (for the favicon) only the first time
 * an account is ever viewed, then caches it in Firestore — every later
 * health check reads the stored value instead of re-querying the Google
 * Ads API for it. A transient API error is never cached as "no domain";
 * it just retries on the next view. */
async function resolvePrimaryDomain(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<string | null> {
  const settings = await getOrCreateAccountSettings(customerId);
  if (settings.primaryDomain !== undefined) {
    return settings.primaryDomain;
  }

  const result = await getPrimaryDomain(accessToken, customerId, loginCustomerId);
  if (!result.ok) return null;

  await updateAccountSettings(customerId, { primaryDomain: result.domain });
  return result.domain;
}

export type CallTiming = { label: string; ms: number };

/** Wraps one data-fetch call with its own timer — since every call in a
 * `Promise.all` batch runs concurrently, each wrapped call's `ms` reflects
 * only its own duration, not wall-clock time shared with the others. Lets
 * `runHealthCheck` report per-call cost instead of just the batch total. */
function timed<T>(label: string, promise: Promise<T>, timings: CallTiming[]): Promise<T> {
  const start = Date.now();
  return promise.then((result) => {
    timings.push({ label, ms: Date.now() - start });
    return result;
  });
}

/** Runs the health check's data fetch + scoring and times it. Pulled out of
 * the component body since ESLint's react-hooks/purity rule flags Date.now()
 * calls made directly during render — a plain top-level function call from
 * the component doesn't trip that rule the way an inline call does. */
async function runHealthCheck(
  session: Session | null,
  customerId: string,
  effectiveLoginCustomerId: string
): Promise<{
  healthScore: HealthScore;
  autoApplyResult: AutoApplyRulesResult | null;
  accountName: string | null;
  totalSpendMicros: number;
  spendByChannelType: SpendByChannelType[];
  searchNetworkResult: SearchNetworkSettingsResult | null;
  primaryDomain: string | null;
  noData: boolean;
  durationMs: number;
  callTimings: CallTiming[];
}> {
  const start = Date.now();
  const callTimings: CallTiming[] = [];

  const thresholds = await resolveThresholds(customerId);
  const maxPoints = thresholds.metricMaxPoints;

  if (!session?.accessToken) {
    return {
      healthScore: buildErrorHealthScore("Not signed in.", maxPoints),
      autoApplyResult: null,
      accountName: null,
      totalSpendMicros: 0,
      spendByChannelType: [],
      searchNetworkResult: null,
      primaryDomain: null,
      noData: false,
      durationMs: Date.now() - start,
      callTimings,
    };
  }
  const accessToken = session.accessToken;

  // Phase 1: just enough to know whether there's anything to evaluate —
  // campaign spend and the account name. Everything else is skipped
  // entirely (not attempted, not just hidden) when spend is zero.
  const [result, customerInfoResult] = await Promise.all([
    timed("listCampaigns", listCampaigns(accessToken, customerId, effectiveLoginCustomerId), callTimings),
    timed(
      "getCustomerInfo",
      getCustomerInfo(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
  ]);

  const accountName = customerInfoResult.ok ? customerInfoResult.name : null;
  const totalSpendMicros = result.ok
    ? result.campaigns.reduce((sum, c) => sum + Number(c.costMicros), 0)
    : 0;
  const spendByChannelType = result.ok
    ? computeSpendByChannelType(result.campaigns, totalSpendMicros)
    : [];

  if (result.ok && totalSpendMicros === 0) {
    return {
      healthScore: buildNoDataHealthScore(maxPoints),
      autoApplyResult: null,
      accountName,
      totalSpendMicros: 0,
      spendByChannelType: [],
      searchNetworkResult: null,
      primaryDomain: null,
      noData: true,
      durationMs: Date.now() - start,
      callTimings,
    };
  }

  // Phase 2: the account has real spend — run the full health check.
  const [
    autoApplyResult,
    keywordUtilResult,
    negativeCoverageResult,
    adCoverageResult,
    budgetShareResult,
    searchNetworkResult,
    primaryConversionsResult,
    accountActivityResult,
    conversionGoalSettingsResult,
    brandClassifications,
    primaryDomain,
  ] = await Promise.all([
    timed(
      "listAutoApplyRules",
      listAutoApplyRules(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getKeywordUtilization",
      getKeywordUtilization(
        accessToken,
        customerId,
        effectiveLoginCustomerId,
        thresholds.keywordUtilization.lookbackDays
      ),
      callTimings
    ),
    timed(
      "getNegativeKeywordCoverage",
      getNegativeKeywordCoverage(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getAdCoveragePerAdGroup",
      getAdCoveragePerAdGroup(
        accessToken,
        customerId,
        effectiveLoginCustomerId,
        thresholds.adCoverage.lookbackDays
      ),
      callTimings
    ),
    timed(
      "getSearchBudgetLostImpressionShare",
      getSearchBudgetLostImpressionShare(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getSearchCampaignNetworkSettings",
      getSearchCampaignNetworkSettings(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getPrimaryConversions",
      getPrimaryConversions(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getAccountActivity",
      getAccountActivity(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "getCampaignConversionGoalSettings",
      getCampaignConversionGoalSettings(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
    timed(
      "classifyNewCampaigns",
      result.ok
        ? classifyNewCampaigns(customerId, result.campaigns, thresholds.brandKeywords)
        : Promise.resolve({} as Record<string, CampaignBrandClassification>),
      callTimings
    ),
    timed(
      "resolvePrimaryDomain",
      resolvePrimaryDomain(accessToken, customerId, effectiveLoginCustomerId),
      callTimings
    ),
  ]);

  const metrics: MetricResult[] = [
    result.ok && primaryConversionsResult.ok
      ? scoreSpendConcentration(
          result.campaigns,
          primaryConversionsResult.conversionsLast30Days,
          thresholds.businessType,
          thresholds,
          maxPoints
        )
      : errorMetric(
          "spendConcentration",
          "Campaign-type spend concentration",
          !result.ok
            ? result.error
            : !primaryConversionsResult.ok
              ? primaryConversionsResult.error
              : "Unknown error.",
          maxPoints
        ),
    result.ok
      ? scoreBrandPresence(
          result.campaigns.map((c) => c.id),
          brandClassifications,
          maxPoints
        )
      : errorMetric("brandPresence", "Dedicated brand campaign", result.error, maxPoints),
    keywordUtilResult.ok
      ? scoreKeywordUtilization(keywordUtilResult, thresholds.keywordUtilization, maxPoints)
      : errorMetric(
          "keywordUtilization",
          "Keyword utilization rate",
          keywordUtilResult.error,
          maxPoints
        ),
    negativeCoverageResult.ok
      ? scoreNegativeKeywordCoverage(negativeCoverageResult, maxPoints)
      : errorMetric(
          "negativeKeywordCoverage",
          "Negative keyword coverage",
          negativeCoverageResult.error,
          maxPoints
        ),
    accountActivityResult.ok
      ? scoreAccountActivity(accountActivityResult.hasQualifyingActivity, maxPoints)
      : errorMetric("accountActivity", "Account activity", accountActivityResult.error, maxPoints),
    adCoverageResult.ok
      ? scoreAdCoverage(
          adCoverageResult,
          thresholds.adCoverage.minActiveAds,
          thresholds.adCoverage,
          maxPoints
        )
      : errorMetric("adCoverage", "Ad coverage per ad group", adCoverageResult.error, maxPoints),
    conversionGoalSettingsResult.ok
      ? scoreConversionTrackingIntegrity(
          conversionGoalSettingsResult.campaigns,
          thresholds.conversionTrackingIntegrity,
          maxPoints
        )
      : errorMetric(
          "conversionTrackingIntegrity",
          "Conversion tracking integrity",
          conversionGoalSettingsResult.error,
          maxPoints
        ),
    budgetShareResult.ok
      ? scoreBudgetConstrainedShare(
          budgetShareResult.campaigns,
          thresholds.budgetConstrainedShare.limitedThresholdPct,
          thresholds.budgetConstrainedShare,
          maxPoints
        )
      : errorMetric(
          "budgetConstrainedShare",
          "Budget-constrained campaigns",
          budgetShareResult.error,
          maxPoints
        ),
  ];

  const healthScore = aggregateHealthScore(metrics);

  // Side-channel usage log for the admin CRM view — never allowed to break
  // the health check itself if Firestore hiccups.
  if (session.user?.email) {
    await timed(
      "recordHealthCheckView",
      recordHealthCheckView({
        email: session.user.email,
        name: session.user.name ?? null,
        customerId,
        accountName,
        totalSpendMicros,
        spendByChannelType,
        primaryDomain,
      }).catch((err) => {
        console.error("Failed to record CRM lead:", err);
      }),
      callTimings
    );
  }

  return {
    healthScore,
    autoApplyResult,
    accountName,
    totalSpendMicros,
    spendByChannelType,
    searchNetworkResult,
    primaryDomain,
    noData: false,
    durationMs: Date.now() - start,
    callTimings,
  };
}

export default async function AccountCampaigns({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ loginCustomerId?: string }>;
}) {
  const { customerId } = await params;
  const { loginCustomerId } = await searchParams;
  const session = await auth();
  const effectiveLoginCustomerId = loginCustomerId ?? customerId;

  const {
    healthScore,
    autoApplyResult,
    accountName,
    totalSpendMicros,
    spendByChannelType,
    searchNetworkResult,
    primaryDomain,
    durationMs,
    callTimings,
  } = await runHealthCheck(session, customerId, effectiveLoginCustomerId);

  // Google's public favicon lookup — always returns some image (falling
  // back to a generic icon when the domain has none of its own), so there's
  // no broken-image case to guard against here.
  const faviconUrl = primaryDomain
    ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(primaryDomain)}`
    : null;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external favicon lookup, not a static asset next/image can optimize
              <img
                src={faviconUrl}
                alt=""
                width={28}
                height={28}
                style={{ display: "block", borderRadius: 6 }}
              />
            )}
            <h1 style={{ margin: 0 }}>{accountName ?? `Account ${customerId}`}</h1>
          </div>
          <Link
            href={`/accounts/${customerId}/settings?loginCustomerId=${effectiveLoginCustomerId}`}
            title="Account settings"
            aria-label="Account settings"
            style={{ flexShrink: 0, color: "inherit", paddingTop: 4 }}
          >
            <GearIcon />
          </Link>
        </div>
        <p>
          <Link href="/">&larr; Back to accounts</Link>
        </p>
        <p>Total spend (last 30 days): ${(totalSpendMicros / 1_000_000).toFixed(2)}</p>

        <HealthDashboard
          healthScore={healthScore}
          customerId={customerId}
          userEmail={session?.user?.email ?? null}
          userName={session?.user?.name ?? null}
        />

        <DebugPanel
          autoApplyResult={autoApplyResult}
          searchNetworkResult={searchNetworkResult}
          spendByChannelType={spendByChannelType}
          durationMs={durationMs}
          callTimings={callTimings}
        />
      </main>
    </div>
  );
}
