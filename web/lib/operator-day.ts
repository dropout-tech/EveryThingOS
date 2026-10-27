import { beatByStep } from "./tw-real/index";
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
  const beat = beatByStep(pack.workflow.id, stage);
  if (beat) return { href: beat.href, hint: beat.detail };
  const t = stage;
  if (/留言|私訊|回覆|貼文|社群|IG/.test(t)) {
    return { href: "/workspace/chat", hint: "留言轉成對話" };
  }
  if (/請款|結帳|收款|發票|對帳|訂金|尾款|學費|帳單|押金|報關|沖帳|續約|續報/.test(t)) {
    return { href: "/workspace/erp/finance", hint: "收到錢才算完" };
  }
  if (/進貨|進豆|備料|估料|上架|盤點|庫存|對庫存|撿貨|生產|訂貨|效期|BOM|打樣|加工|烘焙|進書|陳列|報廢|分級|包裝|採收/.test(t)) {
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
    return { href: "/workspace/letter", hint: "寄電子報把人帶回來" };
  }
  return { href: "/workspace/crm", hint: "跟人跟到答應" };
}

function stageEnabled(href: string, pack: IndustryPack): boolean {
  if (href.startsWith("/workspace/crm")) return pack.modules.crm;
  if (href.startsWith("/workspace/chat")) return pack.modules.line;
  if (href.startsWith("/workspace/letter")) return pack.modules.funnel;
  if (href.startsWith("/workspace/website")) return pack.modules.website;
  if (href.startsWith("/workspace/erp/stock")) return pack.modules.erp.inventory;
  return true;
}

export function industryDayPath(pack: IndustryPack): DayStep[] {
  const steps: DayStep[] = [];
  const seen = new Set<string>();

  for (const stage of pack.workflow.stages) {
    const mapped = classifyStage(stage, pack);
    if (!stageEnabled(mapped.href, pack)) continue;
    if (seen.has(mapped.href)) continue;
    seen.add(mapped.href);
    steps.push({ href: mapped.href, label: stage, hint: mapped.hint });
  }

  if (!steps.length) {
    const fallback = pack.modules.crm
      ? { href: "/workspace/crm", label: pack.workflow.stages[0] ?? "客人", hint: "跟人跟到答應" }
      : { href: "/workspace/erp/finance", label: "收錢", hint: "收到錢才算完" };
    steps.push(fallback);
  }

  return steps.slice(0, 5);
}

export function industryTodayJobs(
  pack: IndustryPack,
  money: {
    person: string;
    debtor: string;
    overdueLabel: string;
    overdueAmount: number;
    inventoryOn: boolean;
    lowStockName?: string;
  },
): DayJob[] {
  const path = industryDayPath(pack);
  const stages = pack.workflow.stages;
  const waiting = stages[0] ?? "今天";
  const nextStage = stages[1] ?? waiting;
  const nextBeat = beatByStep(pack.workflow.id, nextStage);
  const follow = path.find((step) => step.href !== "/workspace/crm");

  const home = pack.modules.crm ? "/workspace/crm" : (path[0]?.href ?? "/workspace/erp/finance");
  const painJobs: DayJob[] = (pack.pains ?? []).slice(0, 2).map((pain, index) => ({
    title: pain,
    detail: `${pack.nameZh}的痛點。下一步照「${stages[0] ?? "今天"}」。`,
    href: /庫存|貨|效期|報廢|料|序號/.test(pain) && pack.modules.erp.inventory
      ? "/workspace/erp/stock"
      : /預約|超賣|訂位|檔期|班/.test(pain)
        ? "/workspace/hr"
        : /對話|私訊|留言|客服/.test(pain)
          ? "/workspace/chat"
          : index === 0
            ? home
            : "/workspace/erp/sales",
    tone: index === 0 ? "urgent" : "warn",
  }));

  const jobs: DayJob[] = painJobs.length
    ? painJobs
    : [
        {
          title: `${money.person} 還停在「${waiting}」`,
          detail: nextBeat?.detail ?? `下一步是「${nextStage}」。`,
          href: home,
          tone: "urgent",
        },
      ];

  if (follow) {
    jobs.push({
      title: `然後「${follow.label}」`,
      detail: follow.hint,
      href: follow.href,
      tone: "warn",
    });
  }

  if (money.overdueAmount > 0) {
    jobs.push({
      title: `${money.debtor} 還欠 ${money.overdueLabel}`,
      detail: "錢沒進來，前面都白做。",
      href: "/workspace/erp/finance",
      tone: "ok",
    });
  } else if (money.inventoryOn && money.lowStockName) {
    jobs.push({
      title: `${money.lowStockName} 快沒了`,
      detail: "先補，再繼續賣。",
      href: "/workspace/erp/stock",
      tone: "ok",
    });
  }

  return jobs.slice(0, 3);
}
