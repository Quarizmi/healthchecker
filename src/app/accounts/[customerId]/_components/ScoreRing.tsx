import styles from "../health-dashboard.module.css";
import type { ScoreTier } from "@/lib/health-score";

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STROKE_VAR_BY_TIER: Record<ScoreTier, string> = {
  good: "var(--health-good)",
  warning: "var(--health-warning)",
  critical: "var(--health-critical)",
};

export function ScoreRing({
  score,
  tier,
  noData,
}: {
  score: number;
  tier: ScoreTier;
  /** Renders a filled neutral ring with "No data" instead of a tier-colored
   * score — the health check wasn't attempted, so a red/green number here
   * would misread as "this account was scored and it's bad/good." */
  noData?: boolean;
}) {
  const clamped = Math.min(Math.max(score, 0), 100);
  const dashoffset = noData ? 0 : CIRCUMFERENCE * (1 - clamped / 100);
  const strokeColor = noData ? "var(--health-pending)" : STROKE_VAR_BY_TIER[tier];

  return (
    <div className={styles.ringWrap}>
      <svg viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke="var(--health-track)"
          strokeWidth="12"
        />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className={styles.ringCenter}>
        <div className={styles.ringScore}>{noData ? "—" : Math.round(clamped)}</div>
        <div className={styles.ringMax}>{noData ? "No data" : "/ 100"}</div>
      </div>
    </div>
  );
}
