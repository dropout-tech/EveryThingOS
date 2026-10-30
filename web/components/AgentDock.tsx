"use client";

import { useState } from "react";
import { confirm, dismiss, stage, type Proposal } from "@/lib/agent-confirm";
import { confirmRequest, parseAgentCall } from "@/lib/agent-tools";
import { AgentPanel, type AgentTurn } from "./AgentPanel";

type Held = Proposal & { args: Record<string, unknown> };

/** Asks for one proposal, then posts it only after the staff confirms. */
export function AgentDock({ open }: { open: boolean }) {
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<AgentTurn[]>([]);
  const [pending, setPending] = useState<Held | null>(null);

  function say(role: AgentTurn["role"], text: string) {
    setTranscript((current) => [...current, { role, text }]);
  }

  async function onAsk(message: string) {
    say("staff", message);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { message?: string; proposal?: Held };
      const proposal = data.proposal;
      if (res.ok && proposal?.id && proposal.tool && proposal.summary && proposal.args) {
        setPending((current) => stage(current, proposal) as Held);
        say("agent", proposal.summary);
        return;
      }
      say("agent", typeof data.message === "string" && data.message.trim() ? data.message : "這一步不會寫入單據。");
    } catch {
      say("agent", "代理人還沒接上。單據仍然在 ERPNext。");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!pending) return;
    const decided = confirm(pending, pending.id);
    setPending(decided.pending as Held | null);
    const accepted = decided.accepted as Held | null;
    if (!accepted) return;
    const request = confirmRequest(parseAgentCall({ tool: accepted.tool, args: accepted.args }));
    if (!request) {
      say("agent", "這個動作不能從這裡做");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(request.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; created?: { name?: string } };
      if (data.ok && data.created?.name) say("agent", `已寫入 ${data.created.name}`);
      else say("agent", data.message?.trim() || "這一步不會寫入單據。");
    } catch {
      say("agent", "代理人還沒接上。單據仍然在 ERPNext。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AgentPanel
      open={open}
      busy={busy}
      transcript={transcript}
      proposal={pending ? { tool: pending.tool, summary: pending.summary } : null}
      onAsk={onAsk}
      onConfirm={() => void onConfirm()}
      onDismiss={() => setPending(dismiss(pending))}
    />
  );
}
