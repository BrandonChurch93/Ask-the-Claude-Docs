import type { Metadata, Viewport } from "next";
import { serif, sans, mono } from "./fonts";
import { env } from "../lib/env";
import "./globals.css";

/**
 * Root layout: the three font voices on <html> and the full Metadata API pass
 * (ENG-15). The skip link (A11Y-04) is rendered per-page as its first focusable
 * element, so its target is valid on every surface (the landing skips to the
 * question input; /evals skips to its main content); header/footer landmarks are
 * per-surface (A11Y-03).
 */

const SITE_NAME = "Ask the Claude Docs";
const DESCRIPTION =
  "A RAG assistant over the Claude Code documentation. Every answer cites its sources; when the docs don't cover a question, it says so, with receipts.";

// The site's own origin for canonical + OG/Twitter URLs. SITE_URL overrides;
// otherwise Vercel production builds use the production origin and everything
// else (local dev, CI, previews) stays on localhost. Distinct from PORTFOLIO_URL
// (the footer link).
const PRODUCTION_URL = "https://ask-the-claude-docs.vercel.app";
const siteUrl =
  env.SITE_URL ??
  (env.VERCEL_ENV === "production" ? PRODUCTION_URL : "http://localhost:3000");

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
      <body>{children}</body>
    </html>
  );
}
