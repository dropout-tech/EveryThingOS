"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ActionNote } from "./ActionNote";
import { Badge } from "./ui/Badge";
import { Button, buttonClass } from "./ui/Button";
import { Field } from "./ui/Field";
import { demoKey, peekDemoState, useDemoState, writeDemoState } from "@/lib/demo-state";
import type { StockRow } from "@/lib/erp";
import {
  BATCH_SIZE,
  KINDS,
  KIND_IDS,
  MAX_ROWS,
  autoMap,
  buildRows,
  decodeBytes,
  failedRowsCsv,
  missingRequired,
  parseDelimited,
  prepare,
  summarize,
  templateCsv,
  toCsv,
  toTable,
  type CheckContext,
  type ImportKind,
  type Mapping,
  type PreparedRow,
  type Table,
} from "@/lib/importer";

type Lead = { name: string; stage: string; score: number; channel: string; href?: string };

type Demo = {
  packId: string;
  leads: Lead[];
  lastStage: string;
  inventory: boolean;
  existing: Record<ImportKind, string[]>;
};

type Props = { live: boolean; initialKind: ImportKind | null; demo?: Demo };

type Result = { row: number; ok: boolean; name?: string; href?: string; message?: string };
type Run = { total: number; done: number; results: Result[]; running: boolean; stopped: string | null; priceList?: string };
type Imported = Record<ImportKind, string[]>;

const STEPS = ["選種類", "貼上／上傳", "對欄位", "檢查", "匯入"] as const;
const NO_IMPORTS: Imported = { customers: [], suppliers: [], items: [] };
const SHOWN = 200;

const KIND_NOTE: Record<ImportKind, string> = {
  customers: "公司或個人、統編、聯絡人、電話、Email、地址",
  suppliers: "廠商名稱、統編、聯絡人、電話、地址",
  items: "料號、品名、售價、單位；售價會放進預設的銷售價目表",
};

/** 「先用範例試試」：故意放一列有問題、一列要提醒，看得到檢查在做什麼。 */
const SAMPLES: Record<ImportKind, string[][]> = {
  customers: [
    ["客戶名稱", "統編", "聯絡人", "手機", "Email", "地址"],
    ["宏達機械股份有限公司", "24536801", "王經理", "0912-001-001", "purchase@hongda.example.com", "台中市西屯區工業區一路 10 號"],
    ["永豐五金行", "24536871", "陳老闆", "912001002", "yf@example.com", "新北市三重區重新路一段 1 號"],
    ["立揚自動化有限公司", "24536892", "林小姐", "02-2345-6789", "buy@liyang", "高雄市前鎮區成功二路 88 號"],
    ["好日子工作室", "12345678", "張先生", "0933-123-456", "hi@goodday.example.com", ""],
    ["宏達機械股份有限公司", "24536801", "", "", "", ""],
  ],
  suppliers: [
    ["廠商名稱", "統一編號", "聯絡人", "電話", "地址"],
    ["中鋼鋼材行", "24536990", "李先生", "07-333-1234", "高雄市小港區中鋼路 1 號"],
    ["大同五金批發", "24537018", "吳小姐", "02-2591-0000", "台北市中山區中山北路三段 22 號"],
    ["新竹表面處理廠", "1234", "", "", ""],
  ],
  items: [
    ["料號", "品名", "售價", "單位", "規格"],
    ["M3-10", "螺絲 M3x10", "2.5", "個", "不鏽鋼 304"],
    ["M4-12", "螺絲 M4x12", "NT$3.2", "PCS", "不鏽鋼 304"],
    ["BRK-01", "L 型固定座", "", "個", "鋁合金陽極"],
    ["SVC-01", "到府安裝", "一千五", "次", ""],
  ],
};

