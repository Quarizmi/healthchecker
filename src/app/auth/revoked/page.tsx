import Link from "next/link";
import { ContactLinks } from "../../_components/ContactLinks";
import pageStyles from "../../page.module.css";
import styles from "../../_components/error-fallback.module.css";

export default function AccessRevokedPage() {
  return (
    <div className={pageStyles.page}>
      <main className={styles.card}>
        <h1>Access revoked</h1>
        <p className={styles.message}>
          Your Google Ads access has been revoked, and you have been signed out. Quarizmi AdTech
          no longer has access to your Google account or your Google Ads data. If you&rsquo;d
          like to use Health Checker again in the future, you&rsquo;re welcome to sign in and
          reauthorize access at any time.
        </p>

        <div className={styles.actions}>
          <Link href="/" className="btn-primary">
            Return to sign-in
          </Link>
        </div>

        <p className={styles.contactLabel}>Questions? Reach us directly:</p>
        <ContactLinks />
      </main>
    </div>
  );
}
