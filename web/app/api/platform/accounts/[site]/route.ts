import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { glueAdmin, platformOperator, type PlatformAccount } from "@/lib/platform";

type Body =
  | { action: "renew"; years?: number; reference?: string }
  | { action: "state"; state: "active" | "suspended" | "cancelled"; reason?: string }
  | { action: "update"; company?: string; contact_email?: string; hosts?: string[]; trial_ends?: string | null; renews_on?: string | null };

/** DropOut staff only: renew, suspend/resume/cancel, or edit one company's account. */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/platform/accounts/[site]">) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 DropOut OS 送出的", 403);
  const operator = await platformOperator();
  if (!operator) return refuse("只有 DropOut 營運人員可以做這件事", 403);
  const { site } = await params;
  const body = await readJson<Body>(request);
  if (!body) return refuse("缺少內容");
  const path = `/admin/accounts/${encodeURIComponent(site)}`;
  const res =
    body.action === "renew"
      ? await glueAdmin<{ account: PlatformAccount }>(`${path}/renew`, operator, { method: "POST", body: { years: body.years ?? 1, reference: body.reference } })
      : body.action === "state"
        ? await glueAdmin<{ account: PlatformAccount }>(`${path}/state`, operator, { method: "POST", body: { state: body.state, reason: body.reason } })
        : await glueAdmin<{ account: PlatformAccount }>(path, operator, {
            method: "PUT",
            body: { company: body.company, contact_email: body.contact_email, hosts: body.hosts, trial_ends: body.trial_ends, renews_on: body.renews_on },
          });
  if (!res.ok || !res.data) return refuse(res.text || `回應 ${res.status}`, res.status === 409 ? 409 : 502);
  const a = res.data.account;
  return reply({ ok: true, message: `${a.company}：${a.lifecycle.message || "使用中"}`, account: a });
}
