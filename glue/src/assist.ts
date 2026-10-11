import type { Ai } from "./meetings";

/**
 * 問助理's optional AI layer. The shell's rules answer every question with
 * numbers from the company's own books; the model is only ever asked to
 * (a) pick which known question type an unmatched sentence is, or
 * (b) reword a message draft without touching its facts. Every model output is
 * validated here and falls back to "not understood" / the original draft.
 */

/** Keep in step with `INTENTS` in web/lib/assistant.ts. */
export const INTENTS = [
  "receivables",
  "overdue",
  "revenue",
  "revenue_compare",
  "margin",
  "low_stock",
  "quotes",
  "orders",
  "leave",
  "approvals",
  "payroll",
  "agenda",
  "customer",
  "top_customers",
  "payables",
  "cash",
  "purchases",
  "leads",
  "vat",
  "einvoice",
  "draft_reminder",
  "draft_quote",
  "draft_reply",
  "capabilities",
] as const;
export type Intent = (typeof INTENTS)[number];

export const PERIODS = ["today", "tomorrow", "this_week", "next_week", "this_month", "last_month"] as const;
export type Period = (typeof PERIODS)[number];

export const MAX_QUESTION = 200;
export const MAX_DRAFT = 2000;
const MAX_FACTS = 12;

export type Classified = { intent: Intent | null; period: Period | null; name: string | null };
const NOTHING: Classified = { intent: null, period: null, name: null };

const DESCRIBE: Record<Intent, string> = {
  receivables: "誰欠我們錢、應收帳款",
  overdue: "逾期沒付的錢",
  revenue: "營收、業績（某個月）",
  revenue_compare: "營收跟上個月比、趨勢",
  margin: "毛利、有沒有賺",
  low_stock: "什麼貨快沒了、要補貨",
  quotes: "報價等回覆、卡住的報價",
  orders: "訂單還沒出貨或交貨",
  leave: "誰請假",
  approvals: "等我核准的假單",
  payroll: "薪資進度",
  agenda: "今天／明天／這週要做什麼",
  customer: "某一位客人的狀況",
  top_customers: "最大的客人、買最多的客人",
  payables: "要付廠商的錢",
  cash: "現金夠不夠、週轉",
  purchases: "進貨、採購還沒到",
  leads: "新的詢問、還在跟的客人",
  vat: "營業稅",
  einvoice: "電子發票有沒有開成",
  draft_reminder: "幫我寫催款訊息",
  draft_quote: "幫我寫報價追蹤",
  draft_reply: "幫我寫回覆客人的訊息",
  capabilities: "問助理會回答什麼",
};

export const CLASSIFY_PROMPT = [
  "你是台灣小公司經營系統裡的分類器。使用者用中文問一個關於自己公司的問題，你只要判斷它屬於哪一類。",
  "只能從下面的 intent 裡選一個；都不像就用 \"none\"。不要回答問題本身，不要產生任何數字。",
  ...INTENTS.map((id) => `- ${id}：${DESCRIBE[id]}`),
  `period 只能是 ${PERIODS.join("、")} 或 null。name 是問題裡提到的客人或廠商名字（原文照抄），沒有就 null。`,
  '只輸出一行 JSON，例如 {"intent":"receivables","period":null,"name":null}。',
].join("\n");

export const POLISH_PROMPT = [
  "你幫台灣的小公司潤飾要傳給客人的訊息。用繁體中文、台灣商業往來常見的客氣口吻，簡潔自然。",
  "規則：不可以新增或改動任何數字、金額、日期、單號、名字；不可以加入折扣、承諾、威脅或原文沒有的事情；不要加連結。",
  "只輸出改好的訊息本文，不要加說明、引號或標題。",
].join("\n");

