import type { Metadata, Viewport } from "next";
import { serif, sans, mono } from "./fonts";
import { env } from "../lib/env";
import "./globals.css";
import styles from "./skip-link.module.css";

/**
 * Root layout: the three font voices on <html>, the full Metadata API pass
 * (ENG-15), and the skip link as the first focusable element (A11Y-04). The
 * conversation lives in <main> inside the page; header/footer landmarks are
 * rendered per-surface (A11Y-03).
 */

const SITE_NAME = "Ask the Claude Docs";
const DESCRIPTION =
  "A RAG assistant over the Claude Code documentation. Every answer cites its sources; when the docs don't cover a question, it says so, with receipts.";

// The site's own origin for canonical + OG/Twitter URLs; localhost until SITE_URL
// is set in Vercel (P8.1). Distinct from PORTFOLIO_URL (the footer link).
const siteUrl = env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f0", // --paper
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Font variables (--serif / --sans / --mono) are set on <html> so the whole
  // document can reference the three voices (DS §3.3, DS-08).
  return (
    <html
      lang="en"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <a href="#ask-input" className={styles.skipLink}>
          Skip to question input
        </a>
        {children}
      </body>
    </html>
  );
}
