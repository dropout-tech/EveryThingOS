"use client";

import { useState, type FormEvent } from "react";
import { DeskLink } from "./DeskLink";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import type { useLiveAction } from "./LiveAction";
import {
  parseShiftInput,
  scheduleConflict,
  shiftsNeedingSubstitute,
  type LeaveSpan,
  type ShiftSlot,
} from "@/lib/schedule";

type Props = {
  initialSchedule: ShiftSlot[];
  staff: { id: string; name: string }[];
  leaves: LeaveSpan[];
  today: string;
  canSchedule: boolean;
  live: boolean;
  run: ReturnType<typeof useLiveAction>["run"];
  busy: boolean;
  onPractice: (message: string) => void;
};

export function TeacherSchedule({
  initialSchedule,
  staff,
  leaves,
  today,
  canSchedule,
  live,
  run,
  busy,
  onPractice,
}: Props) {
  const [slots, setSlots] = useState<ShiftSlot[]>(initialSchedule);
  const [form, setForm] = useState({
    employee: staff[0]?.id ?? "",
    date: today,
    startTime: "09:00",
    endTime: "12:00",
    courseName: "",
    room: "教室 A",
  });
  const [error, setError] = useState<string | null>(null);

  const shownSlots = live ? initialSchedule : slots;
  const subNeeded = shiftsNeedingSubstitute(shownSlots, leaves);
  const subIds = new Set(subNeeded.map((s) => s.id));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const who = staff.find((s) => s.id === form.employee);
    const parsed = parseShiftInput({
      ...form,
      employeeName: who?.name ?? form.employee,
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const conflict = scheduleConflict(parsed.value, shownSlots, leaves);
    if (conflict) {
      setError(conflict);
      return;
    }
    setError(null);
    if (!live) {
      const created: ShiftSlot = {
        id: `SH-${Date.now().toString().slice(-4)}`,
        employee: parsed.value.employee,
        employeeName: who?.name ?? parsed.value.employee,
        date: parsed.value.date,
        startTime: parsed.value.startTime,
        endTime: parsed.value.endTime,
        courseName: parsed.value.courseName,
        room: parsed.value.room,
      };
      setSlots((cur) =>
        [...cur, created].sort(
          (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
        ),
      );
      setForm((cur) => ({ ...cur, courseName: "" }));
      onPractice(
        `練習：已排班 ${created.employeeName} ${created.date} ${created.startTime}–${created.endTime}「${created.courseName}」${created.room ? `（${created.room}）` : ""}，沒有送出。`,
      );
      return;
    }
    const res = await run(
      "/api/hr/schedule",
      parsed.value,
      (r) => String(r.message ?? `已排班 ${who?.name ?? parsed.value.employee}`),
    );
    if (res?.ok) setForm((cur) => ({ ...cur, courseName: "" }));
  }

  return (
    <section className="glass space-y-4 p-5">
      <div>
        <h2 className="text-sm font-medium">師資排班與代課檢查</h2>
        <p className="mt-1 text-xs text-cream-dim">
          對應 Frappe HRMS 排班指派（Shift Assignment）。自動擋下同一位老師衝堂、同一間教室衝突，以及請假當天的排課。
        </p>
      </div>

      {subNeeded.length ? (
        <div className="glass-well space-y-1.5 p-3.5 text-sm" role="status">
          <p className="font-medium text-warn">
            有 {subNeeded.length} 堂課的老師當天請假，要安排代課：
          </p>
          <ul className="space-y-1 text-xs text-cream-dim">
            {subNeeded.map((s) => (
              <li key={s.id}>
                {s.date.slice(5)} {s.startTime}–{s.endTime} · {s.employeeName}（請{s.leaveType}）·「{s.courseName}」
                {s.room ? ` · ${s.room}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {shownSlots.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {shownSlots.map((slot) => {
            const needsSub = subIds.has(slot.id);
            return (
              <li
                key={slot.id}
                className="glass-chip flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {slot.courseName}
                    {slot.room ? <span className="ml-2 text-xs text-cream-dim">{slot.room}</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-cream-dim">
                    {slot.date.slice(5)} · {slot.startTime}–{slot.endTime} · {slot.employeeName}
                  </p>
                </div>
                <span className="flex items-center gap-2 text-xs">
                  {needsSub ? <Badge tone="warn">請假需代課</Badge> : <Badge tone="ok">正常</Badge>}
                  {slot.href ? (
                    <DeskLink href={slot.href} className="text-cream-dim underline hover:text-cream">
                      打開
                    </DeskLink>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-cream-dim">近期還沒有排定的師資班表。</p>
      )}

      {canSchedule && staff.length ? (
        <form onSubmit={submit} className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-6" noValidate>
          <label className="text-sm">
            <span className="field-label">授課老師</span>
            <select
              value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}
              className="field"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="field-label">上課日期</span>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="field"
            />
          </label>
          <label className="text-sm">
            <span className="field-label">上課時間</span>
            <input
              type="time"
              required
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              className="field"
            />
          </label>
          <label className="text-sm">
            <span className="field-label">下課時間</span>
            <input
              type="time"
              required
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              className="field"
            />
          </label>
          <label className="text-sm">
            <span className="field-label">課程／班級名稱</span>
            <input
              required
              maxLength={80}
              value={form.courseName}
              onChange={(e) => setForm({ ...form, courseName: e.target.value })}
              placeholder="STEAM 機器人 A 班"
              className="field"
            />
          </label>
          <label className="text-sm">
            <span className="field-label">教室（選填）</span>
            <input
              maxLength={40}
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="教室 A"
              className="field"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
            <button type="submit" disabled={busy} className={buttonClass({ variant: "secondary" })}>
              {busy ? "處理中…" : "排入班表"}
            </button>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="text-xs text-cream-dim">
                同一位老師同時段、同一間教室同時段，或老師當天請假，系統會擋下並指出衝突的那堂課。
              </p>
            )}
          </div>
        </form>
      ) : null}
    </section>
  );
}
