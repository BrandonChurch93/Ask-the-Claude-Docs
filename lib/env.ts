import 'server-only';

import { z } from 'zod';

/**
 * Environment access (ENG-06, ENG-09, ENG-10, ENG-11).
 *
 * Every environment variable crosses this zod boundary exactly once, at module
 * load, so the app fails at boot — not at first use — on a missing or malformed
 * variable. `process.env` appears nowhere else in the codebase (ENG-09).
 *
 * The `server-only` import (ENG-10) makes importing this module from a client
 * component a build error, so these secrets can never reach the client bundle
 * (SEC-01). Variable set here is kept identical to `.env.example` (ENG-11).
 *
 * Validation errors report variable NAMES and reasons only — never values —
 * so a malformed secret can never leak into a log or stack trace (SEC-02).
 */
const envSchema = z.object({
  // Server-only secrets (SEC §1). Never prefixed NEXT_PUBLIC_.
  ANTHROPIC_API_KEY: z.string().startsWith('sk-', 'must be an Anthropic API key'),
  OPENAI_API_KEY: z.string().startsWith('sk-', 'must be an OpenAI API key'),
  DATABASE_URL: z
    .string()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'must be a postgres connection string'),
  UPSTASH_REDIS_REST_URL: z.url('must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'must not be empty'),

  // Server-only, non-secret. Portfolio link rendered in the footer (UX-13).
  PORTFOLIO_URL: z.url('must be a valid URL'),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Report names + messages only; never the offending values (SEC-02).
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. Fix these variables (see .env.example):\n${issues}`,
    );
  }

  return result.data;
}

export const env: Env = parseEnv();
