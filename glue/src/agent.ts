import type { Ai } from "./meetings";

/** Staff sentence -> one proposed tool call. The model must answer with this shape and nothing else. */
export const ACTION_PROMPT = [
  "你是店裡的下一步助理。只回答一個 JSON 物件，不要其他文字，也不要 markdown。",
  '格式固定是 {"tool","args"}。',
  "tool 只能是：create_quotation、advance、record_deposit、deliver_partial、return_against_delivery。",
  "create_quotation 的 args 為 party_type（Lead 或 Customer）、party、items（每項 item_code、qty，員工有講單價才放 rate）。",
  "advance 的 args 為 doctype、name。",
  "record_deposit 的 args 為 sales_order、amount。",
  "deliver_partial 的 args 為 sales_order、qty。",
  "return_against_delivery 的 args 為 delivery_note、qty。",
  "不要發明稅率。稅由帳套自己算，不要寫進 args。員工沒說的數字不要補。",
].join("\n");

const TOOLS = new Set(["create_quotation", "advance", "record_deposit", "deliver_partial", "return_against_delivery"]);

const NEED_MESSAGE = "請說要做的下一張單";
const REFUSE = "這一步還不能做";

export type ActionProposal =
  | { ok: true; tool: string; args: Record<string, unknown> }
  | { ok: false; message: string };

function modelText(out: unknown): string | null {
  if (typeof out === "string") return out;
  if (out !== null && typeof out === "object" && "response" in out && typeof out.response === "string") return out.response;
  return null;
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : trimmed).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Proposes the next ERP tool call. Does not run it. */
const NOT_CONNECTED = "進階版的代理人還沒接上模型。這一步不會寫入單據。";

/** Propose when a model is bound. Without one, say so and do not invent a document. */
export async function staffProposal(ai: Ai | undefined, model: string, message: string): Promise<ActionProposal> {
  if (!ai) return { ok: false, message: NOT_CONNECTED };
  return proposeAction(ai, model, message);
}

export async function proposeAction(ai: Ai, model: string, message: string): Promise<ActionProposal> {
  if (message.trim() === "") return { ok: false, message: NEED_MESSAGE };
  const out = await ai.run(model, {
    messages: [
      { role: "system", content: ACTION_PROMPT },
      { role: "user", content: message },
    ],
  });
  const text = modelText(out);
  if (text == null) return { ok: false, message: REFUSE };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    return { ok: false, message: REFUSE };
  }
  if (!isRecord(parsed) || typeof parsed.tool !== "string" || !TOOLS.has(parsed.tool) || !isRecord(parsed.args)) {
    return { ok: false, message: REFUSE };
  }
  return { ok: true, tool: parsed.tool, args: parsed.args };
}
