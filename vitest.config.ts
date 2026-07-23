import { defineConfig } from "vitest/config";

// Unit + integration tests (ENG §8). Node environment by default; tests that
// need the browser DOM opt in per-file. Tests never hit the network or paid
// APIs (ENG-17) — model/db clients are mocked (test/mocks/, added when needed).
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
    ],
  },
});
