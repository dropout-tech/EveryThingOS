"use client";

import { useState, type FormEvent } from "react";
import { buttonClass } from "./ui/Button";
import type { useLiveAction } from "./LiveAction";
import { OVERTIME_KINDS, parseOvertime, type OvertimeKind } from "@/lib/overtime";

type Props = {
  staff: { id: string; name: string }[];
  today: string;
  live: boolean;
  run: ReturnType<typeof useLiveAction>["run"];
  busy: boolean;
  onPractice: (message: string) => void;
};

/** HR enters approved overtime; ERPNext applies the 勞基法 multipliers and caps and adds it to that month's payslip. */
export function OvertimeForm({ staff, today, live, run, busy, onPractice }: Props) {
  const [form, setForm] = useState({ employee: staff[0]?.id ?? "", work_date: today, hours: "2", kind: "weekday" as OvertimeKind, reason: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseOvertime(form);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    const who = staff.find((s) => s.id === parsed.value.employee)?.name ?? parsed.value.employee;
    if (!live) {
      onPractice(`練習：${who} ${OVERTIME_KINDS[parsed.value.kind]} ${parsed.value.hours} 小時，沒有送出。接上 ERPNext 後會依倍數算出加班費，進當月薪資單。`);
      return;
    }
    const result = await run("/api/hr/overtime", parsed.value, (r) => String(r.message ?? `已記 ${who} 的加班`));
    if (result?.ok) setForm((current) => ({ ...current, hours: "2", reason: "" }));
  }

  if (!staff.length) return <p className="text-sm text-cream-dim">還沒有在職員工，先到 ERPNext 建員工資料。</p>;

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" noValidate>
      <label className="text-sm">
        <span className="field-label">誰</span>
        <select value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} className="field">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="field-label">哪一天</span>
        <input type="date" required value={form.work_date} max={today} onChange={(e) => setForm({ ...form, work_date: e.target.value })} className="field" />
      </label>
      <label className="text-sm">
        <span className="field-label">加班時數</span>
        <input type="number" inputMode="decimal" min={0.5} max={24} step={0.5} required value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className="field" />
      </label>
      <label className="text-sm">
        <span className="field-label">種類</span>
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as OvertimeKind })} className="field">
          {Object.entries(OVERTIME_KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="field-label">事由（選填）</span>
        <input maxLength={200} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="趕出貨" className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
        <button type="submit" disabled={busy} className={buttonClass({ variant: "secondary" })}>
          {busy ? "處理中…" : "記進薪資"}
        </button>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-cream-dim">填主管核准的時數。超過一日 12 小時或當月上限，系統會擋下並說明條文。</p>
        )}
      </div>
    </form>
  );
}
