"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionNote } from "./ActionNote";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { TimeEntryDrawer } from "./TimeEntryDrawer";
import { useProjects } from "./useProjects";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Money } from "./ui/Money";
import { SearchBox } from "./ui/SearchBox";
import { formatTwdShort } from "@/lib/format";
import { HEALTH_LABEL, STATUS_LABEL, addDemoLog, formatHours, projectMetrics, summarize, type Health, type ProjectMetrics, type ProjectsData } from "@/lib/projects";

export const HEALTH_TONE: Record<Health, BadgeTone> = { ok: "ok", watch: "warn", over: "danger" };
const HEALTH_RANK: Record<Health, number> = { over: 0, watch: 1, ok: 2 };

type Show = "active" | "attention" | "all";
const SHOWS: { id: Show; label: string }[] = [
  { id: "active", label: "進行中" },
  { id: "attention", label: "要注意" },
  { id: "all", label: "全部" },
];

type Sort = "attention" | "due" | "unbilled" | "margin";
const SORTS: { id: Sort; label: string }[] = [
  { id: "attention", label: "最需要注意的在前" },
  { id: "due", label: "截止日近的在前" },
  { id: "unbilled", label: "未請款多的在前" },
  { id: "margin", label: "毛利低的在前" },
];

/** Opens the 記工時 drawer when the page is reached with #log (the header button, or a link from elsewhere). */
export function useLogHash() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => setOpen(location.hash === "#log");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function close() {
    setOpen(false);
    if (location.hash === "#log") history.replaceState(null, "", location.pathname + location.search);
  }
  return [open, setOpen, close] as const;
}

export function ProgressBar({ label, value, tone }: { label: string; value: number; tone?: "warn" | "danger" }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, value)} aria-valuetext={`${value}%`} className="progress" data-tone={tone}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function marginTone(m: ProjectMetrics) {
  return m.marginPct === null ? undefined : m.margin < 0 ? "danger" : m.marginPct < 15 ? "warn" : undefined;
}

