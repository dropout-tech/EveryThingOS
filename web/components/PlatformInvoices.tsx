"use client";

import { useState } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import type { GatewayStatus, PlatformInvoice } from "@/lib/platform";

const field = "rounded-lg border border-[var(--line)] bg-ink px-3 py-1.5 text-cream";

const ntd = (n: number) => `NT$${n.toLocaleString("en-US")}`;

const STATUS: Record<PlatformInvoice["status"], string> = { open: "未付", paid: "已付", void: "作廢" };

/** One company's renewal invoices: mark paid offline, void, resend the payment link, retry the e-invoice. */
export function PlatformInvoices({ site, invoices, gateway }: { site: string; invoices: PlatformInvoice[]; gateway: GatewayStatus | null }) {
  const action = useLiveAction();
  const path = "/api/platform/invoices";
  const [reference, setReference] = useState<Record<string, string>>({});
  const describe = (r: { message?: string }) => String(r.message ?? "已更新");
  const hasOpen = invoices.some((i) => i.status === "open");

  return (
    <section className="glass-well space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm">帳單</h3>
        {hasOpen ? null : (
          <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "create", site }, describe)} className="glass-pill px-3 py-1.5 text-xs disabled:opacity-50">
            開這期帳單
          </button>
        )}
      </div>
      {gateway && gateway.ecpay !== "production" ? (
        <p className="text-xs text-orange">{gateway.ecpay ? "線上付款接的是綠界測試環境，不會真的扣款。" : "膠水沒有設定綠界，付款連結只會請客戶回信。"}</p>
      ) : null}
      <ActionOutcomeNote outcome={action.outcome} />
      {invoices.length ? (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id} className="glass-chip space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className={inv.status === "open" ? "text-orange" : inv.status === "void" ? "text-cream-dim line-through" : ""}>{STATUS[inv.status]}</span>
                <span>{inv.id}</span>
                <span>{ntd(inv.amount)}</span>
                <span className="text-cream-dim">
                  {inv.buyer_name}
                  {inv.buyer_tax_id ? ` · 統編 ${inv.buyer_tax_id}` : ""} · 開立 {inv.created_at.slice(0, 10)}
                </span>
              </div>
              {inv.status === "paid" ? (
                <p className="text-xs text-cream-dim">
                  {inv.paid_at?.slice(0, 10)} {inv.paid_via === "ecpay" ? `綠界 ${inv.trade_no}` : `線下 ${inv.reference ?? ""}`}
                  {inv.renewed_until ? ` · 續約到 ${inv.renewed_until}` : ""}
                  {" · "}
                  {inv.einvoice_number ? (
                    `發票 ${inv.einvoice_number}`
                  ) : inv.einvoice_error ? (
                    <span className="text-orange">發票沒開成：{inv.einvoice_error}</span>
                  ) : gateway?.einvoice ? (
                    "發票處理中"
                  ) : (
                    "沒設定電子發票，請在加值中心手動開"
                  )}
                </p>
              ) : null}
              {inv.status === "void" && inv.void_reason ? <p className="text-xs text-cream-dim">作廢原因：{inv.void_reason}</p> : null}
              {inv.status === "open" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={reference[inv.id] ?? ""}
                    onChange={(e) => setReference({ ...reference, [inv.id]: e.target.value })}
                    placeholder="匯款末五碼或收款單號"
                    className={`${field} w-48`}
                  />
                  <button type="button" disabled={action.busy || !reference[inv.id]?.trim()} onClick={() => action.run(path, { action: "paid", id: inv.id, reference: reference[inv.id] }, describe)} className="glass-cta rounded-full px-3 py-1.5 text-xs disabled:opacity-50">
                    標記已付款（會續約一年）
                  </button>
                  <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "resend", id: inv.id }, describe)} className="glass-pill px-3 py-1.5 text-xs disabled:opacity-50">
                    寄付款連結
                  </button>
                  {inv.pay_url ? (
                    <button type="button" onClick={() => navigator.clipboard?.writeText(inv.pay_url!)} className="px-2 py-1.5 text-xs text-teal">
                      複製連結
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={() => {
                      const reason = window.prompt(`作廢 ${inv.id}？寫一下原因（例：統編寫錯、不續約）`);
                      if (reason !== null) action.run(path, { action: "void", id: inv.id, reason }, describe);
                    }}
                    className="px-2 py-1.5 text-xs text-orange disabled:opacity-50"
                  >
                    作廢
                  </button>
                </div>
              ) : null}
              {inv.status === "paid" && !inv.einvoice_number && gateway?.einvoice ? (
                <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "einvoice", id: inv.id }, describe)} className="glass-pill px-3 py-1.5 text-xs disabled:opacity-50">
                  重開發票
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-cream-dim">還沒有帳單。年約到期前 60 天會自動開。</p>
      )}
    </section>
  );
}
