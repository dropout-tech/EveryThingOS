import { parseAgentCall } from "./agent-tools.ts";

/** The right-hand agent cannot call Workers AI from this computer. It never writes a document. */

export function agentReply(connected: boolean, message: string, call?: unknown): { ok: false; message: string } {
  if (!message.trim()) return { ok: false, message: "請說要做的下一張單" };
  if (call !== undefined) {
    const parsed = parseAgentCall(call);
    if (!parsed.ok) return { ok: false, message: parsed.message };
  }
  if (!connected) return { ok: false, message: "代理人還沒接上。單據仍然在 ERPNext。" };
  return { ok: false, message: "進階版的代理人還沒接上模型。這一步不會寫入單據。" };
}
