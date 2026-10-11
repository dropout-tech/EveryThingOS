import type { NextRequest } from "next/server";
import { erpAction, readJson } from "@/lib/actions";

type Body = { two_factor?: boolean; two_factor_method?: string; password_policy?: boolean; session_expiry?: string; lockout_attempts?: number };

export async function POST(request: NextRequest) {
  const body = (await readJson<Body>(request)) ?? {};
  const args: Record<string, unknown> = {};
  if (typeof body.two_factor === "boolean") args.two_factor = body.two_factor ? 1 : 0;
  if (body.two_factor_method === "OTP App" || body.two_factor_method === "Email") args.two_factor_method = body.two_factor_method;
  if (typeof body.password_policy === "boolean") args.password_policy = body.password_policy ? 1 : 0;
  if (typeof body.session_expiry === "string") args.session_expiry = body.session_expiry.trim();
  if (typeof body.lockout_attempts === "number") args.lockout_attempts = Math.max(0, Math.min(20, Math.round(body.lockout_attempts)));
  return erpAction(request, "dropout_core.team.set_security", args, { always: true });
}
