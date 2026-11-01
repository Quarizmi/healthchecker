import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "admin_auth";

/**
 * The admin gate is a single shared password (env var `ADMIN_PASSWORD`),
 * independent of Google sign-in — this protects an internal CRM view, not
 * a per-user resource. The cookie never stores the password itself; it
 * stores a hash derived from it, so changing `ADMIN_PASSWORD` immediately
 * invalidates every existing session with no extra state to clean up.
 */
function expectedCookieValue(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHash("sha256").update(`admin-gate:${password}`).digest("hex");
}

/** Constant-time compare — the password itself is checked against a
 * user-submitted value, so a timing side-channel is worth closing even on
 * a low-stakes internal tool. */
export function verifyAdminPassword(submitted: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(password);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminCookieValueForSuccessfulLogin(): string | null {
  return expectedCookieValue();
}

export function isValidAdminCookie(cookieValue: string | undefined): boolean {
  const expected = expectedCookieValue();
  if (!expected || !cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
