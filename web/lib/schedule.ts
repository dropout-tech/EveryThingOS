/**
 * 智慧人資管理（HRM）師資排班、技能媒合、工時異常與「勞動法規先行、AI 建議、主管覆核、異常留痕」：
 * 1. 排班硬性把關：同一位老師衝堂、同一間教室衝突、請假撞課、單日工時逾 12 小時或月延長工時上限。
 * 2. 師資三維技能標籤：專長主題（親子手作／美術創作／節慶DIY／STEAM…）、適教年齡層（幼兒／低年級／親子共學…）、所屬分店與可跨店支援據點。
 * 3. AI 師資媒合與排班建議（recommendTeachersForClass）：勞動法規先行過濾 → 專長與年齡層媒合 → 本店優先／鄰近分店跨店支援 → 尖峰人力缺口與工時異常提醒。
 * 4. 主管覆核與異常留痕（ScheduleAuditRecord）：完整保存原始 AI 建議、主管調整內容、採用結果與時間戳記，不逕行自動再訓練。
 */

export type ShiftSlot = {
  id: string;
  employee: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
  courseName: string;
  room?: string;
  branch?: string;
  href?: string;
};

export type LeaveSpan = {
  employee?: string;
  employeeName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
};

export type NewShiftInput = {
  employee: string;
  employeeName?: string;
  date: string;
  startTime: string;
  endTime: string;
  courseName: string;
  room?: string;
  branch?: string;
};

export type TeacherProfile = {
  id: string;
  name: string;
  employmentType: "full_time" | "part_time";
  homeBranch: string;
  supportBranches: string[];
  /** 專長／課程主題標籤（例如：親子手作、美術創作、節慶DIY、黏土雕塑、STEAM 機器人） */
  skills: string[];
  /** 適教年齡層標籤（例如：幼兒 3–6 歲、兒童 7–12 歲、親子共學） */
  ageGroups: string[];
  /** 本週已排工時（小時） */
  weeklyHours: number;
  /** 本週建議正常工時上限（正職 40h，兼職依約定如 24h） */
  weeklyTargetHours: number;
  /** 本月已記延長工時（小時） */
  monthlyOvertimeHours: number;
};

export type ClassDemand = {
  id: string;
  branch: string;
  date: string;
  startTime: string;
  endTime: string;
  courseName: string;
  requiredSkill: string;
  targetAgeGroup: string;
  enrolledCount: number;
  room?: string;
};

export type TeacherCandidateRank = {
  teacher: TeacherProfile;
  score: number;
  crossBranch: boolean;
  skillMatched: boolean;
  ageMatched: boolean;
  blockedReason: string | null;
  hoursWarning: string | null;
  aiReason: string;
};

export type AiScheduleSuggestion = {
  demand: ClassDemand;
  durationHours: number;
  recommended: TeacherCandidateRank | null;
  alternatives: TeacherCandidateRank[];
  blockedCandidates: TeacherCandidateRank[];
  staffingGapWarning: string | null;
};

export type ScheduleAuditRecord = {
  id: string;
  demandId: string;
  courseName: string;
  branch: string;
  date: string;
  timeRange: string;
  aiSuggestedEmployee: string;
  aiSuggestedName: string;
  aiReason: string;
  finalEmployee: string;
  finalName: string;
  decision: "adopted" | "modified";
  adjustmentNote: string;
  reviewedAt: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function minutesOfDay(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = minutesOfDay(startA);
  const a1 = minutesOfDay(endA);
  const b0 = minutesOfDay(startB);
  const b1 = minutesOfDay(endB);
  if (a0 === null || a1 === null || b0 === null || b1 === null) return false;
  return a0 < b1 && b0 < a1;
}

export function shiftDurationHours(startTime: string, endTime: string): number {
  const a0 = minutesOfDay(startTime);
  const a1 = minutesOfDay(endTime);
  if (a0 === null || a1 === null || a1 <= a0) return 0;
  return Number(((a1 - a0) / 60).toFixed(2));
}

/** 驗證排班表單輸入。 */
export function parseShiftInput(body: unknown): { ok: true; value: NewShiftInput } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "沒有收到排班資料" };
  const b = body as Record<string, unknown>;
  const employee = typeof b.employee === "string" ? b.employee.trim() : "";
  if (!employee || employee.length > 140) return { ok: false, message: "要選老師／員工" };
  const employeeName = typeof b.employeeName === "string" && b.employeeName.trim() ? b.employeeName.trim().slice(0, 80) : undefined;
  const date = typeof b.date === "string" ? b.date.trim() : "";
  if (!validDate(date)) return { ok: false, message: "排班日期格式不對" };
  const startTime = typeof b.startTime === "string" ? b.startTime.trim() : "";
  const endTime = typeof b.endTime === "string" ? b.endTime.trim() : "";
  const sMin = minutesOfDay(startTime);
  const eMin = minutesOfDay(endTime);
  if (sMin === null || eMin === null) return { ok: false, message: "時間要用 HH:MM（例如 09:00）" };
  if (eMin <= sMin) return { ok: false, message: "下課時間要晚於上課時間" };
  const courseName = typeof b.courseName === "string" ? b.courseName.trim().slice(0, 80) : "";
  if (!courseName) return { ok: false, message: "要填課程或班級名稱" };
  const room = typeof b.room === "string" && b.room.trim() ? b.room.trim().slice(0, 40) : undefined;
  const branch = typeof b.branch === "string" && b.branch.trim() ? b.branch.trim().slice(0, 40) : undefined;
  return {
    ok: true,
    value: {
      employee,
      ...(employeeName ? { employeeName } : {}),
      date,
      startTime,
      endTime,
      courseName,
      ...(room ? { room } : {}),
      ...(branch ? { branch } : {}),
    },
  };
}

