import { Firestore } from "@google-cloud/firestore";
import { formatChannelType } from "./format";

const COLLECTION = "crmLeads";

export type CrmSpendByChannelType = { channelType: string; costMicros: number; pct: number };

export type CrmLead = {
  email: string;
  name: string | null;
  customerId: string;
  accountName: string | null;
  totalSpendMicros: number;
  spendByChannelType: CrmSpendByChannelType[];
  primaryDomain: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  viewCount: number;
};

let firestoreClient: Firestore | null = null;

/** Lazily constructed — same reasoning as account-settings.ts: avoids
 * connecting to Firestore at module load time, and picks up Application
 * Default Credentials automatically. */
function getFirestore(): Firestore {
  if (!firestoreClient) {
    firestoreClient = new Firestore({ projectId: "quarizmi-adshealth" });
  }
  return firestoreClient;
}

/** One doc per (signed-in user, account) pair, not one per view — a lead
 * who re-checks the same account repeatedly updates their existing row
 * (bumping `viewCount`/`lastSeenAt`) instead of growing the table
 * unboundedly. `@`/`.` are valid Firestore doc-ID characters, but kept
 * out of the ID anyway so it reads cleanly in the Firestore console. */
function leadDocId(email: string, customerId: string): string {
  const safeEmail = email.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const normalizedCustomerId = customerId.replace(/[^0-9]/g, "");
  return `${safeEmail}__${normalizedCustomerId}`;
}

/**
 * Records one health-check view for the CRM. Called after a full,
 * successful health check (spend/channel-type/domain all need real data to
 * be worth recording) — never for a zero-spend or error run. Callers wrap
 * this in try/catch: a CRM write failing must never break the health check
 * page itself.
 */
export async function recordHealthCheckView(lead: {
  email: string;
  name: string | null;
  customerId: string;
  accountName: string | null;
  totalSpendMicros: number;
  spendByChannelType: CrmSpendByChannelType[];
  primaryDomain: string | null;
}): Promise<void> {
  const docRef = getFirestore().collection(COLLECTION).doc(leadDocId(lead.email, lead.customerId));
  const now = new Date().toISOString();
  const snapshot = await docRef.get();

  if (snapshot.exists) {
    const previousViewCount = (snapshot.data() as CrmLead | undefined)?.viewCount ?? 0;
    await docRef.set(
      {
        name: lead.name,
        accountName: lead.accountName,
        totalSpendMicros: lead.totalSpendMicros,
        spendByChannelType: lead.spendByChannelType,
        primaryDomain: lead.primaryDomain,
        lastSeenAt: now,
        viewCount: previousViewCount + 1,
      },
      { merge: true }
    );
    return;
  }

  const newLead: CrmLead = {
    email: lead.email,
    name: lead.name,
    customerId: lead.customerId,
    accountName: lead.accountName,
    totalSpendMicros: lead.totalSpendMicros,
    spendByChannelType: lead.spendByChannelType,
    primaryDomain: lead.primaryDomain,
    firstSeenAt: now,
    lastSeenAt: now,
    viewCount: 1,
  };
  await docRef.set(newLead);
}

/** All recorded leads, most recently seen first — for the admin page. */
export async function listCrmLeads(): Promise<CrmLead[]> {
  const snapshot = await getFirestore().collection(COLLECTION).orderBy("lastSeenAt", "desc").get();
  return snapshot.docs.map((doc) => doc.data() as CrmLead);
}

/** Permanently removes one lead row — used by the admin page's delete action. */
export async function deleteCrmLead(email: string, customerId: string): Promise<void> {
  await getFirestore().collection(COLLECTION).doc(leadDocId(email, customerId)).delete();
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV export for the admin page — one row per lead, same ordering as
 * `listCrmLeads`. The channel-type split uses "; " internally so it reads
 * cleanly in Excel/Sheets without every row needing quote-wrapping. */
export function leadsToCsv(leads: CrmLead[]): string {
  const header = [
    "Email",
    "Name",
    "Account name",
    "Customer ID",
    "Domain",
    "Spend (30d, USD)",
    "Campaign type split",
    "Views",
    "First seen",
    "Last seen",
  ];

  const rows = leads.map((lead) => [
    lead.email,
    lead.name ?? "",
    lead.accountName ?? "",
    lead.customerId,
    lead.primaryDomain ?? "",
    (lead.totalSpendMicros / 1_000_000).toFixed(2),
    lead.spendByChannelType
      .map((c) => `${formatChannelType(c.channelType)} ${c.pct.toFixed(0)}%`)
      .join("; "),
    String(lead.viewCount),
    lead.firstSeenAt,
    lead.lastSeenAt,
  ]);

  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}
