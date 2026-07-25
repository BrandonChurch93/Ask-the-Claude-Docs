/**
 * The owned answer tokenizer (SEC-07). Model output is untrusted text: it is
 * NEVER handed to an HTML/markdown renderer and NEVER to dangerouslySetInnerHTML
 * (SEC-06). This parses the streamed answer into a small, closed token tree that
 * the renderer turns into React text nodes and citation elements - the only
 * lightweight formatting recognized is paragraphs, inline `code` spans, and the
 * `[n]` citation markers. Anything else stays literal text.
 *
 * Markers are extracted as references only; whether a `[n]` resolves to a real
 * source is decided by the renderer against the server-sent sources array (a
 * marker with no matching source renders as the literal text `[n]`, per the
 * eval's citations-valid check). Pure, so the parse is unit-testable, and it runs
 * on the growing text each render: a partial trailing `[` or `` ` `` is just text
 * until it completes.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "marker"; n: number };

export interface Paragraph {
  type: "paragraph";
  inlines: Inline[];
}

/** Split into paragraphs on blank lines, then parse each paragraph's inlines. */
export function tokenizeAnswer(text: string): Paragraph[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({ type: "paragraph", inlines: tokenizeInline(block) }));
}

// Matches an inline `code` span or a `[n]` citation marker (n = 1..999).
const INLINE_RE = /`([^`]+)`|\[(\d{1,3})\]/g;

export function tokenizeInline(text: string): Inline[] {
  const inlines: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index;
    if (start > last)
      inlines.push({ type: "text", value: text.slice(last, start) });
    if (m[1] !== undefined) {
      inlines.push({ type: "code", value: m[1] });
    } else {
      inlines.push({ type: "marker", n: Number(m[2]) });
    }
    last = start + m[0].length;
  }
  if (last < text.length)
    inlines.push({ type: "text", value: text.slice(last) });
  return inlines;
}
