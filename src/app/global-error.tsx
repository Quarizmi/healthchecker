"use client";

import { useEffect } from "react";
import { ErrorFallback } from "./_components/ErrorFallback";
import "./globals.css";

/** Catches a crash in the root layout itself (rare — Header/Footer don't do
 * much). Next.js requires this to render its own <html>/<body> since it
 * fully replaces the root layout while active. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[health-checker] root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorFallback
          message="Something went wrong. Please try again, or reach out below if it keeps happening."
          detail={[error.message, error.digest && `Digest: ${error.digest}`, error.stack]
            .filter(Boolean)
            .join("\n\n")}
          onRetry={reset}
        />
      </body>
    </html>
  );
}
