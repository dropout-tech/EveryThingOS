/**
 * 課程 BOM（ERPNext Product Bundle）：一門課或一期班搭配哪些講義、課本、實驗材料包與耗材。
 * 報名出貨時自動依每位學員用量扣減材料庫存；開班前依現有庫存算出「還能收幾位學員」與「卡在哪項材料」。
 */

export type CourseBomLine = {
  sku: string;
  name: string;
  qtyPerStudent: number;
  uom: string;
};

export type CourseBom = {
  courseCode: string;
  courseName: string;
  targetSeats: number;
  lines: CourseBomLine[];
  href?: string;
};

export type EvaluatedBomLine = CourseBomLine & {
  onHand: number;
  safety: number;
  /** 單看這項材料，現有庫存夠幾位學員 */
  supportedSeats: number;
  /** 要開滿 targetSeats 人，這項材料還缺多少 */
  shortageForTarget: number;
};

export type EvaluatedCourseBom = Omit<CourseBom, "lines"> & {
  lines: EvaluatedBomLine[];
  /** 受限於最缺的那項材料，目前最多能收幾位學員 */
  maxSeats: number;
  /** 卡住開班名額的瓶頸材料 */
  bottleneck: EvaluatedBomLine | null;
  /** 現有材料是否夠開滿 targetSeats 人 */
  readyForTarget: boolean;
};

type StockLike = { sku: string; onHand: number; safety: number };

export function evaluateCourseBom(bom: CourseBom, stock: readonly StockLike[]): EvaluatedCourseBom {
  const bySku = new Map<string, { onHand: number; safety: number }>();
  for (const row of stock) {
    const prev = bySku.get(row.sku) ?? { onHand: 0, safety: 0 };
    bySku.set(row.sku, { onHand: prev.onHand + row.onHand, safety: Math.max(prev.safety, row.safety) });
  }
  const target = Math.max(1, Math.round(bom.targetSeats || 1));
  const lines: EvaluatedBomLine[] = bom.lines.map((line) => {
    const found = bySku.get(line.sku) ?? { onHand: 0, safety: 0 };
    const qty = line.qtyPerStudent > 0 ? line.qtyPerStudent : 1;
    const supportedSeats = Math.max(0, Math.floor(found.onHand / qty));
    const needed = target * qty;
    const shortageForTarget = Math.max(0, Math.ceil(needed - found.onHand));
    return {
      ...line,
      onHand: found.onHand,
      safety: found.safety,
      supportedSeats,
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
  return {
    ...bom,
    targetSeats: target,
    lines,
    maxSeats,
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
