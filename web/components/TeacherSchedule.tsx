"use client";

import { useState, type FormEvent } from "react";
import { DeskLink } from "./DeskLink";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import type { useLiveAction } from "./LiveAction";
import {
  buildScheduleAuditRecord,
  parseShiftInput,
  recommendTeachersForClass,
  scheduleConflict,
  shiftsNeedingSubstitute,
  type ClassDemand,
  type LeaveSpan,
  type ScheduleAuditRecord,
  type ShiftSlot,
  type TeacherProfile,
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

function defaultTeacherProfiles(staff: { id: string; name: string }[]): TeacherProfile[] {
  const presets: Omit<TeacherProfile, "id" | "name">[] = [
    {
      employmentType: "full_time",
      homeBranch: "台北信義教室",
      supportBranches: ["新北板橋教室", "台北大安教室"],
      skills: ["親子手作", "美術創作", "STEAM 機器人"],
      ageGroups: ["幼兒 3–6 歲", "兒童 7–12 歲"],
      weeklyHours: 34,
      weeklyTargetHours: 40,
      monthlyOvertimeHours: 12,
    },
    {
      employmentType: "full_time",
      homeBranch: "台北信義教室",
      supportBranches: ["新北板橋教室"],
      skills: ["親子手作", "節慶DIY", "黏土雕塑"],
      ageGroups: ["幼兒 3–6 歲", "親子共學"],
      weeklyHours: 28,
      weeklyTargetHours: 40,
      monthlyOvertimeHours: 6,
    },
    {
      employmentType: "part_time",
      homeBranch: "新北板橋教室",
      supportBranches: ["台北信義教室", "桃園藝文教室"],
      skills: ["親子手作", "節慶DIY", "黏土雕塑", "美術創作"],
      ageGroups: ["幼兒 3–6 歲", "親子共學"],
      weeklyHours: 14,
      weeklyTargetHours: 24,
      monthlyOvertimeHours: 0,
    },
    {
      employmentType: "full_time",
      homeBranch: "台中公益教室",
      supportBranches: ["台中七期教室", "台北信義教室"],
      skills: ["美術創作", "壓克力畫", "STEAM 機器人"],
      ageGroups: ["兒童 7–12 歲", "親子共學"],
      weeklyHours: 38,
      weeklyTargetHours: 40,
      monthlyOvertimeHours: 42,
    },
  ];
  return staff.map((s, idx) => ({
    id: s.id,
    name: s.name,
    ...presets[idx % presets.length],
  }));
}

function initialDemands(today: string): ClassDemand[] {
  return [
    {
      id: "DEM-101",
      branch: "台北信義教室",
      date: today,
      startTime: "10:00",
      endTime: "12:00",
      courseName: "節慶親子手作輕黏土加開班",
      requiredSkill: "節慶DIY",
      targetAgeGroup: "親子共學",
      enrolledCount: 14,
      room: "手作教室 B",
    },
    {
      id: "DEM-102",
      branch: "台中公益教室",
      date: today,
      startTime: "14:00",
      endTime: "16:30",
      courseName: "兒童創意美術與媒材創作班",
      requiredSkill: "美術創作",
      targetAgeGroup: "兒童 7–12 歲",
      enrolledCount: 12,
      room: "美術教室 A",
    },
  ];
}

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
  const [demands, setDemands] = useState<ClassDemand[]>(() => initialDemands(today));
  const [overrideTeacher, setOverrideTeacher] = useState<Record<string, string>>({});
  const [overrideNote, setOverrideNote] = useState<Record<string, string>>({});
  const [audits, setAudits] = useState<ScheduleAuditRecord[]>([
    {
      id: "AUD-SEED-01",
      demandId: "DEM-099",
      courseName: "週末親子黏土體驗班",
      branch: "台北信義教室",
      date: today,
      timeRange: "09:30–12:00",
      aiSuggestedEmployee: staff[0]?.id ?? "HR-EMP-00001",
      aiSuggestedName: staff[0]?.name ?? "王小明",
      aiReason: "具備「親子手作」專長 · 適教「幼兒 3–6 歲」 · 台北信義教室本店師資 · 本週工時合規",
      finalEmployee: staff[0]?.id ?? "HR-EMP-00001",
      finalName: staff[0]?.name ?? "王小明",
      decision: "adopted",
      adjustmentNote: "主管確認採用 AI 原始排班建議",
      reviewedAt: `${today} 08:40`,
    },
  ]);

  const [form, setForm] = useState({
    employee: staff[0]?.id ?? "",
    branch: "台北信義教室",
    date: today,
    startTime: "13:30",
    endTime: "15:30",
    courseName: "",
    room: "教室 A",
  });
  const [error, setError] = useState<string | null>(null);

  const shownSlots = live ? initialSchedule : slots;
  const subNeeded = shiftsNeedingSubstitute(shownSlots, leaves);
  const subIds = new Set(subNeeded.map((s) => s.id));
  const teacherProfiles = defaultTeacherProfiles(staff);

  async function confirmAiSuggestion(demand: ClassDemand) {
    const suggestion = recommendTeachersForClass(demand, teacherProfiles, shownSlots, leaves);
    const chosenId = overrideTeacher[demand.id] || suggestion.recommended?.teacher.id;
    const chosen = teacherProfiles.find((t) => t.id === chosenId);
    if (!chosen) return;

    const conflict = scheduleConflict(
      {
        employee: chosen.id,
        employeeName: chosen.name,
        date: demand.date,
        startTime: demand.startTime,
        endTime: demand.endTime,
        courseName: demand.courseName,
        room: demand.room,
        branch: demand.branch,
      },
      shownSlots,
      leaves,
    );
    if (conflict) {
      setError(conflict);
      return;
    }
    setError(null);

    const audit = buildScheduleAuditRecord({
      suggestion,
      chosenTeacher: { id: chosen.id, name: chosen.name },
      adjustmentNote: overrideNote[demand.id],
    });

    if (live) {
      await run(
        "/api/hr/schedule",
        {
          employee: chosen.id,
          employeeName: chosen.name,
          date: demand.date,
          startTime: demand.startTime,
          endTime: demand.endTime,
          courseName: demand.courseName,
          room: demand.room,
          branch: demand.branch,
          aiSuggestedEmployee: audit.aiSuggestedEmployee,
          aiReason: audit.aiReason,
          adjustmentNote: audit.adjustmentNote,
        },
        (r) => String(r.message ?? `已覆核排班：${chosen.name}`),
      );
    } else {
      const created: ShiftSlot = {
        id: `SH-${demand.id}`,
        employee: chosen.id,
        employeeName: chosen.name,
        date: demand.date,
        startTime: demand.startTime,
        endTime: demand.endTime,
        courseName: demand.courseName,
        room: demand.room,
        branch: demand.branch,
      };
      setSlots((cur) =>
        [...cur, created].sort(
          (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
        ),
      );
      onPractice(
        `主管覆核完成並已留痕：${demand.branch}「${demand.courseName}」指派 ${chosen.name}（${audit.decision === "adopted" ? "採用 AI 建議" : `主管調整：${audit.adjustmentNote}`}）。`,
      );
    }

    setAudits((cur) => [audit, ...cur]);
    setDemands((cur) => cur.filter((d) => d.id !== demand.id));
  }

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
        id: `SH-${slots.length + 1}-${parsed.value.startTime}`,
        employee: parsed.value.employee,
        employeeName: who?.name ?? parsed.value.employee,
        date: parsed.value.date,
        startTime: parsed.value.startTime,
        endTime: parsed.value.endTime,
        courseName: parsed.value.courseName,
        room: parsed.value.room,
        branch: parsed.value.branch,
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
    <div className="space-y-5">
      {/* 1. 師資主檔與三維技能標籤（專長／年齡層／跨店支援／工時） */}
      {teacherProfiles.length ? (
        <section className="glass space-y-3 p-5">
          <div>
            <h2 className="text-sm font-medium">師資主檔、技能標籤與工時合規監測（HRM）</h2>
            <p className="mt-1 text-xs text-cream-dim">
              整合正兼職師資之專長主題、適教年齡層、所屬分店與可跨店支援據點，並即時監測本週工時與當月延長工時。
            </p>
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            {teacherProfiles.map((t) => {
              const nearCap = t.monthlyOvertimeHours >= 40 || t.weeklyHours >= t.weeklyTargetHours;
              return (
                <div key={t.id} className="glass-chip space-y-1.5 p-3.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {t.name}
                      <span className="ml-2 text-xs text-cream-dim">
                        {t.employmentType === "full_time" ? "正職師資" : "兼職／鐘點師資"} · {t.homeBranch}
                      </span>
                    </span>
                    <Badge tone={nearCap ? "warn" : "ok"}>
                      本週 {t.weeklyHours}/{t.weeklyTargetHours}h · 月加班 {t.monthlyOvertimeHours}h
                    </Badge>
                  </div>
                  <p className="text-xs text-cream-dim">
                    專長：{t.skills.join("、")} ｜ 適教：{t.ageGroups.join("、")}
                  </p>
                  <p className="text-xs text-cream-dim">
                    可跨店支援：{t.supportBranches.join("、")}
                    {nearCap ? (
                      <span className="ml-2 font-medium text-warn">
                        （工時提醒：接近法定或約定工時上限）
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 2. AI 智慧師資媒合與排班建議（「勞動法規先行、AI 建議、主管覆核、異常留痕」） */}
      {canSchedule ? (
        <section className="glass space-y-4 p-5">
          <div>
            <h2 className="text-sm font-medium">
              AI 師資媒合與排班建議（「勞動法規先行、AI 建議、主管覆核、異常留痕」）
            </h2>
            <p className="mt-1 text-xs text-cream-dim">
              排班前先檢核請假、衝堂與勞基法工時上限，再依課程主題、學員年齡層與跨店支援推薦適任師資。AI 只提建議，最終班表由主管確認；確認或改派結果完整留痕。
            </p>
          </div>

          {demands.length ? (
            <ul className="space-y-3">
              {demands.map((d) => {
                const suggestion = recommendTeachersForClass(d, teacherProfiles, shownSlots, leaves);
                const rec = suggestion.recommended;
                const selectedId = overrideTeacher[d.id] ?? rec?.teacher.id ?? "";
                const isModified = Boolean(rec && selectedId && selectedId !== rec.teacher.id);
                return (
                  <li key={d.id} className="glass-well space-y-3 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {d.branch} · {d.courseName}
                          {d.room ? <span className="ml-2 text-xs text-cream-dim">（{d.room}）</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-cream-dim">
                          {d.date} {d.startTime}–{d.endTime} · 報名 {d.enrolledCount} 人 · 需「{d.requiredSkill}」×「{d.targetAgeGroup}」
                        </p>
                      </div>
                      {rec ? (
                        <Badge tone={rec.crossBranch ? "warn" : "ok"}>
                          AI 推薦：{rec.teacher.name}（{rec.crossBranch ? "跨店支援" : "本店師資"}）
                        </Badge>
                      ) : (
                        <Badge tone="warn">尖峰師資缺口</Badge>
                      )}
                    </div>

                    {suggestion.staffingGapWarning ? (
                      <p className="text-xs text-warn" role="status">
                        {suggestion.staffingGapWarning}
                      </p>
                    ) : null}

                    {rec ? (
                      <p className="text-xs text-cream-dim">
                        AI 媒合依據：{rec.aiReason}
                        {rec.hoursWarning ? `（注意：${rec.hoursWarning}）` : ""}
                      </p>
                    ) : null}

                    {suggestion.blockedCandidates.length ? (
                      <p className="text-xs text-cream-dim">
                        法規與衝突已自動排除：
                        {suggestion.blockedCandidates
                          .map((b) => `${b.teacher.name}（${b.blockedReason}）`)
                          .join("；")}
                      </p>
                    ) : null}

                    <div className="grid gap-2 pt-1 sm:grid-cols-12">
                      <label className="text-xs sm:col-span-4">
                        <span className="field-label">主管覆核指派師資</span>
                        <select
                          value={selectedId}
                          onChange={(e) =>
                            setOverrideTeacher((cur) => ({ ...cur, [d.id]: e.target.value }))
                          }
                          className="field"
                        >
                          {teacherProfiles.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}（{t.homeBranch}）
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs sm:col-span-5">
                        <span className="field-label">主管調整原因／覆核備註（留痕）</span>
                        <input
                          value={overrideNote[d.id] ?? ""}
                          onChange={(e) =>
                            setOverrideNote((cur) => ({ ...cur, [d.id]: e.target.value }))
                          }
                          placeholder={
                            isModified
                              ? "請填改派原因（例如：改派巡迴師資支援）"
                              : "預設：採用 AI 原始排班建議"
                          }
                          className="field"
                        />
                      </label>
                      <div className="flex items-end sm:col-span-3">
                        <button
                          type="button"
                          disabled={busy || !selectedId}
                          onClick={() => confirmAiSuggestion(d)}
                          className={buttonClass({ variant: "secondary", block: true })}
                        >
                          {isModified ? "改派並留痕排入班表" : "確認採用 AI 建議"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-cream-dim">目前待排課需求皆已由主管覆核並排入班表。</p>
          )}
        </section>
      ) : null}

      {/* 3. 已確認師資班表與事後請假代課檢查 */}
      <section className="glass space-y-4 p-5">
        <div>
          <h2 className="text-sm font-medium">師資排班表與請假代課檢查</h2>
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
                      {slot.branch ? `${slot.branch} · ` : ""}
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
                placeholder="節慶親子手作 DIY"
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
                {busy ? "處理中…" : "手動排入班表"}
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

        {audits.length ? (
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-medium text-cream-dim">
              主管覆核與異常留痕紀錄（供營運主管與資服團隊檢視規則權重，不逕行自動再訓練）
            </h3>
            <ul className="space-y-1.5 text-xs">
              {audits.map((a) => (
                <li key={a.id} className="glass-chip flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <strong>{a.branch}</strong> · {a.date} {a.timeRange}「{a.courseName}」｜ AI 原始建議：
                    {a.aiSuggestedName} → 主管確認：<strong>{a.finalName}</strong>（{a.adjustmentNote}）
                  </span>
                  <span className="text-cream-dim">
                    {a.decision === "adopted" ? "採用建議" : "主管調整"} · {a.reviewedAt}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
