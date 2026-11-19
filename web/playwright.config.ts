import { defineConfig, devices } from "@playwright/test";
import { assertLocalBaseUrl, blankDemoEnvCommand } from "./e2e/guard";

const port = 3017;
const baseURL = assertLocalBaseUrl(process.env.E2E_BASE_URL, `http://127.0.0.1:${port}`);

/**
 * Quote-to-cash browser check.
 * Starts the shell with ERPNext, glue, mail, and session variables set to
 * empty strings, so `.env.local` cannot refill them. A non-local
 * E2E_BASE_URL throws above, before a browser is launched.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
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
  webServer: process.env.E2E_BASE_URL?.trim()
    ? undefined
    : {
        command: blankDemoEnvCommand(
          `env SESSION_SECRET=local-e2e-only-session-secret OWNER_BOOTSTRAP_EMAILS=e2e@example.invalid:local,e2e@example.invalid:local-e2e-b LOCAL_E2E_LOGIN=1 SHELL_URL=http://127.0.0.1:3017 sh -c ${JSON.stringify(`npx wrangler d1 migrations apply dropout-ledger-test --local && npx wrangler d1 migrations apply everythingos-accounts --local && npm run dev -- --hostname 127.0.0.1 --port ${port}`)}`,
        ),
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
