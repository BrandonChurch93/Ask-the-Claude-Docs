#!/usr/bin/env node
/**
 * DS-14: the em dash character must not appear in authored product copy.
 * Model-generated answer text is exempt (it never lives in the repo); Brandon's
 * frozen specs under .claude/ and third-party files (fonts, licenses, lockfile)
 * are out of scope. Everything else we author is checked.
 *
 * The em dash is referenced by codepoint so this file stays clean itself.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const EM_DASH = String.fromCodePoint(0x2014);

const EXCLUDE = [
  /^\.claude\//,
  /^CLAUDE\.md$/,
  /\.woff2$/,
  /(^|\/)LICENSE(\.|$)/i,
  /(^|\/)package-lock\.json$/,
];

// --cached --others --exclude-standard = tracked plus new (non-ignored) files,
// so a file is checked before it is committed, not only after.
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
    continue; // unreadable/binary
  }
  if (!content.includes(EM_DASH)) continue;
  content.split("\n").forEach((line, i) => {
    if (line.includes(EM_DASH)) offenders.push(`${file}:${i + 1}`);
  });
}

if (offenders.length > 0) {
  console.error(
    `DS-14 FAIL: em dash found in authored copy (use interpunct, colon, or restructure):`,
  );
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(`DS-14 OK: no em dash in ${files.length} authored files.`);
