/** Tasteful abstraction of the WhatsApp mark, in its own brand green — not a
 * literal reproduction of WhatsApp's logo. */
export function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" fill="#25D366" />
      <path
        d="M16.7 13.3c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.2-.6.9-.8 1-.1.2-.3.2-.5.1-.7-.3-1.4-.8-2-1.4-.5-.5-1-1.2-1.4-1.9-.1-.2-.1-.4.1-.5.2-.2.5-.5.6-.7.1-.2.1-.4 0-.6-.1-.2-.6-1.4-.8-1.9-.1-.3-.3-.3-.5-.3h-.5c-.2 0-.5.1-.6.3-.4.5-.6 1.1-.6 1.8.1 1.6.8 3.1 2 4.3 1.3 1.3 2.9 2.1 4.6 2.3.6.1 1.2 0 1.7-.3.4-.3.7-.7.8-1.2 0-.1 0-.3 0-.4-.1-.1-.2-.2-.4-.2Z"
        fill="#fff"
      />
    </svg>
  );
}
