import Link from "next/link";
import { auth, signIn } from "@/auth";
import { listAccountGroup, listManagedAccounts, type ManagedAccount } from "@/lib/google-ads";
import { displayError } from "@/lib/error-display";
import { GoogleAdsIcon } from "./_components/GoogleAdsIcon";
import { ContactLinks } from "./_components/ContactLinks";
import pageStyles from "./page.module.css";
import styles from "./account-list.module.css";

/** One account row. Manager accounts drill into their own children instead
 * of going to the health check page — the health check only ever runs on
 * a single (non-manager) account. */
function AccountRow({
  account,
  loginCustomerId,
}: {
  account: ManagedAccount;
  loginCustomerId: string;
}) {
  const href = account.isManager
    ? `/?scope=${account.id}&loginCustomerId=${loginCustomerId}`
    : `/accounts/${account.id}?loginCustomerId=${loginCustomerId}`;

  return (
    <Link href={href} className={styles.rowLink}>
      <GoogleAdsIcon />
      <span className={styles.rowText}>
        {account.name ?? "(unnamed)"} <span className={styles.accountId}>({account.id})</span>
        {account.isManager && (
          <span className={styles.managerBadge}>Manager — view sub-accounts</span>
        )}
        {!account.isManager && account.status !== "ENABLED" && (
          <span className={styles.badge}>{account.status}</span>
        )}
      </span>
    </Link>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; loginCustomerId?: string }>;
}) {
  const session = await auth();
  const { scope, loginCustomerId } = await searchParams;

  if (!session?.user) {
    return (
      <div className={pageStyles.page}>
        <main className={pageStyles.loginCard}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/quarizmi-logo.svg" alt="Quarizmi" className={pageStyles.loginLogo} />
          <h1 className={pageStyles.loginTitle}>Health Checker</h1>
          <p className={pageStyles.loginTagline}>Google Ads Account Health Checker</p>
          <p className={pageStyles.loginBody}>
            Connect a Google Ads account and get an instant 0&ndash;100 health score for how
            well it&rsquo;s being managed, with concrete recommendations for what to fix first.
          </p>

          <p className={pageStyles.contactLabel}>Get in touch:</p>
          <ContactLinks />

          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button type="submit" className="btn-primary">
              Sign in with Google
            </button>
          </form>
          <p className={pageStyles.pendingNote}>
            Google is still reviewing our app, so sign-in is invite-only for now &mdash; message
            us above first and we&rsquo;ll add you as a tester.
          </p>
        </main>

        <section className={pageStyles.howItWorks}>
          <h2 className={pageStyles.howItWorksTitle}>How it works</h2>
          <ol className={pageStyles.howItWorksList}>
            <li>
              <strong>Connect.</strong> Sign in with the Google account that has access to the
              Google Ads account(s) you want checked. Quarizmi AdTech only reads the Google Ads
              data needed to run the checks below &mdash; it never changes your account settings.
            </li>
            <li>
              <strong>Score.</strong> The app pulls your recent campaign, keyword, and
              configuration data and turns it into a single 0&ndash;100 health score.
            </li>
            <li>
              <strong>Fix.</strong> You get a prioritized list of concrete issues to address,
              instead of having to dig through the Google Ads UI yourself.
            </li>
          </ol>
          <p className={pageStyles.howItWorksFootnote}>
            Built and operated by{" "}
            <a href="https://quarizmi.com" target="_blank" rel="noopener noreferrer">
              Quarizmi AdTech, Inc.
            </a>
            . See our{" "}
            <a href="https://quarizmi.com/privacy-cookies/" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>{" "}
            for details on how your data is handled.
          </p>
        </section>
      </div>
    );
  }

  if (!session.accessToken) {
    return (
      <div className={pageStyles.page}>
        <main className={pageStyles.main}>
          <h1>Marketing Health Checker</h1>
          <p style={{ color: "crimson" }}>No access token on session.</p>
        </main>
      </div>
    );
  }

  // Drilled into a specific manager account — show only its own children.
  if (scope) {
    const effectiveLoginCustomerId = loginCustomerId ?? scope;
    const result = await listAccountGroup(session.accessToken, scope, effectiveLoginCustomerId);

    return (
      <div className={pageStyles.page}>
        <main className={pageStyles.main}>
          <h1>Marketing Health Checker</h1>
          <p>
            <Link href="/">&larr; Back to all accounts</Link>
          </p>

          {result.ok ? (
            result.group ? (
              <>
                <p>
                  Sub-accounts of {result.group.topLevel.name ?? "(unnamed)"} ({result.group.topLevel.id})
                  :
                </p>
                {result.group.children.length > 0 ? (
                  <ul className={styles.list}>
                    {result.group.children.map((child) => (
                      <li key={child.id} className={styles.row}>
                        <AccountRow account={child} loginCustomerId={effectiveLoginCustomerId} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No sub-accounts found under this manager account.</p>
                )}
              </>
            ) : (
              <p>Account not found, or it&rsquo;s canceled.</p>
            )
          ) : (
            <p style={{ color: "crimson" }}>{displayError(result.error)}</p>
          )}
        </main>
      </div>
    );
  }

  const result = await listManagedAccounts(session.accessToken);

  return (
    <div className={pageStyles.page}>
      <main className={pageStyles.main}>
        <h1>Marketing Health Checker</h1>
        <p>Signed in as {session.user.email}</p>

        {result.ok ? (
          result.groups.length > 0 ? (
            <>
              <p>Accounts under management:</p>
              <ul className={styles.list}>
                {result.groups.map((group) => (
                  <li key={group.topLevel.id} className={styles.group}>
                    <AccountRow account={group.topLevel} loginCustomerId={group.topLevel.id} />
                    {group.error ? (
                      <p style={{ color: "crimson" }}>{displayError(group.error)}</p>
                    ) : group.children.length > 0 ? (
                      <ul className={styles.childList}>
                        {group.children.map((child) => (
                          <li key={child.id}>
                            <AccountRow account={child} loginCustomerId={group.topLevel.id} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No Google Ads accounts found for this Google account.</p>
          )
        ) : (
          <p style={{ color: "crimson" }}>{displayError(result.error)}</p>
        )}
      </main>
    </div>
  );
}