function download(name: string, csv: string) {
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function post<T>(url: string, body: unknown): Promise<T & { ok: boolean; message?: string }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: "連不上 DropOut OS，請確認網路後再試" } as T & { ok: boolean; message?: string };
  }
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  return { ...data, ok: res.ok && data.ok !== false, message: data.message ?? (res.ok ? undefined : `伺服器回應 ${res.status}`) };
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ImportWizard({ live, initialKind, demo }: Props) {
  const [step, setStep] = useState(initialKind ? 1 : 0);
  const [kind, setKind] = useState<ImportKind | null>(initialKind);
  const [text, setText] = useState("");
  const [source, setSource] = useState<{ name: string; note: string } | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [rows, setRows] = useState<PreparedRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [priceList, setPriceList] = useState<string | undefined>();
  const cancel = useRef(false);
  const fileId = useId();
  const [imported, setImported] = useDemoState<Imported>(demoKey("imported", demo?.packId ?? "none"), NO_IMPORTS);

  const spec = kind ? KINDS[kind] : null;
  const missing = kind ? missingRequired(kind, mapping) : [];
  const summary = useMemo(() => summarize(rows), [rows]);

  function choose(next: ImportKind) {
    if (next !== kind) {
      setTable(null);
      setRows([]);
      setRun(null);
    }
    setKind(next);
    setProblem(null);
    setStep(1);
  }

  function loadGrid(grid: string[][], from: { name: string; note: string }) {
    if (!kind) return;
    if (grid.length < 2) {
      setProblem("至少要有一列表頭和一列資料。請連表頭一起複製。");
      return;
    }
    if (grid.length - 1 > MAX_ROWS) {
      setProblem(`一次最多 ${MAX_ROWS} 列，這份有 ${grid.length - 1} 列。請分成幾個檔案匯入。`);
      return;
    }
    const t = toTable(grid);
    setTable(t);
    setMapping(autoMap(kind, t.headers));
    setSource(from);
    setRows([]);
    setRun(null);
    setProblem(null);
    setStep(2);
  }

  function fromPaste() {
    if (!text.trim()) {
      setProblem("先把 Excel 的內容貼進來，或選一個檔案。");
      return;
    }
    loadGrid(parseDelimited(text), { name: "貼上的內容", note: "" });
  }

  async function fromFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (file.size > 10 * 1024 * 1024) {
      setProblem("檔案超過 10 MB。請只留要匯入的那一頁，或分成幾個檔案。");
      return;
    }
    if (lower.endsWith(".xls")) {
      setProblem("這是舊版 Excel（.xls）。請在 Excel 按「另存新檔」，存成 .xlsx 或 CSV 再上傳；也可以直接全選複製、貼到上面。");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
        const { readXlsx } = await import("@/lib/xlsx");
        loadGrid(await readXlsx(bytes), { name: file.name, note: "Excel 第一個工作表" });
      } else {
        const decoded = decodeBytes(bytes);
        loadGrid(parseDelimited(decoded.text), { name: file.name, note: decoded.encoding === "big5" ? "Big5 編碼（舊版 Excel 存的 CSV）" : decoded.encoding === "utf-8" ? "UTF-8" : "Unicode 文字" });
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "讀不了這個檔案，請另存成 CSV 再試。");
    }
  }

  async function check() {
    if (!kind || !table) return;
    const input = buildRows(kind, table, mapping);
    setChecking(true);
    setProblem(null);
    let ctx: CheckContext = {};
    if (live) {
      const keys = input.map((r) => r.values[KINDS[kind].key]).filter(Boolean);
      const taxIds = kind === "items" ? [] : [...new Set(input.map((r) => (r.values.tax_id ?? "").replace(/\D/g, "")).filter((t) => t.length === 8))];
      const res = await post<{ existing: { keys: string[]; taxIds: Record<string, string> }; options: CheckContext & { priceList?: string } }>("/api/import/check", { kind, keys, taxIds });
      if (!res.ok) {
        setChecking(false);
        setProblem(`沒辦法跟 ERPNext 比對：${res.message ?? "請稍後再試"}`);
        return;
      }
      ctx = { existingKeys: res.existing.keys, existingTaxIds: res.existing.taxIds, groups: res.options.groups, territories: res.options.territories, uoms: res.options.uoms };
      setPriceList(res.options.priceList);
    } else if (demo) {
      ctx = { existingKeys: [...demo.existing[kind], ...imported[kind]] };
    }
    setRows(prepare(kind, input, ctx));
    setFilter("all");
    setChecking(false);
    setStep(3);
  }

  function finishDemo(kindDone: ImportKind, done: PreparedRow[]) {
    if (!demo) return;
    const key = KINDS[kindDone].key;
    const names = done.map((r) => r.values[key]);
    setImported((current) => ({ ...current, [kindDone]: [...current[kindDone], ...names] }));
    if (kindDone === "customers") {
      const leadsKey = demoKey("leads", demo.packId);
      const leads = peekDemoState<Lead[]>(leadsKey, demo.leads);
      const known = new Set(leads.map((l) => l.name));
      const added = done.filter((r) => !known.has(r.values.customer_name)).map((r) => ({ name: r.values.customer_name, stage: demo.lastStage, score: 60, channel: "匯入" }));
      writeDemoState(leadsKey, [...added, ...leads]);
    }
    if (kindDone === "items") {
      const stockKey = demoKey("stock-imported", demo.packId);
      const stock = peekDemoState<StockRow[]>(stockKey, []);
      const known = new Set(stock.map((s) => s.sku));
      writeDemoState(stockKey, [...stock, ...done.filter((r) => !known.has(r.values.item_code)).map((r) => ({ sku: r.values.item_code, name: r.values.item_name, warehouse: "主倉", onHand: 0, safety: 0 }))]);
    }
  }

  async function start() {
    if (!kind) return;
    const ready = rows.filter((r) => r.ok);
    if (!ready.length) return;
    cancel.current = false;
    setStep(4);
    const state: Run = { total: ready.length, done: 0, results: [], running: true, stopped: null, priceList };
    setRun({ ...state });
    for (let i = 0; i < ready.length; i += BATCH_SIZE) {
      if (cancel.current) {
        state.stopped = "你按了停止，後面的列沒有送出。";
        break;
      }
      const batch = ready.slice(i, i + BATCH_SIZE);
      if (live) {
        const res = await post<{ results: Result[]; stopped: string | null }>("/api/import/run", { kind, rows: batch.map((r) => ({ row: r.row, values: r.values })) });
        if (!res.ok) {
          state.stopped = res.message ?? "匯入中斷了";
          break;
        }
        state.results.push(...res.results);
        if (res.stopped) {
          state.stopped = res.stopped;
          state.done += batch.length;
          break;
        }
      } else {
        await wait(250);
        state.results.push(...batch.map((r) => ({ row: r.row, ok: true, name: r.values[KINDS[kind].key] })));
        finishDemo(kind, batch);
      }
      state.done += batch.length;
      setRun({ ...state, results: [...state.results] });
    }
    state.running = false;
    setRun({ ...state, results: [...state.results] });
    const ok = state.results.filter((r) => r.ok).length;
    setNote(`匯入完成：${ok} 筆${KINDS[kind].noun}進來了${state.stopped ? "，有一部分沒有送出" : ""}。`);
  }

  function failedList() {
    const skipped = rows.filter((r) => !r.ok).map((r) => ({ row: r.row, reason: r.issues.filter((i) => i.level === "error").map((i) => i.problem).join("；") }));
    const sent = new Set(run?.results.map((r) => r.row) ?? []);
    const failed = run?.results.filter((r) => !r.ok).map((r) => ({ row: r.row, reason: r.message ?? "沒有成功" })) ?? [];
    const unsent = run ? rows.filter((r) => r.ok && !sent.has(r.row)).map((r) => ({ row: r.row, reason: run.stopped ?? "沒有送出" })) : [];
    return [...skipped, ...failed, ...unsent];
  }

  function downloadFailed() {
    if (!table || !kind) return;
    download(`${KINDS[kind].label}-沒進去的列.csv`, failedRowsCsv(table, failedList()));
  }

  function reset() {
    setStep(0);
    setKind(null);
    setText("");
    setTable(null);
    setRows([]);
    setRun(null);
    setSource(null);
    setProblem(null);
  }

  const reachable = (i: number) => !run?.running && (i === 0 || (i === 1 && kind) || (i === 2 && table) || (i === 3 && rows.length) || (i === 4 && run));
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "error" ? !r.ok : r.ok && r.issues.length > 0));

  return (
    <div className="space-y-5">
      <ActionNote>{note}</ActionNote>

      <ol className="import-steps" aria-label="匯入步驟">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" className="import-step" aria-current={step === i ? "step" : undefined} data-done={i < step ? "" : undefined} disabled={!reachable(i)} onClick={() => setStep(i)}>
              <span className="import-step-no" aria-hidden>
                {i < step ? "✓" : i + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {problem ? (
        <p className="toast toast-error" role="alert">
          {problem}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="space-y-3" aria-labelledby="import-kind">
          <h2 id="import-kind" className="section-title">
            要搬什麼進來？
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {KIND_IDS.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => choose(id)} aria-pressed={kind === id} className="card card-interactive import-kind h-full w-full text-left">
                  <span className="block text-lg font-medium">{KINDS[id].label}</span>
                  <span className="mt-1 block text-sm text-cream-dim">{KIND_NOTE[id]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-cream-dim">
            沒有舊檔案？先下載範本填好：
            {KIND_IDS.map((id) => (
              <button key={id} type="button" className="ml-3 underline hover:text-cream" onClick={() => download(`範本-${KINDS[id].label}.csv`, templateCsv(id))}>
                {KINDS[id].label}範本
              </button>
            ))}
          </p>
        </section>
      ) : null}

      {step === 1 && spec && kind ? (
        <section className="glass space-y-4 p-5 md:p-6" aria-labelledby="import-input">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="import-input" className="section-title">
              把{spec.label}貼進來
            </h2>
            <button type="button" className="text-sm text-cream-dim underline hover:text-cream" onClick={() => download(`範本-${spec.label}.csv`, templateCsv(kind))}>
              下載{spec.label}範本
            </button>
          </div>
          <Field label="從 Excel 複製（連表頭一起），貼在這裡" hint="在 Excel 選好範圍按 Ctrl+C（Mac 是 ⌘C），再到這裡按 Ctrl+V。">
            <textarea className="field min-h-40 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={spec.template.map((r) => r.join("\t")).join("\n")} spellCheck={false} />
          </Field>
          <div className="import-drop">
            <label htmlFor={fileId} className="field-label">
              或上傳檔案
            </label>
            <input id={fileId} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,text/csv" onChange={fromFile} className="block w-full text-sm" />
            <p className="field-hint">CSV（UTF-8 或 Big5 都可以）或 Excel（.xlsx，讀第一個工作表）。舊版 .xls 請先另存成 .xlsx 或 CSV。</p>
          </div>
          <div className="form-actions flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={fromPaste}>
              下一步：對欄位
            </Button>
            <Button variant="ghost" onClick={() => loadGrid(SAMPLES[kind], { name: "範例", note: "示範用，有一兩列故意寫錯" })}>
              先用範例試試
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 && spec && kind && table ? (
        <section className="glass space-y-4 p-5 md:p-6" aria-labelledby="import-map">
          <div>
            <h2 id="import-map" className="section-title">
              對欄位
            </h2>
            <p className="mt-1 text-sm text-cream-dim">
              {source?.name}
              {source?.note ? `（${source.note}）` : ""} · {table.rows.length} 列。已經照表頭猜好了，不對的地方改一下。
            </p>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {spec.fields.map((field) => {
              const index = mapping[field.key];
              const sample = index === null || index === undefined ? "" : table.rows.find((r) => r[index])?.[index] ?? "";
              const unmapped = field.required && (index === null || index === undefined);
              return (
                <li key={field.key}>
                  <Field
                    label={
                      <>
                        {field.label}
                        {field.required ? <span className="text-cream-dim">（必填）</span> : null}
                      </>
                    }
                    hint={sample ? `例：${sample.slice(0, 40)}` : field.hint}
                    error={unmapped ? `請選哪一欄是${field.label}。` : undefined}
                  >
                    <select className="field" value={index ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value === "" ? null : Number(e.target.value) }))}>
                      <option value="">（不匯入）</option>
                      {table.headers.map((h, i) => (
                        <option key={`${h}-${i}`} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </Field>
                </li>
              );
            })}
          </ul>
          {(() => {
            const used = new Set(Object.values(mapping).filter((v): v is number => v !== null));
            const left = table.headers.filter((_, i) => !used.has(i));
            return left.length ? <p className="text-sm text-cream-dim">這些欄不會匯入：{left.join("、")}</p> : null;
          })()}
          <div className="form-actions flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={check} disabled={missing.length > 0} pending={checking} pendingLabel={live ? "跟 ERPNext 比對中…" : "檢查中…"}>
              下一步：檢查
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>
              換一份資料
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 && spec && kind ? (
        <section className="space-y-4" aria-labelledby="import-check">
          <h2 id="import-check" className="section-title">
            檢查結果
          </h2>
          <ul className="kpi-grid">
            <li className="kpi">
              <span className="kpi-label">可以匯入</span>
              <span className="kpi-value">{summary.ready}</span>
            </li>
            <li className="kpi">
              <span className="kpi-label">有提醒，仍會匯入</span>
              <span className="kpi-value">{summary.warnings}</span>
            </li>
            <li className="kpi">
              <span className="kpi-label">有問題，會跳過</span>
              <span className="kpi-value">{summary.errors}</span>
              {summary.errors ? (
                <span className="kpi-note" data-tone="warn">
                  改好可以再匯一次
                </span>
              ) : null}
            </li>
            <li className="kpi">
              <span className="kpi-label">總共</span>
              <span className="kpi-value">{summary.total}</span>
            </li>
          </ul>
          {kind === "items" && priceList ? <p className="text-sm text-cream-dim">售價會放進「{priceList}」價目表，報價和官網會用它。</p> : null}

          <div className="toolbar flex flex-wrap items-center gap-3">
            <div className="segmented" role="group" aria-label="只看">
              {(
                [
                  ["all", `全部 ${summary.total}`],
                  ["error", `會跳過 ${summary.errors}`],
                  ["warning", `有提醒 ${summary.warnings}`],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="import-filter">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shown.length ? (
            <div className="glass">
              <div className="sm:overflow-x-auto">
                <table className="table-stack sm:min-w-[40rem]">
                  <caption className="sr-only">每一列的檢查結果</caption>
                  <thead className="bg-ink-2">
                    <tr>
                      <th scope="col" className="num" data-numeric="">
                        列
                      </th>
                      <th scope="col">{spec.fields[0].label}</th>
                      <th scope="col">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, SHOWN).map((r) => (
                      <tr key={r.row}>
                        <td data-label="列" className="num" data-numeric="">
                          {r.row}
                        </td>
                        <td data-primary="">{r.values[spec.fields[0].key] || <span className="text-cream-dim">（空白）</span>}</td>
                        <td data-label="結果">
                          {r.issues.length ? (
                            <ul className="space-y-1">
                              {r.issues.map((issue, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                                  <Badge tone={issue.level === "error" ? "danger" : "warn"}>{issue.level === "error" ? "跳過" : "提醒"}</Badge>
                                  <span>{issue.problem}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <Badge tone="ok">可以</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-cream-dim">這一類沒有。</p>
          )}
          {shown.length > SHOWN ? <p className="text-xs text-cream-dim">只列出前 {SHOWN} 列；全部的問題可以下載。</p> : null}

          <div className="form-actions flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={start} disabled={!summary.ready}>
              {summary.ready ? `匯入 ${summary.ready} 筆${summary.errors ? `（跳過 ${summary.errors} 筆）` : ""}` : "沒有可以匯入的列"}
            </Button>
            {summary.errors ? (
              <Button variant="secondary" onClick={downloadFailed}>
                下載有問題的列
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setStep(2)}>
              回去改欄位
            </Button>
          </div>
          {live ? null : <p className="text-xs text-cream-dim">示範模式：匯入的資料只存在這個瀏覽器分頁，不會送到任何地方。</p>}
        </section>
      ) : null}

      {step === 4 && spec && kind && run ? (
        <section className="glass space-y-4 p-5 md:p-6" aria-labelledby="import-run">
          <h2 id="import-run" className="section-title">
            {run.running ? `匯入中…` : "匯入完成"}
          </h2>
          <div className="progress" role="progressbar" aria-label="匯入進度" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
            <span style={{ width: `${run.total ? Math.round((run.done / run.total) * 100) : 0}%` }} />
          </div>
          <p className="text-sm" role="status">
            {run.done}／{run.total} 筆已處理
            {run.running ? "，請不要關掉這一頁。" : "。"}
          </p>
          {(() => {
            const ok = run.results.filter((r) => r.ok);
            const failed = failedList();
            return (
              <>
                <ul className="kpi-grid">
                  <li className="kpi">
                    <span className="kpi-label">進來了</span>
                    <span className="kpi-value">{ok.length}</span>
                  </li>
                  <li className="kpi">
                    <span className="kpi-label">沒進去</span>
                    <span className="kpi-value">{run.running ? "…" : failed.length}</span>
                  </li>
                </ul>
                {run.stopped ? <p className="text-sm text-warn">{run.stopped}</p> : null}
                {!run.running && failed.length ? (
                  <div className="space-y-2">
                    <ul className="space-y-1 text-sm">
                      {failed.slice(0, 20).map((f) => (
                        <li key={f.row}>
                          第 {f.row} 列：<span className="text-cream-dim">{f.reason}</span>
                        </li>
                      ))}
                    </ul>
                    {failed.length > 20 ? <p className="text-xs text-cream-dim">還有 {failed.length - 20} 列，全部在下載的檔案裡。</p> : null}
                  </div>
                ) : null}
                {!run.running && ok.length ? (
                  <details className="disclosure">
                    <summary className="text-sm">
                      <span className="disclosure-mark" aria-hidden>
                        ›
                      </span>
                      看進來的 {ok.length} 筆
                    </summary>
                    <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                      {ok.slice(0, 100).map((r) => (
                        <li key={r.row}>
                          {r.href ? (
                            <a href={r.href} target="_blank" rel="noreferrer" className="underline hover:text-cream">
                              {r.name}
                            </a>
                          ) : (
                            r.name
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            );
          })()}
          <div className="form-actions flex flex-wrap items-center gap-2">
            {run.running ? (
              <Button variant="secondary" onClick={() => (cancel.current = true)}>
                停止
              </Button>
            ) : (
              <>
                {kind === "customers" ? (
                  <Link href="/workspace/crm" className={buttonClass({ variant: "primary" })}>
                    去看客人
                  </Link>
                ) : kind === "items" && (live || demo?.inventory) ? (
                  <Link href="/workspace/erp/stock" className={buttonClass({ variant: "primary" })}>
                    去看商品庫存
                  </Link>
                ) : kind === "suppliers" ? (
                  <Link href="/workspace/erp/purchase" className={buttonClass({ variant: "primary" })}>
                    去進貨
                  </Link>
                ) : null}
                {failedList().length ? (
                  <Button variant="secondary" onClick={downloadFailed}>
                    下載沒進去的列（CSV）
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={reset}>
                  再匯一份
                </Button>
              </>
            )}
          </div>
          {!live && !run.running ? (
            <p className="text-xs text-cream-dim">
              示範模式：{kind === "customers" ? "客人已經放進「客人」看板的最後一欄。" : kind === "items" ? (demo?.inventory ? "商品已經放進「倉庫」清單。" : "這個產業沒有倉庫頁，商品列在上面。") : "供應商列在上面；接上 ERPNext 後會出現在進貨的廠商清單。"}只存在這個瀏覽器分頁。
            </p>
          ) : null}
        </section>
      ) : null}

      {demo && (imported.customers.length || imported.suppliers.length || imported.items.length) && step !== 4 ? (
        <p className="text-xs text-cream-dim">
          這個分頁已經匯入：
          {KIND_IDS.filter((id) => imported[id].length)
            .map((id) => `${KINDS[id].label} ${imported[id].length} 筆`)
            .join("、")}
          。
          <button type="button" className="ml-2 underline hover:text-cream" onClick={() => download("示範匯入紀錄.csv", toCsv([["種類", "名稱"], ...KIND_IDS.flatMap((id) => imported[id].map((n) => [KINDS[id].label, n]))]))}>
            下載紀錄
          </button>
        </p>
      ) : null}
    </div>
  );
}
