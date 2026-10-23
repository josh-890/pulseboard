import { defineConfig, devices } from "@playwright/test";

// Headless and full speed by default — no windows taking the focus while the
// suite runs (2026-10-23). To watch a run: PW_HEADED=1 npx playwright test …
// opens the browser and slows every action by 400 ms.
const headed = process.env.PW_HEADED === "1";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: !headed,
    launchOptions: { slowMo: headed ? 400 : 0 },
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
