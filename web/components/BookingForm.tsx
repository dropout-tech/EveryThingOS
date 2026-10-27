"use client";

import { useState, type FormEvent } from "react";
import { parseBooking, type BookingChannel } from "@/lib/booking";

export type BookableCourse = { code: string; name: string; label: string; full: boolean };

type Result = { status?: "locked" | "waitlist" | "pending"; message?: string };

const SLOTS = ["10:00", "13:30", "15:30", "19:00"];

function tomorrow() {
  const d = new Date(Date.now() + 8 * 3600_000 + 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function BookingForm({ courses, branches, channel, demo }: { courses: BookableCourse[]; branches: string[]; channel: BookingChannel; demo: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data: Record<string, unknown> = { ...Object.fromEntries(new FormData(event.currentTarget).entries()), channel };
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
    const title = result.status === "locked" ? "預約完成" : result.status === "waitlist" ? "已排候補" : "已收到預約";
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

  return (
    <form onSubmit={submit} className="site-sheet space-y-4 p-6 sm:p-8" noValidate>
      <fieldset>
        <legend className="text-sm">課程</legend>
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
          人數
          <input name="seats" type="number" min={1} max={10} defaultValue={1} className="site-field mt-1" />
        </label>
        <label className="text-sm">
          日期
          <input name="date" type="date" defaultValue={tomorrow()} className="site-field mt-1" />
        </label>
        <label className="text-sm">
          時段
          <select name="slot" className="site-field mt-1">
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          家長稱呼
          <input name="parentName" autoComplete="name" className="site-field mt-1" />
        </label>
        <label className="text-sm">
          手機
          <input name="phone" type="tel" autoComplete="tel" className="site-field mt-1" />
        </label>
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
        {busy ? "確認名額與材料中…" : "預約"}
      </button>
      {demo ? <p className="text-xs text-cream-dim">練習模式：會照課程 BOM 算名額，但不會真的送出。</p> : null}
    </form>
  );
}
