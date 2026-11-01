import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE_NAME,
  adminCookieValueForSuccessfulLogin,
  isValidAdminCookie,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import { deleteCrmLead, listCrmLeads } from "@/lib/crm";
import { deleteMetricFeedback, listMetricFeedback } from "@/lib/metric-feedback";
import { formatChannelType } from "@/lib/format";
import { DeleteButton } from "./DeleteButton";
import { jetbrainsMono } from "./fonts";
import styles from "./admin.module.css";

const STATUS_LABEL: Record<string, string> = {
  good: "Good",
  warning: "Warning",
  critical: "Critical",
  pending: "Pending",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const authed = isValidAdminCookie(cookieStore.get(ADMIN_COOKIE_NAME)?.value);

  async function login(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const cookieValue = verifyAdminPassword(password) ? adminCookieValueForSuccessfulLogin() : null;

    if (!cookieValue) {
      redirect("/admin?error=1");
    }

    const store = await cookies();
    store.set(ADMIN_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/admin",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/admin");
  }

  if (!authed) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <div className={styles.loginCard}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, not a page-driven image */}
            <img src="/quarizmi-logo.svg" alt="Quarizmi" height={24} className={styles.loginLogo} />
            <h1 style={{ fontSize: "1.3em", margin: 0 }}>Admin</h1>
            {error && <p className={styles.loginError}>Incorrect password.</p>}
            <form action={login} className={styles.loginForm}>
              <input
                type="password"
                name="password"
                placeholder="Password"
                autoFocus
                required
                className={styles.passwordInput}
              />
              <button type="submit" className="btn-primary">
                Sign in
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  async function logout() {
    "use server";
    const store = await cookies();
    store.delete(ADMIN_COOKIE_NAME);
    redirect("/admin");
  }

  /** Server actions are reachable directly, independent of this page's
   * render-time auth check above, so each one re-verifies the admin cookie
   * itself before touching Firestore. */
  async function deleteLead(formData: FormData) {
    "use server";
    const store = await cookies();
    if (!isValidAdminCookie(store.get(ADMIN_COOKIE_NAME)?.value)) {
      redirect("/admin");
    }
    const email = String(formData.get("email") ?? "");
    const customerId = String(formData.get("customerId") ?? "");
    if (email && customerId) {
      await deleteCrmLead(email, customerId);
    }
    revalidatePath("/admin");
  }

  async function deleteFeedback(formData: FormData) {
    "use server";
    const store = await cookies();
    if (!isValidAdminCookie(store.get(ADMIN_COOKIE_NAME)?.value)) {
      redirect("/admin");
    }
    const id = String(formData.get("id") ?? "");
    if (id) {
      await deleteMetricFeedback(id);
    }
    revalidatePath("/admin");
  }

  const leads = await listCrmLeads();
  const feedback = await listMetricFeedback();
  const totalSpendMicros = leads.reduce((sum, l) => sum + l.totalSpendMicros, 0);
  const uniqueDomains = new Set(leads.map((l) => l.primaryDomain).filter(Boolean)).size;
  const totalViews = leads.reduce((sum, l) => sum + l.viewCount, 0);

  return (
    <div className={styles.page}>
      <main className={`${styles.container} ${jetbrainsMono.variable}`}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, not a page-driven image */}
            <img src="/quarizmi-logo.svg" alt="Quarizmi" height={22} />
            <h1 className={styles.title}>CRM</h1>
          </div>
          <div className={styles.actions}>
            <a href="/admin/export" className={styles.exportLink}>
              Export CSV
            </a>
            <form action={logout}>
              <button type="submit" className={styles.logoutButton}>
                Log out
              </button>
            </form>
          </div>
        </div>
        <p className={styles.subtitle}>Everyone who&rsquo;s used the Health Checker.</p>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{leads.length}</div>
            <div className={styles.statLabel}>Leads</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>${(totalSpendMicros / 1_000_000).toFixed(0)}</div>
            <div className={styles.statLabel}>Tracked spend (30d)</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{uniqueDomains}</div>
            <div className={styles.statLabel}>Unique domains</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{totalViews}</div>
            <div className={styles.statLabel}>Total views</div>
          </div>
        </div>

        <div className={styles.tableCard}>
          {leads.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Account</th>
                    <th>Spend (30d)</th>
                    <th>Campaign type split</th>
                    <th>Views</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={`${lead.email}__${lead.customerId}`}>
                      <td>{lead.email}</td>
                      <td>{lead.name ?? "—"}</td>
                      <td>
                        <div className={styles.accountCell}>
                          {lead.primaryDomain ? (
                            // eslint-disable-next-line @next/next/no-img-element -- external favicon lookup, not a static asset next/image can optimize
                            <img
                              src={`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(lead.primaryDomain)}`}
                              alt=""
                              width={18}
                              height={18}
                              className={styles.favicon}
                            />
                          ) : (
                            <span className={styles.faviconPlaceholder} />
                          )}
                          <span>
                            {lead.accountName ?? "(unnamed)"}
                            <br />
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                              {lead.primaryDomain ?? lead.customerId}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className={styles.numCell}>
                        ${(lead.totalSpendMicros / 1_000_000).toFixed(2)}
                      </td>
                      <td>
                        {lead.spendByChannelType.length > 0 ? (
                          <div className={styles.splitList}>
                            {lead.spendByChannelType.map((c) => (
                              <span key={c.channelType} className={styles.splitPill}>
                                {formatChannelType(c.channelType)} {c.pct.toFixed(0)}%
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={styles.numCell}>
                        <span className={styles.viewBadge}>{lead.viewCount}</span>
                      </td>
                      <td>{new Date(lead.firstSeenAt).toLocaleDateString()}</td>
                      <td>{new Date(lead.lastSeenAt).toLocaleString()}</td>
                      <td>
                        <DeleteButton
                          action={deleteLead}
                          hidden={{ email: lead.email, customerId: lead.customerId }}
                          confirmText={`Delete the lead for ${lead.email} (${lead.accountName ?? lead.customerId})?`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyState}>No leads recorded yet.</p>
          )}
        </div>

        <h2 className={styles.sectionHeading}>Metric feedback</h2>
        <p className={styles.subtitle}>
          Sent from the &ldquo;See more&rdquo; detail view on a health score card.
        </p>

        <div className={styles.tableCard} style={{ marginTop: 16 }}>
          {feedback.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>From</th>
                    <th>Account</th>
                    <th>Metric</th>
                    <th>Score at the time</th>
                    <th>Comment</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((f) => (
                    <tr key={f.id}>
                      <td>{new Date(f.createdAt).toLocaleString()}</td>
                      <td>
                        {f.userName ?? "—"}
                        <br />
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                          {f.userEmail}
                        </span>
                      </td>
                      <td>{f.customerId}</td>
                      <td>{f.metricTitle}</td>
                      <td className={styles.numCell}>
                        <span className={`${styles.statusBadge} ${styles[`statusBadge_${f.status}`]}`}>
                          {STATUS_LABEL[f.status] ?? f.status}
                        </span>
                        <br />
                        {f.valueLabel} ({f.points}/{f.maxPoints} pts)
                      </td>
                      <td className={styles.commentCell}>{f.comment}</td>
                      <td>
                        {f.id && (
                          <DeleteButton
                            action={deleteFeedback}
                            hidden={{ id: f.id }}
                            confirmText={`Delete this feedback from ${f.userEmail}?`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyState}>No feedback submitted yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
