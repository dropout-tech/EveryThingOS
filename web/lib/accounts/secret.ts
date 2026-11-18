import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const secretFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".data", "session-secret");

/**
 * Cookie key for the platform session.
 * An explicit empty SESSION_SECRET (the browser test does this) stays empty.
 * A missing variable gets a local file so Google login can seal a cookie.
 */
export function resolveSessionSecret(): string | null {
  if (process.env.SESSION_SECRET !== undefined) {
    const fromEnv = process.env.SESSION_SECRET.trim();
    return fromEnv.length >= 16 ? fromEnv : null;
  }
  try {
    const existing = readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
    /* first run */
  }
  try {
    mkdirSync(path.dirname(secretFile), { recursive: true });
    const created = randomBytes(32).toString("base64url");
    writeFileSync(secretFile, created, { mode: 0o600 });
    return created;
  } catch {
    return null;
  }
}
