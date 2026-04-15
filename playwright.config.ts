import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3004",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "Mobile Safari",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
  webServer: {
    command: "PORT=3004 npm run dev",
    port: 3004,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
