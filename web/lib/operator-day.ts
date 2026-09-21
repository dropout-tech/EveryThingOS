import type { IndustryPack } from "./types";

export type DayStep = {
  href: string;
  label: string;
  hint: string;
};

export type DayJob = {
  title: string;
  detail: string;
  href: string;
  tone: "urgent" | "warn" | "ok";
};

type StageTarget = { href: string; hint: string };

function classifyStage(stage: string, pack: IndustryPack): StageTarget {
  const t = stage;
  if (/留言|私訊|回覆|貼文|社群|IG/.test(t)) {
    return { href: "/workspace/reply", hint: "留言轉成對話" };
  }
  if (/請款|結帳|收款|發票|對帳|訂金|尾款|帳單|押金|報關|沖帳|續約|續報/.test(t)) {
    return { href: "/workspace/erp/finance", hint: "收到錢才算完" };
  }
  if (/進貨|備料|上架|盤點|庫存|生產|訂貨|效期|BOM|打樣|加工|烘焙|進書|陳列|報廢|分級/.test(t)) {
    return pack.modules.erp.inventory
      ? { href: "/workspace/erp/stock", hint: "貨夠不夠" }
      : { href: "/workspace/erp/purchase", hint: "跟廠商要" };
  }
  if (
    /報價|訂單|出貨|銷售|出餐|配送|施工|服務|交付|執行|取貨|成交|交貨|工單|派工|估價|安裝|入住|調劑|購票|履行|製作|綁序號|處置|點名|排課|出勤|完工/.test(
      t,
    )
  ) {
    return { href: "/workspace/erp/sales", hint: "做成一筆生意" };
  }
  if (/活動|企劃|落地|磁鐵|籌備/.test(t) && pack.modules.funnel) {
    return { href: "/workspace/funnel", hint: "把人帶來" };
  }
  return { href: "/workspace/crm", hint: "跟人跟到答應" };
}

export function industryDayPath(pack: IndustryPack): DayStep[] {
  const steps: DayStep[] = [];
  const seen = new Set<string>();

  for (const stage of pack.workflow.stages) {
    const mapped = classifyStage(stage, pack);
    if (seen.has(mapped.href)) continue;
    seen.add(mapped.href);
    steps.push({ href: mapped.href, label: stage, hint: mapped.hint });
  }

  if (!steps.length) {
    steps.push({ href: "/workspace/crm", label: pack.workflow.stages[0] ?? "客人", hint: "跟人跟到答應" });
  }

  return steps.slice(0, 5);
}

export function industryTodayJobs(
  pack: IndustryPack,
  money: {
    overdueLabel: string;
    overdueAmount: number;
    inventoryOn: boolean;
    lowStockName?: string;
  },
): DayJob[] {
  const path = industryDayPath(pack);
  const pains = pack.pains;
  const stages = pack.workflow.stages;
  const first = path[0];
  const second = path[1] ?? path[0];
  const lastStage = stages[stages.length - 1] ?? "收尾";

  const jobs: DayJob[] = [
    {
      title: pains[0] ?? `先做「${stages[0] ?? "今天"}」`,
      detail: `這是「${pack.nameZh}」現在最常卡住的。從「${stages[0] ?? first.label}」開始。`,
      href: first.href,
      tone: "urgent",
    },
  ];

  if (second) {
    jobs.push({
      title: `接著做「${second.label}」`,
      detail: pains[1] ?? pack.sampleLoop,
      href: second.href,
      tone: "warn",
    });
  }

  if (money.inventoryOn && money.lowStockName) {
    jobs.push({
      title: `${money.lowStockName} 快沒了`,
      detail: "先補貨，再繼續賣。不要等缺貨才問。",
      href: "/workspace/erp/stock",
      tone: "ok",
    });
  } else if (money.overdueAmount > 0) {
    jobs.push({
      title: `把欠款收回來 ${money.overdueLabel}`,
      detail: `走完「${lastStage}」才算今天做完。錢沒進來，前面都白做。`,
      href: "/workspace/erp/finance",
      tone: "ok",
    });
  } else {
    const last = path[path.length - 1] ?? first;
    jobs.push({
      title: `收尾：${last.label}`,
      detail: pack.sampleLoop,
      href: last.href,
      tone: "ok",
    });
  }

  return jobs.slice(0, 3);
}
