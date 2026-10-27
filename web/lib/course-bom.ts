/**
 * 課程＋零售特化 OMS＋WMS 核心邏輯：
 * 1. 課程 BOM（ERPNext Product Bundle）：拆解每位學員所需教材／材料包，支援報名時「預先鎖定材料包（lockedQty）」。
 * 2. 虛實履約同步拆解（splitCourseFulfillment）：課程名額（虛擬履約）與材料包（實體履約）分開計價與追蹤，退改課時自動扣算已領用材料成本。
 * 3. WMS 庫存異動（領用、上課耗用、損耗／報廢、跨店調撥）。
 * 4. 多據點（20 店規模）AI 備料、跨店調撥與補貨建議（planMultiStoreReplenishment）。
 */

export type CourseBomLine = {
  sku: string;
  name: string;
  qtyPerStudent: number;
  uom: string;
  /** 單份材料包成本（用於虛實履約拆解與損耗成本計算） */
  unitCost?: number;
};

export type CourseBom = {
  courseCode: string;
  courseName: string;
  targetSeats: number;
  /** 目前已報名預約（尚未完課）的人數，OMS 會預先鎖定對應的材料包 */
  bookedSeats?: number;
  /** 季節／節慶檔期需求係數（例如節慶 DIY 為 1.3，常態為 1.0） */
  seasonalFactor?: number;
  lines: CourseBomLine[];
  href?: string;
};

export type EvaluatedBomLine = CourseBomLine & {
  onHand: number;
  /** 已隨報名訂單預先鎖定的材料數量 */
  lockedQty: number;
  /** 扣除預先鎖定後，還能給新報名學員用的淨可用量 */
  availableQty: number;
  safety: number;
  /** 單看這項材料，現有庫存（含已鎖定）總共夠幾位學員上課 */
  supportedSeats: number;
  /** 扣除已鎖定後，還能再收幾位新學員 */
  remainingNewSeats: number;
  /** 要開滿 targetSeats 人，這項材料還缺多少 */
  shortageForTarget: number;
};

export type EvaluatedCourseBom = Omit<CourseBom, "lines"> & {
  bookedSeats: number;
  lines: EvaluatedBomLine[];
  /** 受限於最缺的那項材料，目前庫存總共能開幾位學員 */
  maxSeats: number;
  /** 扣除已報名鎖定後，還能再收幾位新學員 */
  remainingSeats: number;
  /** 卡住開班名額的瓶頸材料 */
  bottleneck: EvaluatedBomLine | null;
  /** 現有材料是否夠開滿 targetSeats 人 */
  readyForTarget: boolean;
};

type StockLike = { sku: string; onHand: number; safety: number; lockedQty?: number };

export function evaluateCourseBom(bom: CourseBom, stock: readonly StockLike[]): EvaluatedCourseBom {
  const bySku = new Map<string, { onHand: number; safety: number; lockedQty: number }>();
  for (const row of stock) {
    const prev = bySku.get(row.sku) ?? { onHand: 0, safety: 0, lockedQty: 0 };
    bySku.set(row.sku, {
      onHand: prev.onHand + row.onHand,
      safety: Math.max(prev.safety, row.safety),
      lockedQty: prev.lockedQty + (row.lockedQty ?? 0),
    });
  }
  const target = Math.max(1, Math.round(bom.targetSeats || 1));
  const booked = Math.max(0, Math.round(bom.bookedSeats ?? 0));
  const lines: EvaluatedBomLine[] = bom.lines.map((line) => {
    const found = bySku.get(line.sku) ?? { onHand: 0, safety: 0, lockedQty: 0 };
    const qty = line.qtyPerStudent > 0 ? line.qtyPerStudent : 1;
    const lockedByCourse = booked * qty;
    const lockedQty = Math.max(found.lockedQty, lockedByCourse);
    const availableQty = Math.max(0, found.onHand - lockedQty);
    const supportedSeats = Math.max(0, Math.floor(found.onHand / qty));
    const remainingNewSeats = Math.max(0, Math.floor(availableQty / qty));
    const needed = target * qty;
    const shortageForTarget = Math.max(0, Math.ceil(needed - found.onHand));
    return {
      ...line,
      onHand: found.onHand,
      lockedQty,
      availableQty,
      safety: found.safety,
      supportedSeats,
      remainingNewSeats,
      shortageForTarget,
    };
  });

  let bottleneck: EvaluatedBomLine | null = null;
  for (const line of lines) {
    if (
      !bottleneck ||
      line.supportedSeats < bottleneck.supportedSeats ||
      (line.supportedSeats === bottleneck.supportedSeats && line.shortageForTarget > bottleneck.shortageForTarget)
    ) {
      bottleneck = line;
    }
  }
  const maxSeats = bottleneck ? bottleneck.supportedSeats : 0;
  const remainingSeats = Math.max(0, maxSeats - booked);
  return {
    ...bom,
    targetSeats: target,
    bookedSeats: booked,
    lines,
    maxSeats,
    remainingSeats,
    bottleneck,
    readyForTarget: lines.length > 0 && maxSeats >= target,
  };
}

