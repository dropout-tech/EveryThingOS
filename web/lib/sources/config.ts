import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { parseShop, type ShopProfile } from "../shop";

export type Stage = "trial" | "active" | "due_soon" | "past_due" | "read_only" | "suspended" | "cancelled";

export type Lifecycle = { stage: Stage; days: number | null; ends: string | null; writable: boolean; bots: boolean; message: string };

/** The company this request belongs to, when one deployment serves many companies. */
/** `ai`: the company is on the AI plan, so the right-hand agent and meeting summaries are on. */
export type Tenancy = { site: string; company: string; host: string; lifecycle: Lifecycle; profile: ShopProfile | null; ai: boolean };

/** Compatibility shape for local demo sources; external connections are disabled. */
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
  tenant?: Tenancy;
  /** Fleet mode, but this host is not registered to any company. */
  unknownHost?: string;
  /** Fleet mode, and the company directory could not be reached. */
  directoryError?: string;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function fleetMode() { return false; }

export async function requestHost() {
  const h = await headers();
  return (h.get("host") ?? "").split(":")[0];
}

export const liveConfig = cache(async (): Promise<LiveConfig> => ({ sessionSecret: env("SESSION_SECRET") }));

/** Login identity is maintained by the platform. */
export function loginRequired(_config: LiveConfig) {
  return false;
}

/** Why this company may not create or change anything right now, or null. */
export function writeBlocked(config: LiveConfig) {
  const life = config.tenant?.lifecycle;
  return life && !life.writable ? life.message : null;
}
