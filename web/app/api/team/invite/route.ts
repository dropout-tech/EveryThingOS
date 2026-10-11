import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

export async function POST(request: NextRequest) {
  const body = await readJson<{ email?: string; full_name?: string; profile?: string }>(request);
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return refuse("請填正確的 Email");
  if (!body?.profile) return refuse("請選職務");
  return erpAction(request, "dropout_core.team.invite", { email, full_name: (body.full_name ?? "").trim().slice(0, 140), profile: body.profile }, { always: true });
}
