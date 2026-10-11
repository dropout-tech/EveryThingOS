"use client";

import { useState } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";
import type { PlatformAccount } from "@/lib/platform";

const field = "mt-1 rounded-lg border border-[var(--line)] bg-ink px-3 py-2 text-cream";

/** Renew, suspend, resume, cancel and edit one company. Every change is written to the account's history. */
export function PlatformAccountPanel({ account }: { account: PlatformAccount }) {
  const action = useLiveAction();
  const path = `/api/platform/accounts/${encodeURIComponent(account.site)}`;
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({
    company: account.company,
    contact_email: account.contact_email ?? "",
    hosts: account.hosts.join(", "),
    trial_ends: account.trial_ends ?? "",
    renews_on: account.renews_on ?? "",
  });
  const describe = (r: { message?: string }) => String(r.message ?? "已更新");

  return (
    <div className="space-y-4">
      <ActionOutcomeNote outcome={action.outcome} />
      <section className="glass flex flex-wrap items-end gap-2 p-4">
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">收款單號（記在紀錄裡）</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ACC-SINV-…" className={`${field} w-44`} />
        </label>
        <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "renew", years: 1, reference }, describe)} className="glass-cta rounded-full px-4 py-2 text-sm disabled:opacity-50">
          續約一年
        </button>
        <label className="text-sm">
          <span className="block text-xs text-cream-dim">暫停原因</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="帳款未付…" className={`${field} w-44`} />
        </label>
        {account.state === "active" ? (
          <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "state", state: "suspended", reason }, describe)} className="glass-pill px-4 py-2 text-sm disabled:opacity-50">
            暫停（只能看）
          </button>
        ) : (
          <button type="button" disabled={action.busy} onClick={() => action.run(path, { action: "state", state: "active" }, describe)} className="glass-pill px-4 py-2 text-sm disabled:opacity-50">
            恢復
          </button>
        )}
        {account.state !== "cancelled" ? (
          <button
            type="button"
            disabled={action.busy}
            onClick={() => {
              if (window.prompt(`解約後只能看和匯出。輸入公司名稱「${account.company}」確認`) === account.company) action.run(path, { action: "state", state: "cancelled", reason }, describe);
            }}
            className="px-2 py-2 text-sm text-orange disabled:opacity-50"
          >
            解約
          </button>
        ) : null}
      </section>
      <form
        className="glass grid gap-2 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          action.run(
            path,
            {
              action: "update",
              company: form.company,
              contact_email: form.contact_email || null,
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
            ["contact_email", "聯絡人 Email", "email"],
            ["hosts", "網址（逗號分隔）", "text"],
            ["trial_ends", "試用到", "date"],
            ["renews_on", "年約到", "date"],
          ] as const
        ).map(([key, label, type]) => (
          <label key={key} className="text-sm">
            <span className="block text-xs text-cream-dim">{label}</span>
            <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${field} w-full`} />
          </label>
        ))}
        <div className="flex items-end">
          <button type="submit" disabled={action.busy} className="glass-pill px-4 py-2 text-sm disabled:opacity-50">
            存
          </button>
        </div>
      </form>
    </div>
  );
}
