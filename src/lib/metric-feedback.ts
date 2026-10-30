"use server";

import { Firestore } from "@google-cloud/firestore";
import type { MetricId, MetricStatus } from "./health-score";

const COLLECTION = "metricFeedback";

let firestoreClient: Firestore | null = null;

/** Lazily constructed — same reasoning as account-settings.ts: avoids
 * connecting to Firestore at module load time, and picks up Application
 * Default Credentials automatically. */
function getFirestore(): Firestore {
  if (!firestoreClient) {
    firestoreClient = new Firestore({ projectId: "quarizmi-adshealth" });
  }
  return firestoreClient;
}

export type MetricFeedback = {
  /** Firestore doc ID — only set when read back via listMetricFeedback,
   * not when first constructed for submitMetricFeedback's `.add()` call. */
  id?: string;
  customerId: string;
  metricId: MetricId;
  metricTitle: string;
  status: MetricStatus;
  valueLabel: string;
  points: number;
  maxPoints: number;
  comment: string;
  userEmail: string;
  userName: string | null;
  createdAt: string;
};

/** Records one piece of visitor feedback disputing or confirming a metric's
 * score, snapshotting the score it was given at the time — a later rescore
 * shouldn't retroactively change what this feedback was responding to. */
export async function submitMetricFeedback(input: {
  customerId: string;
  metricId: MetricId;
  metricTitle: string;
  status: MetricStatus;
  valueLabel: string;
  points: number;
  maxPoints: number;
  comment: string;
  userEmail: string;
  userName: string | null;
}): Promise<void> {
  const feedback: MetricFeedback = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  await getFirestore().collection(COLLECTION).add(feedback);
}

/** All recorded feedback, most recent first — for the admin page. */
export async function listMetricFeedback(): Promise<MetricFeedback[]> {
  const snapshot = await getFirestore().collection(COLLECTION).orderBy("createdAt", "desc").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as MetricFeedback) }));
}
