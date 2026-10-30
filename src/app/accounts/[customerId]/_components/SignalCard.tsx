"use client";

import { useState } from "react";
import styles from "../health-dashboard.module.css";
import type { MetricResult } from "@/lib/health-score";
import { MeterBar } from "./MeterBar";
import { MetricDetailModal } from "./MetricDetailModal";

const STRIPE_CLASS: Record<MetricResult["status"], string> = {
  good: styles.stripe_good,
  warning: styles.stripe_warning,
  critical: styles.stripe_critical,
  pending: styles.stripe_pending,
};

const PILL_CLASS: Record<MetricResult["status"], string> = {
  good: styles.statusPill_good,
  warning: styles.statusPill_warning,
  critical: styles.statusPill_critical,
  pending: styles.statusPill_pending,
};

const PILL_LABEL: Record<MetricResult["status"], string> = {
  good: "Good",
  warning: "Warning",
  critical: "Critical",
  pending: "Pending",
};

export function SignalCard({
  metric,
  customerId,
  userEmail,
  userName,
}: {
  metric: MetricResult;
  customerId: string;
  userEmail: string | null;
  userName: string | null;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <article className={styles.card}>
      <div className={`${styles.stripe} ${STRIPE_CLASS[metric.status]}`} />
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>{metric.title}</span>
          <span className={`${styles.statusPill} ${PILL_CLASS[metric.status]}`}>
            {PILL_LABEL[metric.status]}
          </span>
        </div>
        <div className={styles.cardStat}>{metric.valueLabel}</div>
        <div className={styles.cardMeta}>{metric.meta}</div>
        <div className={styles.cardExplain}>{metric.explanation}</div>
        {metric.meterPct != null && (
          <MeterBar
            pct={metric.meterPct}
            status={metric.status}
            thresholdTickPct={metric.thresholdTickPct}
          />
        )}
        <div className={styles.cardFooter}>
          <span>Contributes {metric.maxPoints} pts</span>
          <button
            type="button"
            className={styles.detailsTrigger}
            onClick={() => setDetailOpen(true)}
          >
            See more
          </button>
          <span>
            {metric.status === "pending" ? "—" : metric.points} / {metric.maxPoints}
          </span>
        </div>
      </div>

      {detailOpen && (
        <MetricDetailModal
          metric={metric}
          customerId={customerId}
          userEmail={userEmail}
          userName={userName}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </article>
  );
}
