import { JetBrains_Mono } from "next/font/google";

// Scoped to this route (not layout.tsx) — same pattern as the health
// dashboard's own fonts.ts. Only the numeric columns (spend, views) use it.
export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});
