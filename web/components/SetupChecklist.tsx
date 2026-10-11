"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonClass } from "./ui/Button";
import { demoKey, useDemoState } from "@/lib/demo-state";
import type { SalesDoc } from "@/lib/erp";
import { PRACTICE_PATH, type ChecklistItem } from "@/lib/guide";
import { useGuideFlag } from "@/lib/guide-state";

/** Steps the practice books already have, so practice mode can tick them honestly. */
const PREFILLED = new Set(["company", "customers", "items"]);

type Props = {
  items: ChecklistItem[];
  /** Practice mode: quotation and payment follow what this browser did on the practice books. */
  practice?: { packId: string; seed: SalesDoc[] };
  variant?: "today" | "settings";
};

function usePracticeDone(practice: Props["practice"]) {
  const [docs] = useDemoState(demoKey("sales", practice?.packId ?? "none"), practice?.seed ?? []);
  if (!practice) return null;
  const seeded = new Set(practice.seed.map((d) => d.no));
  const mine = docs.filter((d) => !seeded.has(d.no));
  return { first_quotation: mine.length > 0, first_payment: mine.some((d) => d.step === "paid") } as Record<string, boolean>;
}

export function SetupChecklist({ items, practice, variant = "today" }: Props) {
  const hidden = useGuideFlag("checklist-hidden");
  const [justHid, setJustHid] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (justHid) statusRef.current?.focus();
  }, [justHid]);
  const fromPractice = usePracticeDone(practice);
  const rows = items.map((item) => ({
    ...item,
    done: item.done ?? Boolean(fromPractice?.[item.id] || PREFILLED.has(item.id)),
    prefilled: item.done === null && PREFILLED.has(item.id),
  }));
  const done = rows.filter((r) => r.done).length;
  const next = rows.find((r) => !r.done);
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 100;

  if (variant === "today") {
    if (!hidden.ready) return null;
    if (hidden.set) {
      return justHid ? (
        <p ref={statusRef} tabIndex={-1} className="text-xs text-cream-dim outline-none" role="status">
          開站清單收起來了。要再看，到{" "}
          <Link href="/workspace/settings#checklist" className="underline hover:text-cream">
            設定
          </Link>
          。
        </p>
      ) : null;
    }
  }

  const cta = (row: (typeof rows)[number], primary: boolean) => {
    const className = buttonClass({ variant: primary ? "primary" : "secondary", size: "sm" });
    return row.external ? (
      <a href={row.href} target="_blank" rel="noreferrer" className={className}>
        {row.cta}
        <span className="sr-only">（在 ERPNext 打開）</span>
      </a>
    ) : (
      <Link href={row.href} className={className}>
        {row.cta}
      </Link>
    );
  };

  const list = (
    <ol className="space-y-1">
      {rows.map((row) => {
        const isNext = row.id === next?.id;
        const showWhy = !row.done && (variant === "settings" || isNext);
        return (
          <li key={row.id} className={`rounded-2xl ${isNext ? "glass-chip p-3" : "px-3 py-1.5"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span aria-hidden className={row.done ? "text-ok" : "text-cream-dim"}>
                {row.done ? "●" : "○"}
              </span>
              <span className={`flex-1 text-sm ${row.done ? "text-cream-dim" : ""}`}>
                {row.label}
                <span className="sr-only">{row.done ? "（已完成）" : "（還沒做）"}</span>
                {row.prefilled ? <span className="ml-2 text-xs text-cream-dim">練習帳本已備好</span> : null}
                {isNext ? <span className="ml-2 text-xs text-focus">下一步</span> : null}
              </span>
              {!row.done ? cta(row, isNext && variant === "settings") : null}
            </div>
            {showWhy ? (
              <p className="mt-1 pl-6 text-xs text-cream-dim">
                {row.why}{" "}
                <Link href={`/help/${row.help}`} className="underline hover:text-cream">
                  說明
                </Link>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  return (
    <section id="checklist" className="card space-y-4" aria-labelledby="checklist-title">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 id="checklist-title" className="section-title">
            開站清單
          </h2>
          <p className="mt-1 text-xs text-cream-dim">
            {practice ? "練習：導入後照你們 ERPNext 的真資料打勾。" : "照 ERPNext 裡的真資料自動打勾，不能手動勾。"}
          </p>
        </div>
        <p className="num display text-sm" aria-hidden>
          {done}／{rows.length}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="開站清單完成度"
        aria-valuemin={0}
        aria-valuemax={rows.length}
        aria-valuenow={done}
        aria-valuetext={`完成 ${done} 項，共 ${rows.length} 項`}
        className="progress"
      >
        <span className="motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${pct}%` }} />
      </div>

      {next ? null : <p className="text-sm">全部完成。新同事進來，請他先看「第一天」再練習一筆生意。</p>}

      {variant === "today" ? (
        <>
          {next ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm">
                <span className="text-cream-dim">下一步：</span>
                {next.label}
              </p>
              {cta(next, false)}
            </div>
          ) : null}
          <details className="disclosure" open={done * 2 < rows.length}>
            <summary className="min-h-10 text-sm text-cream-dim hover:text-cream">
              <span aria-hidden className="disclosure-mark">
                ›
              </span>
              看全部 {rows.length} 項
            </summary>
            <div className="mt-2">{list}</div>
          </details>
        </>
      ) : (
        list
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-cream-dim">
        <Link href={PRACTICE_PATH} className="underline hover:text-cream">
          先練習一筆生意
        </Link>
        <Link href="/help/checklist" className="underline hover:text-cream">
          開站清單怎麼算
        </Link>
        {variant === "today" ? (
          <button
            type="button"
            className="ml-auto min-h-8 underline hover:text-cream"
            onClick={() => {
              hidden.on();
              setJustHid(true);
            }}
          >
            先收起來
          </button>
        ) : hidden.ready && hidden.set ? (
          <button type="button" className="ml-auto underline hover:text-cream" onClick={hidden.off}>
            放回「今天」
          </button>
        ) : null}
      </div>
    </section>
  );
}
