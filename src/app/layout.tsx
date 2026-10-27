import type { Metadata } from "next";
import { Mulish } from "next/font/google";
import { Header } from "./_components/Header";
import { Footer } from "./_components/Footer";
import "./globals.css";

const mulish = Mulish({
  variable: "--font-mulish",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marketing Health Checker",
  description: "Google Ads account health checks for Quarizmi AdTech, Inc.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={mulish.variable}>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
