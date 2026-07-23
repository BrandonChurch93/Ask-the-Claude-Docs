import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks are hoisted above the route import so its top-level imports resolve to
// them. Neither the retriever nor the generator (both server-only) is loaded;
// tests make zero network or paid-API calls (ENG-17).
const {
  retrieveMock,
  streamAnswerMock,
  isSpendCapReachedMock,
  recordSpendMock,
} = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  streamAnswerMock: vi.fn(),
  isSpendCapReachedMock: vi.fn(),
  recordSpendMock: vi.fn(),
}));

vi.mock("../../../lib/rag/retriever", () => ({ retrieve: retrieveMock }));
vi.mock("../../../lib/rag/generator", () => ({
  streamAnswer: streamAnswerMock,
  selectedModel: () => "claude-haiku-4-5",
}));
vi.mock("../../../lib/spend", () => ({
  isSpendCapReached: isSpendCapReachedMock,
  recordSpend: recordSpendMock,
}));

import { POST } from "./route";
import { SSEDecoder } from "../../../lib/stream/parse";
import type {
  ServerEvent,
  SourcesEvent,
  DoneEvent,
} from "../../../lib/stream/types";

function makeReq(body: unknown, raw?: string): Request {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

async function readEvents(res: Response): Promise<ServerEvent[]> {
  const text = await res.text();
  return new SSEDecoder().decode(text);
}

const scored = (id: string, similarity: number) => ({
  chunkId: id,
  breadcrumb: `Claude Code › ${id}`,
  // headingAnchor is the full deep link (chunker stores `pageUrl#slug`).
  headingAnchor: `https://code.claude.com/docs/${id}#sec`,
  content: `body of ${id}. `.repeat(60), // > snippet length, so truncation is exercised
  similarity,
});

// A fake Anthropic MessageStream: async-iterable of stream events + finalMessage().
function fakeGen(deltas: string[], usage: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of deltas) {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text },
        };
      }
    },
    finalMessage: async () => ({ usage }),
  };
}

beforeEach(() => {
  retrieveMock.mockReset();
  streamAnswerMock.mockReset();
  isSpendCapReachedMock.mockReset();
  recordSpendMock.mockReset();
  isSpendCapReachedMock.mockResolvedValue(false); // under cap by default
  recordSpendMock.mockResolvedValue(undefined);
});

