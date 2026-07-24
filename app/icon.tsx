import { ImageResponse } from "next/og";

/**
 * Generated favicon (ENG-15). No icon library or binary asset (DS-13): the mark
 * is typographic - a serif "A" in accent on paper, echoing the wordmark. Built
 * at request/build time by next/og (built into Next; no new dependency).
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f0", // --paper
        color: "#99512a", // --accent
        fontSize: 24,
        fontWeight: 600,
        fontFamily: "Georgia, serif",
      }}
    >
      A
    </div>,
    { ...size },
  );
}
