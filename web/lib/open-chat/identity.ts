import type { PersonRef } from "./types";

function emailKey(email: string | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function phoneDigits(phone: string | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** Email wins over phone. A shared name is never enough. */
export function samePerson(a: PersonRef, b: PersonRef): "email" | "phone" | null {
  const emailA = emailKey(a.email);
  const emailB = emailKey(b.email);
  if (emailA && emailB && emailA === emailB) return "email";

  const phoneA = phoneDigits(a.phone);
  const phoneB = phoneDigits(b.phone);
  if (phoneA.length >= 8 && phoneB.length >= 8 && phoneA === phoneB) return "phone";

  return null;
}

export function samePersonReason(kind: "email" | "phone" | null): string {
  if (kind === "email") return "信箱一樣，可以標成同一個人。";
  if (kind === "phone") return "手機一樣，可以標成同一個人。";
  return "姓名一樣不算。要有驗證過的信箱或手機才合併。";
}