describe("POST /api/ask (P3.3)", () => {
  it("emits sources before the first text delta, then done (RAG-16); snippet-only sources (PERF-12)", async () => {
    retrieveMock.mockResolvedValue({
      contextSet: [scored("a", 0.7), scored("b", 0.65)],
      nearMisses: [],
      refused: false,
      calibrated: false,
      threshold: null,
      results: [],
      timings: { embedMs: 10, queryMs: 20, retrievalMs: 35 },
    });
    streamAnswerMock.mockReturnValue(
      fakeGen(["Hello ", "world"], {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
    );

    const res = await POST(makeReq({ question: "how do hooks work" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-store"); // ENG-14

    const events = await readEvents(res);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("sources");
    expect(types[types.length - 1]).toBe("done");
    // RAG-16: the sources event precedes the first text delta.
    expect(types.indexOf("sources")).toBeLessThan(types.indexOf("text"));

    const texts = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { delta: string }).delta);
    expect(texts).toEqual(["Hello ", "world"]);

    const sources = events[0] as SourcesEvent;
    expect(sources.sources.map((s) => s.chunkId)).toEqual(["a", "b"]);
    const first = sources.sources[0]!;
    expect(first.url).toBe("https://code.claude.com/docs/a#sec");
    // PERF-12: snippet, not the full chunk body.
    expect(first.snippet.length).toBeLessThanOrEqual(300);
    expect(first.snippet.length).toBeLessThan(scored("a", 0.7).content.length);

    const done = events[events.length - 1] as DoneEvent;
    // RAG-17: cost from the usage object: 100 in @ $1/M + 20 out @ $5/M.
    expect(done.receipt.costUsd).toBeCloseTo(
      (100 * 1 + 20 * 5) / 1_000_000,
      12,
    );
    expect(done.receipt.usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(done.receipt.refused).toBe(false);
  });

  it("refusal makes zero generation calls and flushes sources then done (RAG-13, PERF-07)", async () => {
    retrieveMock.mockResolvedValue({
      contextSet: [],
      nearMisses: [scored("x", 0.12)],
      refused: true,
      calibrated: true,
      threshold: 0.35,
      results: [],
      timings: { embedMs: 10, queryMs: 20, retrievalMs: 35 },
    });

    const res = await POST(makeReq({ question: "how do I bake sourdough" }));
    const events = await readEvents(res);

    expect(events.map((e) => e.type)).toEqual(["sources", "done"]);
    expect(streamAnswerMock).not.toHaveBeenCalled(); // zero generation

    const done = events[1] as DoneEvent;
    expect(done.receipt.refused).toBe(true);
    expect(done.receipt.usage).toBeNull();
    expect(done.receipt.costUsd).toBe(0);
    const sources = events[0] as SourcesEvent;
    expect(sources.sources).toEqual([]);
    expect(sources.nearMisses.map((s) => s.chunkId)).toEqual(["x"]);
  });

  it("rejects invalid requests with a typed 400 and never retrieves (ENG-07, SEC-04)", async () => {
    const cases: Array<{ name: string; req: Request }> = [
      { name: "missing question", req: makeReq({}) },
      { name: "empty after trim", req: makeReq({ question: "   " }) },
      { name: "over 500 chars", req: makeReq({ question: "a".repeat(501) }) },
      {
        name: "extra field (.strict)",
        req: makeReq({ question: "hi", model: "claude-opus-4-8" }),
      },
      { name: "non-JSON body", req: makeReq(null, "not json{") },
    ];

    for (const c of cases) {
      const res = await POST(c.req);
      expect(res.status, c.name).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = (await res.json()) as {
        error: { type: string; message: string };
      };
      expect(body.error.type, c.name).toBe("invalid_request");
      expect(typeof body.error.message).toBe("string");
    }
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(streamAnswerMock).not.toHaveBeenCalled();
  });

  it("strips control characters before validation: control-only is empty -> 400 (SEC-04)", async () => {
    const res = await POST(makeReq({ question: "\u0007\u0001\u001f" }));
    expect(res.status).toBe(400);
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("passes the cleaned (control-stripped) question to retrieval (SEC-04)", async () => {
    retrieveMock.mockResolvedValue({
      contextSet: [scored("a", 0.7)],
      nearMisses: [],
      refused: false,
      calibrated: false,
      threshold: null,
      results: [],
      timings: { embedMs: 1, queryMs: 1, retrievalMs: 2 },
    });
    streamAnswerMock.mockReturnValue(
      fakeGen(["ok"], { input_tokens: 1, output_tokens: 1 }),
    );

    const res = await POST(makeReq({ question: "hel\u0000lo\tthere" }));
    await res.text(); // drain the stream
    expect(retrieveMock).toHaveBeenCalledWith("hellothere");
  });

  it("rejects with a typed 429 and no generation when the spend cap is reached (SEC-10)", async () => {
    isSpendCapReachedMock.mockResolvedValue(true);
    const res = await POST(makeReq({ question: "how do hooks work" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("spend_cap");
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(streamAnswerMock).not.toHaveBeenCalled();
  });

  it("fails CLOSED (429, no generation) when the spend counter can't be read (SEC-10)", async () => {
    isSpendCapReachedMock.mockRejectedValue(new Error("upstash down"));
    const res = await POST(makeReq({ question: "how do hooks work" }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe("spend_cap");
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(streamAnswerMock).not.toHaveBeenCalled();
  });

  it("accumulates the answered request's real cost after generation (SEC-10)", async () => {
    retrieveMock.mockResolvedValue({
      contextSet: [scored("a", 0.7)],
      nearMisses: [],
      refused: false,
      calibrated: false,
      threshold: null,
      results: [],
      timings: { embedMs: 1, queryMs: 1, retrievalMs: 2 },
    });
    streamAnswerMock.mockReturnValue(
      fakeGen(["ok"], { input_tokens: 100, output_tokens: 20 }),
    );
    const res = await POST(makeReq({ question: "how do hooks work" }));
    await res.text(); // drain to completion so recordSpend runs
    expect(recordSpendMock).toHaveBeenCalledTimes(1);
    // (100 in @ $1/M + 20 out @ $5/M) = $0.0002
    expect(recordSpendMock.mock.calls[0]![0]).toBeCloseTo(0.0002, 12);
  });

  it("does not accumulate spend on a refusal (RAG-13; embedding-only cost deferred to P4.4)", async () => {
    retrieveMock.mockResolvedValue({
      contextSet: [],
      nearMisses: [scored("x", 0.1)],
      refused: true,
      calibrated: true,
      threshold: 0.35,
      results: [],
      timings: { embedMs: 1, queryMs: 1, retrievalMs: 2 },
    });
    const res = await POST(makeReq({ question: "off corpus" }));
    await res.text();
    expect(recordSpendMock).not.toHaveBeenCalled();
  });
});
