"use client";

import { useEffect, useState } from "react";
import styles from "../health-dashboard.module.css";
import type { MetricResult } from "@/lib/health-score";
import { submitMetricFeedback } from "@/lib/metric-feedback";
import { MeterBar } from "./MeterBar";

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

export function MetricDetailModal({
  metric,
  customerId,
  userEmail,
  userName,
  onClose,
}: {
  metric: MetricResult;
  customerId: string;
  userEmail: string | null;
  userName: string | null;
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    if (!comment.trim() || !userEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitMetricFeedback({
        customerId,
        metricId: metric.id,
        metricTitle: metric.title,
        status: metric.status,
        valueLabel: metric.valueLabel,
        points: metric.points,
        maxPoints: metric.maxPoints,
        comment: comment.trim(),
        userEmail,
        userName,
      });
      setSubmitted(true);
    } catch {
      setError("Couldn't send that — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{metric.title}</h2>
            <span className={`${styles.statusPill} ${PILL_CLASS[metric.status]}`}>
              {PILL_LABEL[metric.status]}
            </span>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalStat}>{metric.valueLabel}</div>
          <div className={styles.modalMeta}>{metric.meta}</div>
          {metric.meterPct != null && (
            <div className={styles.modalMeter}>
              <MeterBar
                pct={metric.meterPct}
                status={metric.status}
                thresholdTickPct={metric.thresholdTickPct}
              />
            </div>
          )}

          <div className={styles.modalSection}>
            <p className={styles.modalSectionTitle}>What this measures</p>
            <p className={styles.modalSectionBody}>{metric.explanation}</p>
          </div>

          <div className={styles.modalSection}>
            <p className={styles.modalSectionTitle}>How we scored it</p>
            <p className={styles.modalSectionBody}>{metric.methodology}</p>
          </div>

          <div className={styles.feedbackSection}>
            {submitted ? (
              <p className={styles.feedbackSuccess}>
                Thanks — we&rsquo;ve noted your take on this one.
              </p>
            ) : (
              <>
                <p className={styles.feedbackPrompt}>
                  Does this match what you&rsquo;re seeing in the account? If something looks
                  off, tell us what you&rsquo;re seeing.
                </p>
                <textarea
                  className={styles.feedbackTextarea}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="E.g. this campaign actually has negatives applied at the ad group level..."
                  disabled={submitting}
                />
                {error && <p className={styles.feedbackError}>{error}</p>}
                <div className={styles.feedbackActions}>
                  <button
                    type="button"
                    className={styles.feedbackSubmit}
                    onClick={handleSubmit}
                    disabled={submitting || !comment.trim() || !userEmail}
                  >
                    {submitting ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
