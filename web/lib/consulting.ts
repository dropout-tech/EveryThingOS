export const EMPLOYEE_RANGES = ["1–4 人", "5–10 人", "11–30 人", "31–100 人", "100 人以上"] as const;
export const CURRENT_SYSTEMS = ["試算表或紙本", "LINE 群組加試算表", "鼎新 A1", "億看 ECOUNT", "其他 ERP 或會計軟體", "還沒有"] as const;
export const TIME_SLOTS = ["平日上午", "平日下午", "平日 18:00 後", "都可以"] as const;
export const CONSULTING_WORDING = "consulting-2026-10";

export type LeadInput = {
  name: string;
  company: string;
  tax_id: string;
  contact: string;
  email: string;
  employees: string;
  system: string;
  time: string;
  note: string;
  privacy: boolean;
  updates: boolean;
};

export type LeadErrors = Partial<Record<keyof LeadInput, string>>;

const LIMITS: Partial<Record<keyof LeadInput, number>> = { name: 60, company: 100, tax_id: 8, contact: 60, email: 120, note: 500 };

function text(v: unknown, max: number) {
  return String(v ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const flag = (v: unknown) => v === true || ["on", "true", "1", "yes"].includes(String(v ?? "").toLowerCase());

/** 統一編號 checksum (財政部 2023 rule: weighted digit sum divisible by 5). */
export function validTaxId(id: string) {
  if (!/^\d{8}$/.test(id)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const sum = weights.reduce((n, w, i) => {
    const p = Number(id[i]) * w;
    return n + Math.floor(p / 10) + (p % 10);
  }, 0);
  return sum % 5 === 0 || (id[6] === "7" && (sum + 1) % 5 === 0);
}

const pick = <T extends readonly string[]>(list: T, v: string) => (list.includes(v) ? v : "");

export function normalizeLead(raw: Record<string, unknown>): LeadInput {
  return {
    name: text(raw.name, LIMITS.name!),
    company: text(raw.company, LIMITS.company!),
    tax_id: text(raw.tax_id, 20).replace(/\D/g, "").slice(0, 8),
    contact: text(raw.contact, LIMITS.contact!),
    email: text(raw.email, LIMITS.email!).toLowerCase(),
    employees: pick(EMPLOYEE_RANGES, text(raw.employees, 20)),
    system: pick(CURRENT_SYSTEMS, text(raw.system, 30)),
    time: pick(TIME_SLOTS, text(raw.time, 20)),
    note: text(raw.note, LIMITS.note!),
    privacy: flag(raw.privacy),
    updates: flag(raw.updates),
  };
}

export function validateLead(lead: LeadInput): LeadErrors {
  const errors: LeadErrors = {};
  const link = /https?:\/\/|www\./i;
  if (!lead.name) errors.name = "請填怎麼稱呼你";
  else if (link.test(lead.name)) errors.name = "名字不能放網址";
  if (!lead.company) errors.company = "請填公司或店名";
  else if (link.test(lead.company)) errors.company = "公司名稱不能放網址";
  if (lead.tax_id && !validTaxId(lead.tax_id)) errors.tax_id = "統編是 8 位數字，請再對一次（不知道可以先空著）";
  if (!lead.contact) errors.contact = "請留手機或 LINE ID，顧問約時間用";
  else if (!/^(\+?\d[\d\s-]{7,15}|[a-z0-9._@-]{2,40})$/i.test(lead.contact)) errors.contact = "手機像 0912345678，LINE ID 只能有英數字和 . _ -";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) errors.email = "請填正確的 Email，顧問會寫信跟你確認時間";
  if (!lead.employees) errors.employees = "請選公司大約幾個人";
  if (!lead.system) errors.system = "請選現在用什麼記帳或管客人";
  if (!lead.time) errors.time = "請選方便聯絡的時間";
  if (!lead.privacy) errors.privacy = "請先同意隱私權政策，我們才能用這些資料聯絡你";
  return errors;
}

export function leadMessage(lead: LeadInput) {
  return [
    "【免費導入預約】",
    `公司：${lead.company}${lead.tax_id ? `（統編 ${lead.tax_id}）` : ""}`,
    `員工數：${lead.employees}`,
    `現在用的系統：${lead.system}`,
    `方便時間：${lead.time}`,
    `手機／LINE：${lead.contact}`,
    lead.note ? `想先解決：${lead.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