/** 找出最需要優先補齊材料的課程 BOM（還沒湊齊目標開班人數、且可開名額最少的排第一）。 */
export function nextCourseBom(boms: readonly EvaluatedCourseBom[]): EvaluatedCourseBom | null {
  const short = boms.filter((b) => !b.readyForTarget && b.bottleneck);
  if (!short.length) return null;
  return [...short].sort((a, b) => a.maxSeats - b.maxSeats || (b.bottleneck?.shortageForTarget ?? 0) - (a.bottleneck?.shortageForTarget ?? 0))[0];
}

// ---------- 虛實履約同步拆解（課程虛擬名額 + 材料包實體履約） ----------

export type VirtualStage = "booked" | "attended" | "rescheduled" | "cancelled";
export type MaterialStage = "locked" | "issued" | "consumed" | "returned";

export type CourseEnrollmentOrder = {
  orderNo: string;
  studentName: string;
  branchName: string;
  courseCode: string;
  courseName: string;
  channel: "官網預約" | "LINE 預約" | "門市現場";
  totalSessions: number;
  attendedSessions: number;
  tuitionAmount: number;
  materialPackAmount: number;
  virtualStage: VirtualStage;
  materialStage: MaterialStage;
};

export type FulfillmentSplitResult = {
  orderNo: string;
  /** 已完成上課認列的學費 */
  earnedTuition: number;
  /** 已領用／已耗用不可退的材料包費用 */
  nonRefundableMaterial: number;
  /** 若此時申請退課，應退還家長的金額（未上堂數比例學費 + 尚未拆封領用的材料包費） */
  refundableAmount: number;
  /** 若退課，是否可將鎖定的材料包釋放回可用庫存 */
  canReleaseLockedMaterial: boolean;
  summary: string;
};

/**
 * 拆解單筆課程訂單的虛擬履約（課程堂數）與實體履約（材料包）：
 * - 材料包若還在 `locked`（僅預扣鎖定、尚未現場領用拆封）或 `returned`（完好退回），退課時可釋放鎖定並退還材料費。
 * - 材料包若已 `issued`（已領用拆封）或 `consumed`（已上課耗用），材料包屬實體履約完成，退課時扣除材料包費，僅按未上堂數比例計算應退課程費。
 */
export function splitCourseFulfillment(order: CourseEnrollmentOrder): FulfillmentSplitResult {
  const total = Math.max(1, order.totalSessions);
  const attended = Math.min(total, Math.max(0, order.attendedSessions));
  const earnedTuition = Math.round((order.tuitionAmount * attended) / total);
  const refundableTuition = Math.max(0, order.tuitionAmount - earnedTuition);

  const materialUsed = order.materialStage === "issued" || order.materialStage === "consumed";
  const nonRefundableMaterial = materialUsed ? order.materialPackAmount : 0;
  const refundableMaterial = materialUsed ? 0 : order.materialPackAmount;
  const refundableAmount = refundableTuition + refundableMaterial;
  const canReleaseLockedMaterial = !materialUsed;

  const summary = materialUsed
    ? `已上 ${attended}/${total} 堂，材料包已${order.materialStage === "consumed" ? "上課耗用" : "現場領用"}（實體履約 NT$${order.materialPackAmount.toLocaleString("zh-TW")} 不退庫）；退改課可退學費 NT$${refundableAmount.toLocaleString("zh-TW")}。`
    : `已上 ${attended}/${total} 堂，材料包僅系統預扣鎖定尚未領用；退課可釋放材料鎖定並退還 NT$${refundableAmount.toLocaleString("zh-TW")}（含未上學費與材料費）。`;

  return {
    orderNo: order.orderNo,
    earnedTuition,
    nonRefundableMaterial,
    refundableAmount,
    canReleaseLockedMaterial,
    summary,
  };
}

