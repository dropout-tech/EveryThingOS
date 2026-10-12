"use client";

import { useState, type FormEvent } from "react";
import { formatTwd } from "@/lib/erp";
import type { Catalog } from "@/lib/sources/types";
import type { useLiveAction } from "./LiveAction";

type Line = { item_code: string; qty: string; rate: string };

const field = "field";

/** 開一張報價 straight into ERPNext: pick who, pick what, the price list fills the rest. */
export function LiveQuoteForm({ catalog, action, emphasis = "primary" }: { catalog: Catalog; action: ReturnType<typeof useLiveAction>; emphasis?: "primary" | "secondary" }) {
  const [party, setParty] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_code: "", qty: "1", rate: "" }]);
  const price = (code: string) => catalog.items.find((i) => i.item_code === code)?.rate ?? null;
  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (l.rate ? Number(l.rate) : price(l.item_code) ?? 0), 0);

  if (!catalog.items.length || !catalog.parties.length) {
    return (
      <p className="text-xs text-cream-dim">
        {!catalog.parties.length ? "還沒有客人" : "還沒有可以賣的商品"}。先在「客人」新增，或用導入工具匯入，就能在這裡開報價。
      </p>
    );
  }

  function update(i: number, patch: Partial<Line>) {
    setLines((current) => current.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const [party_type, name] = party.split("::");
    const items = lines.filter((l) => l.item_code).map((l) => ({ item_code: l.item_code, qty: Number(l.qty) || 1, rate: l.rate === "" ? null : Number(l.rate.replace(/[,，\s]/g, "")) }));
    const result = await action.run("/api/erp/quotation", { party_type, party: name, items }, (r) => `已開報價 ${r.created!.name}，含稅 ${formatTwd(Number((r.created as { grand_total?: number }).grand_total ?? 0))}。`);
    if (result?.ok) setLines([{ item_code: "", qty: "1", rate: "" }]);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label className="block text-sm">
        <span className="field-label">給誰</span>
        <select required value={party} onChange={(e) => setParty(e.target.value)} className={`${field} sm:w-64`}>
          <option value="">選客人</option>
          {catalog.parties.map((p) => (
            <option key={`${p.party_type}::${p.party}`} value={`${p.party_type}::${p.party}`}>
              {p.label}
              {p.party_type === "Lead" ? "（潛在）" : ""}
            </option>
          ))}
        </select>
      </label>
      {lines.map((line, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="w-full text-sm sm:w-auto">
            <span className="field-label">賣什麼</span>
            <select required={i === 0} value={line.item_code} onChange={(e) => update(i, { item_code: e.target.value })} className={`${field} sm:w-56`}>
              <option value="">選商品</option>
              {catalog.items.map((item) => (
                <option key={item.item_code} value={item.item_code}>
                  {item.item_name}
                  {item.rate != null ? `　${formatTwd(item.rate)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full text-sm sm:w-auto">
            <span className="field-label">數量</span>
            <input value={line.qty} onChange={(e) => update(i, { qty: e.target.value })} inputMode="decimal" className={`${field} sm:w-20`} />
          </label>
          <label className="w-full text-sm sm:w-auto">
            <span className="field-label">單價（空白用價目表）</span>
            <input value={line.rate} onChange={(e) => update(i, { rate: e.target.value })} inputMode="decimal" placeholder={price(line.item_code)?.toString() ?? ""} className={`${field} sm:w-28`} />
          </label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setLines((c) => [...c, { item_code: "", qty: "1", rate: "" }])} className="btn btn-secondary btn-sm">
          再加一項
        </button>
        <button type="submit" disabled={action.busy} className={emphasis === "primary" ? "btn btn-primary" : "btn btn-secondary"}>
          {action.busy ? "開單中…" : "開一張報價"}
        </button>
        <span className="text-xs text-cream-dim">未稅約 {formatTwd(total)}；稅依 ERPNext 的稅別範本計算。</span>
      </div>
    </form>
  );
}
