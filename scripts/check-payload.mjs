// Payload-budget assertion (PERF-03, performance.md §2). Reads Next's per-route
// `route-bundle-stats.json` from the build output and gzips each first-load chunk,
// then asserts two layers so a breach names which one moved:
//   - absolute first-load JS per route (framework floor + our app code)
//   - app-delta = first-load minus the shared-by-all-routes chunk set (our code)
// plus the fonts and CSS budgets. Any breach exits non-zero and fails the build
// step. Prints floor / delta / total per route regardless, so the numbers are the
// receipt. No paid APIs, no network; pure build-output inspection (ENG-17).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const KB = 1024;

// Budgets from performance.md §2 (amended 2026-07-25). Absolute = measured 150.1 KB
// framework floor + app + ~10 KB drift headroom; delta = the sharp guard on our code.
const ABSOLUTE_KB = { "/": 170, "/evals": 165 };
const DELTA_MAX_KB = 30; // per route, app-specific first-load JS
const FONTS_MAX_KB = 130;
const FONTS_MAX_FILES = 5;
const CSS_MAX_KB = 30;

const root = process.cwd();
const gz = (p) => gzipSync(readFileSync(p), { level: 9 }).length;
const kb = (b) => b / KB;
const fmt = (b) => `${kb(b).toFixed(1)} KB`;

const failures = [];
const fail = (msg) => failures.push(msg);

// --- First-load JS: absolute + app-delta, from route-bundle-stats.json ---
const statsPath = path.join(
  root,
  ".next",
  "diagnostics",
  "route-bundle-stats.json",
);
if (!existsSync(statsPath)) {
  console.error(
    `payload: ${path.relative(root, statsPath)} not found. Run \`next build\` first, ` +
      `or the Next build-output layout changed (this assertion must be re-pointed, not skipped).`,
  );
  process.exit(1);
}

const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const byRoute = new Map(stats.map((r) => [r.route, r.firstLoadChunkPaths]));

// Framework floor = chunks shared by EVERY route with first-load JS.
const routesWithJs = stats.filter((r) => r.firstLoadChunkPaths?.length);
let sharedSet = new Set(routesWithJs[0]?.firstLoadChunkPaths ?? []);
for (const r of routesWithJs) {
  sharedSet = new Set(r.firstLoadChunkPaths.filter((c) => sharedSet.has(c)));
}
const floorBytes = [...sharedSet].reduce(
  (n, c) => n + gz(path.join(root, c)),
  0,
);

console.log("First-load JS (gzipped):");
console.log(`  framework floor (shared by all routes): ${fmt(floorBytes)}\n`);

for (const route of Object.keys(ABSOLUTE_KB)) {
  const chunks = byRoute.get(route);
  if (!chunks) {
    fail(
      `JS: route ${route} absent from route-bundle-stats.json; cannot assert its budget.`,
    );
    continue;
  }
  const totalBytes = chunks.reduce((n, c) => n + gz(path.join(root, c)), 0);
  const deltaBytes = chunks
    .filter((c) => !sharedSet.has(c))
    .reduce((n, c) => n + gz(path.join(root, c)), 0);

  const absOk = kb(totalBytes) <= ABSOLUTE_KB[route];
  const deltaOk = kb(deltaBytes) <= DELTA_MAX_KB;
  console.log(
    `  ${route}\n` +
      `    floor ${fmt(floorBytes)} + delta ${fmt(deltaBytes)} = total ${fmt(totalBytes)}\n` +
      `    absolute ${absOk ? "OK" : "OVER"} (≤ ${ABSOLUTE_KB[route]} KB) · ` +
      `app-delta ${deltaOk ? "OK" : "OVER"} (≤ ${DELTA_MAX_KB} KB)`,
  );
  if (!absOk)
    fail(
      `JS absolute: ${route} first-load ${fmt(totalBytes)} > ${ABSOLUTE_KB[route]} KB ` +
        `(floor ${fmt(floorBytes)} + app-delta ${fmt(deltaBytes)}).`,
    );
  if (!deltaOk)
    fail(
      `JS app-delta: ${route} ${fmt(deltaBytes)} > ${DELTA_MAX_KB} KB; app code grew.`,
    );
}

// --- Fonts: total size + file count (woff2 in .next/static/media) ---
const mediaDir = path.join(root, ".next", "static", "media");
const fontFiles = existsSync(mediaDir)
  ? readdirSync(mediaDir).filter((f) => f.endsWith(".woff2"))
  : [];
const fontBytes = fontFiles.reduce(
  (n, f) => n + statSync(path.join(mediaDir, f)).size,
  0,
);
console.log(`\nFonts: ${fontFiles.length} files, ${fmt(fontBytes)} total`);
if (fontFiles.length > FONTS_MAX_FILES)
  fail(`Fonts: ${fontFiles.length} files > ${FONTS_MAX_FILES}.`);
if (kb(fontBytes) > FONTS_MAX_KB)
  fail(`Fonts: ${fmt(fontBytes)} > ${FONTS_MAX_KB} KB.`);

// --- CSS: gzipped total across all emitted stylesheets ---
const cssFiles = [];
const walk = (dir) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".css")) cssFiles.push(p);
  }
};
walk(path.join(root, ".next", "static"));
const cssBytes = cssFiles.reduce((n, p) => n + gz(p), 0);
console.log(`CSS: ${cssFiles.length} files, ${fmt(cssBytes)} gzipped`);
if (kb(cssBytes) > CSS_MAX_KB)
  fail(`CSS: ${fmt(cssBytes)} gzipped > ${CSS_MAX_KB} KB.`);

// --- Verdict ---
if (failures.length) {
  console.error(`\n✗ Payload budgets breached (PERF-03):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\n✓ Payload budgets OK (PERF-03).");