// ---------- WMS 耗用、損耗／報廢與多店跨據點調撥建議 ----------

export type MovementKind = "lock" | "consume" | "wastage" | "transfer";

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
  lock: "報名預扣鎖定",
  consume: "上課領用耗用",
  wastage: "教學損耗／過期報廢",
  transfer: "跨店調撥",
};

export type StockMovementInput = {
  kind: MovementKind;
  sku: string;
  name: string;
  qty: number;
  fromBranch: string;
  toBranch?: string;
  reason?: string;
};

export type BranchMaterialStock = {
  branchId: string;
  branchName: string;
  region: "北區" | "中區" | "南區";
  sku: string;
  materialName: string;
  uom: string;
  onHand: number;
  /** 已因課程預約而由 OMS 鎖定的數量 */
  locked: number;
  /** 近期上課實際耗用數量（30 日） */
  consumed30d: number;
  /** 近期教學損耗／報廢數量（30 日） */
  wastage30d: number;
  /** 該據點安全庫存門檻 */
  safety: number;
  /** 即將開課或節慶檔期預估需求量（含課程 BOM 展開） */
  upcomingDemand: number;
};

export type AiInventoryRecommendation = {
  id: string;
  action: "transfer" | "purchase";
  sku: string;
  materialName: string;
  uom: string;
  targetBranch: string;
  sourceBranch?: string;
  qty: number;
  reason: string;
};

/**
 * 多據點（20 店規模）AI 材料備料、跨店庫存調撥與補貨建議引擎：
 * - 對每個據點計算：淨可用 = onHand - locked；歷史損耗率 = wastage30d / max(1, consumed30d + wastage30d)。
 * - 目標需備水位 = ceil(upcomingDemand * (1 + wastageRate)) + safety。
 * - 若 onHand < 目標需備水位（出現缺口 deficit）：
 *   1. 優先尋找同區域（其次跨區）有餘裕（surplus = onHand - locked - upcomingDemand - safety > 0）的據點，提出「跨店調撥（transfer）」建議，避免重複採購與冷門積壓。
 *   2. 調撥後仍有缺口，提出「總部集中補貨採購（purchase）」建議。
 */
