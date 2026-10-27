import pageStyles from "../../page.module.css";
import styles from "./loading.module.css";

// Next.js shows this automatically while page.tsx's async data fetch is in
// flight — no wiring needed beyond this file existing alongside page.tsx.
export default function Loading() {
  return (
    <div className={pageStyles.page}>
      <main className={pageStyles.main}>
        <div className={styles.wrap}>
          <div className={styles.spinner} />
          <p className={styles.message}>
            Quarizmi is calculating your account&rsquo;s health score&hellip;
          </p>
        </div>
      </main>
    </div>
  );
}
