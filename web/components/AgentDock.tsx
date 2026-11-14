"use client";

import { useRef, useState, type PointerEvent } from "react";
import { startClip } from "@/lib/mic-clip";
import { deskAgents, OPENWHISPER_ID } from "@/lib/openwhisper";
import { confirm, dismiss, stage, type Proposal } from "@/lib/agent-confirm";
import { confirmRequest, parseAgentCall } from "@/lib/agent-tools";
import { AgentPanel, type AgentTurn } from "./AgentPanel";
import { Button } from "./ui/Button";

type Held = Proposal & { args: Record<string, unknown> };

/** Right-hand rail: pick an agent and, for OpenWhisper, take one free-tier turn. */
export function AgentDock({ slip }: { slip: boolean }) {
  const agents = deskAgents(slip);
  const [selected, setSelected] = useState(OPENWHISPER_ID);
  const [inCall, setInCall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState<AgentTurn[]>([]);
  const [slipTranscript, setSlipTranscript] = useState<AgentTurn[]>([]);
  const [pending, setPending] = useState<Held | null>(null);
  const clip = useRef<{ stop: () => Promise<string> } | null>(null);
  const holding = useRef(false);

  function say(role: AgentTurn["role"], text: string) {
    setTranscript((current) => [...current, { role, text }]);
  }

  function saySlip(role: AgentTurn["role"], text: string) {
    setSlipTranscript((current) => [...current, { role, text }]);
  }

  function toggleCall(id: string) {
    setSelected(id);
    setInCall((current) => (selected === id ? !current : true));
  }

  async function sendTurn(body: { message?: string; audio?: string }) {
    const message = body.message?.trim() ?? "";
    if (message) say("staff", message);
    setBusy(true);
    try {
      const res = await fetch("/api/openwhisper", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: OPENWHISPER_ID, message, audio: body.audio }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; heard?: string; reply?: string };
      if (res.ok && data.ok && data.reply) {
        if (!message && data.heard) say("staff", data.heard);
        say("agent", data.reply);
        return;
      }
      say("agent", data.message?.trim() || "這一回合沒有通。");
    } catch {
      say("agent", "OpenWhisper 還沒接上 Workers AI。這一回合不會寫單。");
    } finally {
      setBusy(false);
    }
  }

  async function onAsk(message: string) {
    saySlip("staff", message);
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
        saySlip("agent", proposal.summary);
        return;
      }
      saySlip("agent", typeof data.message === "string" && data.message.trim() ? data.message : "這一步不會寫入單據。");
    } catch {
      saySlip("agent", "代理人還沒接上。單據仍然在 ERPNext。");
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
      saySlip("agent", "這個動作不能從這裡做");
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
      if (data.ok && data.created?.name) saySlip("agent", `已寫入 ${data.created.name}`);
      else saySlip("agent", data.message?.trim() || "這一步不會寫入單據。");
    } catch {
      saySlip("agent", "代理人還沒接上。單據仍然在 ERPNext。");
    } finally {
      setBusy(false);
    }
  }

  async function beginTalk(event: PointerEvent<HTMLButtonElement>) {
    if (busy || holding.current) return;
    holding.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const started = await startClip();
    if (!holding.current) {
      if (started) await started.stop();
      return;
    }
    if (!started) {
      holding.current = false;
      say("agent", "這台沒有麥克風，改打一行字。");
      return;
    }
    clip.current = started;
    setRecording(true);
  }

  async function endTalk() {
    if (!holding.current && !clip.current) return;
    holding.current = false;
    const current = clip.current;
    clip.current = null;
    setRecording(false);
    if (!current) return;
    const audio = await current.stop();
    await sendTurn({ audio });
  }

  function sendDraft() {
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    void sendTurn({ message });
  }

  return (
    <aside className="glass space-y-3 p-4" aria-label="代理人" aria-busy={busy || undefined}>
      <h2 className="text-lg font-medium leading-snug">代理人</h2>
      <ul className="space-y-2" aria-label="可使用的代理人">
        {agents.map((agent) => {
          const active = selected === agent.id;
          const calling = agent.call && active && inCall;
          return (
            <li key={agent.id} className="glass-chip space-y-2 p-3">
              <button type="button" className="block w-full text-left" aria-pressed={active} onClick={() => setSelected(agent.id)}>
                <span className="block text-sm font-medium">{agent.name}</span>
                <span className="mt-1 block text-xs text-cream-dim">{agent.detail}</span>
              </button>
              {agent.call ? (
                <Button variant={calling ? "primary" : "secondary"} size="sm" type="button" onClick={() => toggleCall(agent.id)}>
                  {calling ? "結束通話" : "通話"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {selected === OPENWHISPER_ID && inCall ? (
        <section className="space-y-3" aria-label="OpenWhisper 通話">
          <p className="text-sm text-cream-dim">按住說話，或打一行字。這一回走 Workers AI 免費額度，不是即時雙向語音。</p>
          {transcript.length > 0 ? (
            <ol className="space-y-2" aria-label="通話">
              {transcript.map((turn, index) => (
                <li key={`${index}-${turn.role}`} className="glass-chip p-3 text-sm">
                  <p className="text-xs text-cream-dim">{turn.role === "staff" ? "你" : "OpenWhisper"}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{turn.text}</p>
                </li>
              ))}
            </ol>
          ) : null}
          <label className="block text-sm">
            <span className="sr-only">打一行字</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="打一行字" rows={3} className="field" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" disabled={busy} onClick={sendDraft}>
              送出
            </Button>
            <Button variant="ghost" type="button" disabled={busy} aria-pressed={recording} onPointerDown={(event) => void beginTalk(event)} onPointerUp={() => void endTalk()} onPointerCancel={() => void endTalk()}>
              {recording ? "放開送出" : "按住說話"}
            </Button>
          </div>
        </section>
      ) : null}
      {selected === "slip" ? (
        <AgentPanel
          open
          busy={busy}
          transcript={slipTranscript}
          proposal={pending ? { tool: pending.tool, summary: pending.summary } : null}
          onAsk={onAsk}
          onConfirm={() => void onConfirm()}
          onDismiss={() => setPending(dismiss(pending))}
        />
      ) : null}
    </aside>
  );
}
