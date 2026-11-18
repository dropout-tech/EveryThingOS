import "server-only";
import type { NextRequest } from "next/server";
import { fleetMode } from "./sources/config";

export function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/workspace";
}

/** Trust the URL resolved by the server, not forwarded request headers. */
export function publicOrigin(request: NextRequest) {
  return request.nextUrl.origin;
}

export function here(path: string, request: NextRequest) {
  return new URL(path, publicOrigin(request));
}

/** In fleet mode every company has its own host, so the callback goes back to the host the person is on. */
export function redirectUri(request: NextRequest) {
  const base = fleetMode() ? publicOrigin(request) : (process.env.SHELL_URL ? new URL(process.env.SHELL_URL).origin : publicOrigin(request));
  return `${base.replace(/\/+$/, "")}/api/auth/callback`;
}