/**
 * 檢查新增排班是否與既有排班或已核准／待核准假單衝突。
 * 沒有衝突回傳 null；有衝突回傳給人看的中文說明。
 */
export function scheduleConflict(
  candidate: NewShiftInput,
  existing: readonly ShiftSlot[],
  leaves: readonly LeaveSpan[] = [],
): string | null {
  const teacherLabel = candidate.employeeName || candidate.employee;
  for (const leave of leaves) {
    const samePerson =
      (leave.employee && leave.employee === candidate.employee) ||
      leave.employeeName === candidate.employeeName ||
      leave.employeeName === candidate.employee;
    if (samePerson && leave.fromDate <= candidate.date && candidate.date <= leave.toDate) {
      return `請假衝突：${teacherLabel} 在 ${candidate.date} 請${leave.leaveType}，請改派代課老師。`;
    }
  }

  for (const slot of existing) {
    if (slot.date !== candidate.date) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, slot.startTime, slot.endTime)) continue;
    if (slot.employee === candidate.employee || (candidate.employeeName && slot.employeeName === candidate.employeeName)) {
      return `師資衝堂：${slot.employeeName} 在 ${slot.date} ${slot.startTime}–${slot.endTime} 已經排了「${slot.courseName}」。`;
    }
    const sameBranch = !candidate.branch || !slot.branch || candidate.branch === slot.branch;
    if (sameBranch && candidate.room && slot.room && candidate.room === slot.room) {
      return `教室衝突：「${candidate.room}」在 ${slot.date} ${slot.startTime}–${slot.endTime} 已排給 ${slot.employeeName} 的「${slot.courseName}」。`;
    }
  }

  return null;
}

/** 找出既有班表裡，因為老師請假而需要找人代課的班次。 */
export function shiftsNeedingSubstitute(
  shifts: readonly ShiftSlot[],
  leaves: readonly LeaveSpan[],
): (ShiftSlot & { leaveType: string })[] {
  const out: (ShiftSlot & { leaveType: string })[] = [];
  for (const slot of shifts) {
    const hit = leaves.find(
      (l) =>
        ((l.employee && l.employee === slot.employee) || l.employeeName === slot.employeeName) &&
        l.fromDate <= slot.date &&
        slot.date <= l.toDate,
    );
    if (hit) {
      out.push({ ...slot, leaveType: hit.leaveType });
    }
  }
  return out;
}

/**
 * 依「勞動法規先行、AI 建議、主管覆核」原則，為單堂待排課程推薦最適任師資：
 * 1. 先檢核請假、衝堂、單日 12 小時工時上限（勞基法第 32 條第 2 項）與據點可支援範圍。
 * 2. 依課程主題技能、適教年齡層、本店優先／跨店支援、當週工時餘裕計算媒合分數。
 * 3. 若本店無適任師資或需跨店調度，產生尖峰人力缺口提醒（staffingGapWarning）。
 */
