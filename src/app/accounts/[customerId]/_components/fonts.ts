import { JetBrains_Mono } from "next/font/google";

// Scoped to this route's components (not layout.tsx) so routes that never
// render the dashboard don't load a font family they don't use. Headings
// and body text use the sitewide --font-mulish (set in layout.tsx) instead
// of a route-local font — only the numeric figures need their own monospace.
export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});
