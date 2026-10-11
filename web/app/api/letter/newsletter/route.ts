import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";

type Body = { subject?: string; message?: string; email_groups?: string[]; send?: boolean };

function paragraphs(text: string) {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Writes a newsletter from plain text. Sending goes through ERPNext's own queue and unsubscribe link. */
export async function POST(request: NextRequest) {
  const body = await readJson<Body>(request);
  const subject = (body?.subject ?? "").trim().slice(0, 200);
  const message = (body?.message ?? "").trim().slice(0, 20000);
  const groups = (body?.email_groups ?? []).filter(Boolean).slice(0, 20);
  if (!subject || !message) return refuse("請填主旨與內容");
  if (!groups.length) return refuse("請選要寄給哪一群人");
  return erpAction(request, "dropout_core.actions.draft_newsletter", { subject, message: paragraphs(message), email_groups: groups, send: body?.send ? 1 : 0 });
}
