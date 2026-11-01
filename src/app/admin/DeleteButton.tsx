"use client";

import styles from "./admin.module.css";

/** Submits a server action after a native confirm — used for destructive
 * admin-page row deletes, where a client component is needed only to gate
 * the submit on a confirmation the server action itself can't ask for. */
export function DeleteButton({
  action,
  hidden,
  confirmText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: Record<string, string>;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button type="submit" className={styles.deleteButton}>
        Delete
      </button>
    </form>
  );
}
