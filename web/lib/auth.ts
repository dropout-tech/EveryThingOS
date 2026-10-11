import "server-only";
import type { NextRequest } from "next/server";

export function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/workspace";
}

export function redirectUri(request: NextRequest) {
  return `${(process.env.SHELL_URL ?? request.nextUrl.origin).replace(/\/+$/, "")}/api/auth/callback`;
}
