// Dummy environment for tests. Non-secret placeholder values that satisfy the
// zod schema in lib/env.ts while staying clear of the secret-shape check
// (short keys, no db credentials). Tests always inject mock clients, so the
// real Anthropic/OpenAI/DB clients built from these are never used.
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";
process.env.OPENAI_API_KEY ??= "sk-test";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://test.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "test-token";
process.env.PORTFOLIO_URL ??= "https://example.com";
