/**
 * Self-hosted typefaces via next/font/local (DS §3.1/§3.3, DS-08, PERF-04/05).
 *
 * Tier 3 resolution (Brandon-delegated): DS §3.3 specifies next/font/*google*,
 * but next/font/google@16 downloads EVERY Google subset (latin, latin-ext,
 * cyrillic, greek, vietnamese) and self-hosts all of them. `subsets` only
 * controls preload. That yields 23 files / 708KB on disk, failing PERF-05
 * (≤5 files, latin-only) and the 130KB budget (latin preload alone = 186KB,
 * Source Serif 4's opsz axis being the whale). No config fixes it; the loader
 * URL carries no subset param.
 *
 * The fix that satisfies every frozen rule at once: self-host the SAME families
 * via next/font/local from latin-subset, axis-instanced .woff2 files (built
 * once, committed in ./fonts, see fonts/LICENSE.md). Instancing: wght limited
 * to the design's used range 400..600; Source Serif 4 opsz PINNED to 13
 * (matched to the 17.5px answer-body reading size). The one unavoidable
 * concession, since keeping the opsz axis costs 77KB/face and busts the budget.
 * Result: 5 files, ~107KB, latin-only, zero external origins. Exposed as the
 * CSS variables --serif / --sans / --mono; §3.1 fallback stacks in globals.css.
 */
import localFont from "next/font/local";

// Answer voice. Variable wght 400..600, normal + italic (the Thesis <em> accent).
export const serif = localFont({
  src: [
    {
      path: "./fonts/source-serif-4-latin.woff2",
      weight: "400 600",
      style: "normal",
    },
    {
      path: "./fonts/source-serif-4-italic-latin.woff2",
      weight: "400 600",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--serif",
  adjustFontFallback: "Times New Roman",
});

// Interface voice. Variable wght 400..600.
export const sans = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  variable: "--sans",
  adjustFontFallback: "Arial",
});

// Instrument voice. Static 400 + 500 (fixed-width; no synthetic metric fallback).
export const mono = localFont({
  src: [
    {
      path: "./fonts/ibm-plex-mono-400-latin.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/ibm-plex-mono-500-latin.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--mono",
  adjustFontFallback: false,
});
