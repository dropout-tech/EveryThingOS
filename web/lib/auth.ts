import "server-only";
import type { NextRequest } from "next/server";
import { fleetMode } from "./sources/config";

export function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/workspace";
}

/** In fleet mode every company has its own host, so the callback goes back to the host the person is on. */
export function redirectUri(request: NextRequest) {
  const base = fleetMode() ? request.nextUrl.origin : (process.env.SHELL_URL ?? request.nextUrl.origin);
  return `${base.replace(/\/+$/, "")}/api/auth/callback`;
}
