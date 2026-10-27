"use client";

import { useState, type FormEvent } from "react";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { TwentyScenariosBoard } from "./TwentyScenariosBoard";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import {
  evaluateCourseBom,
  MOVEMENT_LABELS,
  parseCourseBom,
  planMultiStoreReplenishment,
  splitCourseFulfillment,
  type AiInventoryRecommendation,
  type BranchMaterialStock,
  type CourseBom,
  type CourseEnrollmentOrder,
  type EvaluatedCourseBom,
  type MaterialStage,
  type MovementKind,
} from "@/lib/course-bom";
import type { StockRow } from "@/lib/erp";

type Props = {
  initialBoms: CourseBom[];
  stock: StockRow[];
  live: boolean;
  deskUrl?: string;
  onRequestShortage: (items: { sku: string; name: string; shortage: number }[], courseName: string) => void;
  onPracticeNote: (message: string) => void;
};

const INITIAL_BRANCH_STOCKS: BranchMaterialStock[] = [
  {
    branchId: "TPE-XY",
    branchName: "台北信義教室",
    region: "北區",
    sku: "MAT-CLAY-SET",
    materialName: "節慶造型輕黏土材料包",
    uom: "組",
    onHand: 8,
    locked: 6,
    consumed30d: 45,
    wastage30d: 5,
    safety: 6,
    upcomingDemand: 10,
  },
  {
    branchId: "NTPC-BQ",
    branchName: "新北板橋教室",
    region: "北區",
    sku: "MAT-CLAY-SET",
    materialName: "節慶造型輕黏土材料包",
    uom: "組",
    onHand: 30,
    locked: 5,
    consumed30d: 22,
    wastage30d: 1,
    safety: 6,
    upcomingDemand: 7,
  },
  {
    branchId: "TYN-YW",
    branchName: "桃園藝文教室",
    region: "北區",
    sku: "MAT-CLAY-SET",
    materialName: "節慶造型輕黏土材料包",
    uom: "組",
    onHand: 18,
    locked: 6,
    consumed30d: 28,
    wastage30d: 2,
    safety: 6,
    upcomingDemand: 6,
  },
  {
    branchId: "TXG-GY",
    branchName: "台中公益教室",
    region: "中區",
    sku: "MAT-ACRYLIC-SET",
    materialName: "水洗無毒顏料與複合媒材包",
    uom: "組",
    onHand: 9,
    locked: 6,
    consumed30d: 36,
    wastage30d: 4,
    safety: 8,
    upcomingDemand: 12,
  },
  {
    branchId: "TXG-7P",
    branchName: "台中七期教室",
    region: "中區",
    sku: "MAT-ACRYLIC-SET",
    materialName: "水洗無毒顏料與複合媒材包",
    uom: "組",
    onHand: 26,
    locked: 4,
    consumed30d: 18,
    wastage30d: 1,
    safety: 6,
    upcomingDemand: 8,
  },
  {
    branchId: "KHH-JD",
    branchName: "高雄巨蛋教室",
    region: "南區",
    sku: "MAT-STEAM-KIT",
    materialName: "感測器與馬達實驗材料包",
    uom: "組",
    onHand: 7,
    locked: 4,
    consumed30d: 30,
    wastage30d: 3,
    safety: 8,
    upcomingDemand: 10,
  },
];

