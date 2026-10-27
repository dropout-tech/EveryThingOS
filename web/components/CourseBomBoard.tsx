"use client";

import { useState, type FormEvent } from "react";
import { DeskLink } from "./DeskLink";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { evaluateCourseBom, parseCourseBom, type CourseBom, type EvaluatedCourseBom } from "@/lib/course-bom";
import type { StockRow } from "@/lib/erp";

type Props = {
  initialBoms: CourseBom[];
  stock: StockRow[];
  live: boolean;
  deskUrl?: string;
  onRequestShortage: (items: { sku: string; name: string; shortage: number }[], courseName: string) => void;
  onPracticeNote: (message: string) => void;
};

export function CourseBomBoard({ initialBoms, stock, live, deskUrl, onRequestShortage, onPracticeNote }: Props) {
  const action = useLiveAction();
  const [boms, setBoms] = useState<CourseBom[]>(initialBoms);
  const [openForm, setOpenForm] = useState(false);
  const [courseCode, setCourseCode] = useState("CRS-NEW-01");
  const [courseName, setCourseName] = useState("");
  const [targetSeats, setTargetSeats] = useState("12");
  const [lines, setLines] = useState([
    { sku: stock[0]?.sku ?? "MAT-BOOK-01", name: stock[0]?.name ?? "課程講義", qtyPerStudent: "1", uom: "本" },
    { sku: stock[1]?.sku ?? "MAT-KIT-01", name: stock[1]?.name ?? "實驗材料包", qtyPerStudent: "1", uom: "組" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const shownBoms = live ? initialBoms : boms;
  const evaluated: EvaluatedCourseBom[] = shownBoms.map((b) => evaluateCourseBom(b, stock));

  function pickStockItem(index: number, sku: string) {
    const found = stock.find((s) => s.sku === sku);
    setLines((current) =>
      current.map((row, i) => (i === index ? { ...row, sku, name: found ? found.name : row.name } : row)),
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
    <section className="glass space-y-4 p-5">
      <ActionOutcomeNote outcome={action.outcome} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">課程 BOM（每堂／每期教材與材料配方）</h2>
          <p className="mt-1 text-xs text-cream-dim">
            對應 ERPNext 的商品組合（Product Bundle）。學員報名出貨時自動按配方扣減講義與材料包；開班前先算現有材料夠收幾位學員。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenForm((v) => !v)}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          {openForm ? "收起配方表單" : "新增／調整課程 BOM"}
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
                placeholder="CRS-STEAM-02"
                className="field"
              />
            </label>
            <label className="text-sm">
              <span className="field-label">課程／期班名稱</span>
              <input
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="進階機器人實作班（8 堂）"
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
                    placeholder="材料品號（如 MAT-KIT-01）"
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
            ) : (
              <p className="text-xs text-cream-dim">同一個課程代號會更新既有配方；材料品號不存在時會自動建立庫存品。</p>
            )}
          </div>
        </form>
      ) : null}

      {evaluated.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {evaluated.map((bom) => {
            const shortLines = bom.lines.filter((l) => l.shortageForTarget > 0);
            return (
              <article key={bom.courseCode} className="glass-chip space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{bom.courseName}</p>
                    <p className="text-xs text-cream-dim">
                      代號 {bom.courseCode} · 目標開班 {bom.targetSeats} 人
                    </p>
                  </div>
                  {bom.readyForTarget ? (
                    <Badge tone="ok">材料夠開 {bom.maxSeats} 人</Badge>
                  ) : (
                    <Badge tone="warn">
                      只夠 {bom.maxSeats} 人（缺 {bom.targetSeats - bom.maxSeats} 人份）
                    </Badge>
                  )}
                </div>

                <ul className="space-y-1.5 text-xs">
                  {bom.lines.map((line) => (
                    <li key={line.sku} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {line.name}
                        <span className="ml-1.5 text-cream-dim">
                          （每人 {line.qtyPerStudent} {line.uom}）
                        </span>
                      </span>
                      <span className={line.shortageForTarget > 0 ? "font-medium text-warn" : "text-cream-dim"}>
                        現有 {line.onHand} {line.uom} · 夠 {line.supportedSeats} 人
                        {line.shortageForTarget > 0 ? `（開滿還缺 ${line.shortageForTarget} ${line.uom}）` : ""}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {bom.bottleneck && !bom.readyForTarget ? (
                    <p className="text-xs text-warn">
                      卡在「{bom.bottleneck.name}」還缺 {bom.bottleneck.shortageForTarget} {bom.bottleneck.uom}
                    </p>
                  ) : (
                    <p className="text-xs text-cream-dim">開單出貨時自動按人數扣減材料</p>
                  )}
                  <div className="flex items-center gap-2">
                    {shortLines.length > 0 ? (
                      deskUrl ? (
                        <DeskLink
                          href={`${deskUrl}/app/material-request/new?material_request_type=Purchase`}
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          補齊這班缺料
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
                          補齊這班缺料
                        </button>
                      )
                    ) : null}
                    {bom.href ? (
                      <DeskLink href={bom.href} className="text-xs text-cream-dim underline hover:text-cream">
                        打開
                      </DeskLink>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-cream-dim">
          還沒有設定課程 BOM。點右上角「新增／調整課程 BOM」，把每門課要發給學員的講義與材料包配起來。
        </p>
      )}
    </section>
  );
}
