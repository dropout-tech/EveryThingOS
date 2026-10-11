import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { cleanName, NAME_MAX, NAME_MIN, SIGNATURE_MAX_CHARS } from "@/lib/portal";
import { acceptLink, portalMode, PortalError, requestIp, verifyToken } from "@/lib/portal-server";
import { writeBlocked } from "@/lib/sources/config";

type Body = { token?: unknown; name?: unknown; signature?: unknown; consent?: unknown };

const WINDOW_MS = 10 * 60_000;
const PER_ADDRESS = 20;
const tries = new Map<string, { start: number; count: number }>();

/** Per server process, so it only stops bursts; the glue keeps the real per-link limit. */
function underLimit(ip: string | null) {
  const key = ip ?? "unknown";
  const now = Date.now();
  const entry = tries.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    if (tries.size > 5_000) tries.clear();
    tries.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= PER_ADDRESS;
}

/** The customer accepts a quote from the public page. No login: the signed link is the permission. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("請從報價頁面按「接受報價」", 403);
  const ip = await requestIp();
  if (!underLimit(ip)) return refuse("試太多次了，請 10 分鐘後再試，或直接聯絡業務", 429);
  const body = await readJson<Body>(request);
  if (!body || typeof body.token !== "string") return refuse("連結不完整");
  const name = typeof body.name === "string" ? cleanName(body.name) : "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) return refuse(`請輸入 ${NAME_MIN} 到 ${NAME_MAX} 個字的全名`);
  if (body.consent !== true) return refuse("要先勾選同意，才能接受報價");
  const signature = typeof body.signature === "string" && body.signature ? body.signature : null;
  if (signature && (!signature.startsWith("data:image/png;base64,") || signature.length > SIGNATURE_MAX_CHARS)) return refuse("簽名圖不對，請清掉重簽，或只輸入全名");

  const mode = await portalMode();
  const token = await verifyToken(body.token, { live: mode.mode !== "demo", site: mode.mode === "live" ? mode.site : undefined });
  if (token.mode === "invalid") return refuse("這個連結無效，請跟業務要一個新的", 404);
  if (token.mode === "expired") return refuse("這個連結已經過期，請跟業務要一個新的", 410);
  if (token.doctype !== "Quotation") return refuse("只有報價單可以線上接受");

  if (token.mode === "demo") return reply({ ok: true, demo: true, accepted: { name, at: new Date().toISOString() } });
  if (mode.mode !== "live") return refuse("客戶入口暫時不能用，請直接聯絡業務", 503);
  const blocked = writeBlocked(mode.config);
  if (blocked) return refuse("這家公司目前不能線上接受報價，請直接聯絡業務。", 423);
  try {
    const out = await acceptLink(mode.config, token.linkId, { name, signature, consent: true, ip });
    return reply({ ok: true, already: out.already, accepted: out.accepted });
  } catch (error) {
    if (error instanceof PortalError) return refuse(error.message, error.status >= 500 ? 502 : error.status);
    return refuse("現在送不出去，請稍後再試，或直接聯絡業務", 502);
  }
}
