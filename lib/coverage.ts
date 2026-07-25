/**
 * Refusal-state coverage chips (ui-ux-spec §7, RAG-21): a small, recognizable set
 * of topics the corpus actually covers, derived from the sync-fed coverage titles
 * (never hardcoded facts). We prefer a few well-known areas when present, then
 * fill from the front, so the chips are stable and legible without inventing
 * coverage. A chip submits `Tell me about {topic}`.
 */
const PREFERRED = [
  "hook",
  "mcp",
  "subagent",
  "skill",
  "permission",
  "slash command",
  "setting",
  "plugin",
  "memory",
];

export function pickCoverageChips(titles: string[], max = 6): string[] {
  const picked: string[] = [];
  for (const key of PREFERRED) {
    const match = titles.find(
      (t) => t.toLowerCase().includes(key) && !picked.includes(t),
    );
    if (match) picked.push(match);
    if (picked.length >= max) return picked;
  }
  for (const t of titles) {
    if (picked.length >= max) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.slice(0, max);
}
