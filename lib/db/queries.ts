import { sql } from "./client";
import { config } from "../config";

/**
 * SQL query module (ENG-03: all SQL lives in lib/db/ as tagged-template
 * queries). STUB shape for P2.1 to lock the retrieval SQL contract; the full
 * retriever (threshold partition against T, near-misses, `performance.now()`
 * timings) lands in P3.1.
 */

export interface RetrievedChunk {
  chunk_id: string;
  breadcrumb: string;
  heading_anchor: string;
  content: string;
  similarity: number;
}

/** pgvector text form: `[0.1,0.2,...]`. */
function toVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Top-k cosine retrieval (rag-design.md §6). Cosine distance operator `<=>`
 * only (RAG-11); similarity is `1 - distance`. Filters on the configured
 * embedding_model so a partial or mixed-model migration can never silently
 * compare cross-model vectors (RAG-10). `k` and the model come from config
 * (RAG-19).
 */
export async function retrieveTopK(
  embedding: number[],
): Promise<RetrievedChunk[]> {
  const vector = toVector(embedding);
  return sql<RetrievedChunk[]>`
    select
      chunk_id,
      breadcrumb,
      heading_anchor,
      content,
      1 - (embedding <=> ${vector}::vector) as similarity
    from chunks
    where embedding_model = ${config.embedding.model}
    order by embedding <=> ${vector}::vector
    limit ${config.retrieval.k}
  `;
}
