"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { EmptyState } from "./EmptyState";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { HEALTH_TONE, ProgressBar, marginTone, useLogHash } from "./ProjectsBoard";
import { TimeEntryDrawer } from "./TimeEntryDrawer";
import { useProjects } from "./useProjects";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Button, buttonClass } from "./ui/Button";
import { Money } from "./ui/Money";
import { demoKey, peekDemoState, writeDemoState } from "@/lib/demo-state";
import type { SalesDoc } from "@/lib/erp";
import { formatTwd } from "@/lib/format";
import { HEALTH_LABEL, STATUS_LABEL, TASK_COLUMNS, addDemoLog, addDemoTask, billDemoLogs, demoSalesDoc, formatHours, moveDemoTask, projectMetrics, shortDate, teamHours, type ProjectTask, type ProjectsData, type TaskStatus, type TimeLog } from "@/lib/projects";

const MOVES: Record<TaskStatus, { to: TaskStatus; label: string }[]> = {
  todo: [
    { to: "doing", label: "開始做" },
    { to: "done", label: "完成" },
  ],
  doing: [
    { to: "done", label: "完成" },
    { to: "todo", label: "退回待辦" },
  ],
  done: [{ to: "doing", label: "重新打開" }],
};

const LOG_PAGE = 15;

const COLUMN_LABEL = Object.fromEntries(TASK_COLUMNS.map((c) => [c.id, c.label])) as Record<TaskStatus, string>;

function logState(l: TimeLog) {
  if (l.invoice) return { label: `已請款 ${l.invoice}`, tone: "ok" as const };
  if (!l.billable) return { label: "不請款", tone: "neutral" as const };
  if (!l.submitted) return { label: "草稿", tone: "warn" as const };
  return { label: "可請款", tone: "neutral" as const };
}

