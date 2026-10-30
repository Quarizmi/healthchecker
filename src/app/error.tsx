"use client";

import { useEffect } from "react";
import { ErrorFallback } from "./_components/ErrorFallback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[health-checker] page error:", error);
  }, [error]);

  return (
    <ErrorFallback
      message="Something went wrong loading this page. Please try again, or reach out below if it keeps happening."
      detail={[error.message, error.digest && `Digest: ${error.digest}`, error.stack]
        .filter(Boolean)
        .join("\n\n")}
      onRetry={reset}
    />
  );
}
