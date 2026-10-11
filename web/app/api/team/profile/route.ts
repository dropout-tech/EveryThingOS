import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

export async function POST(request: NextRequest) {
  const body = await readJson<{ user?: string; profile?: string }>(request);
  if (!body?.user || !body.profile) return refuse("缺少人或職務");
  return erpAction(request, "dropout_core.team.set_profile", { user: body.user, profile: body.profile }, { always: true });
}
