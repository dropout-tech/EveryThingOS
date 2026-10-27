import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTwentyEduScenarios, summarizeCognitiveReduction } from "./edu-scenarios.ts";

describe("20 個客戶／分店真實情境與 80% 認知負擔降幅驗證", () => {
  it("完整涵蓋 20 個真實情境，每一個情境皆能一鍵解決且認知負擔降低 ≥ 80%", () => {
    const scenarios = buildTwentyEduScenarios();
    assert.equal(scenarios.length, 20);
    for (const s of scenarios) {
      assert.equal(s.resolved, true, `${s.id} 應解決`);
      assert.equal(s.systemStepsCount, 1, `${s.id} 應為 1 步完成`);
      assert.ok(
        s.cognitiveReductionPct >= 80,
        `${s.id} 認知負擔降幅應 >= 80%，實際為 ${s.cognitiveReductionPct}%`,
      );
    }
    const summary = summarizeCognitiveReduction(scenarios);
    assert.equal(summary.scenarioCount, 20);
    assert.equal(summary.allResolved, true);
    assert.ok(summary.overallReductionPct >= 80, `整體認知負擔降幅應 >= 80%，實際為 ${summary.overallReductionPct}%`);
  });

  it("涵蓋計畫書五大類別：CRM預約＋OMS鎖料、虛實履約與退改課、WMS耗損＋20店AI調撥、HRM師資媒合＋主管留痕、總部中台＋薪資串接", () => {
    const scenarios = buildTwentyEduScenarios();
    const categories = new Set(scenarios.map((s) => s.category));
    assert.deepEqual(
      [...categories].sort(),
      [
        "CRM預約＋OMS鎖料",
        "HRM師資媒合＋主管留痕",
        "WMS耗損＋20店AI調撥",
        "總部中台＋薪資串接",
        "虛實履約與退改課",
      ].sort(),
    );
  });
});
