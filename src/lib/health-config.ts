import thresholdsJson from "@/config/health-thresholds.json";
import { getOrCreateAccountSettings } from "./account-settings";

export type BusinessType = "lead_gen" | "ecommerce";

export type PmaxShareCapTier = {
  max_conversions_per_month: number | null;
  max_pmax_share_pct: number;
};

export type ShoppingPmaxFloorTier = {
  max_conversions_per_month: number | null;
  min_shopping_pmax_share_pct: number;
};

export type CurveConfig = {
  lookbackDays: number;
  fullPointsAbovePct: number;
  zeroPointsBelowPct: number;
};

export type ResolvedThresholds = {
  // The business type actually used to pick a tier below — the value
  // stored in Firestore (src/lib/account-settings.ts), editable from the
  // account's Settings page; defaults to "lead_gen" the first time an
  // account is ever viewed.
  businessType: BusinessType;
  pmaxShareCap: PmaxShareCapTier[] | null;
  shoppingPmaxShareFloor: ShoppingPmaxFloorTier[] | null;
  brandKeywords: string[];
  keywordUtilization: CurveConfig;
  adCoverage: CurveConfig & { minActiveAds: number };
  budgetConstrainedShare: {
    limitedThresholdPct: number;
    fullPointsAtLimitedPct: number;
    zeroPointsAtLimitedPct: number;
  };
  conversionTrackingIntegrity: {
    fullPointsAbovePct: number;
    zeroPointsBelowPct: number;
  };
  metricMaxPoints: number;
};

type ThresholdsConfig = typeof thresholdsJson;

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/[^0-9]/g, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merges `override` onto `base`, recursing into nested plain objects
 * so a partial override block only replaces the keys it actually sets. */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  const result: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const baseValue = result[key];
    result[key] =
      isPlainObject(overrideValue) && isPlainObject(baseValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue;
  }
  return result as T;
}

/** Resolves every per-metric threshold for one account, applying the
 * layered config: business-type default -> customer-id override, most
 * specific wins. `businessType` itself comes from Firestore (account
 * settings), not this static file — see account-settings.ts. */
export async function resolveThresholds(customerId: string): Promise<ResolvedThresholds> {
  const config = thresholdsJson as ThresholdsConfig;
  const id = normalizeCustomerId(customerId);
  const settings = await getOrCreateAccountSettings(id);
  const businessType = settings.businessType;

  let resolved: ResolvedThresholds = {
    businessType,
    pmaxShareCap:
      businessType === "lead_gen" ? config.defaults.lead_gen.pmax_share_cap : null,
    shoppingPmaxShareFloor:
      businessType === "ecommerce" ? config.defaults.ecommerce.shopping_pmax_share_floor : null,
    brandKeywords: config.brandDetection.campaignNameKeywords,
    keywordUtilization: config.keywordUtilization,
    adCoverage: config.adCoverage,
    budgetConstrainedShare: config.budgetConstrainedShare,
    conversionTrackingIntegrity: config.conversionTrackingIntegrity,
    metricMaxPoints: config.scoring.metricMaxPoints,
  };

  const overridesByCustomerId = config.overrides.by_customer_id as Record<string, unknown>;
  if (overridesByCustomerId[id]) {
    resolved = deepMerge(resolved, overridesByCustomerId[id]);
  }

  return resolved;
}
