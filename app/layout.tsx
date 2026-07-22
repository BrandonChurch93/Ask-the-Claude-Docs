import type { Metadata } from "next";
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
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
