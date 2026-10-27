const GOOGLE_ADS_API_VERSION = "v25";

export type AccessibleCustomersResult =
  | { ok: true; customerIds: string[] }
  | { ok: false; error: string };

export async function listAccessibleCustomers(
  accessToken: string
): Promise<AccessibleCustomersResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: `Google Ads API error (${response.status}): ${body}` };
  }

  const data = (await response.json()) as { resourceNames?: string[] };
  const customerIds = (data.resourceNames ?? []).map((name) =>
    name.replace("customers/", "")
  );

  return { ok: true, customerIds };
}

export type ManagedAccount = {
  id: string;
  name: string | null;
  isManager: boolean;
  status: string;
};

export type AccountGroup = {
  topLevel: ManagedAccount;
  children: ManagedAccount[];
  error?: string;
};

export type ManagedAccountsResult =
  | { ok: true; groups: AccountGroup[] }
  | { ok: false; error: string };

async function googleAdsSearch<T>(
  customerId: string,
  loginCustomerId: string,
  accessToken: string,
  developerToken: string,
  query: string
): Promise<T[]> {
  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": loginCustomerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Ads API error (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { results?: T[] };
  return data.results ?? [];
}

type CustomerClientRow = {
  customerClient: {
    id: string;
    descriptiveName?: string;
    level: string;
    manager: boolean;
    status: string;
  };
};

async function queryCustomerClients(
  customerId: string,
  loginCustomerId: string,
  accessToken: string,
  developerToken: string
): Promise<CustomerClientRow[]> {
  return googleAdsSearch<CustomerClientRow>(
    customerId,
    loginCustomerId,
    accessToken,
    developerToken,
    `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.level,
        customer_client.manager,
        customer_client.status
      FROM customer_client
      WHERE customer_client.level <= 1
    `
  );
}

/**
 * Fetches one account's customer_client hierarchy one level down, dropping
 * any CANCELED account (top-level or child) entirely rather than showing it
 * with an unknown/placeholder status. Returns null if the top-level account
 * itself is missing or CANCELED, so the caller can skip the whole group.
 */
async function buildAccountGroup(
  customerId: string,
  loginCustomerId: string,
  accessToken: string,
  developerToken: string
): Promise<AccountGroup | null> {
  const rows = await queryCustomerClients(customerId, loginCustomerId, accessToken, developerToken);

  let topLevel: ManagedAccount | null = null;
  const children: ManagedAccount[] = [];

  for (const row of rows) {
    const c = row.customerClient;
    if (c.status === "CANCELED") continue;

    const account: ManagedAccount = {
      id: c.id,
      name: c.descriptiveName ?? null,
      isManager: c.manager,
      status: c.status,
    };

    if (c.level === "0") {
      topLevel = account;
    } else {
      children.push(account);
    }
  }

  if (!topLevel) return null;
  return { topLevel, children };
}

/**
 * For every account the signed-in user can access directly, fetches its
 * customer_client hierarchy one level down — i.e. the accounts it manages.
 * CANCELED accounts (top-level or child) are left out entirely.
 */
