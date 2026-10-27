"use client";

import { useState } from "react";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Icon } from "./ui/Viz";
import {
  buildTwentyEduScenarios,
  summarizeCognitiveReduction,
  type ScenarioCategory,
} from "@/lib/edu-scenarios";

const CATEGORIES: ("全部" | ScenarioCategory)[] = [
  "全部",
  "CRM預約＋OMS鎖料",
  "虛實履約與退改課",
  "WMS耗損＋20店AI調撥",
  "HRM師資媒合＋主管留痕",
  "總部中台＋薪資串接",
];

export function TwentyScenariosBoard({
  defaultCategory = "全部",
  onRunScenario,
}: {
  defaultCategory?: "全部" | ScenarioCategory;
  onRunScenario?: (message: string) => void;
}) {
  const scenarios = buildTwentyEduScenarios();
  const summary = summarizeCognitiveReduction(scenarios);
  const [category, setCategory] = useState<"全部" | ScenarioCategory>(defaultCategory);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const first = scenarios.find((s) => defaultCategory === "全部" || s.category === defaultCategory);
    return first?.id ?? scenarios[0].id;
  });
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());

  const filtered = category === "全部" ? scenarios : scenarios.filter((s) => s.category === category);
  const current = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? scenarios[0];
  const isDone = doneIds.has(current.id);

  function triggerCurrent() {
    setDoneIds((prev) => new Set(prev).add(current.id));
    onRunScenario?.(`情境 #${String(current.no).padStart(2, "0")}（${current.branch}）一鍵完成：${current.decisionHeadline}`);
  }

  return (
    <section className="glass space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">20 家分店・20 個真實情境</h2>
        <Badge tone="ok">
          {summary.totalManualSteps} 步 → {summary.totalSystemSteps} 步（-{summary.overallReductionPct}%）
        </Badge>
      </div>

      {/* 分類篩選 */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setCategory(cat);
              const next = (cat === "全部" ? scenarios : scenarios.filter((s) => s.category === cat))[0];
              if (next) setSelectedId(next.id);
            }}
            className={buttonClass({ variant: category === cat ? "secondary" : "ghost", size: "sm" })}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 情境編號快速切換 */}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((s) => {
          const active = s.id === current.id;
          const done = doneIds.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                active
                  ? "border-cream bg-cream text-ink font-medium"
                  : done
                    ? "border-cream/40 text-cream"
                    : "border-cream/20 text-cream-dim hover:text-cream"
              }`}
            >
              #{String(s.no).padStart(2, "0")} {s.branch.replace("教室", "")}
              {done ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      {/* 單一聚焦情境卡：只給一句結論＋一個按鈕 */}
      <div className="glass-well space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-cream-dim">
              情境 #{String(current.no).padStart(2, "0")} · {current.branch}（{current.region}） · {current.actor}
            </p>
            <h3 className="mt-0.5 text-base font-medium">{current.title}</h3>
          </div>
          <Badge tone="ok">-{current.cognitiveReductionPct}%</Badge>
        </div>

        <div className="flex items-center gap-2" role="img" aria-label={`以前 ${current.manualStepsCount} 步：${current.beforeSteps.join("、")}；現在 1 步`}>
          <span className="flex gap-1">
            {current.beforeSteps.map((step, i) => (
              <span key={i} className="viz-avatar viz-avatar-muted !h-6 !w-6 text-[0.65rem] line-through" title={step}>
                {i + 1}
              </span>
            ))}
          </span>
          <Icon name="arrow" className="text-cream-dim" />
          <span className="viz-avatar viz-avatar-accent !h-6 !w-6">
            <Icon name="check" className="!h-3.5 !w-3.5" />
          </span>
          <span className="text-xs text-cream-dim">{current.manualStepsCount} 步變 1 步</span>
        </div>

        <p className="text-sm font-medium">{current.decisionHeadline}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <details className="text-xs text-cream-dim">
            <summary className="cursor-pointer select-none">怎麼算的</summary>
            <p className="mt-1 max-w-prose">{current.engineProof}</p>
          </details>
          <button
            type="button"
            onClick={triggerCurrent}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {isDone ? `已完成：${current.oneClickLabel} ✓` : current.oneClickLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
