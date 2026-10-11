"use client";

import { useState, type FormEvent } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { EmptyState } from "./EmptyState";
import { DOCS_URL, EVENT_LABEL, type Integrations } from "@/lib/integrations";

const field = "mt-1 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream";

function when(value: string | null, empty = "還沒用過") {
  if (!value) return empty;
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function OnceSecret({ title, secret, onDone }: { title: string; secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass-chip space-y-2 p-4 text-sm" role="status">
      <p>{title}</p>
      <code className="block break-all rounded-lg bg-ink px-3 py-2 text-teal select-all">{secret}</code>
      <p className="text-xs text-cream-dim">只會出現這一次。關掉之後我們也看不到，弄丟了就停用再開一把新的。</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="glass-pill px-3 py-1 text-xs"
          onClick={() => navigator.clipboard?.writeText(secret).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "已複製" : "複製"}
        </button>
        <button type="button" className="glass-pill px-3 py-1 text-xs" onClick={onDone}>
          我存好了
        </button>
      </div>
    </div>
  );
}

/** Keys for other systems to read and write, and webhooks that tell them when something happens. `live` false is the 示範 view: nothing is sent. */
export function ApiBoard({ data, live }: { data: Integrations; live: boolean }) {
  const action = useLiveAction();
  const [keyForm, setKeyForm] = useState({ label: "", write: false });
  const [hookForm, setHookForm] = useState({ url: "", label: "", events: ["sales_order.submitted"] as string[] });
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const disabled = !live || action.busy;
  const activeKeys = data.keys.filter((k) => !k.revoked_at);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    const r = await action.run("/api/integrations/keys", keyForm, () => `已新增金鑰「${keyForm.label}」。`);
    if (r?.ok && typeof r.secret === "string") {
      setSecret({ title: `「${keyForm.label}」的 API 金鑰`, value: r.secret });
      setKeyForm({ label: "", write: false });
    }
  }

  async function createHook(event: FormEvent) {
    event.preventDefault();
    const r = await action.run("/api/integrations/webhooks", hookForm, () => "已新增 Webhook。");
    if (r?.ok && typeof r.secret === "string") {
      setSecret({ title: "Webhook 簽章密鑰（用來驗證通知真的是 DropOut 發的）", value: r.secret });
      setHookForm({ url: "", label: "", events: ["sales_order.submitted"] });
    }
  }

  const toggleEvent = (e: string) =>
    setHookForm((f) => ({ ...f, events: f.events.includes(e) ? f.events.filter((x) => x !== e) : [...f.events, e] }));

  return (
    <div className="space-y-5">
      {!live ? <p className="glass-chip px-4 py-2 text-xs text-cream-dim">示範：下面是範例金鑰和 Webhook，按鈕不會送出。接上系統同步之後，這裡就是你們公司真的設定。</p> : null}
      <ActionOutcomeNote outcome={action.outcome} />
      {secret ? <OnceSecret title={secret.title} secret={secret.value} onDone={() => setSecret(null)} /> : null}

      <section className="glass space-y-4 p-5">
        <div>
          <h3 className="text-sm">API 金鑰</h3>
          <p className="mt-1 text-xs text-cream-dim">
            給蝦皮／momo 的串接程式、會計師、你們自己的 App 或 Zapier、n8n、Make 用。網址：<code className="text-cream">{data.apiBase}</code>
            ；用法看{" "}
            <a href={DOCS_URL} target="_blank" rel="noreferrer" className="text-teal">
              API 說明
            </a>
            。
          </p>
        </div>
        {data.keys.length ? (
          <ul className="space-y-2">
            {data.keys.map((k) => (
              <li key={k.id} className={`glass-chip flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${k.revoked_at ? "opacity-50" : ""}`}>
                <span>
                  {k.label} <code className="text-xs text-cream-dim">{k.display}</code>
                  <span className="block text-xs text-cream-dim">
                    {k.scopes.includes("write") ? "可以讀和寫" : "只能讀"} · {k.created_by} 開的 · 最近使用 {when(k.last_used_at)}
                    {k.revoked_at ? ` · ${when(k.revoked_at)} 停用` : ""}
                  </span>
                </span>
                {!k.revoked_at ? (
                  <button
                    type="button"
                    disabled={disabled}
                    className="glass-pill px-3 py-1 text-xs disabled:opacity-40"
                    onClick={() => {
                      if (confirm(`停用「${k.label}」？用這把金鑰的系統會馬上讀不到。`)) action.run("/api/integrations/keys/revoke", { id: k.id }, () => `「${k.label}」已停用。`);
                    }}
                  >
                    停用
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="還沒有金鑰" detail="要讓蝦皮、會計師或自己的程式讀寫資料時，在下面開一把，只給它需要的權限。" help="module-api" />
        )}
        <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-cream-dim">給誰用</span>
            <input required maxLength={80} value={keyForm.label} onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} placeholder="蝦皮同步" className={`${field} w-48`} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={keyForm.write} onChange={(e) => setKeyForm({ ...keyForm, write: e.target.checked })} />
            也可以新增客戶和潛在客人
          </label>
          <button type="submit" disabled={disabled || activeKeys.length >= data.maxKeys} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
            {action.busy ? "處理中…" : "開一把金鑰"}
          </button>
          <p className="w-full text-xs text-cream-dim">
            最多 {data.maxKeys} 把有效金鑰，每把每分鐘 120 次。只能看的公司（合約到期、暫停）金鑰還能讀，不能寫。
          </p>
        </form>
      </section>

      <section className="glass space-y-4 p-5">
        <div>
          <h3 className="text-sm">Webhook：有事發生就通知別的系統</h3>
          <p className="mt-1 text-xs text-cream-dim">
            我們會 POST 到你填的網址，標頭 <code className="text-cream">X-DropOut-Signature</code> 帶簽章。送不到會自動重試；連續 20 次送不到就先停用，這裡會寫原因。
          </p>
        </div>
        {data.webhooks.length ? (
          <ul className="space-y-2">
            {data.webhooks.map((h) => (
              <li key={h.id} className={`glass-chip space-y-2 p-3 text-sm ${h.enabled ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {h.label} {h.enabled ? null : <span className="text-orange">· 已停用</span>}
                    <span className="block break-all text-xs text-cream-dim">{h.url}</span>
                    <span className="block text-xs text-cream-dim">{h.events.map((e) => EVENT_LABEL[e] ?? e).join("、")}</span>
                    {h.disabled_reason ? <span className="block text-xs text-orange">{h.disabled_reason}</span> : null}
                    <span className="block text-xs text-cream-dim">
                      最近送到 {when(h.last_success_at, "還沒有")}
                      {h.failures ? ` · 連續失敗 ${h.failures} 次` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" disabled={disabled} className="glass-pill px-3 py-1 text-xs disabled:opacity-40" onClick={() => action.run("/api/integrations/webhooks/test", { id: h.id }, (r) => `測試送到了（HTTP ${String(r.status)}）。`)}>
                      送測試
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      className="glass-pill px-3 py-1 text-xs disabled:opacity-40"
                      onClick={() => action.run("/api/integrations/webhooks/enable", { id: h.id, enabled: !h.enabled }, () => (h.enabled ? "已停用。" : "已重新啟用，失敗次數歸零。"))}
                    >
                      {h.enabled ? "停用" : "重新啟用"}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      className="glass-pill px-3 py-1 text-xs disabled:opacity-40"
                      onClick={() => {
                        if (confirm(`刪掉「${h.label}」？`)) action.run("/api/integrations/webhooks/delete", { id: h.id }, () => "已刪除。");
                      }}
                    >
                      刪除
                    </button>
                    <button type="button" className="glass-pill px-3 py-1 text-xs" onClick={() => setOpen(open === h.id ? null : h.id)}>
                      {open === h.id ? "收起紀錄" : "送出紀錄"}
                    </button>
                  </span>
                </div>
                {open === h.id ? (
                  (data.deliveries[h.id] ?? []).length ? (
                    <ul className="space-y-1 text-xs">
                      {(data.deliveries[h.id] ?? []).map((d) => (
                        <li key={d.id} className="flex flex-wrap gap-x-3">
                          <span className="text-cream-dim">{when(d.created_at)}</span>
                          <span>{EVENT_LABEL[d.event_type] ?? d.event_type}</span>
                          <span className={d.ok ? "text-teal" : "text-orange"}>{d.ok ? `送到了 ${d.status}` : d.error}</span>
                          {d.attempt > 1 ? <span className="text-cream-dim">第 {d.attempt} 次</span> : null}
                          {d.duration_ms != null ? <span className="text-cream-dim">{d.duration_ms} ms</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-cream-dim">還沒送過。</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="還沒有 Webhook" detail="想在有新訂單、收到錢時通知 LINE 群組或 Zapier，就在下面加一個網址。" help="module-api" />
        )}
        <form onSubmit={createHook} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs text-cream-dim">網址（https）</span>
              <input required type="url" pattern="https://.*" value={hookForm.url} onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })} placeholder="https://hooks.zapier.com/…" className={`${field} w-80 max-w-full`} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-cream-dim">名字（選填）</span>
              <input maxLength={80} value={hookForm.label} onChange={(e) => setHookForm({ ...hookForm, label: e.target.value })} placeholder="Zapier" className={`${field} w-40`} />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-xs text-cream-dim">什麼時候通知</legend>
            {data.events.map((e) => (
              <label key={e} className="flex items-center gap-1.5">
                <input type="checkbox" checked={hookForm.events.includes(e)} onChange={() => toggleEvent(e)} />
                {EVENT_LABEL[e] ?? e}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={disabled || !hookForm.events.length || data.webhooks.length >= data.maxWebhooks} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
            {action.busy ? "處理中…" : "新增 Webhook"}
          </button>
          <p className="text-xs text-cream-dim">最多 {data.maxWebhooks} 個。不能填公司內部網路或本機位址。</p>
        </form>
      </section>
    </div>
  );
}
