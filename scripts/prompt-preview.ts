import { retrieve } from "../lib/rag/retriever";
import { buildGenerationRequest } from "../lib/rag/generator";
import { sql } from "../lib/db/client";

/**
 * Prompt-structure preview (P3.2 review). Retrieves for a question (one
 * embedding call), then renders the exact generation request and prints it.
 * No generation call is made. Source bodies are truncated for readability;
 * the real request uses full content.
 *
 * Run: `npm run prompt:preview -- "<question>"`
 */
async function main() {
  const question =
    process.argv.slice(2).join(" ").trim() ||
    "how do I give Claude Code memory across sessions";

  const { contextSet } = await retrieve(question);
  const req = buildGenerationRequest(question, contextSet);

  console.log(
    `model: ${req.model}   max_tokens: ${req.max_tokens}   sources: ${contextSet.length}\n`,
  );

  // Print the system prompt with each source body truncated for readability.
  const truncatedSystem = req.system.replace(
    /(\[\d+\][^\n]*\n)([\s\S]*?)(?=\n\n\[\d+\]|\s*$)/g,
    (_m, header: string, body: string) =>
      `${header}${body.length > 180 ? body.slice(0, 180) + ` ...[${body.length} chars]` : body}`,
  );
  console.log("=== SYSTEM ===");
  console.log(truncatedSystem);
  console.log("\n=== MESSAGES (user turn) ===");
  console.log(JSON.stringify(req.messages, null, 2));

  await sql.end();
}

main().catch(async (err) => {
  console.error("preview failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
