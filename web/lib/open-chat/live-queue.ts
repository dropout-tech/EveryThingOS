import { sortThreads } from "./threads";
import type { OpenChannel } from "./types";

/** One open Chatwoot conversation where the guest spoke last. Message text is left out on purpose. */
export type WaitingChat = { id: number; name: string; channel: OpenChannel | null; waitedMinutes: number };

const CHANNEL: Record<string, OpenChannel> = {
  "Channel::Line": "line",
  "Channel::Instagram": "ig",
  "Channel::FacebookPage": "fb",
  "Channel::WebWidget": "web",
};

const INCOMING = 0;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function seconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Unix seconds since the guest started waiting, or null when the team spoke last. */
function waitingSince(c: Record<string, unknown>): number | null {
  const since = seconds(c.waiting_since);
  if (since) return since;
  const messages = Array.isArray(c.messages) ? c.messages : [];
  const last = record(messages[messages.length - 1]);
  if (!last) return null;
  const incoming = last.message_type === INCOMING || last.message_type === "incoming";
  return incoming ? seconds(last.created_at) : null;
}

/**
 * Turns Chatwoot's open-conversation list (`data.payload` of
 * GET /api/v1/accounts/:id/conversations) into who is waiting, longest first.
 * Anything that does not look like a conversation is skipped rather than guessed.
 */
export function waitingChats(payload: unknown, nowMs: number): WaitingChat[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<number>();
  const out: WaitingChat[] = [];
  for (const item of payload) {
    const c = record(item);
    if (!c || typeof c.id !== "number" || seen.has(c.id) || (c.status !== undefined && c.status !== "open")) continue;
    const since = waitingSince(c);
    if (!since) continue;
    seen.add(c.id);
    const meta = record(c.meta);
    const sender = record(meta?.sender);
    const name = typeof sender?.name === "string" && sender.name.trim() ? sender.name.trim().slice(0, 60) : "沒留名字的客人";
    const channel = typeof meta?.channel === "string" ? (CHANNEL[meta.channel] ?? null) : null;
    out.push({ id: c.id, name, channel, waitedMinutes: Math.max(0, Math.floor((nowMs / 1000 - since) / 60)) });
  }
  return sortThreads(out);
}

/** "95 分鐘" under two hours, then hours, then days. */
export function waitedText(minutes: number): string {
  if (minutes < 120) return `${minutes} 分鐘`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} 小時`;
  return `${Math.floor(minutes / (24 * 60))} 天`;
}
