import { WhatsAppIcon } from "./WhatsAppIcon";
import { EmailIcon } from "./EmailIcon";
import styles from "./contact-links.module.css";

const WHATSAPP_NUMBER = "16174750704";
const CONTACT_EMAIL = "automation@quarizmi.com";

/** The two ways to reach us while the app is still waiting on Google's
 * verification — shown on the login page up front, and again on any error
 * page someone might land on in the meantime. */
export function ContactLinks() {
  return (
    <div className={styles.row}>
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        <WhatsAppIcon />
        WhatsApp
      </a>
      <a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>
        <EmailIcon />
        Email
      </a>
    </div>
  );
}
