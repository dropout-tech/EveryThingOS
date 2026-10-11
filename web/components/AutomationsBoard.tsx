"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionNote } from "./ActionNote";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { useConfirm } from "./ui/ConfirmDialog";
import { Drawer } from "./ui/Drawer";
import { Field } from "./ui/Field";
import { demoKey, useDemoState } from "@/lib/demo-state";
import {
  initialRules,
  preview,
  RUN_STATUS,
  simulateRun,
  TEMPLATES,
  templateFor,
  validateParams,
  type AutomationFacts,
  type Automations,
  type Hit,
  type Params,
  type RuleId,
  type RuleState,
  type RunRow,
  type Template,
} from "@/lib/automations";

type Props = {
  packId: string;
  /** Live data from the glue, or null for the demo (state kept in this browser tab). */
  live: Automations | null;
  facts: AutomationFacts | null;
  stockOn: boolean;
  readOnly?: string | null;
};

type Preview = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; hits: Hit[] };

const SHOWN = 3;

function when(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function sentence(t: Template, p: Params) {
  return `當${t.when(p)}，就${t.then(p)}。`;
}

async function fetchDryRun(rule: RuleId, params: Params): Promise<Preview> {
  try {
    const res = await fetch("/api/automations/dry-run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rule, params }) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; hits?: Hit[]; message?: string };
    if (!res.ok || !body.ok) return { state: "error", message: body.message ?? `回應 ${res.status}` };
    return { state: "ready", hits: body.hits ?? [] };
  } catch {
    return { state: "error", message: "連不到 DropOut OS" };
  }
}

export function AutomationsBoard({ packId, live, facts, stockOn, readOnly }: Props) {
  const action = useLiveAction();
  const [confirm, confirmDialog] = useConfirm();
  const initial = useMemo(() => ({ rules: initialRules(), runs: [] as RunRow[] }), []);
  const [demo, setDemo] = useDemoState(demoKey("automations", packId), initial);
  const rules = live ? live.rules : demo.rules;
  const runs = live ? live.runs : demo.runs;
  const [note, setNote] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<RuleId, Preview>>>({});
  const [editing, setEditing] = useState<RuleId | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const ruleFor = (id: RuleId): RuleState => rules.find((r) => r.rule === id) ?? initialRules().find((r) => r.rule === id)!;
  const usable = (t: Template) => !t.needsStock || stockOn;

  const liveKey = live ? live.rules.map((r) => `${r.rule}:${JSON.stringify(r.params)}`).join("|") : "";
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    for (const t of TEMPLATES) {
      if (!usable(t)) continue;
      const params = live.rules.find((r) => r.rule === t.id)?.params ?? {};
      fetchDryRun(t.id, params).then((p) => {
        if (!cancelled) setPreviews((current) => ({ ...current, [t.id]: p }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the saved rules change
  }, [liveKey]);

  function previewFor(id: RuleId, params: Params): Preview {
    if (facts) return { state: "ready", hits: preview(id, facts, params) };
    return previews[id] ?? { state: "loading" };
  }

  async function toggle(t: Template) {
    const r = ruleFor(t.id);
    const enabling = !r.enabled;
    const checked = validateParams(t.id, r.params, { enabling });
    if ("error" in checked) {
      setEditError(checked.error);
      setEditing(t.id);
      return;
    }
    if (enabling && t.id === "invoice_overdue" && r.params.email && live) {
      const ok = await confirm({ title: "打開後會寄信給客人", body: `發票逾期 ${r.params.days} 天、客人有 Email 的，每張發票寄一次提醒。之後隨時可以關掉。`, confirmLabel: "打開" });
      if (!ok) return;
    }
    if (live) {
      action.run("/api/automations/rule", { rule: t.id, enabled: enabling, params: checked.params }, (res) => String(res.message ?? (enabling ? "已打開" : "已關掉")));
      return;
    }
    setDemo((current) => ({ ...current, rules: current.rules.map((x) => (x.rule === t.id ? { ...x, enabled: enabling, params: checked.params, updatedAt: new Date().toISOString(), updatedBy: "你（示範）" } : x)) }));
    setNote(enabling ? `示範：「${t.title}」打開了。按「跑一次看看」看它會做什麼。` : `示範：「${t.title}」關掉了。`);
  }

  function save(id: RuleId, params: Params) {
    const r = ruleFor(id);
    const checked = validateParams(id, params, { enabling: r.enabled });
    if ("error" in checked) return checked.error;
    if (live) {
      action.run("/api/automations/rule", { rule: id, params: checked.params }, (res) => String(res.message ?? "已存好"));
    } else {
      setDemo((current) => ({ ...current, rules: current.rules.map((x) => (x.rule === id ? { ...x, params: checked.params, updatedAt: new Date().toISOString(), updatedBy: "你（示範）" } : x)) }));
      setNote("示範：設定存好了，只存在這個分頁。");
    }
    setEditing(null);
    return null;
  }

  function runDemo() {
    if (!facts) return;
    const before = demo.runs.length;
    const next = simulateRun(demo.rules, facts, demo.runs);
    setDemo((current) => ({ ...current, runs: next }));
    const added = next.length - before;
    if (!demo.rules.some((r) => r.enabled)) setNote("示範：還沒有打開任何規則。先打開一條再跑。");
    else setNote(added ? `示範：做了 ${added} 件事，寫在下面「最近做了什麼」。再按一次不會重複做。` : "示範：今天該做的都做過了，不會重複寄或重複開單。");
  }

  const enabledCount = rules.filter((r) => r.enabled).length;
  const todayCount = TEMPLATES.filter(usable).reduce((sum, t) => {
    const p = previewFor(t.id, ruleFor(t.id).params);
    return sum + (ruleFor(t.id).enabled && p.state === "ready" ? p.hits.filter((h) => !h.doneBefore).length : 0);
  }, 0);
  const editingTemplate = editing ? templateFor(editing) : null;

  return (
    <div className="space-y-6">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      {confirmDialog}

      <section className="glass glass-hero flex flex-wrap items-center justify-between gap-4 p-5 md:p-6" aria-label="現在的狀況">
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-medium">{enabledCount ? `開著 ${enabledCount} 條規則` : "還沒有打開任何規則"}</p>
          <p className="text-sm text-cream-dim">
            {enabledCount ? (todayCount ? `今天還有 ${todayCount} 件會自動處理。` : "今天沒有要追的事。") : "先看每張卡片「今天會碰到」幾件，覺得對再打開。"}
            {live ? " 系統每天早上 8 點後看一次（大訂單每小時），同一件事不會做兩次。" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? <Badge tone="readonly" /> : null}
          {facts ? (
            <Button variant="primary" onClick={runDemo}>
              跑一次看看
            </Button>
          ) : null}
        </div>
      </section>

      {live && !live.mail ? (
        <p className="text-sm text-warn" role="status">
          還沒設定寄件信箱，所以「發票逾期提醒」只會給業務待辦、不會寄信給客人。請導入顧問幫忙接好寄信。
        </p>
      ) : null}
      {readOnly ? (
        <p className="text-sm text-warn" role="status">
          {readOnly} 自動化先暫停，設定也不能改。
        </p>
      ) : null}

      <section className="space-y-3" aria-labelledby="automation-gallery">
        <h2 id="automation-gallery" className="section-title">
          可以交給系統的事
        </h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {TEMPLATES.map((t) => {
            const r = ruleFor(t.id);
            const ok = usable(t);
            const p = ok ? previewFor(t.id, r.params) : null;
            return (
              <li key={t.id} className="card flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">{t.title}</h3>
                  <Badge tone={r.enabled ? "ok" : "neutral"}>{r.enabled ? "開著" : "關著"}</Badge>
                </div>
                <p className="text-base">{sentence(t, r.params)}</p>
                <p className="text-xs text-cream-dim">
                  {t.cadence}。{t.touches}。
                </p>
                {!ok ? (
                  <p className="text-sm text-cream-dim">這家公司沒有管庫存，用不到這條。</p>
                ) : (
                  <HitList preview={p!} />
                )}
                {live && r.lastError ? (
                  <p className="text-xs text-warn" role="status">
                    上次檢查沒成功：{r.lastError}。下一輪會再試。
                  </p>
                ) : live && r.lastEvaluatedAt ? (
                  <p className="text-xs text-cream-dim">上次檢查 {when(r.lastEvaluatedAt)}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="secondary" size="sm" disabled={!ok || Boolean(readOnly) || action.busy} onClick={() => toggle(t)} aria-label={`${r.enabled ? "關掉" : "打開"}「${t.title}」`}>
                    {r.enabled ? "關掉" : "打開"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={!ok} onClick={() => (setEditError(null), setEditing(t.id))} aria-label={`改「${t.title}」的設定，試跑`}>
                    改設定、試跑
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <RunHistory runs={runs} live={Boolean(live)} />

      <Drawer open={Boolean(editingTemplate)} title={editingTemplate?.title ?? ""} onClose={() => setEditing(null)}>
        {editingTemplate ? (
          <RuleEditor
            key={editingTemplate.id}
            template={editingTemplate}
            rule={ruleFor(editingTemplate.id)}
            facts={facts}
            readOnly={Boolean(readOnly)}
            busy={action.busy}
            onSave={(params) => save(editingTemplate.id, params)}
            onCancel={() => setEditing(null)}
            initialError={editError}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function HitList({ preview: p, all = false }: { preview: Preview; all?: boolean }) {
  if (p.state === "loading")
    return (
      <p className="text-sm text-cream-dim" aria-busy="true">
        正在看 ERPNext 今天的單據…
      </p>
    );
  if (p.state === "error")
    return (
      <p className="text-sm text-warn" role="status">
        看不到今天的情況：{p.message}
      </p>
    );
  const fresh = p.hits.filter((h) => !h.doneBefore);
  const done = p.hits.length - fresh.length;
  if (!p.hits.length) return <p className="text-sm text-cream-dim">今天沒有碰到的。</p>;
  const shown = all ? p.hits : fresh.slice(0, SHOWN);
  return (
    <div className="glass-well space-y-2 p-3 text-sm">
      <p className="font-medium">
        {fresh.length ? `今天會碰到 ${fresh.length} 件` : "今天的都做過了"}
        {done ? <span className="ml-1 font-normal text-cream-dim">（另有 {done} 件做過了，不會重複）</span> : null}
      </p>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((h) => (
            <li key={`${h.target}-${h.day}`} className="min-w-0">
              <p className="break-words">
                {h.title}
                {h.doneBefore ? <span className="ml-2 text-xs text-cream-dim">做過了</span> : null}
              </p>
              <p className="text-xs break-words text-cream-dim">
                {h.detail}
                {h.actions.length ? ` → ${h.actions.join("、")}` : " → 沒有負責人，不會做任何事"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {!all && fresh.length > SHOWN ? <p className="text-xs text-cream-dim">還有 {fresh.length - SHOWN} 件，按「改設定、試跑」看全部。</p> : null}
    </div>
  );
}

function RuleEditor({
  template,
  rule,
  facts,
  readOnly,
  busy,
  onSave,
  onCancel,
  initialError,
}: {
  template: Template;
  rule: RuleState;
  facts: AutomationFacts | null;
  readOnly: boolean;
  busy: boolean;
  onSave: (params: Params) => string | null;
  onCancel: () => void;
  initialError: string | null;
}) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => Object.fromEntries(template.params.map((d) => [d.key, d.kind === "bool" ? Boolean(rule.params[d.key]) : String(rule.params[d.key] ?? "")])));
  const [error, setError] = useState<string | null>(initialError);
  const [tried, setTried] = useState<Preview | null>(null);
  const [trying, setTrying] = useState(false);

  const params: Params = Object.fromEntries(template.params.map((d) => [d.key, d.kind === "int" ? Number(draft[d.key]) : draft[d.key]]));
  const checked = validateParams(template.id, params);
  const shownError = error ?? ("error" in checked ? checked.error : null);

  async function dry() {
    if ("error" in checked) return setError(checked.error);
    setError(null);
    if (facts) return setTried({ state: "ready", hits: preview(template.id, facts, checked.params) });
    setTrying(true);
    setTried({ state: "loading" });
    setTried(await fetchDryRun(template.id, checked.params));
    setTrying(false);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(onSave(params));
      }}
    >
      <p className="text-base">{"error" in checked ? sentence(template, rule.params) : sentence(template, checked.params)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {template.params.map((d) =>
          d.kind === "bool" ? (
            <label key={d.key} className="flex min-h-[var(--ui-tap)] items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" className="size-5" checked={Boolean(draft[d.key])} onChange={(e) => setDraft((x) => ({ ...x, [d.key]: e.target.checked }))} />
              {d.label}
            </label>
          ) : (
            <Field key={d.key} label={d.kind === "int" ? `${d.label}（${d.unit}）` : d.label} hint={d.kind === "user" ? d.hint : `${d.min.toLocaleString("en-US")}–${d.max.toLocaleString("en-US")}`}>
              {d.kind === "int" ? (
                <input className="field" type="number" inputMode="numeric" min={d.min} max={d.max} step={d.step ?? 1} value={String(draft[d.key])} onChange={(e) => (setError(null), setDraft((x) => ({ ...x, [d.key]: e.target.value })))} />
              ) : (
                <input className="field" type="email" autoComplete="off" placeholder="boss@example.tw" maxLength={140} value={String(draft[d.key])} onChange={(e) => (setError(null), setDraft((x) => ({ ...x, [d.key]: e.target.value })))} />
              )}
            </Field>
          ),
        )}
      </div>
      {shownError ? (
        <p className="field-error" role="alert">
          {shownError}
        </p>
      ) : null}
      <p className="text-xs text-cream-dim">
        {template.cadence}。{template.touches}。
      </p>
      <div className="space-y-2">
        <Button variant="secondary" size="sm" onClick={dry} pending={trying} pendingLabel="試跑中…">
          試跑：看今天會碰到哪些
        </Button>
        <p className="text-xs text-cream-dim">試跑只看不做：不寄信、不開單、不給待辦。</p>
        {tried ? <HitList preview={tried} all /> : null}
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={readOnly || busy || "error" in checked}>
          存好
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}

function RunHistory({ runs, live }: { runs: RunRow[]; live: boolean }) {
  return (
    <section className="space-y-3" aria-labelledby="automation-runs">
      <h2 id="automation-runs" className="section-title">
        最近做了什麼
      </h2>
      {runs.length ? (
        <div className="glass">
          <div className="sm:overflow-x-auto">
            <table className="table-stack sm:min-w-[40rem]">
              <thead>
                <tr>
                  <th scope="col">對象</th>
                  <th scope="col">規則</th>
                  <th scope="col">結果</th>
                  <th scope="col">狀態</th>
                  <th scope="col">時間</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td data-primary="">
                      <span className="break-words">{r.title}</span>
                      <span className="block text-xs text-cream-dim">{r.detail}</span>
                    </td>
                    <td data-label="規則">{templateFor(r.rule).title}</td>
                    <td data-label="結果">{r.status === "failed" ? <span className="text-danger">{r.error ?? "沒做成"}</span> : (r.result ?? "等一下就做")}</td>
                    <td data-label="狀態">
                      <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
                    </td>
                    <td data-label="時間" className="whitespace-nowrap">
                      {when(r.finishedAt ?? r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="glass-well p-4 text-sm text-cream-dim">{live ? "還沒有跑過。打開一條規則，明天早上 8 點後就會開始。" : "還沒有跑過。打開一條規則，再按上面的「跑一次看看」。"}</p>
      )}
      {runs.some((r) => r.status === "failed") ? <p className="text-xs text-cream-dim">沒做成的會留在設定的「同步沒送到」，看原因後可以重送。</p> : null}
    </section>
  );
}
