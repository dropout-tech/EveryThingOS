import "server-only";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "dropout_session";
export const LOGIN_COOKIE = "dropout_login";
const MAX_AGE = 60 * 60 * 24 * 14;

/** Holds the ERPNext OAuth tokens, so the cookie is encrypted, not only signed. */
export type Session = {
  user: string;
  name?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type PendingLogin = { state: string; verifier: string; next: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function key(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), encoder.encode(JSON.stringify(value)));
  return `${b64url(iv)}.${b64url(new Uint8Array(data))}`;
}

export async function unseal<T>(token: string | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  const [iv, data] = token.split(".");
  if (!iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await key(secret), fromB64url(data));
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}

export function cookieOptions(maxAge = MAX_AGE) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

export async function readSession(secret: string | undefined): Promise<Session | null> {
  if (!secret) return null;
  const jar = await cookies();
  return unseal<Session>(jar.get(SESSION_COOKIE)?.value, secret);
}