export function ProjectDetail({ data, live, demoId, packId, id, deskUrl }: { data: ProjectsData; live: boolean; demoId: string; packId: string; id: string; deskUrl?: string }) {
  const action = useLiveAction();
  const [state, setState] = useProjects(data, live, demoId);
  const [note, setNote] = useState<string | null>(null);
  const [logOpen, , closeLog] = useLogHash();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceKey, setInvoiceKey] = useState(0);
  const [subject, setSubject] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [shown, setShown] = useState(LOG_PAGE);
  const project = state.projects.find((p) => p.id === id);

  if (!project) {
    return <EmptyState title="找不到這個專案" detail={live ? "可能已經取消，或你的 ERPNext 角色看不到它。" : "示範資料換了一組，回專案列表重新選一個。"} action={{ href: "/workspace/projects", label: "回到全部專案" }} />;
  }

  const m = projectMetrics(project, state.tasks, state.logs, data.today);
  const tasks = state.tasks.filter((t) => t.project === project.id);
  const logs = state.logs.filter((l) => l.project === project.id);
  const team = teamHours(logs);
  const taskName = new Map(tasks.map((t) => [t.id, t.subject]));
  const burnTone = m.burnPct !== null && m.burnPct > 100 ? "danger" : m.health === "watch" ? "warn" : undefined;

  async function move(task: ProjectTask, to: TaskStatus) {
    if (!live) {
      setState((s) => moveDemoTask(s, task.id, to));
      setNote(`練習：「${task.subject}」改成${COLUMN_LABEL[to]}，沒有送出。`);
      return;
    }
    setPending(task.id);
    await action.run("/api/projects/task/status", { name: task.id, status: to }, () => `「${task.subject}」改成${COLUMN_LABEL[to]}。`);
    setPending(null);
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = subject.trim();
    if (!text) {
      setSubjectError("請填工作項目，例如「水電配管」。");
      return;
    }
    if (text.length > 140) {
      setSubjectError("最多 140 個字。");
      return;
    }
    setSubjectError(null);
    if (!live) {
      setState((s) => addDemoTask(s, project!.id, text));
      setSubject("");
      setNote(`練習：加了「${text}」，沒有送出。`);
      return;
    }
    const done = await action.run("/api/projects/task", { project: project!.id, subject: text }, () => `加了「${text}」。`);
    if (done?.ok) setSubject("");
  }

  function billDemo(ids: string[]) {
    const result = billDemoLogs(state, project!.id, ids, data.today);
    if (!result) return;
    setState(result.state);
    const { invoice } = result;
    const doc = demoSalesDoc(invoice, project!.name);
    writeDemoState(demoKey("inbox", packId), [doc, ...peekDemoState<SalesDoc[]>(demoKey("inbox", packId), [])]);
    setNote(`練習：已開 ${invoice.no}，${formatHours(invoice.hours)}，含稅 ${formatTwd(invoice.net + invoice.tax)}。到「銷售」的「請他付錢」看這張。`);
  }

  return (
    <div className="space-y-6">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />

      <section className="glass glass-hero space-y-4 p-5 md:p-6" aria-label="這案賺不賺">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={HEALTH_TONE[m.health]}>{HEALTH_LABEL[m.health]}</Badge>
          {project.status !== "active" ? <Badge>{STATUS_LABEL[project.status]}</Badge> : null}
          <span className="text-cream-dim">
            {project.customer ?? "還沒填客人"}
            {project.due ? ` · 截止 ${shortDate(project.due, data.today)}` : ""}
          </span>
        </div>
        {m.reasons.length ? (
          <ul className="space-y-1 text-sm">
            {m.reasons.map((r) => (
              <li key={r} className={m.health === "over" ? "text-danger" : "text-warn"}>
                {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">成本、進度、截止日都在掌握中。</p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs text-cream-dim">合約金額</dt>
            <dd className="mt-0.5 text-lg">{project.contract > 0 ? <Money amount={project.contract} /> : <span className="text-cream-dim">沒填</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-cream-dim">到目前的成本</dt>
            <dd className="mt-0.5 text-lg">
              <Money amount={m.cost} tone={burnTone === "danger" ? "danger" : "none"} />
            </dd>
            <dd className="text-xs text-cream-dim">
              工時 {formatTwd(m.labor)}
              {project.otherCost ? `＋採購材料 ${formatTwd(project.otherCost)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-cream-dim">已請款</dt>
            <dd className="mt-0.5 text-lg">
              <Money amount={m.billed} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-cream-dim">做了還沒請款</dt>
            <dd className="mt-0.5 text-lg">
              <Money amount={m.unbilledAmount} tone={m.unbilledAmount > 0 ? "warn" : "none"} />
            </dd>
            <dd className="text-xs text-cream-dim">{formatHours(m.unbilledHours)}</dd>
          </div>
          <div>
            <dt className="text-xs text-cream-dim">毛利（照合約）</dt>
            <dd className={`mt-0.5 text-lg num ${marginTone(m) === "danger" ? "text-danger" : marginTone(m) === "warn" ? "text-warn" : ""}`}>{m.marginPct === null ? "—" : `${m.marginPct}%`}</dd>
            <dd className="text-xs text-cream-dim">
              <Money amount={m.margin} />
            </dd>
          </div>
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="flex justify-between text-xs text-cream-dim">
              <span>預算用了</span>
              <span className="num">{m.burnPct === null ? "沒填預算" : `${m.burnPct}%`}</span>
            </p>
            <ProgressBar label="預算用了多少" value={m.burnPct ?? 0} tone={burnTone} />
            {project.costBudget > 0 ? <p className="text-xs text-cream-dim">預估成本 {formatTwd(project.costBudget)}</p> : null}
          </div>
          <div className="space-y-1">
            <p className="flex justify-between text-xs text-cream-dim">
              <span>進度</span>
              <span className="num">{m.progress.total ? `${m.progress.done}／${m.progress.total} 項` : `${m.progress.pct}%`}</span>
            </p>
            <ProgressBar label="完成了多少" value={m.progress.pct} />
            <p className="text-xs text-cream-dim">一共記了 {formatHours(m.hours)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => {
              setInvoiceKey((k) => k + 1);
              setInvoiceOpen(true);
            }} disabled={!m.unbilledHours} aria-haspopup="dialog">
            {m.unbilledHours ? `開成發票（${formatHours(m.unbilledHours)}）` : "沒有要請款的工時"}
          </Button>
          {project.href ? (
            <DeskLink href={project.href} className={buttonClass({ variant: "ghost" })}>
              在 ERPNext 打開
            </DeskLink>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="tasks-title" className="space-y-3">
        <div className="section-head">
          <h2 id="tasks-title" className="section-title scene-type">
            工作項目
          </h2>
          <span className="text-xs text-cream-dim">按按鈕換欄位</span>
        </div>
        {data.denied?.includes("工作項目") ? (
          <p className="text-sm text-cream-dim">你的 ERPNext 角色看不到工作項目。</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {TASK_COLUMNS.map((column) => {
              const items = tasks.filter((t) => t.status === column.id);
              return (
                <section key={column.id} className="glass-well p-3" aria-label={`${column.label}（${items.length}）`}>
                  <h3 className="flex items-center justify-between gap-2 text-sm font-medium">
                    {column.label}
                    <span className="badge-count">{items.length}</span>
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {items.length ? (
                      items.map((t) => (
                        <li key={t.id} className="glass-chip space-y-2 p-3">
                          <p className="text-sm">
                            {t.href ? (
                              <DeskLink href={t.href} className="hover:underline">
                                {t.subject}
                              </DeskLink>
                            ) : (
                              t.subject
                            )}
                          </p>
                          {t.due ? <p className={`text-xs ${t.status !== "done" && t.due < data.today ? "text-warn" : "text-cream-dim"}`}>預計 {shortDate(t.due, data.today)}</p> : null}
                          {data.can.tasks ? (
                            <div className="flex flex-wrap gap-2">
                              {MOVES[t.status].map((mv) => (
                                <Button key={mv.to} size="sm" variant="secondary" pending={pending === t.id && action.busy} disabled={action.busy} onClick={() => move(t, mv.to)}>
                                  {mv.label}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-cream-dim">這一欄沒有工作</li>
                    )}
                  </ul>
                  {column.id === "todo" && data.can.tasks ? (
                    <form onSubmit={addTask} noValidate className="mt-3 space-y-1" aria-label="加一項工作">
                      <div className="flex gap-2">
                        <label htmlFor="new-task" className="sr-only">
                          新的工作項目
                        </label>
                        <input
                          id="new-task"
                          className="field"
                          value={subject}
                          maxLength={140}
                          placeholder="加一項，例如：油漆"
                          aria-invalid={subjectError ? true : undefined}
                          aria-describedby={subjectError ? "new-task-error" : undefined}
                          onChange={(e) => setSubject(e.target.value)}
                        />
                        <Button type="submit" size="sm" variant="secondary" disabled={action.busy}>
                          加
                        </Button>
                      </div>
                      {subjectError ? (
                        <p id="new-task-error" className="field-error" role="alert">
                          {subjectError}
                        </p>
                      ) : null}
                    </form>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="team-title" className="space-y-3">
        <div className="section-head">
          <h2 id="team-title" className="section-title scene-type">
            誰花了幾小時
          </h2>
        </div>
        {team.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((row) => (
              <li key={row.person} className="glass-chip flex items-center gap-3 p-3 text-sm">
                <Avatar name={row.person} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.person}</span>
                  <span className="block text-xs text-cream-dim">可請款 {formatHours(row.billable)} · 成本 {formatTwd(row.cost)}</span>
                </span>
                <span className="num shrink-0 font-medium">{formatHours(row.hours)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">{data.denied?.includes("工時") ? "你的 ERPNext 角色看不到工時。" : "還沒有人記工時。按上面的「記工時」記第一筆。"}</p>
        )}
      </section>

      {logs.length ? (
        <section aria-labelledby="logs-title" className="space-y-3">
          <div className="section-head">
            <h2 id="logs-title" className="section-title scene-type">
              工時紀錄
            </h2>
            <span className="text-xs text-cream-dim">最近的在上面</span>
          </div>
          <div className="glass">
            <div className="sm:overflow-x-auto">
              <table className="table-stack sm:min-w-[44rem]">
                <thead>
                  <tr>
                    <th scope="col">日期</th>
                    <th scope="col">誰</th>
                    <th scope="col">做什麼</th>
                    <th scope="col" className="num" data-numeric="">
                      時數
                    </th>
                    <th scope="col">請款</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, shown).map((l) => {
                    const s = logState(l);
                    return (
                      <tr key={l.id}>
                        <td data-label="日期" data-primary="">
                          {l.href ? <DeskLink href={l.href}>{shortDate(l.date, data.today)}</DeskLink> : shortDate(l.date, data.today)}
                        </td>
                        <td data-label="誰">{l.person}</td>
                        <td data-label="做什麼">
                          {[l.activity, l.task ? taskName.get(l.task) : null].filter(Boolean).join("｜") || "—"}
                          {l.note ? <span className="block text-xs text-cream-dim">{l.note}</span> : null}
                        </td>
                        <td data-label="時數" className="num" data-numeric="">
                          {formatHours(l.hours)}
                        </td>
                        <td data-label="請款">
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {logs.length > shown ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-cream-dim">
              {shown < 60 ? (
                <Button size="sm" variant="secondary" onClick={() => setShown((n) => Math.min(60, n + LOG_PAGE))}>
                  再看 {Math.min(LOG_PAGE, logs.length - shown)} 筆
                </Button>
              ) : null}
              <span>
                列出 {shown}／{logs.length} 筆。
                {deskUrl ? (
                  <DeskLink href={`${deskUrl}/app/timesheet?parent_project=${encodeURIComponent(project.id)}`} className="ml-1 underline underline-offset-2">
                    到 ERPNext 看全部
                  </DeskLink>
                ) : null}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      <p>
        <Link href="/workspace/projects" className="text-sm text-cream-dim underline hover:text-cream">
          回到全部專案
        </Link>
      </p>

      <TimeEntryDrawer
        open={logOpen}
        onClose={closeLog}
        projects={state.projects.filter((p) => p.status === "active")}
        tasks={state.tasks}
        logs={state.logs}
        activities={data.activities}
        today={data.today}
        me={data.me}
        defaultProject={project.id}
        live={live}
        action={action}
        onDemoSave={(entry) => {
          setState((s) => addDemoLog(s, entry, data.me, data.activities));
          setNote(`練習：記好了 ${formatHours(entry.hours)}，沒有送出。`);
        }}
      />
      <InvoiceDrawer key={invoiceKey} open={invoiceOpen} onClose={() => setInvoiceOpen(false)} project={project} logs={state.logs} services={data.services} live={live} canInvoice={data.can.invoice} action={action} onDemoBill={billDemo} />
    </div>
  );
}
