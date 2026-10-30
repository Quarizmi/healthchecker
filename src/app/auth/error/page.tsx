import { ErrorFallback } from "../../_components/ErrorFallback";

/** NextAuth's own codes (see auth.ts's `pages.error`) — AccessDenied is the
 * one that actually matters right now: it's what a non-tester Google
 * account hits while the app is still pending Google's OAuth verification. */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "This Google account isn't approved to sign in yet. While Google reviews our app, we have to add testers manually — message us below and we'll get you access.",
  Configuration: "There's a configuration issue with sign-in right now.",
  Verification: "That sign-in link is invalid or has expired.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error && ERROR_MESSAGES[error]) ?? "Something went wrong while signing you in.";

  return (
    <ErrorFallback
      message={message}
      detail={error ? `NextAuth error code: ${error}` : "(no error code provided)"}
      backHref="/"
    />
  );
}
