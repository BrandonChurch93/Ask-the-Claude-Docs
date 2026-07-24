import { ImageResponse } from "next/og";

/**
 * Social card (ENG-15): the OG image, reused as the Twitter summary_large_image.
 * Built with next/og (no new dependency, no binary asset). It states the thesis
 * in the brand palette; a serif face isn't loaded into the generator (that needs
 * font bytes at the edge), so the card uses a system serif - acceptable for a
 * 1200x630 social preview, refinable later.
 */
export const alt =
  "Ask the Claude Docs - a RAG assistant over the Claude Code documentation, with cited answers and honest refusals.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px 96px",
        background: "#faf7f0", // --paper
        color: "#211f1a", // --ink
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          fontSize: 30,
          fontFamily: "monospace",
          color: "#726c59", // --ink-muted
          marginBottom: 28,
        }}
      >
        Ask the Claude Docs
      </div>
      <div style={{ fontSize: 64, lineHeight: 1.3, maxWidth: 940 }}>
        Ask the Claude Code docs a question. Every answer is cited. When the
        docs don&apos;t cover it, it says so, with receipts.
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontFamily: "monospace",
          color: "#99512a", // --accent
          marginTop: 40,
        }}
      >
        cited answers · honest refusals · a CI eval harness
      </div>
    </div>,
    { ...size },
  );
}
