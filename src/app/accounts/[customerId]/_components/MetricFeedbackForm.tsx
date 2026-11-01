"use client";

import { useState } from "react";
import dashboardStyles from "../health-dashboard.module.css";
import type { MetricId, MetricResult } from "@/lib/health-score";
import { submitMetricFeedback } from "@/lib/metric-feedback";

/** One plausible, metric-specific disagreement per metric — shown as the
 * feedback textarea's placeholder so the hint is actually relevant to what
 * someone is looking at, instead of one generic example (originally
 * written for negative-keyword coverage) showing up on every metric. */
const FEEDBACK_PLACEHOLDER: Record<MetricId, string> = {
  spendConcentration:
    "E.g. the PMax share is high on purpose — we're deliberately testing a higher cap this month...",
  brandPresence:
    "E.g. we do run a dedicated brand campaign, it's just paused right now for a seasonal reason...",
  keywordUtilization:
    "E.g. those keywords are intentionally paused for the season, not abandoned...",
  negativeKeywordCoverage:
    "E.g. this campaign actually has negatives applied at the ad group level, not the campaign level...",
  accountActivity:
    "E.g. changes were made this month through a connected feed or script, not directly in the account...",
  adCoverage:
    "E.g. these ad groups only need one ad on purpose — they're running Dynamic Search Ads...",
  conversionTrackingIntegrity:
    "E.g. that conversion action is a legacy goal we haven't removed yet, not a tracking failure...",
  budgetConstrainedShare:
    "E.g. we're intentionally capping this campaign's budget while we test a new landing page...",
};

export function MetricFeedbackForm({
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
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className={dashboardStyles.feedbackSection}>
      {submitted ? (
        <p className={dashboardStyles.feedbackSuccess}>
          Thanks — we&rsquo;ve noted your take on this one.
        </p>
      ) : (
        <>
          <p className={dashboardStyles.feedbackPrompt}>
            Does this match what you&rsquo;re seeing in the account? If something looks off, tell
            us what you&rsquo;re seeing.
          </p>
          <textarea
            className={dashboardStyles.feedbackTextarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={FEEDBACK_PLACEHOLDER[metric.id]}
            disabled={submitting}
          />
          {error && <p className={dashboardStyles.feedbackError}>{error}</p>}
          <div className={dashboardStyles.feedbackActions}>
            <button
              type="button"
              className={dashboardStyles.feedbackSubmit}
              onClick={handleSubmit}
              disabled={submitting || !comment.trim() || !userEmail}
            >
              {submitting ? "Sending..." : "Send feedback"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
