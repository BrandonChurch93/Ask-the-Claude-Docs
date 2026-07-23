import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit + integration tests (ENG §8). Node environment by default; tests that
// need the browser DOM opt in per-file. Tests never hit the network or paid
// APIs (ENG-17); model/db clients are mocked or injected.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
    ],
    // Dummy env so lib/env.ts parses at import; server-only guard neutralized below.
    setupFiles: ["./test/setup-env.ts"],
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/server-only.stub.ts", import.meta.url),
      ),
    },
  },
});
