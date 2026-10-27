import styles from "../health-dashboard.module.css";
import type { HealthScore } from "@/lib/health-score";
import { jetbrainsMono } from "./fonts";
import { ScoreRing } from "./ScoreRing";
import { SignalCard } from "./SignalCard";

const TIER_LABEL = {
  good: "Good",
  warning: "Needs attention",
  critical: "Critical",
} as const;

export function HealthDashboard({ healthScore }: { healthScore: HealthScore }) {
  return (
    <div className={`${styles.dashboard} ${jetbrainsMono.variable}`}>
      <section className={styles.hero}>
        <ScoreRing
          score={healthScore.overallScore}
          tier={healthScore.tier}
          noData={healthScore.noData}
        />
        <div className={styles.heroBody}>
          <h2>Account Health Score</h2>
          {healthScore.noData ? (
            <p className={styles.heroSub}>
              No ad spend in the last 30 days, so the health check wasn&rsquo;t run — there&rsquo;s
              nothing yet to evaluate. It&rsquo;ll run automatically once this account starts
              spending again.
            </p>
          ) : (
            <>
              <p className={styles.heroSub}>
                A composite of {healthScore.totalMetricCount} management-quality signals — not a
                copy of Google&rsquo;s own Optimization Score.{" "}
                {healthScore.pendingMetricIds.length > 0 &&
                  `${healthScore.pendingMetricIds.length} of ${healthScore.totalMetricCount} aren't wired up yet and don't count toward this score.`}
              </p>
              <span className={`${styles.statusPill} ${styles[`statusPill_${healthScore.tier}`]}`}>
                {TIER_LABEL[healthScore.tier]}
              </span>
              <div className={styles.tierLegend}>
                <span>
                  <i className={styles.tierDot} style={{ background: "var(--health-critical)" }} />
                  0&ndash;49 Critical
                </span>
                <span>
                  <i className={styles.tierDot} style={{ background: "var(--health-warning)" }} />
                  50&ndash;74 Needs attention
                </span>
                <span>
                  <i className={styles.tierDot} style={{ background: "var(--health-good)" }} />
                  75&ndash;100 Good
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      <p className={styles.sectionLabel}>
        {healthScore.totalMetricCount} signals behind the score
      </p>
      <div className={styles.grid}>
        {healthScore.metrics.map((metric) => (
          <SignalCard key={metric.id} metric={metric} />
        ))}
      </div>
    </div>
  );
}
