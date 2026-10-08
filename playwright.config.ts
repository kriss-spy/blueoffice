import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const evidence = process.env.BLUEOFFICE_VERIFICATION_OUTPUT;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 2,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: resolve(evidence ?? ".", "playwright-report"),
      },
    ],
    [
      "json",
      { outputFile: resolve(evidence ?? "test-results", "playwright.json") },
    ],
  ],
  outputDir: resolve(evidence ?? ".", "test-results"),
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // The fixture office has no GPU requirement. Use Chromium software rendering.
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [{ name: "chromium" }],
});
