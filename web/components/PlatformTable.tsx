"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { HEALTH_LABEL, HEALTH_TONE, ntd, STAGE_LABEL, STAGE_ORDER, STAGE_TONE, type HealthLevel } from "@/lib/platform-ui";
import type { Stage } from "@/lib/sources/config";

export type PlatformRow = {
  site: string;
  company: string;
  stage: Stage;
  ends: string | null;
  health: { score: number; level: HealthLevel; reasons: string[] } | null;
  open: number | null;
  einvoiceFailed: boolean;
  users: number | null;
  active: number | null;
  invoices: number | null;
  dataMb: number | null;
  usageError: boolean;
  backup: string | null;
  backupProblem: string | null;
  hosts: string[];
};

type SortKey = "risk" | "company" | "health" | "stage" | "ends" | "open" | "users" | "invoices" | "data";

const byStage = (a: PlatformRow, b: PlatformRow) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || (a.ends ?? "9").localeCompare(b.ends ?? "9");
const risk = (r: PlatformRow) => (r.stage === "cancelled" ? 1000 : (r.health?.score ?? 101));
const nums = (a: number | null, b: number | null) => (a ?? -1) - (b ?? -1);

const COMPARE: Record<SortKey, (a: PlatformRow, b: PlatformRow) => number> = {
  risk: (a, b) => risk(a) - risk(b) || byStage(a, b),
  company: (a, b) => a.company.localeCompare(b.company, "zh-Hant"),
  health: (a, b) => risk(a) - risk(b),
  stage: byStage,
  ends: (a, b) => (a.ends ?? "9").localeCompare(b.ends ?? "9"),
  open: (a, b) => nums(a.open, b.open),
  users: (a, b) => nums(a.users, b.users),
  invoices: (a, b) => nums(a.invoices, b.invoices),
  data: (a, b) => nums(a.dataMb, b.dataMb),
};

const COLUMNS: { key: SortKey | null; label: string; numeric?: boolean }[] = [
  { key: "company", label: "公司" },
  { key: "health", label: "健康度" },
  { key: "stage", label: "合約狀態" },
  { key: "ends", label: "到期" },
  { key: "open", label: "帳單" },
  { key: "users", label: "帳號／30 天活躍", numeric: true },
  { key: "invoices", label: "本月發票", numeric: true },
  { key: "data", label: "資料量", numeric: true },
  { key: null, label: "最近備份" },
  { key: null, label: "網址" },
];

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className="site-chip" data-tone={tone}>
      {children}
    </span>
  );
}

