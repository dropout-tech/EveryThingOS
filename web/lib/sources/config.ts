import "server-only";

/**
 * Which systems this deployment is connected to. Each one switches from demo to
 * live on its own, so a company can go live with ERPNext first and add Chatwoot
 * or the glue later. Values come from Worker secrets / vars (see web/README.md).
 */
export type LiveConfig = {
  erpnext?: {
    url: string;
    site?: string;
    apiKey?: string;
    apiSecret?: string;
    oauth?: { clientId: string; clientSecret?: string };
  };
  glue?: { url: string; adminToken: string; site: string };
  chatwoot?: { url: string; platformToken?: string; accountId?: string };
  sessionSecret?: string;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function liveConfig(): LiveConfig {
  const erpUrl = env("ERPNEXT_URL");
  const glueUrl = env("GLUE_URL");
  const chatUrl = env("CHATWOOT_URL");
  const clientId = env("ERPNEXT_OAUTH_CLIENT_ID");
  return {
    erpnext: erpUrl
      ? {
          url: trimSlash(erpUrl),
          site: env("ERPNEXT_SITE"),
          apiKey: env("ERPNEXT_API_KEY"),
          apiSecret: env("ERPNEXT_API_SECRET"),
          oauth: clientId ? { clientId, clientSecret: env("ERPNEXT_OAUTH_CLIENT_SECRET") } : undefined,
        }
      : undefined,
    glue:
      glueUrl && env("GLUE_ADMIN_TOKEN")
        ? { url: trimSlash(glueUrl), adminToken: env("GLUE_ADMIN_TOKEN")!, site: env("GLUE_SITE") ?? env("ERPNEXT_SITE") ?? "" }
        : undefined,
    chatwoot: chatUrl
      ? { url: trimSlash(chatUrl), platformToken: env("CHATWOOT_PLATFORM_TOKEN"), accountId: env("CHATWOOT_ACCOUNT_ID") }
      : undefined,
    sessionSecret: env("SESSION_SECRET"),
  };
}

/** Login is required as soon as ERPNext OAuth is configured. */
export function loginRequired(config = liveConfig()) {
  return Boolean(config.erpnext?.oauth && config.sessionSecret);
}
