import { Firestore } from "@google-cloud/firestore";
import type { BusinessType } from "./health-config";

const COLLECTION = "accountSettings";

export type CampaignBrandClassification = {
  isBrand: boolean;
  /** "auto" = keyword-matched the first time this campaign was seen;
   * "manual" = the user set or changed it on the settings page. A manual
   * value is never overwritten by re-classification. */
  source: "auto" | "manual";
};

export type AccountSettings = {
  customerId: string;
  businessType: BusinessType;
  campaignBrandClassifications?: Record<string, CampaignBrandClassification>;
  /** The account's detected site domain, used for the favicon on the health
   * check page. `undefined` (the key absent) = never looked up yet; `null`
   * = looked up once and found no domain in any enabled ad's final URLs.
   * Distinguishing those two means a domain-less account isn't re-queried
   * against the Google Ads API on every later health check. */
  primaryDomain?: string | null;
  createdAt: string;
  updatedAt: string;
};

let firestoreClient: Firestore | null = null;

/** Lazily constructed — avoids connecting to Firestore at module load time
 * (e.g. during `next build`, which imports this file but never calls into
 * it), and picks up Application Default Credentials automatically: the
 * Cloud Run service account in production, `gcloud auth application-default
 * login` locally. */
function getFirestore(): Firestore {
  if (!firestoreClient) {
    // projectId is explicit rather than relying on ambient detection — this
    // app only ever talks to the one GCP project it's deployed in, same
    // spirit as the hardcoded Google Ads API version elsewhere in this repo.
    firestoreClient = new Firestore({ projectId: "quarizmi-health-checker" });
  }
  return firestoreClient;
}

function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/[^0-9]/g, "");
}

/** Placeholder for real business-type inference (e.g. from Shopping/
 * Merchant Center presence). Always "lead_gen" for now — this is only the
 * default a brand-new settings record gets; after that, the stored value
 * in Firestore always wins, and the settings page can change it. */
function defaultBusinessType(): BusinessType {
  return "lead_gen";
}

/**
 * Reads an account's settings, creating a record with default values on
 * first access if none exists yet — so viewing an account's health check
 * is what brings its settings record into existence, not a separate setup
 * step. Every later health check, and the settings page itself, both read
 * through this same function.
 */
export async function getOrCreateAccountSettings(customerId: string): Promise<AccountSettings> {
  const id = normalizeCustomerId(customerId);
  const docRef = getFirestore().collection(COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (snapshot.exists) {
    return snapshot.data() as AccountSettings;
  }

  const now = new Date().toISOString();
  const defaults: AccountSettings = {
    customerId: id,
    businessType: defaultBusinessType(),
    createdAt: now,
    updatedAt: now,
  };
  await docRef.set(defaults);
  return defaults;
}

/** Updates an account's settings — used by the settings page's save
 * action. Merges rather than overwrites, so adding more editable fields
 * later doesn't require touching every existing record. */
export async function updateAccountSettings(
  customerId: string,
  updates: Partial<Pick<AccountSettings, "businessType" | "primaryDomain">>
): Promise<void> {
  const id = normalizeCustomerId(customerId);
  const docRef = getFirestore().collection(COLLECTION).doc(id);
  await docRef.set({ ...updates, updatedAt: new Date().toISOString() }, { merge: true });
}

/**
 * Auto-classifies (keyword match against the campaign name) any campaign
 * not already in the stored map, persists just the additions, and returns
 * the full up-to-date map. A campaign already classified — whether by a
 * past auto-match or a manual override on the settings page — is left
 * untouched, so this never re-runs or re-litigates a classification once
 * it exists; only genuinely new campaign IDs get auto-classified. Called
 * every time an account's health check or settings page is viewed, so new
 * campaigns get picked up without a separate setup step.
 */
export async function classifyNewCampaigns(
  customerId: string,
  campaigns: { id: string; name: string }[],
  brandKeywords: string[]
): Promise<Record<string, CampaignBrandClassification>> {
  const settings = await getOrCreateAccountSettings(customerId);
  const existing = settings.campaignBrandClassifications ?? {};

  const newEntries: Record<string, CampaignBrandClassification> = {};
  for (const campaign of campaigns) {
    if (existing[campaign.id]) continue;
    const isBrand = brandKeywords.some((kw) => campaign.name.toLowerCase().includes(kw.toLowerCase()));
    newEntries[campaign.id] = { isBrand, source: "auto" };
  }

  if (Object.keys(newEntries).length === 0) {
    return existing;
  }

  const merged = { ...existing, ...newEntries };
  const id = normalizeCustomerId(customerId);
  const docRef = getFirestore().collection(COLLECTION).doc(id);
  // Writes the full merged map explicitly rather than just `newEntries`
  // with `{merge: true}` — relying on Firestore's nested-map merge
  // behavior here risks silently dropping a manual override if that
  // behavior is ever misjudged; writing the already-merged object removes
  // the question entirely.
  await docRef.set(
    { campaignBrandClassifications: merged, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return merged;
}

/** Sets (or changes) one campaign's brand classification from the settings
 * page — always recorded as "manual" so it's never silently overwritten by
 * a later `classifyNewCampaigns` pass. */
export async function setCampaignBrandOverride(
  customerId: string,
  campaignId: string,
  isBrand: boolean
): Promise<void> {
  const settings = await getOrCreateAccountSettings(customerId);
  const existing = settings.campaignBrandClassifications ?? {};
  const merged: Record<string, CampaignBrandClassification> = {
    ...existing,
    [campaignId]: { isBrand, source: "manual" },
  };
  const id = normalizeCustomerId(customerId);
  const docRef = getFirestore().collection(COLLECTION).doc(id);
  await docRef.set(
    { campaignBrandClassifications: merged, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}
