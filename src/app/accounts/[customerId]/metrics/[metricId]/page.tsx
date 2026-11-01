import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { runHealthCheck } from "@/lib/run-health-check";
import type { MetricResult } from "@/lib/health-score";
import { MeterBar } from "../../_components/MeterBar";
import { MetricFeedbackForm } from "../../_components/MetricFeedbackForm";
import { PrintButton } from "../../_components/PrintButton";
import pageStyles from "../../../../page.module.css";
import dashboardStyles from "../../health-dashboard.module.css";
import styles from "./metric-detail.module.css";

const PILL_CLASS: Record<MetricResult["status"], string> = {
  good: dashboardStyles.statusPill_good,
  warning: dashboardStyles.statusPill_warning,
  critical: dashboardStyles.statusPill_critical,
  pending: dashboardStyles.statusPill_pending,
};

const PILL_LABEL: Record<MetricResult["status"], string> = {
  good: "Good",
  warning: "Warning",
  critical: "Critical",
  pending: "Pending",
};

export default async function MetricDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string; metricId: string }>;
  searchParams: Promise<{ loginCustomerId?: string }>;
}) {
  const { customerId, metricId } = await params;
  const { loginCustomerId } = await searchParams;
  const session = await auth();
  const effectiveLoginCustomerId = loginCustomerId ?? customerId;

  const { healthScore } = await runHealthCheck(session, customerId, effectiveLoginCustomerId);
  const metric = healthScore.metrics.find((m) => m.id === metricId);

  if (!metric) {
    notFound();
  }

  const backHref = `/accounts/${customerId}?loginCustomerId=${effectiveLoginCustomerId}`;

  return (
    <div className={pageStyles.page}>
      <main className={pageStyles.main}>
        <div className={dashboardStyles.dashboard}>
          <p className={styles.noPrint}>
            <Link href={backHref}>&larr; Back to account</Link>
          </p>

          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <h1 className={styles.title}>{metric.title}</h1>
              <span className={`${dashboardStyles.statusPill} ${PILL_CLASS[metric.status]}`}>
                {PILL_LABEL[metric.status]}
              </span>
            </div>
            <PrintButton className={`${styles.printButton} ${styles.noPrint}`} />
          </div>

          <div className={styles.stat}>{metric.valueLabel}</div>
          <div className={styles.meta}>{metric.meta}</div>
          {metric.meterPct != null && (
            <div className={styles.meterWrap}>
              <MeterBar
                pct={metric.meterPct}
                status={metric.status}
                thresholdTickPct={metric.thresholdTickPct}
              />
            </div>
          )}

          <div className={dashboardStyles.modalSection}>
            <p className={dashboardStyles.modalSectionTitle}>What this measures</p>
            <p className={dashboardStyles.modalSectionBody}>{metric.explanation}</p>
          </div>

          <div className={dashboardStyles.modalSection}>
            <p className={dashboardStyles.modalSectionTitle}>How we scored it</p>
            <p className={dashboardStyles.modalSectionBody}>{metric.methodology}</p>
          </div>

          {metric.recommendations.length > 0 && (
            <div className={dashboardStyles.modalSection}>
              <p className={dashboardStyles.modalSectionTitle}>Recommendations</p>
              <ol className={styles.recommendationsList}>
                {metric.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ol>
            </div>
          )}

          <div className={styles.noPrint}>
            <MetricFeedbackForm
              metric={metric}
              customerId={customerId}
              userEmail={session?.user?.email ?? null}
              userName={session?.user?.name ?? null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
