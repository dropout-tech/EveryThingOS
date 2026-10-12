"use client";

import { useState, type FormEvent } from "react";
import { ActionOutcomeNote, useLiveAction } from "./LiveAction";

const field = "field";

/** 新增一個人. Same email or phone as someone already known opens that person instead of making a duplicate. */
export function LiveLeadForm({ emphasis = "primary" }: { emphasis?: "primary" | "secondary" }) {
  const action = useLiveAction();
  const [form, setForm] = useState({ name: "", company_name: "", email: "", phone: "", notes: "" });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await action.run("/api/crm/lead", form, (r) => (r.existing ? `這個人已經在了（${r.party}），沒有重複建立。` : `已新增 ${form.name || form.email || form.phone}。`));
    if (result?.ok) setForm({ name: "", company_name: "", email: "", phone: "", notes: "" });
  }

  return (
    <form onSubmit={submit} className="glass space-y-2 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-sm sm:w-auto">
          <span className="field-label">名字</span>
          <input value={form.name} onChange={set("name")} maxLength={140} className={`${field} sm:w-36`} />
        </label>
        <label className="w-full text-sm sm:w-auto">
          <span className="field-label">公司</span>
          <input value={form.company_name} onChange={set("company_name")} maxLength={140} className={`${field} sm:w-40`} />
        </label>
        <label className="w-full text-sm sm:w-auto">
          <span className="field-label">Email</span>
          <input type="email" value={form.email} onChange={set("email")} className={`${field} sm:w-52`} />
        </label>
        <label className="w-full text-sm sm:w-auto">
          <span className="field-label">手機</span>
          <input value={form.phone} onChange={set("phone")} inputMode="tel" placeholder="0912345678" className={`${field} sm:w-36`} />
        </label>
        <label className="w-full text-sm sm:w-auto">
          <span className="field-label">怎麼認識的</span>
          <input value={form.notes} onChange={set("notes")} maxLength={500} placeholder="展場、介紹…" className={`${field} sm:w-44`} />
        </label>
        <button type="submit" disabled={action.busy} className={emphasis === "primary" ? "btn btn-primary" : "btn btn-secondary"}>
          {action.busy ? "新增中…" : "新增一個人"}
        </button>
      </div>
      <p className="text-xs text-cream-dim">只是認識不等於同意收電子報；要寄電子報，請對方從官網表單或確認信同意。</p>
      <ActionOutcomeNote outcome={action.outcome} />
    </form>
  );
}
