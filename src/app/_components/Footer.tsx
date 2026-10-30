import type { CSSProperties } from "react";
import { auth, signOut } from "@/auth";

const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "inherit",
  textDecoration: "underline",
  cursor: "pointer",
};

async function signOutAction() {
  "use server";
  await signOut();
}

/**
 * Signing out alone only clears the local app session — it doesn't touch
 * the actual Google Ads permission grant, which stays active in the
 * user's Google Account until they remove it themselves. This calls
 * Google's own OAuth revocation endpoint first (RFC 7009 — Google ties a
 * whole grant to its tokens, so revoking the access token revokes the
 * grant itself, equivalent to removing this app from
 * myaccount.google.com/permissions), then signs out locally either way.
 */
async function revokeAccessAction() {
  "use server";
  const session = await auth();

  if (session?.accessToken) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(session.accessToken)}`,
      });
    } catch (err) {
      // Still sign out locally below even if the revoke call itself
      // failed — better than leaving the local session looking "still
      // connected" when it may or may not actually be.
      console.error("Failed to revoke Google OAuth access:", err);
    }
  }

  await signOut({ redirectTo: "/" });
}

export async function Footer() {
  const year = new Date().getFullYear();
  const session = await auth();

  return (
    <footer
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        padding: "16px 24px",
        borderTop: "1px solid rgba(128, 128, 128, 0.25)",
        fontSize: "0.85em",
        opacity: 0.75,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span>&copy; Quarizmi {year}</span>
        <a href="https://quarizmi.com/privacy-cookies/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          Privacy Policy
        </a>
      </div>
      {session?.user && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <form action={revokeAccessAction}>
            <button
              type="submit"
              style={linkButtonStyle}
              title="Revokes this app's access to your Google Ads data on Google's side and signs you out — the same as removing it from myaccount.google.com/permissions"
            >
              Revoke access
            </button>
          </form>
          <form action={signOutAction}>
            <button type="submit" style={linkButtonStyle}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </footer>
  );
}
