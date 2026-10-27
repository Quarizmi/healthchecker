import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getOrCreateAccountSettings,
  updateAccountSettings,
  classifyNewCampaigns,
  setCampaignBrandOverride,
} from "@/lib/account-settings";
import { listCampaigns } from "@/lib/google-ads";
import { resolveThresholds } from "@/lib/health-config";
import styles from "../../../page.module.css";

export default async function AccountSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ loginCustomerId?: string }>;
}) {
  const { customerId } = await params;
  const { loginCustomerId } = await searchParams;
  const effectiveLoginCustomerId = loginCustomerId ?? customerId;
  const backHref = `/accounts/${customerId}?loginCustomerId=${effectiveLoginCustomerId}`;

  const session = await auth();

  if (!session?.user) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>Account settings</h1>
          <p>Sign in with Google to view or change this account&rsquo;s settings.</p>
          <p>
            <Link href="/">Go to sign in</Link>
          </p>
        </main>
      </div>
    );
  }

  if (!session.accessToken) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <h1>Account settings</h1>
          <p style={{ color: "crimson" }}>No access token on session.</p>
        </main>
      </div>
    );
  }

  const settings = await getOrCreateAccountSettings(customerId);
  const thresholds = await resolveThresholds(customerId);
  const campaignsResult = await listCampaigns(session.accessToken, customerId, effectiveLoginCustomerId);
  const classifications = campaignsResult.ok
    ? await classifyNewCampaigns(customerId, campaignsResult.campaigns, thresholds.brandKeywords)
    : {};

  async function save(formData: FormData) {
    "use server";
    // Re-checked here, not just in the page render above — a Server Action
    // can in principle be invoked directly, so the write itself needs its
    // own guard rather than relying only on the page having shown a form.
    const actionSession = await auth();
    if (!actionSession?.user) {
      redirect("/");
    }

    const businessType = formData.get("businessType");
    if (businessType === "lead_gen" || businessType === "ecommerce") {
      await updateAccountSettings(customerId, { businessType });
    }

    // Only writes a campaign whose checkbox state actually differs from
    // what was loaded — so saving the form for an unrelated reason (e.g.
    // just changing business type) doesn't silently convert every
    // auto-classified campaign into a manual override.
    if (campaignsResult.ok) {
      for (const campaign of campaignsResult.campaigns) {
        const checked = formData.get(`campaign-${campaign.id}`) === "on";
        const current = classifications[campaign.id]?.isBrand ?? false;
        if (checked !== current) {
          await setCampaignBrandOverride(customerId, campaign.id, checked);
        }
      }
    }

    redirect(backHref);
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Account settings</h1>
        <p>
          <Link href={backHref}>&larr; Back to account</Link>
        </p>

        <form action={save}>
          <fieldset
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "16px 20px",
              marginTop: 16,
            }}
          >
            <legend style={{ fontWeight: 600 }}>Business type</legend>
            <p style={{ color: "#666", fontSize: "0.9em", marginTop: 0 }}>
              Determines which thresholds the health check uses for campaign-type spend
              concentration — a lead-gen account is checked for too much Performance Max spend;
              an e-commerce account is checked for too little.
            </p>
            <label style={{ display: "block", marginBottom: 10, cursor: "pointer" }}>
              <input
                type="radio"
                name="businessType"
                value="lead_gen"
                defaultChecked={settings.businessType === "lead_gen"}
              />{" "}
              Lead generation
            </label>
            <label style={{ display: "block", cursor: "pointer" }}>
              <input
                type="radio"
                name="businessType"
                value="ecommerce"
                defaultChecked={settings.businessType === "ecommerce"}
              />{" "}
              E-commerce
            </label>
          </fieldset>

          <fieldset
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "16px 20px",
              marginTop: 16,
            }}
          >
            <legend style={{ fontWeight: 600 }}>Brand campaigns</legend>
            <p style={{ color: "#666", fontSize: "0.9em", marginTop: 0 }}>
              New campaigns are classified automatically the first time they&rsquo;re seen, by
              matching their name against configured brand keywords. Override any of them below
              — once changed here, a campaign is never reclassified automatically again.
            </p>
            {campaignsResult.ok ? (
              campaignsResult.campaigns.length > 0 ? (
                campaignsResult.campaigns.map((campaign) => {
                  const classification = classifications[campaign.id];
                  return (
                    <label
                      key={campaign.id}
                      style={{ display: "block", marginBottom: 8, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        name={`campaign-${campaign.id}`}
                        defaultChecked={classification?.isBrand ?? false}
                      />{" "}
                      {campaign.name}{" "}
                      {classification?.source === "manual" && (
                        <span style={{ color: "#888", fontSize: "0.85em" }}>(manually set)</span>
                      )}
                    </label>
                  );
                })
              ) : (
                <p>No campaigns with spend in the last 30 days.</p>
              )
            ) : (
              <p style={{ color: "crimson" }}>{campaignsResult.error}</p>
            )}
          </fieldset>

          <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>
            Save
          </button>
        </form>
      </main>
    </div>
  );
}
