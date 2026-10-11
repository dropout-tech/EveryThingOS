import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { BULK_LIMIT, isSmall, itemKey, MAX_REASON } from "@/lib/approvals";
import { liveApprovals } from "@/lib/sources/approvals";
import { liveConfig, writeBlocked } from "@/lib/sources/config";
import { erpPost, SourceError } from "@/lib/sources/erpnext";

type Wanted = { doctype: string; name: string; action: string };
type Outcome = { doctype: string; name: string; ok: boolean; message: string };

const STATUS: Record<SourceError["kind"], number> = { login: 401, denied: 403, unreachable: 502, upstream: 502 };

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

function parse(raw: unknown): Wanted[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > BULK_LIMIT) return null;
  const out: Wanted[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const doctype = text(e?.doctype, 80);
    const name = text(e?.name, 140);
    const action = text(e?.action, 140);
    if (!doctype || !name || !action) return null;
    out.push({ doctype, name, action });
  }
  return new Set(out.map(itemKey)).size === out.length ? out : null;
}

/**
 * Approves or returns documents waiting for the logged-in person. Only what is
 * in their own inbox can be decided here (so never their own requests), with an
 * action ERPNext offered for it; ERPNext checks everything again.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const body = await readJson<{ items?: unknown; reason?: unknown }>(request);
  const wanted = parse(body?.items);
  if (!wanted) return refuse(`要選 1 到 ${BULK_LIMIT} 張單`);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length > MAX_REASON) return refuse(`原因最多 ${MAX_REASON} 字`);

  const config = await liveConfig();
  if (!config.erpnext) return refuse("ERPNext 還沒接上，現在是練習模式", 409);
  const blocked = writeBlocked(config);
  if (blocked) return refuse(blocked, 423);

  let inbox;
  try {
    inbox = new Map((await liveApprovals()).items.map((i) => [itemKey(i), i]));
  } catch (error) {
    if (error instanceof SourceError) return refuse(error.message, STATUS[error.kind]);
    return refuse(error instanceof Error ? error.message : String(error), 500);
  }

  for (const w of wanted) {
    const item = inbox.get(itemKey(w));
    if (!item) return refuse(`${w.name} 不在你的待簽清單：可能有人處理過了，或是你自己送出的。`, 409);
    const action = item.actions.find((a) => a.action === w.action);
    if (!action) return refuse(`${w.name} 現在不能「${w.action}」`, 409);
    if (action.kind === "reject" && reason.length < 2) return refuse("退回要寫原因，讓對方知道要改什麼");
    if (wanted.length > 1 && (action.kind !== "approve" || !isSmall(item))) return refuse("一次核准只能用在小額的單，其他請一張一張看");
  }

  const results: Outcome[] = [];
  for (const w of wanted) {
    try {
      const r = await erpPost<{ ok: boolean; message?: string }>("dropout_core.approvals.decide", { ...w, reason: reason || undefined }, config);
      results.push({ doctype: w.doctype, name: w.name, ok: Boolean(r.ok), message: r.message ?? (r.ok ? "完成" : "沒有完成") });
    } catch (error) {
      if (error instanceof SourceError && error.kind === "login") return refuse(error.message, 401);
      results.push({ doctype: w.doctype, name: w.name, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const done = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  if (wanted.length === 1) return reply({ ok: done.length === 1, message: results[0].message, results });
  const message = failed.length ? `完成 ${done.length} 張，${failed.length} 張沒成功：${failed[0].name} ${failed[0].message}` : `已核准 ${done.length} 張`;
  return reply({ ok: failed.length === 0, message, results });
}
