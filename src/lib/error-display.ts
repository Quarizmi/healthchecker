/**
 * Whether raw backend error text (Google Ads API errors, auth errors, etc.)
 * is shown to whoever's looking at the page, or swapped for a generic
 * message. Defaults to showing raw errors — this app is still being built
 * and tested, and seeing the real error is exactly what makes that
 * possible. Flip to "false" (Cloud Run env var, or .env.local) once this is
 * a live tool for people other than whoever's actively building it; nothing
 * else in the code needs to change.
 */
const SHOW_RAW_ERRORS = process.env.SHOW_RAW_ERRORS !== "false";

const GENERIC_ERROR_MESSAGE = "This couldn't be loaded right now. Please try again shortly.";

/**
 * Wraps a raw error string for display. Always logs the real error
 * server-side (visible in Cloud Run logs) regardless of the toggle, so the
 * detail isn't lost once raw errors stop being shown on-screen.
 */
export function displayError(rawError: string): string {
  console.error("[health-checker]", rawError);
  return SHOW_RAW_ERRORS ? rawError : GENERIC_ERROR_MESSAGE;
}
