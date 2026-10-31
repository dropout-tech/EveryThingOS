import { parseAgentCall, type AgentCall } from "./agent-tools";

/** A proposal is not a saved document. Writing happens only after the staff confirms, on another route. */

export function agentReply(connected: boolean, message: string, call?: unknown): { ok: false; message: string } {
  if (!message.trim()) return { ok: false, message: "請說要做的下一張單" };
  if (call !== undefined) {
    const parsed = parseAgentCall(call);
    if (!parsed.ok) return { ok: false, message: parsed.message };
  }
  if (!connected) return { ok: false, message: "代理人還沒接上。單據仍然在 ERPNext。" };
  return { ok: false, message: "進階版的代理人還沒接上模型。這一步不會寫入單據。" };
}

export type AgentAnswer = { ok: false; message: string } | { ok: true; proposal: { id: string; tool: string; summary: string; args: Record<string, unknown> } };

function describeCall(call: Extract<AgentCall, { ok: true }>): string {
  switch (call.tool) {
    case "create_quotation":
      return `開報價給 ${call.args.party}`;
    case "advance":
      return `${call.args.doctype} ${call.args.name} 往下走`;
    case "record_deposit":
      return `${call.args.sales_order} 收訂金 ${call.args.amount}`;
    case "deliver_partial":
      return `${call.args.sales_order} 先出 ${call.args.qty}`;
    case "return_against_delivery":
      return `${call.args.delivery_note} 退 ${call.args.qty}`;
    default:
      return "這一步還不能做";
  }
}

/** Ask the glue for one proposal. A proposal is not a saved document. */
export async function askAgent(input: { connected: boolean; message: string; call?: unknown; propose?: () => Promise<unknown> }): Promise<AgentAnswer> {
  const screened = agentReply(input.connected, input.message, input.call);
  if (!input.message.trim()) return screened;
  if (input.call !== undefined && !parseAgentCall(input.call).ok) return screened;
  if (!input.connected || !input.propose) return screened;
  let raw: unknown;
  try {
    raw = await input.propose();
  } catch {
    return { ok: false, message: "代理人還沒接上。單據仍然在 ERPNext。" };
  }
  if (raw !== null && typeof raw === "object" && "ok" in raw && raw.ok === false && "message" in raw && typeof raw.message === "string") {
    return { ok: false, message: raw.message };
  }
  const body = raw !== null && typeof raw === "object" && "tool" in raw ? raw : null;
  const parsed = parseAgentCall(body);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, proposal: { id: `${parsed.tool}:${JSON.stringify(parsed.args)}`, tool: parsed.tool, summary: describeCall(parsed), args: parsed.args } };
}
