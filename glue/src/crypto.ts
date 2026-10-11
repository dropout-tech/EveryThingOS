const enc = new TextEncoder();
const dec = new TextDecoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacSha256(key: string | Uint8Array, data: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  const k = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function aesCbcKey(key: string, usage: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", enc.encode(key), { name: "AES-CBC" }, false, [usage]);
}

/** AES-CBC with PKCS#7 padding (Web Crypto pads automatically). */
export async function aesCbcEncrypt(plain: string, key: string, iv: string): Promise<Uint8Array> {
  const k = await aesCbcKey(key, "encrypt");
  return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: enc.encode(iv) }, k, enc.encode(plain)));
}

export async function aesCbcDecrypt(data: Uint8Array, key: string, iv: string): Promise<string> {
  const k = await aesCbcKey(key, "decrypt");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-CBC", iv: enc.encode(iv) }, k, data));
}

async function gcmKey(b64: string, usage: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", fromBase64(b64), { name: "AES-GCM" }, false, [usage]);
}

/** Tenant secrets at rest in D1: AES-256-GCM, iv prefixed. */
export async function seal(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await gcmKey(keyB64, "encrypt"), enc.encode(plain));
  return `${toBase64(iv)}.${toBase64(data)}`;
}

export async function unseal(sealed: string, keyB64: string): Promise<string> {
  const [iv, data] = sealed.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await gcmKey(keyB64, "decrypt"), fromBase64(data));
  return dec.decode(plain);
}
