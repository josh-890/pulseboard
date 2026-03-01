/**
 * Playwright global setup — runs before the test suite.
 * 1. Cleans up test-generated entities from previous runs
 * 2. Re-seeds the database to ensure all seed-* entities exist
 */
import { execSync } from "child_process";

export default async function globalSetup() {
  console.log("\n=== Playwright Global Setup ===\n");

  // 1. Clean up leftover test data
  console.log("Cleaning up test data...");
  execSync("npx tsx e2e/cleanup-test-data.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  // 2. Re-seed the database
  console.log("\nRe-seeding database...");
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  console.log("\n=== Global Setup Complete ===\n");
}
