/** "PERFORMANCE_MAX" -> "Performance Max" — Google Ads channel-type enums
 * are SCREAMING_SNAKE_CASE, not something to show a user as-is. */
export function formatChannelType(channelType: string): string {
  return channelType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