export async function listManagedAccounts(
  accessToken: string
): Promise<ManagedAccountsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  const accessible = await listAccessibleCustomers(accessToken);
  if (!accessible.ok) return accessible;

  const groups: AccountGroup[] = [];

  for (const customerId of accessible.customerIds) {
    try {
      // The user has direct OAuth access to this account, so it's its own
      // login-customer-id.
      const group = await buildAccountGroup(customerId, customerId, accessToken, developerToken);
      if (group) groups.push(group);
    } catch (err) {
      groups.push({
        topLevel: { id: customerId, name: null, isManager: false, status: "UNKNOWN" },
        children: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true, groups };
}

export type AccountGroupResult =
  | { ok: true; group: AccountGroup | null }
  | { ok: false; error: string };

/**
 * Fetches a single manager account's own children — used to drill into a
 * manager account nested below the top level (e.g. a sub-manager the user
 * only reaches through another manager, so `listManagedAccounts` alone
 * never queries its children). `loginCustomerId` must be an account the
 * signed-in user actually has direct OAuth access to, which is not
 * necessarily `customerId` itself.
 */
export async function listAccountGroup(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<AccountGroupResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const group = await buildAccountGroup(customerId, loginCustomerId, accessToken, developerToken);
    return { ok: true, group };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type Campaign = {
  id: string;
  name: string;
  status: string;
  channelType: string;
  costMicros: string;
};

export type CampaignsResult =
  | { ok: true; campaigns: Campaign[] }
  | { ok: false; error: string };

type CampaignRow = {
  campaign: {
    id: string;
    name: string;
    status: string;
    advertisingChannelType: string;
  };
  metrics: {
    costMicros: string;
  };
};

/**
 * Lists campaigns for `customerId` that spent money in the last 30 days.
 * `loginCustomerId` is the manager account the signed-in user is actually
 * authorized through — required by the Google Ads API whenever `customerId`
 * isn't an account the user holds directly.
 */
export async function listCampaigns(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<CampaignsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<CampaignRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          metrics.cost_micros
        FROM campaign
        WHERE segments.date DURING LAST_30_DAYS
          AND metrics.cost_micros > 0
        ORDER BY campaign.name
      `
    );

    const campaigns = rows.map((row) => ({
      id: row.campaign.id,
      name: row.campaign.name,
      status: row.campaign.status,
      channelType: row.campaign.advertisingChannelType,
      costMicros: row.metrics.costMicros,
    }));

    return { ok: true, campaigns };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type AutoApplyRule = {
  type: string;
  status: string;
};

export type AutoApplyRulesResult =
  | { ok: true; rules: AutoApplyRule[] }
  | { ok: false; error: string };

type RecommendationSubscriptionRow = {
  recommendationSubscription: {
    type: string;
    status: string;
  };
};

/**
 * Lists the auto-apply recommendation subscriptions for `customerId` — i.e.
 * which recommendation types Google is allowed to apply automatically, and
 * whether each is currently enabled or paused.
 */
export async function listAutoApplyRules(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<AutoApplyRulesResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<RecommendationSubscriptionRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT
          recommendation_subscription.type,
          recommendation_subscription.status
        FROM recommendation_subscription
      `
    );

    const rules = rows.map((row) => ({
      type: row.recommendationSubscription.type,
      status: row.recommendationSubscription.status,
    }));

    return { ok: true, rules };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type Keyword = {
  text: string;
  matchType: string;
  costMicros: string;
};

export type KeywordsResult =
  | { ok: true; keywords: Keyword[] }
  | { ok: false; error: string };

type KeywordViewRow = {
  adGroupCriterion: {
    keyword: {
      text: string;
      matchType: string;
    };
  };
  metrics: {
    costMicros: string;
  };
};

/**
 * Lists the top-spending keywords (last 30 days) for a single Search
 * campaign.
 */
export async function listTopKeywords(
  accessToken: string,
  customerId: string,
  loginCustomerId: string,
  campaignId: string,
  limit: number = 5
): Promise<KeywordsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<KeywordViewRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          metrics.cost_micros
        FROM keyword_view
        WHERE segments.date DURING LAST_30_DAYS
          AND campaign.id = ${campaignId}
          AND metrics.cost_micros > 0
        ORDER BY metrics.cost_micros DESC
        LIMIT ${limit}
      `
    );

    const keywords = rows.map((row) => ({
      text: row.adGroupCriterion.keyword.text,
      matchType: row.adGroupCriterion.keyword.matchType,
      costMicros: row.metrics.costMicros,
    }));

    return { ok: true, keywords };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Account health dashboard queries (Phase 1 — see DASHBOARD_REQUIREMENTS.md)
// ---------------------------------------------------------------------------

/**
 * Builds an explicit date range ending yesterday (today's data is usually
 * incomplete) for a configurable lookback window — GAQL's canned
 * `LAST_30_DAYS` macro can't flex to an arbitrary N.
 */
function gaqlDateRange(lookbackDays: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (lookbackDays - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/**
 * Same idea as gaqlDateRange, but with a time component — change_event
 * needs this, confirmed live: `change_event.change_date_time DURING
 * LAST_30_DAYS` gets rejected with START_DATE_TOO_OLD (the macro's
 * resolved start apparently lands just outside Google's exact 30-day
 * cutoff). 29 days leaves a safety margin under that hard cap rather than
 * chasing the exact boundary.
 */
function gaqlDateTimeRange(daysAgo: number): { startDateTime: string; endDateTime: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { startDateTime: fmt(start), endDateTime: fmt(end) };
}

export type KeywordUtilizationResult =
  | { ok: true; enabledKeywordCount: number; keywordsWithImpressionsCount: number }
  | { ok: false; error: string };

type AdGroupCriterionIdRow = {
  adGroupCriterion: { criterionId: string };
};

/**
 * Metric #3 (keyword utilization): the enabled-keyword catalog (no metrics,
 * no date filter — won't drop a zero-impression keyword) compared against
 * keywords that actually served an impression in the lookback window.
 */
export async function getKeywordUtilization(
  accessToken: string,
  customerId: string,
  loginCustomerId: string,
  lookbackDays: number
): Promise<KeywordUtilizationResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  const { startDate, endDate } = gaqlDateRange(lookbackDays);

  try {
    const [enabledRows, impressionRows] = await Promise.all([
      googleAdsSearch<AdGroupCriterionIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT ad_group_criterion.criterion_id
          FROM ad_group_criterion
          WHERE ad_group_criterion.type = 'KEYWORD'
            AND ad_group_criterion.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
        `
      ),
      googleAdsSearch<AdGroupCriterionIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT ad_group_criterion.criterion_id
          FROM keyword_view
          WHERE ad_group_criterion.status = 'ENABLED'
            AND segments.date BETWEEN '${startDate}' AND '${endDate}'
            AND metrics.impressions > 0
        `
      ),
    ]);

    // The impression query is segmented by segments.date, so a keyword with
    // impressions on multiple days within the window comes back as multiple
    // rows — dedupe by criterion ID rather than counting raw rows.
    const distinctKeywordsWithImpressions = new Set(
      impressionRows.map((r) => r.adGroupCriterion.criterionId)
    );

    return {
      ok: true,
      enabledKeywordCount: enabledRows.length,
      keywordsWithImpressionsCount: distinctKeywordsWithImpressions.size,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type NegativeKeywordCoverageResult =
  | { ok: true; qualifyingCampaignIds: string[]; coveredCampaignIds: string[] }
  | { ok: false; error: string };

type CampaignIdRow = { campaign: { id: string } };
type CampaignSharedSetRow = { campaignSharedSet: { campaign: string } };

/**
 * Metric #4 (negative keyword coverage): among Search campaigns running at
 * least one broad-match keyword, which ones have zero negative-keyword
 * coverage at all — neither a shared negative list attached nor any
 * campaign-level negatives of their own. All-or-nothing by design (see
 * DASHBOARD_REQUIREMENTS.md §2.4) — the caller treats any gap as critical.
 */
export async function getNegativeKeywordCoverage(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<NegativeKeywordCoverageResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const [broadMatchRows, campaignNegativeRows, sharedSetRows] = await Promise.all([
      googleAdsSearch<CampaignIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT campaign.id
          FROM ad_group_criterion
          WHERE ad_group_criterion.type = 'KEYWORD'
            AND ad_group_criterion.status = 'ENABLED'
            AND ad_group_criterion.keyword.match_type = 'BROAD'
            AND campaign.advertising_channel_type = 'SEARCH'
            AND campaign.status = 'ENABLED'
        `
      ),
      googleAdsSearch<CampaignIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT campaign.id
          FROM campaign_criterion
          WHERE campaign_criterion.type = 'KEYWORD'
            AND campaign_criterion.negative = true
        `
      ),
      googleAdsSearch<CampaignSharedSetRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT campaign_shared_set.campaign
          FROM campaign_shared_set
          WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
            AND campaign_shared_set.status = 'ENABLED'
        `
      ),
    ]);

    const qualifyingCampaignIds = [...new Set(broadMatchRows.map((r) => r.campaign.id))];
    const campaignLevelNegativeIds = new Set(campaignNegativeRows.map((r) => r.campaign.id));
    const sharedSetCampaignIds = new Set(
      sharedSetRows.map((r) => r.campaignSharedSet.campaign.split("/campaigns/")[1])
    );

    const coveredCampaignIds = qualifyingCampaignIds.filter(
      (id) => campaignLevelNegativeIds.has(id) || sharedSetCampaignIds.has(id)
    );

    return { ok: true, qualifyingCampaignIds, coveredCampaignIds };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type AdCoverageResult =
  | { ok: true; qualifyingAdGroupIds: string[]; adCountByAdGroupId: Record<string, number> }
  | { ok: false; error: string };

