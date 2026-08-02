// Loads .env before anything else so DATABASE_URL is set for the DB-integration
// tests. Without it Prisma falls back to 127.0.0.1 and every one of them fails on
// connection — which read like "no local Postgres" and quietly kept a third of
// the suite from ever running. .env points at the DEV database by project
// convention, which is exactly where throwaway test data belongs.
import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/e2e/**"],
    // DB-integration tests share the dev database and clean up by prefix in
    // afterEach. Running files in parallel lets one file's cleanup delete
    // another's fixtures mid-test, so files run one at a time.
    fileParallelism: false,
  },
});
