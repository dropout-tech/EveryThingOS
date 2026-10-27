"use client";

import { useState } from "react";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
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
        <div>
          <h2 className="text-sm font-medium">
            20 家分店／20 個真實客戶情境一鍵解決（認知負擔降低 {summary.overallReductionPct}%）
          </h2>
          <p className="mt-0.5 text-xs text-cream-dim">
            原本人工要跨表比對 {summary.totalManualSteps} 個步驟，系統全部在背後算好，每個情境都變成「看一句結論、按一下完成」。
          </p>
        </div>
        <Badge tone="ok">
          已驗證 {summary.scenarioCount}/20 情境 · 步驟 {summary.totalManualSteps} → {summary.totalSystemSteps}（-{summary.overallReductionPct}%）
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
          <Badge tone="ok">
            {current.manualStepsCount} 步變 1 步（認知負擔 -{current.cognitiveReductionPct}%）
          </Badge>
        </div>

        {/* 以前人工 5-6 步（劃掉） vs 現在 1 句話 */}
        <p className="text-xs text-cream-dim line-through">
          以前人工（{current.manualStepsCount} 步）：{current.beforeSteps.join(" → ")}
        </p>

        <p className="text-sm font-medium">
          現在系統算好：{current.decisionHeadline}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-cream-dim">系統底層檢核：{current.engineProof}</span>
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