export function ProjectsBoard({ data, live, demoId }: { data: ProjectsData; live: boolean; demoId: string }) {
  const action = useLiveAction();
  const [state, setState] = useProjects(data, live, demoId);
  const [note, setNote] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("active");
  const [sort, setSort] = useState<Sort>("attention");
  const [query, setQuery] = useState("");
  const [logOpen, , closeLog] = useLogHash();
  const view = { ...data, ...state };
  const summary = summarize(view);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = state.projects.map((p) => ({ p, m: projectMetrics(p, state.tasks, state.logs, data.today) }));
    const shown = all.filter(({ p, m }) => {
      if (show === "active" && p.status !== "active") return false;
      if (show === "attention" && (p.status !== "active" || m.health === "ok")) return false;
      return !needle || `${p.name} ${p.customer ?? ""} ${p.id}`.toLowerCase().includes(needle);
    });
    const due = (d: string | null) => d ?? "9999";
    return shown.sort((a, b) => {
      if (sort === "due") return due(a.p.due).localeCompare(due(b.p.due));
      if (sort === "unbilled") return b.m.unbilledAmount - a.m.unbilledAmount;
      if (sort === "margin") return (a.m.marginPct ?? 999) - (b.m.marginPct ?? 999);
      return HEALTH_RANK[a.m.health] - HEALTH_RANK[b.m.health] || (a.m.marginPct ?? 999) - (b.m.marginPct ?? 999);
    });
  }, [state, data.today, show, sort, query]);

  const active = state.projects.filter((p) => p.status === "active");

  return (
    <div className="space-y-5">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />

      <ul className="kpi-grid" aria-label="專案摘要">
        <li className="kpi">
          <span className="kpi-label">進行中</span>
          <span className="kpi-value">{summary.active} 案</span>
          <span className="kpi-note" data-tone={summary.over ? "danger" : summary.watch ? "warn" : undefined}>
            {summary.over || summary.watch ? `${summary.over ? `${summary.over} 案超支` : ""}${summary.over && summary.watch ? "、" : ""}${summary.watch ? `${summary.watch} 案要注意` : ""}` : "都很順"}
          </span>
        </li>
        <li className="kpi">
          <span className="kpi-label">本月工時</span>
          <span className="kpi-value num">{formatHours(summary.monthHours)}</span>
          <span className="kpi-note">{data.today.slice(0, 7).replace("-", " 年 ")} 月</span>
        </li>
        <li className="kpi" data-tone={summary.unbilled > 0 ? "warn" : undefined}>
          <span className="kpi-label">做了還沒請款</span>
          <span className="kpi-value">{formatTwdShort(summary.unbilled)}</span>
          <span className="kpi-note">未稅，可以開成發票</span>
        </li>
        <li className="kpi">
          <span className="kpi-label">平均毛利</span>
          <span className="kpi-value num">{summary.avgMargin === null ? "—" : `${summary.avgMargin}%`}</span>
          <span className="kpi-note">進行中的案子，照合約算</span>
        </li>
      </ul>

      <div className="toolbar">
        <nav className="segmented" aria-label="顯示哪些專案">
          {SHOWS.map((s) => (
            <a
              key={s.id}
              href={`?show=${s.id}`}
              aria-current={show === s.id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setShow(s.id);
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <label className="sr-only" htmlFor="project-sort">
          排序
        </label>
        <select id="project-sort" className="field w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {state.projects.length > 4 ? <SearchBox label="找專案" placeholder="專案或客人" value={query} onChange={setQuery} /> : null}
      </div>

      {rows.length ? (
        <div className="glass">
          <div className="sm:overflow-x-auto">
            <table className="table-stack sm:min-w-[56rem]">
              <thead>
                <tr>
                  <th scope="col">專案</th>
                  <th scope="col">進度</th>
                  <th scope="col" className="num" data-numeric="">
                    合約金額
                  </th>
                  <th scope="col" className="num" data-numeric="">
                    成本
                  </th>
                  <th scope="col" className="num" data-numeric="">
                    已請款
                  </th>
                  <th scope="col" className="num" data-numeric="">
                    未請款
                  </th>
                  <th scope="col" className="num" data-numeric="">
                    毛利
                  </th>
                  <th scope="col">截止</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, m }) => (
                  <tr key={p.id}>
                    <td data-label="專案" data-primary="">
                      <Link href={`/workspace/projects/${encodeURIComponent(p.id)}`} className="font-medium underline decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-4">
                        {p.name}
                      </Link>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cream-dim">
                        <Badge tone={HEALTH_TONE[m.health]}>{HEALTH_LABEL[m.health]}</Badge>
                        {p.status !== "active" ? <Badge>{STATUS_LABEL[p.status]}</Badge> : null}
                        {p.customer ?? "還沒填客人"}
                      </span>
                      {m.reasons.length ? <span className="mt-1 block text-xs text-cream-dim">{m.reasons[0]}</span> : null}
                    </td>
                    <td data-label="進度">
                      <span className="block min-w-24">
                        <ProgressBar label={`${p.name} 進度`} value={m.progress.pct} />
                        <span className="mt-1 block text-xs text-cream-dim">{m.progress.total ? `完成 ${m.progress.done}／${m.progress.total} 項` : `${m.progress.pct}%`}</span>
                      </span>
                    </td>
                    <td data-label="合約金額" className="num" data-numeric="">
                      {p.contract > 0 ? <Money amount={p.contract} /> : <span className="text-cream-dim">沒填</span>}
                    </td>
                    <td data-label="成本" className="num" data-numeric="">
                      <Money amount={m.cost} tone={m.burnPct !== null && m.burnPct > 100 ? "danger" : "none"} />
                      {m.burnPct !== null ? <span className="block text-xs text-cream-dim">預算的 {m.burnPct}%</span> : null}
                    </td>
                    <td data-label="已請款" className="num" data-numeric="">
                      <Money amount={m.billed} />
                    </td>
                    <td data-label="未請款" className="num" data-numeric="">
                      {m.unbilledHours > 0 ? (
                        <>
                          <span className="block">{formatHours(m.unbilledHours)}</span>
                          <Money amount={m.unbilledAmount} className="block text-xs text-cream-dim" />
                        </>
                      ) : (
                        <span className="text-cream-dim">—</span>
                      )}
                    </td>
                    <td data-label="毛利" className="num" data-numeric="">
                      <span className={marginTone(m) === "danger" ? "text-danger" : marginTone(m) === "warn" ? "text-warn" : ""}>{m.marginPct === null ? "—" : `${m.marginPct}%`}</span>
                    </td>
                    <td data-label="截止">
                      {p.due ? <span className={m.overdueDays ? "text-warn" : ""}>{p.due.slice(5).replace("-", "/")}</span> : <span className="text-cream-dim">沒填</span>}
                      {m.overdueDays ? <span className="block text-xs text-warn">過了 {m.overdueDays} 天</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="glass-well p-4 text-sm text-cream-dim">{query ? "沒有符合的專案。" : show === "attention" ? "沒有要注意的案子，都很順。" : "這裡還沒有專案。"}</p>
      )}

      {data.truncated ? <p className="text-xs text-warn">工時筆數很多，這裡只算了最近的 2,000 筆；完整數字請看 ERPNext 的專案報表。</p> : null}

      <TimeEntryDrawer
        open={logOpen}
        onClose={closeLog}
        projects={active}
        tasks={state.tasks}
        logs={state.logs}
        activities={data.activities}
        today={data.today}
        me={data.me}
        live={live}
        action={action}
        onDemoSave={(entry) => {
          setState((s) => addDemoLog(s, entry, data.me, data.activities));
          const name = state.projects.find((p) => p.id === entry.project)?.name ?? "";
          setNote(`練習：記好了 ${name} ${formatHours(entry.hours)}，沒有送出。`);
        }}
      />
    </div>
  );
}
