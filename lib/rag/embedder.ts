import "server-only";

import OpenAI from "openai";
import { env } from "../env";
import { config } from "../config";

/**
 * The single shared embedding function (RAG-12). Ingestion (chunk embedding)
 * and the query path (P3.1) both call `embed`; `embedQuery` is a thin wrapper
 * over it, so there is exactly one embedding implementation. Model + parameters
 * come from config: text-embedding-3-small, 1536 dims, default params, no
 * dimension truncation (RAG §5). Batches per config (the API accepts arrays).
 *
 * The client is injectable so tests exercise batching and the shared-function
 * guarantee without touching the network or paid API (ENG-17).
 */
export interface EmbeddingClient {
  embeddings: {
    create(args: {
      model: string;
      input: string[];
    }): Promise<{ data: { embedding: number[] }[] }>;
  };
}

let defaultClient: OpenAI | null = null;
function getDefaultClient(): EmbeddingClient {
  defaultClient ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return defaultClient;
}

export async function embed(
  texts: string[],
  client: EmbeddingClient = getDefaultClient(),
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += config.embedding.batchSize) {
    const batch = texts.slice(i, i + config.embedding.batchSize);
    const res = await client.embeddings.create({
      model: config.embedding.model,
      input: batch,
    });
    for (const item of res.data) vectors.push(item.embedding);
  }
  return vectors;
}

/** Query embedding uses the SAME function as chunk embedding (RAG-12). */
export async function embedQuery(
  text: string,
  client?: EmbeddingClient,
): Promise<number[]> {
  const [vector] = await embed([text], client);
  if (!vector) throw new Error("embedding returned no vector");
  return vector;
}
