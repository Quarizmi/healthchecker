import Link from "next/link";
import { auth } from "@/auth";
import { runHealthCheck } from "@/lib/run-health-check";
import { HealthDashboard } from "./_components/HealthDashboard";
import { DebugPanel } from "./_components/DebugPanel";
import { GearIcon } from "../../_components/GearIcon";
import { formatCurrencyMicros } from "@/lib/format";
import styles from "../../page.module.css";

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
    currencyCode,
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
        <p style={{ marginBottom: 36 }}>
          Total spend (last 30 days): {formatCurrencyMicros(totalSpendMicros, currencyCode)}
        </p>

        <HealthDashboard
          healthScore={healthScore}
          customerId={customerId}
          loginCustomerId={effectiveLoginCustomerId}
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
