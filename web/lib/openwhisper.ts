export const OPENWHISPER_ID = "openwhisper";

export type DeskAgent = {
  id: string;
  name: string;
  detail: string;
  call: boolean;
};

/** Agents on the right-hand rail. OpenWhisper is always there; the slip agent stays on the advanced tier. */
export function deskAgents(slip: boolean): DeskAgent[] {
  const agents: DeskAgent[] = [
    {
      id: OPENWHISPER_ID,
      name: "OpenWhisper",
      detail: "一回合通話。免費額度，不接付費模型。",
      call: true,
    },
  ];
  if (slip) {
    agents.push({
      id: "slip",
      name: "下一步",
      detail: "請他看下一張單。單據仍然進 ERPNext。",
      call: false,
    });
  }
  return agents;
}

export type WhisperScreen = { ok: true } | { ok: false; message: string };

/** Gate a turn before it reaches the glue. A turn is not a saved document. */
export function screenWhisper(input: { connected: boolean; agentId: string; message: string; hasAudio: boolean }): WhisperScreen {
  if (input.agentId !== OPENWHISPER_ID) return { ok: false, message: "這個代理人不能從這裡通話" };
  if (!input.message.trim() && !input.hasAudio) return { ok: false, message: "說一句，或打一行字" };
  if (!input.connected) return { ok: false, message: "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。" };
  return { ok: true };
}
