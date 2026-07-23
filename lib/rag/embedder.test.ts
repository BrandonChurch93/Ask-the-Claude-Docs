import { describe, it, expect } from "vitest";
import { embed, embedQuery, type EmbeddingClient } from "./embedder";
import { config } from "../config";

function mockClient() {
  const calls: string[][] = [];
  const client: EmbeddingClient = {
    embeddings: {
      create: async ({ input }: { model: string; input: string[] }) => {
        calls.push(input);
        return { data: input.map((_, i) => ({ embedding: [i] })) };
      },
    },
  };
  return { client, calls };
}

describe("embed (RAG-12, RAG §5)", () => {
  it("batches inputs per config", async () => {
    const { client, calls } = mockClient();
    const texts = Array.from(
      { length: config.embedding.batchSize * 2 + 5 },
      (_, i) => `t${i}`,
    );
    const vectors = await embed(texts, client);
    expect(vectors).toHaveLength(texts.length);
    expect(calls).toHaveLength(3); // ceil((2*batch + 5) / batch)
    expect(calls[0]).toHaveLength(config.embedding.batchSize);
  });

  it("embedQuery routes through the same embed function (one implementation)", async () => {
    const { client, calls } = mockClient();
    const vector = await embedQuery("hello", client);
    expect(calls).toEqual([["hello"]]);
    expect(vector).toEqual([0]);
  });
});
