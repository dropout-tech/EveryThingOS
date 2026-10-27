"use client";

import { useState, type FormEvent } from "react";
import { DeskLink } from "./DeskLink";
import { TwentyScenariosBoard } from "./TwentyScenariosBoard";
import { Badge } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Avatar, Bar, Check, Icon, Legend, Stat } from "./ui/Viz";
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

function blockedKind(reason: string): string {
  if (reason.startsWith("請假")) return "請假";
  if (reason.startsWith("勞基法")) return "工時上限";
  if (reason.startsWith("未開放跨店")) return "不支援此店";
  if (reason.startsWith("教室")) return "教室衝突";
  return "衝堂";
}

function countBlocked(reasons: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(blockedKind(r), (counts.get(blockedKind(r)) ?? 0) + 1);
  return [...counts.entries()];
}

function HoursBar({ used, adding = 0, target }: { used: number; adding?: number; target: number }) {
  const over = used + adding > target;
  return (
    <div className="space-y-1">
      <Bar
        label={`本週已排 ${used} 小時${adding ? `，這堂 ${adding} 小時` : ""}，目標 ${target} 小時`}
        max={Math.max(target, used + adding)}
        marker={target}
        segments={[
          { value: used, tone: "muted" },
          { value: adding, tone: over ? "warn" : "accent" },
        ]}
      />
      <Legend
        items={[
          { tone: "muted", label: <>本週 <b>{used}h</b></> },
          ...(adding ? [{ tone: over ? ("warn" as const) : ("accent" as const), label: <>這堂 <b>+{adding}h</b></> }] : []),
          { tone: "soft", label: <>上限 {target}h</> },
        ]}
      />
    </div>
  );
}

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const LANE = 52;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** One row per day, 08–22, with each class as a block; overlapping classes take another lane. */
function Timeline({ slots, subIds }: { slots: ShiftSlot[]; subIds: Set<string> }) {
  const days = [...new Set(slots.map((s) => s.date))].sort().slice(0, 4);
  return (
    <div className="space-y-2">
      <div className="viz-axis pl-14">
        {[8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}</span>
        ))}
      </div>
      {days.map((day) => {
        const daySlots = slots.filter((s) => s.date === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
        const laneEnds: number[] = [];
        const placed = daySlots.map((s) => {
          const start = Math.max(DAY_START, toMin(s.startTime));
          const end = Math.min(DAY_END, Math.max(start + 30, toMin(s.endTime)));
          let lane = laneEnds.findIndex((e) => e <= start);
          if (lane < 0) lane = laneEnds.length;
          laneEnds[lane] = end;
          return { s, start, end, lane };
        });
        const lanes = Math.max(1, laneEnds.length);
        return (
          <div key={day} className="flex items-stretch gap-2">
            <span className="w-12 shrink-0 pt-3 text-xs tabular-nums text-cream-dim">{day.slice(5)}</span>
            <div className="viz-track flex-1" style={{ height: lanes * LANE }}>
              {placed.map(({ s, start, end, lane }) => {
                const warn = subIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={`viz-block ${warn ? "viz-block-warn" : ""}`}
                    style={{
                      left: `${((start - DAY_START) / (DAY_END - DAY_START)) * 100}%`,
                      width: `calc(${((end - start) / (DAY_END - DAY_START)) * 100}% - 3px)`,
                      top: lane * LANE + 5,
                      bottom: "auto",
                      height: LANE - 10,
                    }}
                    title={`${s.startTime}–${s.endTime} ${s.courseName} · ${s.employeeName}${s.branch ? ` · ${s.branch}` : ""}`}
                  >
                    {s.href ? (
                      <DeskLink href={s.href} className="font-semibold underline-offset-2 hover:underline">
                        {s.courseName}
                      </DeskLink>
                    ) : (
                      <b>{s.courseName}</b>
                    )}
                    <span className="flex items-center gap-1">
                      {warn ? <Icon name="alert" className="text-warn" /> : null}
                      {s.employeeName}
                      {warn ? " 請假" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
      startTime: "13:30",
      endTime: "15:30",
      courseName: "兒童創意美術加開班",
      requiredSkill: "美術創作",
      targetAgeGroup: "兒童 7–12 歲",
      enrolledCount: 14,
      room: "美術教室 B",
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
  const [editingDemandId, setEditingDemandId] = useState<string | null>(null);
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
  const nearCapCount = teacherProfiles.filter(
    (t) => t.monthlyOvertimeHours >= 40 || t.weeklyHours >= t.weeklyTargetHours,
  ).length;

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
    <div className="space-y-4">
      {/* 第一眼極簡決策區：AI 師資媒合與排班覆核（法規先行算好，一鍵採用或改派） */}
      {canSchedule ? (
        <section className="glass space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Icon name="spark" className="text-teal" />
              AI 師資媒合與排班建議
            </h2>
            <Badge tone="ok">待覆核 {demands.length} 堂</Badge>
          </div>
          <div className="viz-flow" aria-label="排班原則">
            <span><Icon name="shield" />勞動法規先行</span>
            <Icon name="arrow" />
            <span><Icon name="spark" />AI 建議</span>
            <Icon name="arrow" />
            <span><Icon name="check" />主管覆核</span>
            <Icon name="arrow" />
            <span><Icon name="clock" />異常留痕</span>
          </div>

          {demands.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {demands.map((d) => {
                const suggestion = recommendTeachersForClass(d, teacherProfiles, shownSlots, leaves);
                const rec = suggestion.recommended;
                const selectedId = overrideTeacher[d.id] ?? rec?.teacher.id ?? "";
                const isModified = Boolean(rec && selectedId && selectedId !== rec.teacher.id);
                const isEditing = editingDemandId === d.id;
                const excluded = countBlocked(suggestion.blockedCandidates.map((b) => b.blockedReason ?? ""));
                return (
                  <li key={d.id} className="glass-well flex flex-col justify-between gap-3 p-4 text-sm">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="font-medium">{d.courseName}</p>
                        <p className="flex flex-wrap gap-x-3 gap-y-1">
                          <Stat icon="calendar">{d.date.slice(5)} {d.startTime}–{d.endTime}</Stat>
                          <Stat icon="store">{d.branch.replace("教室", "")}</Stat>
                          <Stat icon="users">{d.enrolledCount} 人</Stat>
                        </p>
                      </div>

                      {rec ? (
                        <div className="glass-chip space-y-2.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2.5">
                              <Avatar name={rec.teacher.name} />
                              <span>
                                <span className="block text-xs text-cream-dim">AI 推薦</span>
                                <span className="font-medium">{rec.teacher.name}</span>
                              </span>
                            </span>
                            <Badge tone={rec.crossBranch ? "warn" : "ok"}>{rec.crossBranch ? `${rec.teacher.homeBranch.replace("教室", "")}支援` : "本店"}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Check ok={rec.skillMatched}>{d.requiredSkill}</Check>
                            <Check ok={rec.ageMatched}>{d.targetAgeGroup}</Check>
                            <Check ok={!rec.hoursWarning}>工時</Check>
                          </div>
                          <HoursBar
                            used={rec.teacher.weeklyHours}
                            adding={suggestion.durationHours}
                            target={rec.teacher.weeklyTargetHours}
                          />
                          {!rec.skillMatched ? (
                            <p className="flex items-center gap-1.5 text-xs text-warn" role="status">
                              <Icon name="alert" />
                              可排的老師都沒有「{d.requiredSkill}」，請主管確認
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="flex items-center gap-2 text-xs text-warn" role="status">
                          <Icon name="alert" />
                          {suggestion.staffingGapWarning}
                        </p>
                      )}

                      {excluded.length ? (
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-cream-dim">
                          已排除
                          {excluded.map(([why, n]) => (
                            <Check key={why} ok={false}>
                              {why} {n}
                            </Check>
                          ))}
                        </p>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 border-t border-cream/10 pt-2">
                        <label className="block text-xs">
                          <span className="field-label">主管改派師資</span>
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
                        <label className="block text-xs">
                          <span className="field-label">調整原因（自動寫入留痕）</span>
                          <input
                            value={overrideNote[d.id] ?? ""}
                            onChange={(e) =>
                              setOverrideNote((cur) => ({ ...cur, [d.id]: e.target.value }))
                            }
                            placeholder="例如：改派總部巡迴指導師資"
                            className="field"
                          />
                        </label>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingDemandId(isEditing ? null : d.id)}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        {isEditing ? "收起換人" : "換人／改派"}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !selectedId}
                        onClick={() => confirmAiSuggestion(d)}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        {isModified ? "確認改派並留痕" : "確認採用 AI 建議"}
                      </button>
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

      {/* 第二眼：近期師資班表與請假代課檢查 */}
      <section className="glass space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">近期師資班表與請假代課檢查</h2>
          {subNeeded.length ? (
            <Badge tone="warn">{subNeeded.length} 堂課老師請假需代課</Badge>
          ) : (
            <Badge tone="ok">全部班次師資正常</Badge>
          )}
        </div>

        {subNeeded.length ? (
          <ul className="flex flex-wrap gap-2" role="status">
            {subNeeded.map((s) => (
              <li key={s.id} className="glass-well flex items-center gap-2 px-3 py-2 text-xs">
                <Avatar name={s.employeeName} tone="warn" />
                <span>
                  <span className="block font-medium">{s.courseName}</span>
                  <span className="text-cream-dim">
                    {s.date.slice(5)} {s.startTime} · {s.employeeName}請{s.leaveType} · 需代課
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {shownSlots.length ? (
          <>
            <div className="hidden sm:block">
              <Timeline slots={shownSlots} subIds={subIds} />
            </div>
            <ul className="space-y-1.5 sm:hidden">
              {shownSlots.map((s) => (
                <li key={s.id} className={`viz-block !static ${subIds.has(s.id) ? "viz-block-warn" : ""} py-2`}>
                  {s.href ? <DeskLink href={s.href} className="font-semibold underline">{s.courseName}</DeskLink> : <b>{s.courseName}</b>}
                  <span>
                    {s.date.slice(5)} {s.startTime}–{s.endTime} · {s.employeeName}
                    {subIds.has(s.id) ? " 請假・需代課" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-cream-dim">近期還沒有排定的師資班表。</p>
        )}
      </section>

      {/* HRM 師資與排班情境模擬器 */}
      <TwentyScenariosBoard defaultCategory="HRM師資媒合＋主管留痕" onRunScenario={onPractice} />

      {/* 漸進式揭露（1）：師資主檔、專長／適教年齡層標籤與工時合規監測 */}
      <details className="glass p-5">
        <summary className="cursor-pointer select-none text-sm font-medium">
          師資技能標籤與工時
          <span className="ml-2 text-xs font-normal text-cream-dim">
            {teacherProfiles.length} 位師資{nearCapCount ? ` · ${nearCapCount} 位接近工時上限` : ""}
          </span>
        </summary>
        <div className="mt-4 grid gap-2.5 md:grid-cols-2">
          {teacherProfiles.map((t) => {
            const nearCap = t.monthlyOvertimeHours >= 40 || t.weeklyHours >= t.weeklyTargetHours;
            return (
              <div key={t.id} className="glass-chip space-y-3 p-3.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={t.name} tone={nearCap ? "warn" : "accent"} />
                    <span className="min-w-0">
                      <span className="block font-medium">{t.name}</span>
                      <Stat icon="store">
                        {t.homeBranch.replace("教室", "")} · {t.employmentType === "full_time" ? "正職" : "兼職"}
                      </Stat>
                    </span>
                  </span>
                  {nearCap ? (
                    <Badge tone="warn">接近上限</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {t.skills.map((s) => (
                    <span key={s} className="viz-check viz-check-ok">{s}</span>
                  ))}
                  {t.ageGroups.map((a) => (
                    <span key={a} className="badge">{a}</span>
                  ))}
                </div>
                <HoursBar used={t.weeklyHours} target={t.weeklyTargetHours} />
                <div className="space-y-1">
                  <Bar
                    label={`本月延長工時 ${t.monthlyOvertimeHours} 小時，上限 46 小時`}
                    max={54}
                    marker={46}
                    segments={[{ value: t.monthlyOvertimeHours, tone: t.monthlyOvertimeHours >= 40 ? "warn" : "ok" }]}
                  />
                  <Legend items={[{ tone: t.monthlyOvertimeHours >= 40 ? "warn" : "ok", label: <>月加班 <b>{t.monthlyOvertimeHours}h</b> ／ 46h</> }]} />
                </div>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-cream-dim">
                  <Icon name="truck" />
                  {t.supportBranches.map((b) => b.replace("教室", "")).join("・")}
                </p>
              </div>
            );
          })}
        </div>
      </details>

      {/* 漸進式揭露（2）：主管覆核與異常留痕紀錄 ＆ 手動排課表單 */}
      <details className="glass p-5">
        <summary className="cursor-pointer select-none text-sm font-medium">
          主管覆核與異常留痕紀錄
          <span className="ml-2 text-xs font-normal text-cream-dim">已留痕 {audits.length} 筆 · 手動排班</span>
        </summary>
        <div className="mt-4 space-y-4">
          {audits.length ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-cream-dim">
                <Icon name="shield" />
                原始建議、調整與時間都會保存；不會自動拿去重新訓練。
              </p>
              <ul className="space-y-2 text-sm">
                {audits.map((a) => (
                  <li key={a.id} className="glass-chip space-y-2 p-3" title={a.aiReason}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{a.courseName}</span>
                      <span className="flex flex-wrap gap-x-3">
                        <Stat icon="store">{a.branch.replace("教室", "")}</Stat>
                        <Stat icon="clock">{a.reviewedAt}</Stat>
                      </span>
                    </div>
                    <div className="viz-route text-xs">
                      <span>
                        <Icon name="spark" className="text-teal" />
                        AI 建議 {a.aiSuggestedName}
                      </span>
                      <Icon name="arrow" />
                      <span>
                        <Icon name="check" className="text-teal" />
                        主管{a.decision === "adopted" ? "採用" : "改派"} {a.finalName}
                      </span>
                      {a.decision === "modified" ? <Badge tone="warn">{a.adjustmentNote}</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canSchedule && staff.length ? (
            <form onSubmit={submit} className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-6" noValidate>
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
                <button type="submit" disabled={busy} className={buttonClass({ variant: "secondary", size: "sm" })}>
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
        </div>
      </details>
    </div>
  );
}
