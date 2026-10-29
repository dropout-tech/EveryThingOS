"use client";

import { useState } from "react";
import { AgentPanel, type AgentTurn } from "./AgentPanel";

/** Asks the shell agent and shows the reply. The reply never includes a created document. */
export function AgentDock({ open }: { open: boolean }) {
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<AgentTurn[]>([]);

  async function onAsk(message: string) {
    setTranscript((current) => [...current, { role: "staff", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { message?: string };
      const text = typeof data.message === "string" && data.message.trim() ? data.message : "這一步不會寫入單據。";
      setTranscript((current) => [...current, { role: "agent", text }]);
    } catch {
      setTranscript((current) => [...current, { role: "agent", text: "代理人還沒接上。單據仍然在 ERPNext。" }]);
    } finally {
      setBusy(false);
    }
  }

  return <AgentPanel open={open} busy={busy} transcript={transcript} proposal={null} onAsk={onAsk} onConfirm={() => undefined} onDismiss={() => undefined} />;
}
