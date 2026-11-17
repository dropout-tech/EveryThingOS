import { defineConfig, devices } from "@playwright/test";

const port = 3017;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;

/**
 * Quote-to-cash browser check.
 * Starts the shell with no ERPNext, glue, or mail credentials.
 * Do not point E2E_BASE_URL at a host that can write a real ledger.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `env -u ERPNEXT_URL -u ERPNEXT_SITE -u ERPNEXT_API_KEY -u ERPNEXT_API_SECRET -u ERPNEXT_OAUTH_CLIENT_ID -u ERPNEXT_OAUTH_CLIENT_SECRET -u GLUE_URL -u GLUE_ADMIN_TOKEN -u GLUE_SITE -u SHELL_TOKEN -u SESSION_SECRET -u CHATWOOT_URL -u CHATWOOT_PLATFORM_TOKEN npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
