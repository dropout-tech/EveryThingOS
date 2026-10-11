import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { party_type?: string; party?: string; items?: { item_code?: string; qty?: number; rate?: number | null }[] };

export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const items = (body?.items ?? []).filter((i) => i.item_code && Number(i.qty) > 0).slice(0, 50);
  if (!body?.party || (body.party_type !== "Customer" && body.party_type !== "Lead")) return refuse("請選客人");
  if (!items.length) return refuse("至少要有一項商品，數量大於 0");
  return erpAction(request, "dropout_core.actions.create_quotation", {
    party_type: body.party_type,
    party: body.party,
    items: items.map((i) => ({ item_code: i.item_code, qty: Number(i.qty), rate: i.rate == null || Number.isNaN(Number(i.rate)) ? null : Number(i.rate) })),
  });
}
