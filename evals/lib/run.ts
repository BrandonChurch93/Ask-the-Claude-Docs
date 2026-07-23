import { readFileSync } from "node:fs";
import path from "node:path";

import { retrieve } from "../../lib/rag/retriever";
import {
  scoreQuestion,
  type QuestionResult,
  type EvalCategory,
} from "./metrics";

/**
 * Live retrieval eval runner (eval-harness §2). Imports the PRODUCTION retrieval
 * function (EVAL-04, no parallel implementation), scores each answerable +
 * boundary question against its gold labels. The EVAL-05 determinism contract is
 * byte-identical metrics (hit@5, MRR) and chunk rankings, which are proven
 * stable; similarity scores are diagnostic detail stored at 3 decimals and carry
 * ~1e-5 external-API float noise (OpenAI embeddings are not bit-deterministic),
 * too small to reorder results. Query embeddings are the only spend (fractions
 * of a cent; the harness is the sanctioned spender, ENG-17).
 */

const SCORE_PRECISION = 3;
const round = (n: number) =>
  Math.round(n * 10 ** SCORE_PRECISION) / 10 ** SCORE_PRECISION;

interface TestQuestion {
  id: string;
  category: string;
  question: string;
  gold_chunks: string[];
}

/** Read the test set and score every answerable + boundary question live. */
export async function runRetrievalEval(): Promise<QuestionResult[]> {
  const testsetPath = path.join(process.cwd(), "evals", "testset.json");
  const testset = JSON.parse(readFileSync(testsetPath, "utf8")) as {
    questions: TestQuestion[];
  };
  const questions = testset.questions.filter(
    (q) => q.category === "answerable" || q.category === "boundary",
  );

  const results: QuestionResult[] = [];
  for (const q of questions) {
    const outcome = await retrieve(q.question);
    const retrieved = outcome.results.map((r) => ({
      chunk_id: r.chunkId,
      page_path: r.pagePath,
      similarity: round(r.similarity),
    }));
    results.push(
      scoreQuestion(
        q.id,
        q.category as EvalCategory,
        q.question,
        q.gold_chunks,
        retrieved,
      ),
    );
  }
  return results;
}