const INITIAL_ENROLLMENTS: CourseEnrollmentOrder[] = [
  {
    orderNo: "SO-20501",
    studentName: "陳小安（家長：陳怡君）",
    branchName: "台北信義教室",
    courseCode: "CRS-CLAY-01",
    courseName: "節慶親子手作輕黏土班（4 堂）",
    channel: "官網預約",
    totalSessions: 4,
    attendedSessions: 1,
    tuitionAmount: 3200,
    materialPackAmount: 800,
    virtualStage: "booked",
    materialStage: "issued",
  },
  {
    orderNo: "SO-20502",
    studentName: "林小宇（家長：林俊傑）",
    branchName: "台北信義教室",
    courseCode: "CRS-CLAY-01",
    courseName: "節慶親子手作輕黏土班（4 堂）",
    channel: "LINE 預約",
    totalSessions: 4,
    attendedSessions: 0,
    tuitionAmount: 3200,
    materialPackAmount: 800,
    virtualStage: "booked",
    materialStage: "locked",
  },
  {
    orderNo: "SO-20503",
    studentName: "張小語（家長：張雅婷）",
    branchName: "台中公益教室",
    courseCode: "CRS-ART-01",
    courseName: "兒童創意美術與媒材創作班（8 堂）",
    channel: "門市現場",
    totalSessions: 8,
    attendedSessions: 3,
    tuitionAmount: 6400,
    materialPackAmount: 1200,
    virtualStage: "booked",
    materialStage: "consumed",
  },
];

const MATERIAL_STAGE_LABEL: Record<MaterialStage, string> = {
  locked: "已預扣鎖定（未拆封領用）",
  issued: "現場已領用（實體履約）",
  consumed: "上課已耗用（實體履約）",
  returned: "完好退回入庫",
};

