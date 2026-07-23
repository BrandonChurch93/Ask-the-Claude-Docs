#!/usr/bin/env node
/**
 * SEC-01 hygiene: fail if a committed file contains a key-shaped string.
 * Catches accidentally committed secrets (API keys, DB credentials). The
 * sanctioned placeholder file .env.example is excluded; real secrets live only
 * in untracked .env.local / platform env config.
 *
 * Never prints the matched value (SEC-02); only the file and which pattern hit.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "anthropic-key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "openai-key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "postgres-credentials", re: /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/ },
];

const EXCLUDE = [
  /^\.env\.example$/, // sanctioned placeholders
  /\.woff2$/,
  /(^|\/)package-lock\.json$/,
];

// --cached --others --exclude-standard = tracked plus new (non-ignored) files,
// so a secret is caught before it is committed, not only after.
const files = execSync("git ls-files --cached --others --exclude-standard", {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((re) => re.test(f)));

const offenders = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(content)) offenders.push(`${file} (${name})`);
  }
}

if (offenders.length > 0) {
  console.error(`SEC-01 FAIL: key-shaped string(s) found in tracked files:`);
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(
  `SEC-01 OK: no key-shaped strings in ${files.length} tracked files.`,
);
