import type { Metadata } from "next";
import { serif, sans, mono } from "./fonts";
import "./globals.css";

// Placeholder metadata; the full Metadata API pass (title template, OG/Twitter,
// canonical, favicons) lands in P5.2 per ENG-15.
export const metadata: Metadata = {
  title: "Ask the Claude Docs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Font variables (--serif / --sans / --mono) are set on <html> so the whole
  // document can reference the three voices (DS §3.3, DS-08).
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