export function planMultiStoreReplenishment(rows: readonly BranchMaterialStock[]): AiInventoryRecommendation[] {
  const bySku = new Map<string, BranchMaterialStock[]>();
  for (const r of rows) {
    const list = bySku.get(r.sku) ?? [];
    list.push(r);
    bySku.set(r.sku, list);
  }

  const recommendations: AiInventoryRecommendation[] = [];

  for (const [sku, stores] of bySku.entries()) {
    const surpluses = stores
      .map((s) => {
        const free = s.onHand - s.locked - s.upcomingDemand - s.safety;
        return { store: s, surplus: Math.max(0, Math.floor(free)) };
      })
      .filter((x) => x.surplus > 0)
      .sort((a, b) => b.surplus - a.surplus);

    for (const s of stores) {
      const totalUsed = s.consumed30d + s.wastage30d;
      const wastageRate = totalUsed > 0 ? Math.min(0.25, s.wastage30d / totalUsed) : 0;
      const demandWithWastage = Math.ceil(s.upcomingDemand * (1 + wastageRate));
      const requiredTotal = s.locked + demandWithWastage + s.safety;
      let deficit = Math.max(0, requiredTotal - s.onHand);
      if (deficit <= 0) continue;

      // 先找同區有餘裕的分店，再找跨區有餘裕的分店
      const orderedDonors = [
        ...surpluses.filter((d) => d.store.branchId !== s.branchId && d.store.region === s.region),
        ...surpluses.filter((d) => d.store.branchId !== s.branchId && d.store.region !== s.region),
      ];

      for (const donor of orderedDonors) {
        if (deficit <= 0) break;
        if (donor.surplus <= 0) continue;
        const moveQty = Math.min(deficit, donor.surplus);
        donor.surplus -= moveQty;
        deficit -= moveQty;
        recommendations.push({
          id: `REC-TR-${sku}-${donor.store.branchId}-${s.branchId}`,
          action: "transfer",
          sku,
          materialName: s.materialName,
          uom: s.uom,
          targetBranch: s.branchName,
          sourceBranch: donor.store.branchName,
          qty: moveQty,
          reason: `${s.branchName} 已鎖定 ${s.locked} ${s.uom}、近期排課需求 ${s.upcomingDemand} ${s.uom}（含損耗率 ${Math.round(wastageRate * 100)}% 與安全量 ${s.safety}），現有 ${s.onHand} ${s.uom} 不足；${donor.store.branchName} 扣除自身需求與安全量後尚有餘裕，建議優先跨店調撥 ${moveQty} ${s.uom}，免重複採購。`,
        });
      }

      if (deficit > 0) {
        recommendations.push({
          id: `REC-PO-${sku}-${s.branchId}`,
          action: "purchase",
          sku,
          materialName: s.materialName,
          uom: s.uom,
          targetBranch: s.branchName,
          qty: deficit,
          reason: `${s.branchName} 排課需求 ${s.upcomingDemand} ${s.uom}（加計歷史損耗率 ${Math.round(wastageRate * 100)}% 與安全量 ${s.safety}），跨店調度後仍缺 ${deficit} ${s.uom}，建議總部採購補貨。`,
        });
      }
    }
  }

  return recommendations;
}

const CODE_RE = /^[A-Za-z0-9_.-]{2,60}$/;

export function parseCourseBom(body: unknown): { ok: true; value: CourseBom } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "沒有收到課程 BOM 資料" };
  const b = body as Record<string, unknown>;
  const courseCode = typeof b.courseCode === "string" ? b.courseCode.trim() : "";
  if (!CODE_RE.test(courseCode)) return { ok: false, message: "課程代號要用英數或連字號（2–60 字）" };
  const courseName = typeof b.courseName === "string" ? b.courseName.trim().slice(0, 80) : "";
  if (!courseName) return { ok: false, message: "要填課程名稱" };
  const rawSeats = typeof b.targetSeats === "number" ? b.targetSeats : typeof b.targetSeats === "string" ? Number(b.targetSeats) : 15;
  if (!Number.isFinite(rawSeats) || rawSeats < 1 || rawSeats > 500 || Math.round(rawSeats) !== rawSeats) {
    return { ok: false, message: "每班目標人數要是 1 到 500 的整數" };
  }
  if (!Array.isArray(b.lines) || !b.lines.length) return { ok: false, message: "至少要配一項教材或材料" };
  if (b.lines.length > 30) return { ok: false, message: "一門課最多配 30 項材料" };

  const merged = new Map<string, CourseBomLine>();
  for (const rawLine of b.lines) {
    if (!rawLine || typeof rawLine !== "object") return { ok: false, message: "材料格式不對" };
    const l = rawLine as Record<string, unknown>;
    const sku = typeof l.sku === "string" ? l.sku.trim() : "";
    if (!CODE_RE.test(sku)) return { ok: false, message: "材料品號要用英數或連字號" };
    const name = typeof l.name === "string" && l.name.trim() ? l.name.trim().slice(0, 80) : sku;
    const qty = typeof l.qtyPerStudent === "number" ? l.qtyPerStudent : typeof l.qtyPerStudent === "string" ? Number(l.qtyPerStudent) : Number.NaN;
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) return { ok: false, message: `「${name}」每位學員用量要大於 0` };
    const uom = typeof l.uom === "string" && l.uom.trim() ? l.uom.trim().slice(0, 12) : "份";
    const existing = merged.get(sku);
    if (existing) {
      existing.qtyPerStudent = Number((existing.qtyPerStudent + qty).toFixed(4));
    } else {
      merged.set(sku, { sku, name, qtyPerStudent: qty, uom });
    }
  }

  return {
    ok: true,
    value: {
      courseCode,
      courseName,
      targetSeats: rawSeats,
      lines: [...merged.values()],
    },
  };
}
