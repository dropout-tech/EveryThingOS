import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { MAX_QUESTION } from "@/lib/assistant";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { liveMe } from "@/lib/sources/live";

const MAX_DRAFT = 2000;

type Body = { task?: string; question?: unknown; draft?: unknown; facts?: unknown };

function cleanFacts(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 12) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^[a-z_]{1,24}$/.test(k) || typeof v !== "string" || v.length > 200) return null;
    out[k] = v;
  }
  return out;
}

/**
 * 問助理's optional AI step, through the glue. Only the question text, or a
 * draft and the facts already printed in it, leave the shell; no books.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const config = await liveConfig();
  if (!config.glue) return reply({ ok: false, available: false, message: "AI 沒有接上，只用內建規則回答" }, 409);
  if (loginRequired(config)) {
    try {
      await liveMe();
    } catch {
      return refuse("請先登入", 401);
    }
  }
  const body = await readJson<Body>(request);
  let payload: Record<string, unknown>;
  if (body?.task === "classify" && typeof body.question === "string" && body.question.trim() && body.question.length <= MAX_QUESTION) {
    payload = { task: "classify", question: body.question.trim() };
  } else if (body?.task === "polish" && typeof body.draft === "string" && body.draft.trim() && body.draft.length <= MAX_DRAFT) {
    const facts = cleanFacts(body.facts);
    if (!facts) return refuse("草稿的資料格式不對");
    payload = { task: "polish", draft: body.draft, facts };
  } else {
    return refuse("看不懂這個請求");
  }
  let res: Response;
  try {
    res = await fetch(`${config.glue.url}/admin/tenants/${encodeURIComponent(config.glue.site)}/assist`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.glue.adminToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return reply({ ok: false, available: false, message: "AI 暫時連不上，只用內建規則回答" }, 502);
  }
  if (res.status === 501 || res.status === 404) return reply({ ok: false, available: false, message: "這家公司沒有開 AI，只用內建規則回答" }, 409);
  if (!res.ok) return reply({ ok: false, message: `AI 回應 ${res.status}` }, 502);
  return reply({ ok: true, ...((await res.json()) as Record<string, unknown>) });
}
