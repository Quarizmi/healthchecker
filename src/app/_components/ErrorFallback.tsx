"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ContactLinks } from "./ContactLinks";
import pageStyles from "../page.module.css";
import styles from "./error-fallback.module.css";

/** What anyone — including a Google OAuth reviewer — sees instead of
 * Next.js's default crash screen (the raw message plus a "digest" number)
 * or NextAuth's default error page. Hidden behind the same Ctrl/Cmd+Shift+D
 * shortcut as the health-check DebugPanel reveals the real error/digest so
 * it can still be diagnosed from the live site. */
export function ErrorFallback({
  message,
  detail,
  onRetry,
  backHref,
}: {
  message: string;
  detail: string;
  onRetry?: () => void;
  backHref?: string;
}) {
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebug((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={pageStyles.page}>
      <main className={styles.card}>
        <h1>Something went wrong</h1>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className="btn-primary" onClick={onRetry}>
              Try again
            </button>
          )}
          {backHref && (
            <Link href={backHref} className="btn-primary">
              Back to sign-in
            </Link>
          )}
        </div>

        <p className={styles.contactLabel}>Still stuck? Reach us directly:</p>
        <ContactLinks />

        {showDebug && <pre className={styles.debugDetail}>{detail}</pre>}
        <p className={styles.debugHint}>Ctrl/Cmd+Shift+D to toggle error details</p>
      </main>
    </div>
  );
}
