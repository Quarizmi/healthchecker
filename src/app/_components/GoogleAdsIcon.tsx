/** Small colored badge used next to account names so a row reads as "this
 * is a Google Ads account" at a glance — a tasteful abstraction in Google's
 * brand palette, not a literal reproduction of Google's own icon. */
export function GoogleAdsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12,12 L12,1 A11,11 0 0,1 23,12 Z" fill="#4285F4" />
      <path d="M12,12 L23,12 A11,11 0 0,1 12,23 Z" fill="#34A853" />
      <path d="M12,12 L12,23 A11,11 0 0,1 1,12 Z" fill="#FBBC05" />
      <path d="M12,12 L1,12 A11,11 0 0,1 12,1 Z" fill="#EA4335" />
      <path d="M9,8 L9,16 L16,12 Z" fill="#fff" />
    </svg>
  );
}
