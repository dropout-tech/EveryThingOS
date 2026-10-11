import { fromBase64, hmacSha256, safeEqual, toBase64, toHex } from "./crypto";
import type { Tenant } from "./store";

export type SendEmail = {
  send(msg: { from: string; to: string; subject: string; html: string; text: string; headers?: Record<string, string> }): Promise<{ messageId: string }>;
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendConfirmation(email: SendEmail, t: Tenant, to: string, confirmUrl: string, name?: string) {
  if (!t.mail_from) throw new Error("tenant has no mail_from");
  const hello = name ? `${escapeHtml(name)} 您好，` : "您好，";
  return email.send({
    from: t.mail_from,
    to,
    subject: "請確認訂閱",
    text: `${name ? name + " 您好，" : "您好，"}\n\n請點下面的連結確認訂閱電子報：\n${confirmUrl}\n\n沒有申請請忽略這封信，我們不會再寄給您。`,
    html: `<p>${hello}</p><p>請按下面的按鈕確認訂閱電子報。</p><p><a href="${escapeHtml(confirmUrl)}">確認訂閱</a></p><p>沒有申請請忽略這封信，我們不會再寄給您。</p>`,
  });
}

/** Normalised email-service event. */
export type MailEvent =
  | { kind: "opened" | "clicked"; id: string; email: string; url?: string; messageId?: string; campaign?: string }
  | { kind: "bounced"; id: string; email: string; messageId: string; hard: boolean; reason?: string }
  | { kind: "complained"; id: string; email: string; messageId?: string }
  | { kind: "ignored"; id: string };

/** Resend signs with Svix: base64(HMAC(secret, `${id}.${ts}.${body}`)), secret is `whsec_<base64>`. */
export async function verifySvix(secret: string, headers: Headers, body: string, now = Date.now()): Promise<boolean> {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = fromBase64(secret.replace(/^whsec_/, ""));
  const expected = toBase64(await hmacSha256(key, `${id}.${ts}.${body}`));
  return sigs.split(" ").some((part) => safeEqual(part.split(",")[1] ?? "", expected));
}

export function parseResend(body: string, svixId: string): MailEvent {
  const evt = JSON.parse(body) as { type: string; data: Record<string, any> };
  const email = String((Array.isArray(evt.data.to) ? evt.data.to[0] : evt.data.to) ?? "").toLowerCase();
  const messageId = evt.data.email_id as string;
  const campaign = evt.data.tags?.campaign as string | undefined;
  switch (evt.type) {
    case "email.opened":
      return { kind: "opened", id: svixId, email, messageId, campaign };
    case "email.clicked":
      return { kind: "clicked", id: svixId, email, messageId, campaign, url: evt.data.click?.link };
    case "email.bounced":
      return { kind: "bounced", id: svixId, email, messageId, hard: (evt.data.bounce?.type ?? "Permanent") === "Permanent", reason: evt.data.bounce?.message };
    case "email.complained":
      return { kind: "complained", id: svixId, email, messageId };
    default:
      return { kind: "ignored", id: svixId };
  }
}

/** Provider-neutral format for any service we put an adapter in front of: hex HMAC of the body. */
export async function verifyGeneric(secret: string, headers: Headers, body: string): Promise<boolean> {
  const given = headers.get("x-dropout-signature") ?? "";
  return safeEqual(given, toHex(await hmacSha256(secret, body)));
}

export function parseGeneric(body: string): MailEvent {
  return JSON.parse(body) as MailEvent;
}

export async function unsubscribeSignature(secret: string, email: string): Promise<string> {
  return toHex(await hmacSha256(secret, `unsubscribe:${email.toLowerCase()}`)).slice(0, 32);
}