export function CourseBomBoard({ initialBoms, stock, live, deskUrl, onRequestShortage, onPracticeNote }: Props) {
  const action = useLiveAction();
  const [boms, setBoms] = useState<CourseBom[]>(initialBoms);
  const [branchStocks, setBranchStocks] = useState<BranchMaterialStock[]>(INITIAL_BRANCH_STOCKS);
  const [enrollments, setEnrollments] = useState<CourseEnrollmentOrder[]>(INITIAL_ENROLLMENTS);
  const [openForm, setOpenForm] = useState(false);
  const [courseCode, setCourseCode] = useState("CRS-NEW-01");
  const [courseName, setCourseName] = useState("");
  const [targetSeats, setTargetSeats] = useState("12");
  const [lines, setLines] = useState([
    { sku: stock[0]?.sku ?? "MAT-CLAY-SET", name: stock[0]?.name ?? "節慶造型輕黏土材料包", qtyPerStudent: "1", uom: "組" },
    { sku: stock[1]?.sku ?? "MAT-FRAME-01", name: stock[1]?.name ?? "木質展示相框與配件組", qtyPerStudent: "1", uom: "份" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const [moveForm, setMoveForm] = useState({
    kind: "consume" as Exclude<MovementKind, "lock">,
    sku: INITIAL_BRANCH_STOCKS[0].sku,
    qty: "2",
    fromBranch: "台北信義教室",
    toBranch: "新北板橋教室",
    reason: "週末親子班上課領用",
  });

  const shownBoms = live ? initialBoms : boms;
  const evaluated: EvaluatedCourseBom[] = shownBoms.map((b) => evaluateCourseBom(b, stock));
  const aiRecommendations = planMultiStoreReplenishment(branchStocks);
  const totalLockedStudents = evaluated.reduce((s, b) => s + b.bookedSeats, 0);

  function pickStockItem(index: number, sku: string) {
    const found = stock.find((s) => s.sku === sku);
    setLines((current) =>
      current.map((row, i) => (i === index ? { ...row, sku, name: found ? found.name : row.name } : row)),
    );
  }

  function lockOneMoreStudent(code: string) {
    setBoms((cur) =>
      cur.map((b) => (b.courseCode === code ? { ...b, bookedSeats: (b.bookedSeats ?? 0) + 1 } : b)),
    );
    const target = shownBoms.find((b) => b.courseCode === code);
    if (target) {
      onPracticeNote(
        `OMS 已為「${target.courseName}」新報名學員預先鎖定 1 人份材料包（${target.lines.map((l) => `${l.name}×${l.qtyPerStudent}`).join("、")}）。`,
      );
    }
  }

  function executeRecommendation(rec: AiInventoryRecommendation) {
    if (rec.action === "transfer" && rec.sourceBranch) {
      setBranchStocks((cur) =>
        cur.map((row) => {
          if (row.sku !== rec.sku) return row;
          if (row.branchName === rec.sourceBranch) return { ...row, onHand: Math.max(0, row.onHand - rec.qty) };
          if (row.branchName === rec.targetBranch) return { ...row, onHand: row.onHand + rec.qty };
          return row;
        }),
      );
      onPracticeNote(
        `已執行 AI 跨店調撥建議：由「${rec.sourceBranch}」調撥 ${rec.qty} ${rec.uom}「${rec.materialName}」至「${rec.targetBranch}」，免重複採購。`,
      );
      return;
    }
    onRequestShortage([{ sku: rec.sku, name: rec.materialName, shortage: rec.qty }], `${rec.targetBranch} AI 補貨`);
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    const qty = Number(moveForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (live) {
      await action.run("/api/erp/stock-movement", moveForm, (r) => String(r.message ?? "已登記庫存異動"));
      return;
    }
    setBranchStocks((cur) =>
      cur.map((row) => {
        if (row.sku !== moveForm.sku) return row;
        if (row.branchName === moveForm.fromBranch) {
          return {
            ...row,
            onHand: Math.max(0, row.onHand - qty),
            consumed30d: moveForm.kind === "consume" ? row.consumed30d + qty : row.consumed30d,
            wastage30d: moveForm.kind === "wastage" ? row.wastage30d + qty : row.wastage30d,
          };
        }
        if (moveForm.kind === "transfer" && row.branchName === moveForm.toBranch) {
          return { ...row, onHand: row.onHand + qty };
        }
        return row;
      }),
    );
    const label = MOVEMENT_LABELS[moveForm.kind];
    onPracticeNote(
      `WMS 已記錄「${label}」：${moveForm.fromBranch}${moveForm.kind === "transfer" ? ` → ${moveForm.toBranch}` : ""}（${moveForm.sku} × ${qty}）。耗用與損耗數據已同步回饋 AI 備料模型。`,
    );
  }

  async function submitBom(event: FormEvent) {
    event.preventDefault();
    const parsed = parseCourseBom({
      courseCode,
      courseName,
      targetSeats: Number(targetSeats),
      lines: lines.map((l) => ({
        sku: l.sku,
        name: l.name,
        qtyPerStudent: Number(l.qtyPerStudent),
        uom: l.uom,
      })),
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    if (!live) {
      setBoms((current) => {
        const rest = current.filter((item) => item.courseCode !== parsed.value.courseCode);
        return [parsed.value, ...rest];
      });
      setOpenForm(false);
      setCourseName("");
      onPracticeNote(`練習：已儲存「${parsed.value.courseName}」的課程 BOM（${parsed.value.lines.length} 項教材／材料），沒有送出。`);
      return;
    }
    const res = await action.run(
      "/api/erp/course-bom",
      parsed.value,
      (r) => String(r.message ?? `已儲存「${parsed.value.courseName}」的課程 BOM`),
    );
    if (res?.ok) {
      setOpenForm(false);
      setCourseName("");
    }
  }

  return (
    <div className="space-y-4">
      <ActionOutcomeNote outcome={action.outcome} />

      {/* 第一眼極簡決策區：AI 已經算好的跨店調撥與補貨建議（免翻表、一鍵確認） */}
      <section className="glass space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-medium">AI 智慧備料與跨店調撥建議（不用自己翻 20 店庫存表）</h2>
            <p className="mt-0.5 text-xs text-cream-dim">
              系統已自動把「報名預扣鎖定＋歷史損耗率＋各分店安全量」算完。能從鄰近分店調撥的絕不重複採購，點一下就完成。
            </p>
          </div>
          <Badge tone="ok">待確認 {aiRecommendations.length} 件</Badge>
        </div>

        {aiRecommendations.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {aiRecommendations.slice(0, 4).map((rec) => (
              <li key={rec.id} className="glass-well flex flex-col justify-between gap-3 p-4 text-sm">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {rec.action === "transfer"
                        ? `跨店調撥：${rec.sourceBranch} → ${rec.targetBranch}`
                        : `總部補貨請購：${rec.targetBranch}`}
                    </span>
                    <Badge tone={rec.action === "transfer" ? "ok" : "warn"}>
                      {rec.materialName} × {rec.qty} {rec.uom}
                    </Badge>
                  </div>
                  <p className="text-xs text-cream-dim">{rec.reason}</p>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => executeRecommendation(rec)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    {rec.action === "transfer" ? "一鍵跨店調撥" : "一鍵轉總部請購"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">目前 20 家據點材料皆充足，沒有需要調撥或補貨的項目。</p>
        )}
      </section>

      {/* 20 個真實客戶／分店情境一鍵模擬器 */}
      <TwentyScenariosBoard defaultCategory="WMS耗損＋20店AI調撥" onRunScenario={onPracticeNote} />

      {/* 漸進式揭露（1）：課程 BOM 與報名預扣鎖定明細（預設顯示精簡卡片，配方表單按需展開） */}
      <details className="glass p-5" open>
        <summary className="cursor-pointer select-none text-sm font-medium">
          課程 BOM 與報名材料包預扣鎖定（{evaluated.length} 門課 · 已自動鎖定 {totalLockedStudents} 人份材料包）
        </summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-cream-dim">
              CRM 預約進單即自動依 BOM 預先鎖定材料包，直接告訴你每門課「還能再收幾位學員」與「卡在哪項材料」。
            </p>
            <button
              type="button"
              onClick={() => setOpenForm((v) => !v)}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              {openForm ? "收起配方設定" : "新增／調整課程 BOM"}
            </button>
          </div>

          {openForm ? (
            <form onSubmit={submitBom} className="glass-well space-y-3 p-4" noValidate>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  <span className="field-label">課程代號</span>
                  <input
                    required
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="CRS-CLAY-02"
                    className="field"
                  />
                </label>
                <label className="text-sm">
                  <span className="field-label">課程／期班名稱</span>
                  <input
                    required
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="節慶親子手作 DIY 班（4 堂）"
                    className="field"
                  />
                </label>
                <label className="text-sm">
                  <span className="field-label">每班目標人數</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={targetSeats}
                    onChange={(e) => setTargetSeats(e.target.value)}
                    className="field"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-cream-dim">每位學員領用的教材與材料包</p>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-12">
                    <label className="text-xs sm:col-span-4">
                      <span className="sr-only">品號</span>
                      <input
                        list="bom-stock-skus"
                        value={line.sku}
                        onChange={(e) => pickStockItem(idx, e.target.value)}
                        placeholder="材料品號"
                        className="field"
                      />
                    </label>
                    <label className="text-xs sm:col-span-4">
                      <span className="sr-only">材料名稱</span>
                      <input
                        value={line.name}
                        onChange={(e) =>
                          setLines((cur) => cur.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))
                        }
                        placeholder="材料名稱"
                        className="field"
                      />
                    </label>
                    <label className="text-xs sm:col-span-2">
                      <span className="sr-only">每人數量</span>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={line.qtyPerStudent}
                        onChange={(e) =>
                          setLines((cur) => cur.map((r, i) => (i === idx ? { ...r, qtyPerStudent: e.target.value } : r)))
                        }
                        placeholder="每人用量"
                        className="field"
                      />
                    </label>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        value={line.uom}
                        onChange={(e) =>
                          setLines((cur) => cur.map((r, i) => (i === idx ? { ...r, uom: e.target.value } : r)))
                        }
                        placeholder="單位"
                        className="field"
                      />
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((cur) => cur.filter((_, i) => i !== idx))}
                          className={buttonClass({ variant: "ghost", size: "sm" })}
                          aria-label="移除這項材料"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                <datalist id="bom-stock-skus">
                  {stock.map((s) => (
                    <option key={`${s.sku}-${s.warehouse}`} value={s.sku}>
                      {s.name}
                    </option>
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={() =>
                    setLines((cur) => [...cur, { sku: "", name: "", qtyPerStudent: "1", uom: "份" }])
                  }
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                >
                  ＋ 加一項材料
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={action.busy} className={buttonClass({ variant: "secondary" })}>
                  {action.busy ? "儲存中…" : "儲存課程 BOM"}
                </button>
                {error ? (
                  <p className="field-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            {evaluated.map((bom) => {
              const shortLines = bom.lines.filter((l) => l.shortageForTarget > 0);
              return (
                <article key={bom.courseCode} className="glass-chip flex flex-col justify-between gap-3 p-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{bom.courseName}</p>
                      {bom.readyForTarget ? (
                        <Badge tone="ok">可再收 {bom.remainingSeats} 人</Badge>
                      ) : (
                        <Badge tone="warn">缺 {bom.targetSeats - bom.maxSeats} 人份</Badge>
                      )}
                    </div>
                    <p className="text-xs text-cream-dim">
                      已報名鎖定 {bom.bookedSeats} 人 ／ 目標 {bom.targetSeats} 人
                    </p>
                    <ul className="space-y-1 text-xs text-cream-dim">
                      {bom.lines.map((line) => (
                        <li key={line.sku}>
                          · {line.name}：現有 {line.onHand}（鎖定 {line.lockedQty}、可用 {line.availableQty}）
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {!live ? (
                      <button
                        type="button"
                        onClick={() => lockOneMoreStudent(bom.courseCode)}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        ＋1 人報名鎖料
                      </button>
                    ) : null}
                    {shortLines.length > 0 ? (
                      deskUrl ? (
                        <DeskLink
                          href={`${deskUrl}/app/material-request/new?material_request_type=Purchase`}
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          一鍵補齊缺料
                        </DeskLink>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestShortage(
                              shortLines.map((l) => ({ sku: l.sku, name: l.name, shortage: l.shortageForTarget })),
                              bom.courseName,
                            )
                          }
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          一鍵補齊缺料
                        </button>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </details>

      {/* 漸進式揭露（2）：退改課 × 虛實履約自動拆算（點開即看每筆學員退費明細） */}
      <details className="glass p-5">
        <summary className="cursor-pointer select-none text-sm font-medium">
          課程退改課 × 虛實履約自動拆算（{enrollments.length} 筆報名單 · 自動區分已拆封材料費與未上堂數學費）
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-xs text-cream-dim">
            不用人工查點名表或爭執材料包能不能退：系統自動依「課程堂數（虛擬履約）」與「材料包狀態（實體履約）」算出應退金額。
          </p>
          <ul className="space-y-2.5">
            {enrollments.map((order) => {
              const split = splitCourseFulfillment(order);
              return (
                <li key={order.orderNo} className="glass-chip space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{order.studentName}</span>
                      <span className="ml-2 text-xs text-cream-dim">
                        {order.branchName} · {order.channel} · {order.courseName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="ok">
                        已上 {order.attendedSessions}/{order.totalSessions} 堂
                      </Badge>
                      <Badge tone={order.materialStage === "locked" ? "ok" : "warn"}>
                        {MATERIAL_STAGE_LABEL[order.materialStage]}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-cream-dim">{split.summary}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {order.materialStage === "locked" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollments((cur) =>
                            cur.map((o) => (o.orderNo === order.orderNo ? { ...o, materialStage: "issued" } : o)),
                          );
                          onPracticeNote(`已將 ${order.studentName} 的材料包標記為「現場已領用（實體履約）」。`);
                        }}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        標記材料包已領用
                      </button>
                    ) : null}
                    {order.attendedSessions < order.totalSessions ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollments((cur) =>
                            cur.map((o) =>
                              o.orderNo === order.orderNo
                                ? { ...o, attendedSessions: o.attendedSessions + 1, materialStage: "consumed" }
                                : o,
                            ),
                          );
                          onPracticeNote(`已登記 ${order.studentName} 到課 1 堂，材料包轉為「上課已耗用」。`);
                        }}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        ＋ 記到課 1 堂
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      {/* 漸進式揭露（3）：總部 20 店跨據點庫存水位總表與手動耗損登記 */}
      <details className="glass p-5">
        <summary className="cursor-pointer select-none text-sm font-medium">
          總部 20 店跨據點材料水位總表 ＆ 手動耗用／損耗登記（北中南各分店即時同步）
        </summary>
        <div className="mt-4 space-y-4">
          <div className="sm:overflow-x-auto">
            <table className="table-stack sm:min-w-[44rem]">
              <caption className="sr-only">各據點材料水位與耗損</caption>
              <thead className="bg-ink-2">
                <tr>
                  <th scope="col">據點（北中南 20 店中台）</th>
                  <th scope="col">材料名稱</th>
                  <th scope="col">現有</th>
                  <th scope="col">已鎖定</th>
                  <th scope="col">排課預估</th>
                  <th scope="col">30 日耗用／損耗</th>
                  <th scope="col">安全量</th>
                </tr>
              </thead>
              <tbody>
                {branchStocks.map((row) => {
                  const total30 = row.consumed30d + row.wastage30d;
                  const wastePct = total30 > 0 ? Math.round((row.wastage30d / total30) * 100) : 0;
                  const short = row.onHand < row.locked + row.upcomingDemand + row.safety;
                  return (
                    <tr key={`${row.branchId}-${row.sku}`}>
                      <td data-primary="">
                        {row.branchName}
                        <span className="ml-1.5 text-xs text-cream-dim">（{row.region}）</span>
                      </td>
                      <td data-label="材料名稱">{row.materialName}</td>
                      <td data-label="現有" className={short ? "font-medium text-warn" : ""}>
                        {row.onHand} {row.uom}
                      </td>
                      <td data-label="已鎖定">
                        {row.locked} {row.uom}
                      </td>
                      <td data-label="排課預估">
                        {row.upcomingDemand} {row.uom}
                      </td>
                      <td data-label="30 日耗用／損耗">
                        耗用 {row.consumed30d} · 損耗 {row.wastage30d}（{wastePct}%）
                      </td>
                      <td data-label="安全量">
                        {row.safety} {row.uom}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form onSubmit={submitMovement} className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-6" noValidate>
            <label className="text-sm">
              <span className="field-label">WMS 異動種類</span>
              <select
                value={moveForm.kind}
                onChange={(e) => setMoveForm({ ...moveForm, kind: e.target.value as Exclude<MovementKind, "lock"> })}
                className="field"
              >
                <option value="consume">上課領用耗用</option>
                <option value="wastage">教學損耗／過期報廢</option>
                <option value="transfer">跨店庫存調撥</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="field-label">來源分店</span>
              <select
                value={moveForm.fromBranch}
                onChange={(e) => setMoveForm({ ...moveForm, fromBranch: e.target.value })}
                className="field"
              >
                {[...new Set(branchStocks.map((b) => b.branchName))].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {moveForm.kind === "transfer" ? (
              <label className="text-sm">
                <span className="field-label">調入分店</span>
                <select
                  value={moveForm.toBranch}
                  onChange={(e) => setMoveForm({ ...moveForm, toBranch: e.target.value })}
                  className="field"
                >
                  {[...new Set(branchStocks.map((b) => b.branchName))].map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm">
              <span className="field-label">材料品項</span>
              <select
                value={moveForm.sku}
                onChange={(e) => setMoveForm({ ...moveForm, sku: e.target.value })}
                className="field"
              >
                {[...new Map(branchStocks.map((b) => [b.sku, b.materialName])).entries()].map(([sku, name]) => (
                  <option key={sku} value={sku}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="field-label">數量</span>
              <input
                type="number"
                min={1}
                max={500}
                required
                value={moveForm.qty}
                onChange={(e) => setMoveForm({ ...moveForm, qty: e.target.value })}
                className="field"
              />
            </label>
            <label className="text-sm">
              <span className="field-label">備註／班級</span>
              <input
                maxLength={100}
                value={moveForm.reason}
                onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })}
                placeholder="週六親子手作班"
                className="field"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
              <button type="submit" disabled={action.busy} className={buttonClass({ variant: "secondary", size: "sm" })}>
                登記 WMS 異動
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}
