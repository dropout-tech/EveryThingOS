/** The right-hand agent cannot call Workers AI from this computer. It never writes a document. */

export function agentReply(connected: boolean, message: string): { ok: false; message: string } {
  if (!message.trim()) return { ok: false, message: "請說要做的下一張單" };
  if (!connected) return { ok: false, message: "代理人還沒接上。單據仍然在 ERPNext。" };
  return { ok: false, message: "進階版的代理人還沒接上模型。這一步不會寫入單據。" };
}
