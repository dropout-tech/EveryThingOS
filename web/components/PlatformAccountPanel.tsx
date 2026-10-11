"use client";

import { useState } from "react";
import { ConfirmAction } from "./ConfirmAction";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import type { PlatformAccount } from "@/lib/platform";

const field = "site-field !mt-1 !py-2";

/** Renew, suspend, resume, cancel and edit one company. Every change is written to the account's history. */
export function PlatformAccountPanel({ account }: { account: PlatformAccount }) {
  const action = useLiveAction();
  const path = `/api/platform/accounts/${encodeURIComponent(account.site)}`;
  const [reference, setReference] = useState("");
  const [form, setForm] = useState({
    company: account.company,
    contact_email: account.contact_email ?? "",
    tax_id: account.tax_id ?? "",
    billing_address: account.billing_address ?? "",
    hosts: account.hosts.join(", "),
    trial_ends: account.trial_ends ?? "",
    renews_on: account.renews_on ?? "",
  });
  const describe = (r: { message?: string }) => String(r.message ?? "已更新");

  return (
    <div className="space-y-4">
      <ActionOutcomeNote outcome={action.outcome} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-cream-dim">
          收款單號（記在紀錄裡）
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ACC-SINV-…" className={`${field} w-48`} />
        </label>
        <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "renew", years: 1, reference }, describe)} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
          續約一年
        </button>
        <span className="mx-1 hidden h-8 w-px bg-[var(--line)] sm:block" aria-hidden />
        {account.state === "active" ? (
          <ConfirmAction
            label="暫停（只能看）"
            title={`暫停 ${account.company}？`}
            body="暫停後這家公司只能看和匯出，不能新增或修改單據，會議機器人也會停。之後可以按「恢復」。"
            confirmLabel="暫停"
            reason={{ label: "暫停原因（會記在紀錄、顯示給客戶）", placeholder: "例：帳款未付", required: true }}
            onConfirm={(reason) => action.run(path, { action: "state", state: "suspended", reason }, describe)}
            disabled={action.busy}
            className="glass-pill px-4 py-2 text-sm disabled:opacity-50"
          />
        ) : (
          <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "state", state: "active" }, describe)} className="glass-pill px-4 py-2 text-sm disabled:opacity-50">
            恢復
          </button>
        )}
        {account.state !== "cancelled" ? (
          <ConfirmAction
            label="解約"
            title={`跟 ${account.company} 解約？`}
            body="解約後只能看和匯出資料，期限過後站台與備份會刪除（依服務條款）。這個動作不容易回復。"
            confirmLabel="確定解約"
            reason={{ label: "解約原因", placeholder: "例：客戶不續約" }}
            typeToConfirm={account.company}
            onConfirm={(reason) => action.run(path, { action: "state", state: "cancelled", reason }, describe)}
            disabled={action.busy}
            className="site-chip site-chip-icon !px-4 !py-2 !text-sm disabled:opacity-50"
            tone="bad"
          />
        ) : null}
      </div>
      <details className="rounded-2xl border border-[var(--line)]">
        <summary className="cursor-pointer px-4 py-3 text-sm">修改公司資料</summary>
        <form
          className="grid gap-3 border-t border-[var(--line)] p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(
              path,
              {
                action: "update",
                company: form.company,
                contact_email: form.contact_email || null,
                tax_id: form.tax_id.trim() || null,
                billing_address: form.billing_address.trim() || null,
                hosts: form.hosts.split(/[,\s]+/).filter(Boolean),
                trial_ends: form.trial_ends || null,
                renews_on: form.renews_on || null,
              },
              describe,
            );
          }}
        >
          {(
            [
              ["company", "公司名稱", "text"],
              ["contact_email", "聯絡人 Email（收帳單與發票）", "email"],
              ["tax_id", "統編（有填就開三聯式）", "text"],
              ["billing_address", "發票地址（有統編必填）", "text"],
              ["hosts", "網址（逗號分隔）", "text"],
              ["trial_ends", "試用到", "date"],
              ["renews_on", "年約到", "date"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="text-xs text-cream-dim">
              {label}
              <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={field} />
            </label>
          ))}
          <div className="flex items-end">
            <button type="submit" disabled={action.busy} className="glass-cta rounded-full px-5 py-2 text-sm disabled:opacity-50">
              {action.busy ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
