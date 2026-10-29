"use client";

import { useState } from "react";
import { Button } from "./ui/Button";

export type AgentTurn = {
  role: "staff" | "agent";
  text: string;
};

export type AgentProposal = {
  tool: string;
  summary: string;
};

export type AgentPanelProps = {
  open: boolean;
  busy: boolean;
  transcript: AgentTurn[];
  proposal: AgentProposal | null;
  onAsk: (message: string) => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

/** 進階版右側。請他看下一張單；按「就這樣做」之前這裡不寫單。 */
export function AgentPanel({ open, busy, transcript, proposal, onAsk, onConfirm, onDismiss }: AgentPanelProps) {
  const [draft, setDraft] = useState("");

  if (!open) return null;

  function ask() {
    const message = draft.trim();
    if (!message || busy) return;
    onAsk(message);
    setDraft("");
  }

  return (
    <aside className="glass space-y-3 p-4" aria-label="代理人" aria-busy={busy || undefined}>
      <h2 className="text-lg font-medium leading-snug">代理人</h2>
      <p className="text-sm text-cream-dim">進階版可以請他開下一張單。單據仍然進 ERPNext。</p>
      {transcript.length > 0 ? (
        <ol className="space-y-2" aria-label="對話">
          {transcript.map((turn, index) => (
            <li key={`${index}-${turn.role}`} className="glass-chip p-3 text-sm">
              <p className="text-xs text-cream-dim">{turn.role === "staff" ? "你" : "代理人"}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{turn.text}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {proposal ? (
        <div className="space-y-2" role="region" aria-label="他的建議">
          <p className="text-sm whitespace-pre-wrap break-words">{proposal.summary}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" type="button" onClick={onConfirm}>
              就這樣做
            </Button>
            <Button variant="ghost" type="button" onClick={onDismiss}>
              先不要
            </Button>
          </div>
        </div>
      ) : null}
      <label className="block text-sm">
        <span className="sr-only">說你要做的下一張單</span>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="說你要做的下一張單"
          rows={4}
          className="field"
        />
      </label>
      <Button variant="secondary" type="button" disabled={busy} onClick={ask}>
        請他看
      </Button>
    </aside>
  );
}
