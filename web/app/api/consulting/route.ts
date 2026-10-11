import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { COMMERCIAL } from "@/lib/commercial";
import { CONSULTING_WORDING, leadMessage, normalizeLead, validateLead } from "@/lib/consulting";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

/** Per-instance limit; a serverless isolate restarting resets it, which the glue's own form dedupe backs up. */
function limited(key: string, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.delete(hits.keys().next().value!);
  return recent.length > MAX_PER_WINDOW;
}

function env(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * 免費導入預約. Sends the lead to the glue's public website-form route (G3,
 * `POST /forms/:site`), which creates the Lead in DropOut's own ERPNext.
 * Needs GLUE_URL and CONSULTING_FORM_SITE (DropOut's own site in the glue);
 * without them it is demo mode and nothing leaves this server.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("請從 DropOut 官網的表單送出", 403);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) return refuse("送出太多次了，請 10 分鐘後再試，或直接寫信給我們", 429);

  const raw = await readJson<Record<string, unknown>>(request);
  if (!raw || typeof raw !== "object") return refuse("沒有收到表單內容");
  if (String(raw.website ?? "").trim()) return reply({ ok: true, demo: false });

  const lead = normalizeLead(raw);
  const errors = validateLead(lead);
  if (Object.keys(errors).length) return reply({ ok: false, message: "有幾個欄位要再看一下", errors }, 400);

  const glue = env("GLUE_URL");
  const site = env("CONSULTING_FORM_SITE");
  if (!glue || !site) return reply({ ok: true, demo: true });

  try {
    const res = await fetch(`${glue.replace(/\/+$/, "")}/forms/${encodeURIComponent(site)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        form_id: crypto.randomUUID(),
        email: lead.email,
        name: lead.name,
        phone: lead.contact,
        consent: lead.updates ? "1" : "",
        wording_version: CONSULTING_WORDING,
        source: `${COMMERCIAL.siteUrl}/consulting`,
        message: leadMessage(lead),
        utm_source: typeof raw.utm_source === "string" ? raw.utm_source.slice(0, 80) : undefined,
        utm_medium: typeof raw.utm_medium === "string" ? raw.utm_medium.slice(0, 80) : undefined,
        utm_campaign: typeof raw.utm_campaign === "string" ? raw.utm_campaign.slice(0, 80) : undefined,
        "cf-turnstile-response": typeof raw["cf-turnstile-response"] === "string" ? raw["cf-turnstile-response"] : undefined,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 400) return refuse((await res.text()).slice(0, 200) || "驗證沒有通過，請重新整理再送一次", 400);
    if (!res.ok) throw new Error(String(res.status));
    return reply({ ok: true, demo: false });
  } catch {
    return refuse(`現在送不出去，請直接寫信到 ${COMMERCIAL.email}，我們一樣會回`, 502);
  }
}