function compact(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function modelText(out: unknown): string {
  const response = (out as { response?: unknown } | null)?.response;
  if (typeof response === "string") return response;
  if (response && typeof response === "object") return JSON.stringify(response);
  return "";
}

/** Strict reading of the classifier's answer; anything off means "not understood". */
export function parseClassification(raw: string, question: string): Classified {
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return NOTHING;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    return NOTHING;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return NOTHING;
  const o = value as Record<string, unknown>;
  const intent = typeof o.intent === "string" && (INTENTS as readonly string[]).includes(o.intent) ? (o.intent as Intent) : null;
  if (!intent) return NOTHING;
  const period = typeof o.period === "string" && (PERIODS as readonly string[]).includes(o.period) ? (o.period as Period) : null;
  const rawName = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
  // Only a name the person actually typed; the model must not introduce one.
  const name = rawName.length >= 2 && compact(question).includes(compact(rawName)) ? rawName : null;
  return { intent, period, name };
}

export async function classify(ai: Ai, model: string, question: string, gateway?: string): Promise<Classified> {
  try {
    const out = await ai.run(
      model,
      { messages: [{ role: "system", content: CLASSIFY_PROMPT }, { role: "user", content: question }], max_tokens: 80, temperature: 0 },
      gateway ? { gateway: { id: gateway } } : undefined,
    );
    return parseClassification(modelText(out), question);
  } catch {
    return NOTHING;
  }
}

function digitRuns(text: string): string[] {
  let t = text.normalize("NFKC");
  while (/(\d),(\d{3})/.test(t)) t = t.replace(/(\d),(\d{3})/g, "$1$2");
  return t.match(/\d+/g) ?? [];
}

const CHINESE_NUMBER = /[〇零一二兩三四五六七八九十百千萬億]{2,}/g;

/** Why a polished draft cannot be used, or null when it keeps every fact and adds none. */
export function polishProblem(output: string, draft: string, facts: Record<string, string>): string | null {
  const text = output.trim();
  if (text.length < 10) return "too_short";
  if (text.length > draft.length * 2 + 200) return "too_long";
  const source = `${draft}\n${Object.values(facts).join("\n")}`;
  const known = new Set(digitRuns(source));
  const got = new Set(digitRuns(text));
  for (const run of got) if (!known.has(run)) return "new_number";
  for (const value of Object.values(facts)) {
    for (const run of digitRuns(value)) if (!got.has(run)) return "lost_number";
    if (!/\d/.test(value) && !compact(text).includes(compact(value))) return "lost_fact";
  }
  for (const words of text.normalize("NFKC").match(CHINESE_NUMBER) ?? []) if (!source.includes(words)) return "new_number";
  if (/https?:\/\/|www\./i.test(text) && !/https?:\/\/|www\./i.test(draft)) return "new_link";
  return null;
}

export async function polish(ai: Ai, model: string, draft: string, facts: Record<string, string>, gateway?: string): Promise<{ text: string; polished: boolean; reason?: string }> {
  const list = Object.entries(facts)
    .map(([k, v]) => `${k}：${v}`)
    .join("\n");
  try {
    const out = await ai.run(
      model,
      { messages: [{ role: "system", content: POLISH_PROMPT }, { role: "user", content: `必須保留的事實：\n${list}\n\n原本的訊息：\n${draft}` }], max_tokens: 700, temperature: 0.3 },
      gateway ? { gateway: { id: gateway } } : undefined,
    );
    const text = modelText(out).trim().replace(/^["「]|["」]$/g, "");
    const problem = polishProblem(text, draft, facts);
    return problem ? { text: draft, polished: false, reason: problem } : { text, polished: true };
  } catch {
    return { text: draft, polished: false, reason: "ai_error" };
  }
}

export type AssistRequest = { task: "classify"; question: string } | { task: "polish"; draft: string; facts: Record<string, string> };

/** Validates the shell's request body; returns a reason string when it is not acceptable. */
export function readAssist(body: unknown): AssistRequest | string {
  if (!body || typeof body !== "object") return "body must be JSON";
  const b = body as Record<string, unknown>;
  if (b.task === "classify") {
    if (typeof b.question !== "string" || !b.question.trim()) return "question required";
    if (b.question.length > MAX_QUESTION) return `question longer than ${MAX_QUESTION}`;
    return { task: "classify", question: b.question.trim() };
  }
  if (b.task === "polish") {
    if (typeof b.draft !== "string" || !b.draft.trim()) return "draft required";
    if (b.draft.length > MAX_DRAFT) return `draft longer than ${MAX_DRAFT}`;
    if (!b.facts || typeof b.facts !== "object" || Array.isArray(b.facts)) return "facts required";
    const entries = Object.entries(b.facts as Record<string, unknown>);
    if (entries.length > MAX_FACTS) return "too many facts";
    const facts: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (!/^[a-z_]{1,24}$/.test(k) || typeof v !== "string" || v.length > 200) return "bad fact";
      facts[k] = v;
    }
    return { task: "polish", draft: b.draft, facts };
  }
  return "task must be classify or polish";
}

export type AssistEnv = { AI?: Ai; ASSIST_MODEL?: string; SUMMARY_MODEL?: string; AI_GATEWAY?: string };

export async function assist(req: Request, env: AssistEnv): Promise<Response> {
  if (!env.AI) return Response.json({ available: false }, { status: 501 });
  const parsed = readAssist(await req.json().catch(() => null));
  if (typeof parsed === "string") return new Response(parsed, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const model = env.ASSIST_MODEL ?? env.SUMMARY_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  if (parsed.task === "classify") return Response.json({ available: true, ...(await classify(env.AI, model, parsed.question, env.AI_GATEWAY)) });
  return Response.json({ available: true, ...(await polish(env.AI, model, parsed.draft, parsed.facts, env.AI_GATEWAY)) });
}