export function recommendTeachersForClass(
  demand: ClassDemand,
  teachers: readonly TeacherProfile[],
  existingShifts: readonly ShiftSlot[],
  leaves: readonly LeaveSpan[],
  monthlyCap = 46,
): AiScheduleSuggestion {
  const durationHours = shiftDurationHours(demand.startTime, demand.endTime);
  const eligible: TeacherCandidateRank[] = [];
  const blocked: TeacherCandidateRank[] = [];

  for (const t of teachers) {
    const isHome = t.homeBranch === demand.branch;
    const canSupport = isHome || t.supportBranches.includes(demand.branch);
    const conflict = scheduleConflict(
      {
        employee: t.id,
        employeeName: t.name,
        date: demand.date,
        startTime: demand.startTime,
        endTime: demand.endTime,
        courseName: demand.courseName,
        room: demand.room,
        branch: demand.branch,
      },
      existingShifts,
      leaves,
    );

    const sameDayHours = existingShifts
      .filter((s) => s.employee === t.id && s.date === demand.date)
      .reduce((sum, s) => sum + shiftDurationHours(s.startTime, s.endTime), 0);

    let blockedReason: string | null = conflict;
    if (!blockedReason && !canSupport) {
      blockedReason = `未開放跨店支援「${demand.branch}」（所屬：${t.homeBranch}）`;
    }
    if (!blockedReason && sameDayHours + durationHours > 12) {
      blockedReason = `勞基法第 32 條第 2 項：當日已排 ${sameDayHours} 小時，再排 ${durationHours} 小時將超過一日 12 小時上限`;
    }
    const extraOvertime = Math.max(0, t.weeklyHours + durationHours - 40);
    if (!blockedReason && t.monthlyOvertimeHours + extraOvertime > monthlyCap) {
      blockedReason = `勞基法第 32 條第 2 項：本月延長工時已 ${t.monthlyOvertimeHours} 小時，排入將超過每月 ${monthlyCap} 小時上限`;
    }

    const skillMatched = t.skills.includes(demand.requiredSkill);
    const ageMatched = t.ageGroups.includes(demand.targetAgeGroup);
    const crossBranch = !isHome;

    let hoursWarning: string | null = null;
    if (t.weeklyHours + durationHours > t.weeklyTargetHours) {
      hoursWarning = `排入後本週工時達 ${t.weeklyHours + durationHours}h（超過目標 ${t.weeklyTargetHours}h）`;
    } else if (t.monthlyOvertimeHours >= monthlyCap - 6) {
      hoursWarning = `本月延長工時已 ${t.monthlyOvertimeHours}h，接近上限 ${monthlyCap}h`;
    }

    let score = 0;
    if (skillMatched) score += 50;
    if (ageMatched) score += 25;
    if (isHome) score += 20;
    else if (canSupport) score += 8;
    const slack = Math.max(0, t.weeklyTargetHours - t.weeklyHours);
    score += Math.min(10, Math.round(slack / 2));
    if (hoursWarning) score -= 12;

    const tags: string[] = [];
    tags.push(skillMatched ? `具備「${demand.requiredSkill}」專長` : `無「${demand.requiredSkill}」標籤`);
    tags.push(ageMatched ? `適教「${demand.targetAgeGroup}」` : `非「${demand.targetAgeGroup}」主力`);
    tags.push(isHome ? `${t.homeBranch}本店師資` : `由${t.homeBranch}跨店支援`);
    tags.push(`本週已排 ${t.weeklyHours}/${t.weeklyTargetHours}h`);

    const rank: TeacherCandidateRank = {
      teacher: t,
      score,
      crossBranch,
      skillMatched,
      ageMatched,
      blockedReason,
      hoursWarning,
      aiReason: tags.join(" · "),
    };

    if (blockedReason) {
      blocked.push(rank);
    } else {
      eligible.push(rank);
    }
  }

  eligible.sort((a, b) => b.score - a.score);
  const recommended = eligible[0] ?? null;
  const alternatives = eligible.slice(1);

  let staffingGapWarning: string | null = null;
  if (!recommended) {
    staffingGapWarning = `尖峰人力缺口：「${demand.branch}」${demand.date} ${demand.startTime}–${demand.endTime}「${demand.courseName}」無符合勞動法規與時段的可用師資，請協調調班或增派兼職師資。`;
  } else if (!recommended.skillMatched) {
    staffingGapWarning = `專長缺口：目前可用師資皆無「${demand.requiredSkill}」標籤，建議由 ${recommended.teacher.name} 支援或跨區調度。`;
  } else if (recommended.crossBranch) {
    staffingGapWarning = `跨店支援提醒：「${demand.branch}」本店該時段無可用「${demand.requiredSkill}」師資，AI 建議由「${recommended.teacher.homeBranch}」${recommended.teacher.name} 跨店支援。`;
  }

  return {
    demand,
    durationHours,
    recommended,
    alternatives,
    blockedCandidates: blocked,
    staffingGapWarning,
  };
}

/** 建立一筆「主管覆核與異常留痕」紀錄（保存 AI 原始建議、主管最終選擇、調整內容與時間戳記）。 */
export function buildScheduleAuditRecord(input: {
  suggestion: AiScheduleSuggestion;
  chosenTeacher: { id: string; name: string };
  adjustmentNote?: string;
  nowIso?: string;
}): ScheduleAuditRecord {
  const { suggestion, chosenTeacher } = input;
  const d = suggestion.demand;
  const aiId = suggestion.recommended?.teacher.id ?? "NONE";
  const aiName = suggestion.recommended?.teacher.name ?? "無可用建議";
  const aiReason = suggestion.recommended?.aiReason ?? suggestion.staffingGapWarning ?? "無";
  const adopted = aiId === chosenTeacher.id;
  const defaultNote = adopted
    ? "主管確認採用 AI 原始排班建議"
    : `主管由 AI 建議「${aiName}」改派為「${chosenTeacher.name}」`;

  return {
    id: `AUD-${d.id}-${Date.now().toString().slice(-4)}`,
    demandId: d.id,
    courseName: d.courseName,
    branch: d.branch,
    date: d.date,
    timeRange: `${d.startTime}–${d.endTime}`,
    aiSuggestedEmployee: aiId,
    aiSuggestedName: aiName,
    aiReason,
    finalEmployee: chosenTeacher.id,
    finalName: chosenTeacher.name,
    decision: adopted ? "adopted" : "modified",
    adjustmentNote: input.adjustmentNote?.trim() || defaultNote,
    reviewedAt: input.nowIso ?? new Date().toISOString().replace("T", " ").slice(0, 16),
  };
}
