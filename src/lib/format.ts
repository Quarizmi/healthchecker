/** "PERFORMANCE_MAX" -> "Performance Max" — Google Ads channel-type enums
 * are SCREAMING_SNAKE_CASE, not something to show a user as-is. */
export function formatChannelType(channelType: string): string {
  return channelType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/** Every plain number shown anywhere in the UI should go through this —
 * thousands separators, and never more than `maxDecimals` decimal places
 * (trailing zeros dropped). Exists because the Google Ads API returns some
 * figures (e.g. conversions) as unrounded floats, which otherwise leak
 * straight into the UI as-is. */
export function formatNumber(value: number, maxDecimals = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** A percentage built on `formatNumber` — defaults to 0 decimals, matching
 * how every score/coverage metric in health-score.ts is shown. */
export function formatPercent(value: number, maxDecimals = 0): string {
  return `${formatNumber(value, maxDecimals)}%`;
}

/** A Google Ads cost-micros value as a currency amount, e.g.
 * 1234567890 -> "$1,234.57". `currencyCode` is the account's own currency
 * (e.g. "EUR", "GBP") — defaults to USD when unknown, since most accounts
 * are USD and that matches the previous hardcoded "$" behavior. Always
 * shows exactly 2 decimals, since this is money, not a measurement that
 * should drop trailing zeros. */
export function formatCurrencyMicros(micros: number, currencyCode?: string | null): string {
  const amount = micros / 1_000_000;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: currencyCode ?? "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
