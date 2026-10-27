import styles from "../health-dashboard.module.css";
import type { MetricStatus } from "@/lib/health-score";

export function MeterBar({
  pct,
  status,
  thresholdTickPct,
}: {
  pct: number;
  status: MetricStatus;
  thresholdTickPct?: number;
}) {
  const fillClass =
    status === "good"
      ? styles.meterFill_good
      : status === "warning"
        ? styles.meterFill_warning
        : styles.meterFill_critical;

  return (
    <div className={styles.meter}>
      <div
        className={`${styles.meterFill} ${fillClass}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
      {thresholdTickPct != null && (
        <div className={styles.meterTick} style={{ left: `${thresholdTickPct}%` }} />
      )}
    </div>
  );
}