type AdGroupIdRow = { adGroup: { id: string } };

/**
 * Metric #6 (ad coverage per ad group): among ad groups with real activity
 * (an impression) in the lookback window, how many enabled ads each one has.
 */
export async function getAdCoveragePerAdGroup(
  accessToken: string,
  customerId: string,
  loginCustomerId: string,
  lookbackDays: number
): Promise<AdCoverageResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  const { startDate, endDate } = gaqlDateRange(lookbackDays);

  try {
    const [activeAdGroupRows, adRows] = await Promise.all([
      googleAdsSearch<AdGroupIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT ad_group.id
          FROM ad_group
          WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
            AND metrics.impressions > 0
            AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
        `
      ),
      googleAdsSearch<AdGroupIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT ad_group.id
          FROM ad_group_ad
          WHERE ad_group_ad.status = 'ENABLED'
            AND ad_group.status = 'ENABLED'
            AND campaign.status = 'ENABLED'
        `
      ),
    ]);

    const qualifyingAdGroupIds = [...new Set(activeAdGroupRows.map((r) => r.adGroup.id))];
    const adCountByAdGroupId: Record<string, number> = {};
    for (const row of adRows) {
      adCountByAdGroupId[row.adGroup.id] = (adCountByAdGroupId[row.adGroup.id] ?? 0) + 1;
    }

    return { ok: true, qualifyingAdGroupIds, adCountByAdGroupId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type PrimaryConversionsResult =
  | { ok: true; conversionsLast30Days: number }
  | { ok: false; error: string };

type PrimaryConversionActionIdRow = {
  conversionAction: { id: string };
};

type ConversionsBySegmentRow = {
  segments?: { conversionAction?: string };
  // Omitted by the REST API entirely when conversions is 0 for the window.
  metrics?: { conversions: number };
};

/**
 * Sums conversions over the last 30 days across every primary conversion
 * action (account-wide) — the input metric #1 needs to pick a
 * conversion-volume tier. "Primary" excludes secondary conversion actions
 * tracked for visibility but not counted toward goals.
 *
 * This needs two separate queries joined client-side, not one: GAQL won't
 * let a single query both select metrics.conversions (only valid when
 * querying FROM a metrics-bearing resource like `customer`) and filter on
 * conversion_action.status/primary_for_goal (only valid when querying FROM
 * `conversion_action` itself, which can't carry metrics) — confirmed live
 * by two different PROHIBITED_* query errors when this was attempted as
 * one query.
 */
export async function getPrimaryConversions(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<PrimaryConversionsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const [primaryActionRows, conversionsBySegmentRows] = await Promise.all([
      googleAdsSearch<PrimaryConversionActionIdRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT conversion_action.id
          FROM conversion_action
          WHERE conversion_action.status = 'ENABLED'
            AND conversion_action.primary_for_goal = true
        `
      ),
      googleAdsSearch<ConversionsBySegmentRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT segments.conversion_action, metrics.conversions
          FROM customer
          WHERE segments.date DURING LAST_30_DAYS
        `
      ),
    ]);

    const primaryActionIds = new Set(primaryActionRows.map((row) => row.conversionAction.id));

    const conversionsLast30Days = conversionsBySegmentRows.reduce((sum, row) => {
      const resourceName = row.segments?.conversionAction;
      const id = resourceName?.split("/conversionActions/")[1];
      if (!id || !primaryActionIds.has(id)) return sum;
      return sum + (row.metrics?.conversions ?? 0);
    }, 0);

    return { ok: true, conversionsLast30Days };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ConversionActionActivityResult =
  | {
      ok: true;
      actions: { id: string; name: string; conversionsLast30Days: number }[];
    }
  | { ok: false; error: string };

type ConversionActionRow = {
  conversionAction: { id: string; name: string };
};

/**
 * Per-action conversion counts over the last 30 days for every enabled,
 * primary-for-goal conversion action — the raw data metric #7 (conversion
 * tracking integrity) needs to flag any action recording zero conversions.
 * Exploratory pass only: ad-hoc investigation, not wired into the dashboard
 * yet. Same two-query join as getPrimaryConversions (GAQL won't allow
 * metrics.conversions and conversion_action.status/primary_for_goal in one
 * query), but keeps each action's own count instead of summing them.
 */
export async function getConversionActionActivity(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<ConversionActionActivityResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const [primaryActionRows, conversionsBySegmentRows] = await Promise.all([
      googleAdsSearch<ConversionActionRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT conversion_action.id, conversion_action.name
          FROM conversion_action
          WHERE conversion_action.status = 'ENABLED'
            AND conversion_action.primary_for_goal = true
        `
      ),
      googleAdsSearch<ConversionsBySegmentRow>(
        customerId,
        loginCustomerId,
        accessToken,
        developerToken,
        `
          SELECT segments.conversion_action, metrics.conversions
          FROM customer
          WHERE segments.date DURING LAST_30_DAYS
        `
      ),
    ]);

    const conversionsByActionId: Record<string, number> = {};
    for (const row of conversionsBySegmentRows) {
      const resourceName = row.segments?.conversionAction;
      const id = resourceName?.split("/conversionActions/")[1];
      if (!id) continue;
      conversionsByActionId[id] = (conversionsByActionId[id] ?? 0) + (row.metrics?.conversions ?? 0);
    }

    const actions = primaryActionRows.map((row) => ({
      id: row.conversionAction.id,
      name: row.conversionAction.name,
      conversionsLast30Days: conversionsByActionId[row.conversionAction.id] ?? 0,
    }));

    return { ok: true, actions };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type CampaignConversionGoalSettingsResult =
  | {
      ok: true;
      campaigns: {
        id: string;
        name: string;
        costMicros: string;
        goalConfigLevel: string;
        usesCustomGoal: boolean;
        goals: { label: string; actions: { id: string; name: string; conversionsLast30Days: number }[] }[];
        totalConversionsLast30Days: number;
      }[];
    }
  | { ok: false; error: string };

type CampaignTrafficRow = {
  campaign: { id: string; name: string };
  metrics: { costMicros: string };
};

type GoalConfigLevelRow = {
  campaign: { id: string };
  conversionGoalCampaignConfig: { goalConfigLevel: string; customConversionGoal?: string };
};

type CampaignConversionGoalRow = {
  campaign: { id: string };
  campaignConversionGoal: { category: string; origin: string };
};

type CustomerConversionGoalRow = {
  customerConversionGoal: { category: string; origin: string };
};

type ConversionActionWithCategoryRow = {
  conversionAction: { id: string; name: string; category: string; origin: string; resourceName: string };
};

type CustomConversionGoalRow = {
  customConversionGoal: { resourceName: string; name: string; conversionActions?: string[] };
};

type ConversionsByCampaignAndActionRow = {
  campaign: { id: string };
  segments?: { conversionAction?: string };
  metrics?: { conversions: number };
};

/**
 * For every campaign with traffic in the last 30 days, resolves what's set
 * in its Settings > Goals: either a custom conversion goal (a named bundle
 * of specific conversion actions), per-campaign category/origin goals, or —
 * if the campaign hasn't customized goals at all — the account-wide
 * default category/origin goals. Also resolves each goal to the actual
 * named conversion actions it covers and how many conversions each one got
 * *for that specific campaign* in the window — metric #7 (conversion
 * tracking integrity) needs both, spend-weighted per campaign.
 *
 * Each piece is its own query joined client-side (consistent with every
 * other multi-resource function in this file) since GAQL doesn't allow
 * combining metrics-bearing `campaign` fields with these goal-config
 * resources in one query.
 */
export async function getCampaignConversionGoalSettings(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<CampaignConversionGoalSettingsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const [
      trafficRows,
      levelRows,
      campaignGoalRows,
      customerGoalRows,
      actionRows,
      customGoalRows,
      conversionsByCampaignRows,
    ] = await Promise.all([
        googleAdsSearch<CampaignTrafficRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT campaign.id, campaign.name, metrics.cost_micros
          FROM campaign
          WHERE segments.date DURING LAST_30_DAYS
            AND metrics.impressions > 0
          ORDER BY campaign.name
        `
        ),
        googleAdsSearch<GoalConfigLevelRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT
            campaign.id,
            conversion_goal_campaign_config.goal_config_level,
            conversion_goal_campaign_config.custom_conversion_goal
          FROM conversion_goal_campaign_config
        `
        ),
        googleAdsSearch<CampaignConversionGoalRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT campaign.id, campaign_conversion_goal.category, campaign_conversion_goal.origin
          FROM campaign_conversion_goal
          WHERE campaign_conversion_goal.biddable = true
        `
        ),
        googleAdsSearch<CustomerConversionGoalRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT customer_conversion_goal.category, customer_conversion_goal.origin
          FROM customer_conversion_goal
          WHERE customer_conversion_goal.biddable = true
        `
        ),
        googleAdsSearch<ConversionActionWithCategoryRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT
            conversion_action.id,
            conversion_action.name,
            conversion_action.category,
            conversion_action.origin,
            conversion_action.resource_name
          FROM conversion_action
          WHERE conversion_action.status = 'ENABLED'
        `
        ),
        googleAdsSearch<CustomConversionGoalRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT
            custom_conversion_goal.resource_name,
            custom_conversion_goal.name,
            custom_conversion_goal.conversion_actions
          FROM custom_conversion_goal
        `
        ),
        googleAdsSearch<ConversionsByCampaignAndActionRow>(
          customerId,
          loginCustomerId,
          accessToken,
          developerToken,
          `
          SELECT campaign.id, segments.conversion_action, metrics.conversions
          FROM campaign
          WHERE segments.date DURING LAST_30_DAYS
        `
        ),
      ]);

    const levelByCampaignId: Record<string, string> = {};
    const customGoalResourceByCampaignId: Record<string, string | undefined> = {};
    for (const row of levelRows) {
      levelByCampaignId[row.campaign.id] = row.conversionGoalCampaignConfig.goalConfigLevel;
      customGoalResourceByCampaignId[row.campaign.id] = row.conversionGoalCampaignConfig.customConversionGoal;
    }

    const campaignGoalsByCampaignId: Record<string, { category: string; origin: string }[]> = {};
    for (const row of campaignGoalRows) {
      const id = row.campaign.id;
      (campaignGoalsByCampaignId[id] ??= []).push({
        category: row.campaignConversionGoal.category,
        origin: row.campaignConversionGoal.origin,
      });
    }

    const customerGoals = customerGoalRows.map((row) => ({
      category: row.customerConversionGoal.category,
      origin: row.customerConversionGoal.origin,
    }));

    const actionsByCategoryOrigin: Record<string, { id: string; name: string }[]> = {};
    const actionByResourceName: Record<string, { id: string; name: string }> = {};
    for (const row of actionRows) {
      const key = `${row.conversionAction.category}~${row.conversionAction.origin}`;
      const action = { id: row.conversionAction.id, name: row.conversionAction.name };
      (actionsByCategoryOrigin[key] ??= []).push(action);
      actionByResourceName[row.conversionAction.resourceName] = action;
    }

    const customGoalByResourceName: Record<string, { name: string; actions: { id: string; name: string }[] }> = {};
    for (const row of customGoalRows) {
      customGoalByResourceName[row.customConversionGoal.resourceName] = {
        name: row.customConversionGoal.name,
        actions: (row.customConversionGoal.conversionActions ?? []).map(
          (resourceName) => actionByResourceName[resourceName] ?? { id: resourceName, name: resourceName }
        ),
      };
    }

    // campaignId -> actionId -> conversions, over the last 30 days.
    const conversionsByCampaignAndActionId: Record<string, Record<string, number>> = {};
    for (const row of conversionsByCampaignRows) {
      const resourceName = row.segments?.conversionAction;
      const actionId = resourceName?.split("/conversionActions/")[1];
      if (!actionId) continue;
      const campaignId = row.campaign.id;
      (conversionsByCampaignAndActionId[campaignId] ??= {})[actionId] =
        (conversionsByCampaignAndActionId[campaignId]?.[actionId] ?? 0) + (row.metrics?.conversions ?? 0);
    }

    const withConversions = (campaignId: string, actions: { id: string; name: string }[]) =>
      actions.map((a) => ({
        ...a,
        conversionsLast30Days: conversionsByCampaignAndActionId[campaignId]?.[a.id] ?? 0,
      }));

    const campaigns = trafficRows.map((row) => {
      const id = row.campaign.id;
      const goalConfigLevel = levelByCampaignId[id] ?? "CUSTOMER";
      const customGoalResource = customGoalResourceByCampaignId[id];

      let goals: { label: string; actions: { id: string; name: string; conversionsLast30Days: number }[] }[];
      let usesCustomGoal: boolean;

      if (goalConfigLevel === "CAMPAIGN" && customGoalResource) {
        const customGoal = customGoalByResourceName[customGoalResource];
        usesCustomGoal = true;
        goals = [
          {
            label: `Custom goal: ${customGoal?.name ?? customGoalResource}`,
            actions: withConversions(id, customGoal?.actions ?? []),
          },
        ];
      } else {
        usesCustomGoal = false;
        const goalPairs = goalConfigLevel === "CAMPAIGN" ? (campaignGoalsByCampaignId[id] ?? []) : customerGoals;
        goals = goalPairs.map((g) => ({
          label: `${g.category} / ${g.origin}`,
          actions: withConversions(id, actionsByCategoryOrigin[`${g.category}~${g.origin}`] ?? []),
        }));
      }

      const totalConversionsLast30Days = goals.reduce(
        (sum, g) => sum + g.actions.reduce((s, a) => s + a.conversionsLast30Days, 0),
        0
      );

      return {
        id,
        name: row.campaign.name,
        costMicros: row.metrics.costMicros,
        goalConfigLevel,
        usesCustomGoal,
        goals,
        totalConversionsLast30Days,
      };
    });

    return { ok: true, campaigns };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type CustomerInfoResult =
  | { ok: true; name: string | null }
  | { ok: false; error: string };

type CustomerRow = {
  customer: { descriptiveName?: string };
};

/** Fetches the account's own descriptive name — used for the page title
 * instead of showing the bare customer ID. */
export type PrimaryDomainResult =
  | { ok: true; domain: string | null }
  | { ok: false; error: string };

type AdFinalUrlsRow = {
  adGroupAd: { ad: { finalUrls?: string[] } };
};

/**
 * The domain most of the account's enabled ads land on — used to show the
 * client's own favicon on the health check page instead of a generic
 * Google Ads icon. Picks the single most common hostname across ads'
 * `final_urls` rather than just the first one, since a few ads pointing at
 * a tracking/redirect domain shouldn't outvote the account's real site.
 * `null` (not an error) when no enabled ad has a final URL at all.
 */
export async function getPrimaryDomain(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<PrimaryDomainResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<AdFinalUrlsRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT ad_group_ad.ad.final_urls
        FROM ad_group_ad
        WHERE ad_group_ad.status = 'ENABLED'
        LIMIT 200
      `
    );

    const countByDomain: Record<string, number> = {};
    for (const row of rows) {
      for (const url of row.adGroupAd.ad.finalUrls ?? []) {
        let hostname: string;
        try {
          hostname = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          continue; // Malformed final_url — skip it rather than fail the lookup.
        }
        countByDomain[hostname] = (countByDomain[hostname] ?? 0) + 1;
      }
    }

    const [topDomain] =
      Object.entries(countByDomain).sort((a, b) => b[1] - a[1])[0] ?? [];
    return { ok: true, domain: topDomain ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCustomerInfo(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<CustomerInfoResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<CustomerRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `SELECT customer.descriptive_name FROM customer`
    );

    return { ok: true, name: rows[0]?.customer.descriptiveName ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type SearchNetworkSettingsResult =
  | {
      ok: true;
      campaigns: { id: string; name: string; searchPartners: boolean; display: boolean }[];
    }
  | { ok: false; error: string };

type SearchNetworkSettingsRow = {
  campaign: {
    id: string;
    name: string;
    networkSettings: {
      targetSearchNetwork?: boolean;
      targetContentNetwork?: boolean;
    };
  };
};

/** Fetches whether each enabled Search campaign has Search Partners and/or
 * Display expansion turned on, via campaign.network_settings. */
export async function getSearchCampaignNetworkSettings(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<SearchNetworkSettingsResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<SearchNetworkSettingsRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT
          campaign.id,
          campaign.name,
          campaign.network_settings.target_search_network,
          campaign.network_settings.target_content_network
        FROM campaign
        WHERE campaign.advertising_channel_type = 'SEARCH'
          AND campaign.status = 'ENABLED'
      `
    );

    const campaigns = rows.map((row) => ({
      id: row.campaign.id,
      name: row.campaign.name,
      searchPartners: row.campaign.networkSettings.targetSearchNetwork ?? false,
      display: row.campaign.networkSettings.targetContentNetwork ?? false,
    }));

    return { ok: true, campaigns };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type AccountActivityResult =
  | { ok: true; hasQualifyingActivity: boolean }
  | { ok: false; error: string };

type ChangeEventRow = {
  changeEvent: {
    changeResourceType: string;
    // A serialized FieldMask — expected as a comma-separated string of
    // changed field paths (e.g. "status"), unverified against a live
    // response until this function is actually tested.
    changedFields?: string;
  };
};

/** True only for a change_event row whose *sole* changed field is a
 * campaign's own status — the one specific exclusion in the resolved spec
 * (toggling a campaign enabled/paused doesn't count as "activity", but
 * pausing a keyword or ad group, budget edits, ad edits, etc. all do). */
function isCampaignStatusOnlyChange(changeResourceType: string, changedFields?: string): boolean {
  if (changeResourceType !== "CAMPAIGN" || !changedFields) return false;
  const fields = changedFields
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return fields.length === 1 && fields[0] === "status";
}

/**
 * Metric #5 (account activity): a single account-wide yes/no — did
 * anything happen in this account in the last 30 days other than a
 * campaign being paused or unpaused? Deliberately not broken out per
 * campaign — the owner was explicit this is about whether the account as
 * a whole is being managed, not which specific campaign saw the change.
 * `change_event` is capped by Google to roughly the last 30 days of
 * history regardless of what's queried — this metric's lookback can never
 * be configured wider than that. It also, uniquely among every resource
 * queried in this file, requires an explicit LIMIT clause (max 10,000) or
 * the API rejects the request outright — confirmed live via a
 * LIMIT_NOT_SPECIFIED query error.
 */
export async function getAccountActivity(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<AccountActivityResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  const { startDateTime, endDateTime } = gaqlDateTimeRange(29);

  try {
    const changeEventRows = await googleAdsSearch<ChangeEventRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT change_event.change_resource_type, change_event.changed_fields
        FROM change_event
        WHERE change_event.change_date_time BETWEEN '${startDateTime}' AND '${endDateTime}'
        LIMIT 10000
      `
    );

    const hasQualifyingActivity = changeEventRows.some(
      (row) => !isCampaignStatusOnlyChange(row.changeEvent.changeResourceType, row.changeEvent.changedFields)
    );

    return { ok: true, hasQualifyingActivity };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type BudgetConstrainedResult =
  | { ok: true; campaigns: { id: string; name: string; lostToBudgetShare: number }[] }
  | { ok: false; error: string };

type SearchBudgetLostIsRow = {
  campaign: { id: string; name: string };
  // Omitted by the REST API entirely when every requested metric on this
  // row is at its zero/default value.
  metrics?: { searchBudgetLostImpressionShare: number };
};

/**
 * Metric #8 (budget-constrained campaign share): Search campaigns' share of
 * impressions lost specifically to budget (as opposed to rank). Google
 * returns this as a fraction (0.0-1.0), with a negative value meaning "not
 * applicable" for that campaign.
 */
export async function getSearchBudgetLostImpressionShare(
  accessToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<BudgetConstrainedResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) {
    return {
      ok: false,
      error:
        "GOOGLE_ADS_DEVELOPER_TOKEN is not set. Apply for a developer token in the Google Ads API Center and add it to .env.local.",
    };
  }

  try {
    const rows = await googleAdsSearch<SearchBudgetLostIsRow>(
      customerId,
      loginCustomerId,
      accessToken,
      developerToken,
      `
        SELECT
          campaign.id,
          campaign.name,
          metrics.search_budget_lost_impression_share
        FROM campaign
        WHERE segments.date DURING LAST_30_DAYS
          AND campaign.status = 'ENABLED'
          AND campaign.advertising_channel_type = 'SEARCH'
      `
    );

    // The REST API omits `metrics` entirely for a row where every requested
    // metric is at its zero/default value, rather than returning zeros.
    const campaigns = rows
      .map((r) => ({
        id: r.campaign.id,
        name: r.campaign.name,
        lostToBudgetShare: r.metrics?.searchBudgetLostImpressionShare ?? -1,
      }))
      .filter((c) => c.lostToBudgetShare >= 0);

    return { ok: true, campaigns };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
