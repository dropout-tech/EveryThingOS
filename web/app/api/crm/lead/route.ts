import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { name?: string; email?: string; phone?: string; company_name?: string; notes?: string };

export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const clean = (v?: string, max = 140) => (v ?? "").trim().slice(0, max) || undefined;
  const args = { name: clean(body?.name), email: clean(body?.email), phone: clean(body?.phone, 30), company_name: clean(body?.company_name), notes: clean(body?.notes, 2000) };
  if (!args.name && !args.email && !args.phone) return refuse("請填名字、Email 或電話");
  return erpAction(request, "dropout_core.actions.create_lead", args);
}