export function PlatformTable({ rows, initialSort = "risk" }: { rows: PlatformRow[]; initialSort?: SortKey }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [health, setHealth] = useState<HealthLevel | "none" | "">("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: initialSort === "ends" ? "stage" : initialSort, desc: false });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!stage || r.stage === stage) &&
        (!health || (health === "none" ? !r.health : r.health?.level === health)) &&
        (!q || [r.company, r.site, ...r.hosts].some((v) => v.toLowerCase().includes(q))),
    );
    const cmp = COMPARE[sort.key];
    return list.sort((a, b) => (sort.desc ? -cmp(a, b) : cmp(a, b)));
  }, [rows, query, stage, health, sort]);

  const stageCount = (s: Stage) => rows.filter((r) => r.stage === s).length;
  const healthCount = (h: HealthLevel) => rows.filter((r) => r.health?.level === h).length;
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: ["open", "users", "invoices", "data"].includes(key) }));

  return (
    <section className="site-sheet overflow-hidden" aria-labelledby="accounts-title">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--line)] p-4">
        <h2 id="accounts-title" className="mr-auto text-lg font-medium">
          公司
          <span className="ml-2 text-sm text-cream-dim">
            {shown.length === rows.length ? `${rows.length} 家` : `${shown.length}／${rows.length} 家`}
          </span>
        </h2>
        <label className="text-xs text-cream-dim">
          搜尋
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="公司、站台、網址" className="site-field !mt-1 !py-2 sm:w-56" />
        </label>
        <label className="text-xs text-cream-dim">
          合約狀態
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage | "")} className="site-field !mt-1 !py-2">
            <option value="">全部</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}（{stageCount(s)}）
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cream-dim">
          健康度
          <select value={health} onChange={(e) => setHealth(e.target.value as HealthLevel | "none" | "")} className="site-field !mt-1 !py-2">
            <option value="">全部</option>
            {(["high", "watch", "ok", "gone"] as const).map((h) => (
              <option key={h} value={h}>
                {HEALTH_LABEL[h]}（{healthCount(h)}）
              </option>
            ))}
            <option value="none">沒有資料</option>
          </select>
        </label>
        <button type="button" onClick={() => setSort({ key: "risk", desc: false })} className="glass-pill px-3 py-2 text-xs" aria-pressed={sort.key === "risk"}>
          高風險在前
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="site-table w-full min-w-[64rem] text-left text-sm">
          <thead className="text-xs text-cream-dim">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`px-4 py-3 font-normal whitespace-nowrap ${c.numeric ? "num text-right" : ""}`}
                  data-numeric={c.numeric ? "" : undefined}
                  aria-sort={c.key && sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}
                >
                  {c.key ? (
                    <button type="button" onClick={() => toggle(c.key!)} className="inline-flex items-center gap-1 hover:text-cream">
                      {c.label}
                      <span aria-hidden className={sort.key === c.key ? "text-cream" : "opacity-40"}>
                        {sort.key === c.key && sort.desc ? "↓" : "↑"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.site} className="border-t border-[var(--line)] align-top">
                <td className="px-4 py-3">
                  <Link href={`/platform/${encodeURIComponent(r.site)}`} className="font-medium underline-offset-4 hover:underline">
                    {r.company}
                  </Link>
                  <span className="block text-xs text-cream-dim">{r.site}</span>
                </td>
                <td className="max-w-64 px-4 py-3">
                  {r.health ? (
                    <>
                      <Chip tone={HEALTH_TONE[r.health.level]}>{r.health.level === "gone" ? HEALTH_LABEL.gone : `${r.health.score}・${HEALTH_LABEL[r.health.level]}`}</Chip>
                      {r.health.reasons.length && r.health.level !== "gone" ? <span className="mt-1 block text-xs text-cream-dim">{r.health.reasons.join("；")}</span> : null}
                    </>
                  ) : (
                    <span className="text-cream-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Chip tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Chip>
                </td>
                <td className="num px-4 py-3 whitespace-nowrap">{r.ends ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.open !== null ? <Chip tone="bad">未付 {ntd(r.open)}</Chip> : <span className="text-cream-dim">—</span>}
                  {r.einvoiceFailed ? (
                    <span className="mt-1 block">
                      <Chip tone="warn">發票沒開成</Chip>
                    </span>
                  ) : null}
                </td>
                <td className="num px-4 py-3 text-right" data-numeric="">
                  {r.users ?? "—"} ／ {r.active ?? "—"}
                </td>
                <td className="num px-4 py-3 text-right" data-numeric="">{r.invoices ?? "—"}</td>
                <td className="num px-4 py-3 text-right" data-numeric="">{r.dataMb !== null ? `${r.dataMb} MB` : r.usageError ? <Chip tone="warn">讀不到</Chip> : "—"}</td>
                <td className="max-w-56 px-4 py-3 text-xs">
                  <span className="text-cream-dim">{r.backup ?? "—"}</span>
                  {r.backupProblem ? (
                    <span className="mt-1 block">
                      <Chip tone="bad">{r.backupProblem}</Chip>
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-cream-dim">{r.hosts.join("、") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-5 text-sm text-cream-dim">還沒有公司。用導入工具 `dropout-onboard provision` 或 `fleet` 開第一家。</p> : null}
        {rows.length && !shown.length ? (
          <p className="p-5 text-sm text-cream-dim">
            沒有符合條件的公司。
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStage("");
                setHealth("");
              }}
              className="ml-2 underline underline-offset-4 hover:text-cream"
            >
              清除篩選
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}
