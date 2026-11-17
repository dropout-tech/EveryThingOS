/** Hosts the quote-to-cash browser check is allowed to open. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Credentials that turn the shell from practice mode into a live ledger,
 * glue call, mailbox, or signed-in session. Assigned as empty strings in the
 * dev-server command so an existing `.env.local` cannot fill them back in.
 * Unset variables are not enough: Next only skips keys already present in
 * the environment, and an empty string counts as present.
 */
export const BLANK_DEMO_ENV = [
  "ERPNEXT_URL",
  "ERPNEXT_SITE",
  "ERPNEXT_API_KEY",
  "ERPNEXT_API_SECRET",
  "ERPNEXT_OAUTH_CLIENT_ID",
  "ERPNEXT_OAUTH_CLIENT_SECRET",
  "GLUE_URL",
  "GLUE_ADMIN_TOKEN",
  "GLUE_SITE",
  "SHELL_TOKEN",
  "SESSION_SECRET",
  "CHATWOOT_URL",
  "CHATWOOT_PLATFORM_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
] as const;

export function blankDemoEnvCommand(command: string): string {
  const assignments = BLANK_DEMO_ENV.map((key) => `${key}=`).join(" ");
  return `env ${assignments} ${command}`;
}

/** Resolve the base URL, or throw before Playwright launches a browser. */
export function assertLocalBaseUrl(raw: string | undefined, fallback: string): string {
  const value = raw?.trim() ? raw.trim() : fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`E2E_BASE_URL 不是可用的網址：${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`E2E_BASE_URL 只能用 http 或 https，拒絕 ${url.protocol}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`E2E_BASE_URL 只能是 127.0.0.1 或 localhost，拒絕開啟 ${url.hostname}`);
  }
  return url.origin;
}
