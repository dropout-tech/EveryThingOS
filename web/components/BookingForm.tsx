"use client";

import { useState, type FormEvent } from "react";
import { parseBooking, type BookingChannel } from "@/lib/booking";
import type { TradeField } from "@/lib/trade";

export type BookableCourse = { code: string; name: string; label: string; full: boolean };

type Result = { status?: "locked" | "waitlist" | "pending" | "duplicate" | "full"; message?: string };

const SLOTS = ["10:00", "13:30", "15:30", "19:00"];

function tomorrow() {
  const d = new Date(Date.now() + 8 * 3600_000 + 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function BookingForm({ courses, branches, channel, demo, legend = "課程", partyLabel = "稱呼", verb = "預約", fields = [] }: { courses: BookableCourse[]; branches: string[]; channel: BookingChannel; demo: boolean; legend?: string; partyLabel?: string; verb?: string; fields?: TradeField[] }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = { ...Object.fromEntries(new FormData(event.currentTarget).entries()), channel };
    const extra = fields
      .map((field) => {
        const value = String(data[field.name] ?? "").trim();
        return value ? `${field.label}：${value}` : "";
      })
      .filter(Boolean);
    if (extra.length) data.note = [data.note, ...extra].filter(Boolean).join("；");
    const checked = parseBooking(data);
    if (!checked.ok) {
      setFailure(checked.message);
      return;
    }
    setFailure(null);
    setBusy(true);
    try {
      const res = await fetch("/api/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as Result & { ok: boolean };
      if (!body.ok) setFailure(body.message ?? "送不出去，請直接傳 LINE 給門市");
      else setResult(body);
    } catch {
      setFailure("網路不穩，請再按一次");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const title = result.status === "locked" ? "預約完成" : result.status === "duplicate" ? "不會重複劃位" : result.status === "full" || result.status === "waitlist" ? "已排候補" : "已收到預約";
    return (
      <div className="site-sheet p-6 sm:p-8" role="status">
        <h2 className="text-2xl font-medium">{title}</h2>
        <p className="mt-3 text-cream-dim">{result.message}</p>
        <button type="button" className="btn mt-6" onClick={() => setResult(null)}>
          再約一堂
        </button>
      </div>
    );
  }

  const dateLabel = fields.find((field) => field.name === "date")?.label ?? "日期";
  const slotField = fields.find((field) => field.name === "slot");
  const seatsLabel = fields.find((field) => field.name === "seats")?.label ?? "人數";
  const extra = fields.filter((field) => !["date", "slot", "seats"].includes(field.name));
  const slots = slotField?.options?.length ? slotField.options : SLOTS;

  return (
    <form onSubmit={submit} className="site-sheet space-y-4 p-6 sm:p-8" noValidate>
      <fieldset>
        <legend className="text-sm">{legend}</legend>
        <div className="mt-2 space-y-2">
          {courses.map((c, i) => (
            <label key={c.code} className="glass-chip flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3">
                <input type="radio" name="courseCode" value={c.code} defaultChecked={i === courses.findIndex((x) => !x.full)} />
                {c.name}
              </span>
              <span className="text-xs text-cream-dim">{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          分店
          <select name="branch" className="site-field mt-1">
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {seatsLabel}
          <input name="seats" type="number" min={1} max={10} defaultValue={1} className="site-field mt-1" />
        </label>
        <label className="text-sm">
          {dateLabel}
          <input name="date" type="date" defaultValue={tomorrow()} className="site-field mt-1" />
        </label>
        <label className="text-sm">
          {slotField?.label ?? "時段"}
          <select name="slot" className="site-field mt-1">
            {slots.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {partyLabel}
          <input name="parentName" autoComplete="name" className="site-field mt-1" />
        </label>
        <label className="text-sm">
          手機
          <input name="phone" type="tel" autoComplete="tel" className="site-field mt-1" />
        </label>
        {extra.map((field) => (
          <label key={field.name} className="text-sm">
            {field.label}
            {field.kind === "select" ? (
              <select name={field.name} className="site-field mt-1">
                {(field.options ?? []).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input name={field.name} type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"} className="site-field mt-1" />
            )}
          </label>
        ))}
        <label className="text-sm sm:col-span-2">
          LINE ID <span className="text-xs text-cream-dim">（可不填，填了門市會用 LINE 回你）</span>
          <input name="lineId" className="site-field mt-1" />
        </label>
      </div>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {failure ? (
        <p className="site-error text-sm" role="alert">
          {failure}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "確認中…" : verb}
      </button>
      {demo ? <p className="text-xs text-cream-dim">練習模式：名額記在這一家，另一台瀏覽器也看得到。不會送到店外的系統。</p> : null}
    </form>
  );
}
