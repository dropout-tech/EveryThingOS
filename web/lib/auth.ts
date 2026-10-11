import "server-only";
import type { NextRequest } from "next/server";
import { fleetMode } from "./sources/config";

export function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/workspace";
}

/**
 * The origin the person typed. Behind a proxy or `next start`, `request.url`
 * can be the server's own address, which would send people to the wrong host
 * (and, with one shell for many companies, the wrong company).
 */
export function publicOrigin(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0].trim();
  if (!host) return request.nextUrl.origin;
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

export function here(path: string, request: NextRequest) {
  return new URL(path, publicOrigin(request));
}

/** In fleet mode every company has its own host, so the callback goes back to the host the person is on. */
export function redirectUri(request: NextRequest) {
  const base = fleetMode() ? publicOrigin(request) : (process.env.SHELL_URL ?? publicOrigin(request));
  return `${base.replace(/\/+$/, "")}/api/auth/callback`;
}
