import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleAuditRecord,
  parseShiftInput,
  recommendTeachersForClass,
  scheduleConflict,
  shiftsNeedingSubstitute,
  type LeaveSpan,
  type ShiftSlot,
  type TeacherProfile,
} from "./schedule.ts";

const existing: ShiftSlot[] = [
  {
    id: "SH-1",
    employee: "HR-EMP-00001",
    employeeName: "王小明",
    date: "2026-10-28",
    startTime: "09:00",
    endTime: "12:00",
    courseName: "STEAM 機器人實作 A 班",
    room: "教室 A",
    branch: "台北信義教室",
  },
  {
    id: "SH-2",
    employee: "HR-EMP-00002",
    employeeName: "林業務",
    date: "2026-10-27",
    startTime: "14:00",
    endTime: "16:00",
    courseName: "兒童科學實驗班",
    room: "實驗室 1",
    branch: "台北信義教室",
  },
];

const leaves: LeaveSpan[] = [
  {
    employee: "HR-EMP-00002",
    employeeName: "林業務",
    leaveType: "特休",
    fromDate: "2026-10-27",
    toDate: "2026-10-28",
  },
];

const teachers: TeacherProfile[] = [
  {
    id: "HR-EMP-00001",
    name: "王小明",
    employmentType: "full_time",
    homeBranch: "台北信義教室",
    supportBranches: ["新北板橋教室"],
    skills: ["親子手作", "STEAM 機器人"],
    ageGroups: ["幼兒 3–6 歲", "兒童 7–12 歲"],
    weeklyHours: 32,
    weeklyTargetHours: 40,
    monthlyOvertimeHours: 10,
  },
  {
    id: "HR-EMP-00002",
    name: "林業務",
    employmentType: "full_time",
    homeBranch: "台北信義教室",
    supportBranches: ["新北板橋教室"],
    skills: ["親子手作", "節慶DIY", "黏土雕塑"],
    ageGroups: ["幼兒 3–6 歲", "親子共學"],
    weeklyHours: 24,
    weeklyTargetHours: 40,
    monthlyOvertimeHours: 4,
  },
  {
    id: "HR-EMP-00003",
    name: "陳倉管",
    employmentType: "part_time",
    homeBranch: "新北板橋教室",
    supportBranches: ["台北信義教室"],
    skills: ["親子手作", "節慶DIY", "美術創作"],
    ageGroups: ["幼兒 3–6 歲", "親子共學"],
    weeklyHours: 14,
    weeklyTargetHours: 24,
    monthlyOvertimeHours: 0,
  },
];

describe("師資排班、AI 技能媒合與主管覆核留痕", () => {
  it("擋下同一位老師時段重疊（衝堂）", () => {
    const msg = scheduleConflict(
      {
        employee: "HR-EMP-00001",
        employeeName: "王小明",
        date: "2026-10-28",
        startTime: "11:00",
        endTime: "13:00",
        courseName: "進階程式班",
        room: "教室 B",
      },
      existing,
      leaves,
    );
    assert.ok(msg?.includes("師資衝堂"));
  });

  it("擋下同一間教室時段重疊（教室衝突）", () => {
    const msg = scheduleConflict(
      {
        employee: "HR-EMP-00004",
        employeeName: "李師傅",
        date: "2026-10-28",
        startTime: "10:00",
        endTime: "11:30",
        courseName: "手作木工體驗",
        room: "教室 A",
        branch: "台北信義教室",
      },
      existing,
      leaves,
    );
    assert.ok(msg?.includes("教室衝突"));
  });

  it("擋下請假當天的排班（請假衝突）", () => {
    const msg = scheduleConflict(
      {
        employee: "HR-EMP-00002",
        employeeName: "林業務",
        date: "2026-10-28",
        startTime: "14:00",
        endTime: "16:00",
        courseName: "兒童科學實驗班",
        room: "實驗室 2",
      },
      existing,
      leaves,
    );
    assert.ok(msg?.includes("請假衝突"));
  });

  it("不重疊的班次順利通過，並能找出既有班表裡需代課的課", () => {
    const msg = scheduleConflict(
      {
        employee: "HR-EMP-00001",
        employeeName: "王小明",
        date: "2026-10-28",
        startTime: "13:30",
        endTime: "15:30",
        courseName: "STEAM 機器人實作 B 班",
        room: "教室 A",
      },
      existing,
      leaves,
    );
    assert.equal(msg, null);
    const sub = shiftsNeedingSubstitute(existing, leaves);
    assert.equal(sub.length, 1);
    assert.equal(sub[0].id, "SH-2");
    assert.equal(sub[0].leaveType, "特休");
  });

  it("AI 師資媒合：勞動法規先行排除衝堂與請假老師，推薦可跨店支援且技能吻合的老師，並保存主管覆核留痕", () => {
    // 2026-10-28 10:00-12:00 台北信義教室「萬聖節親子手作 DIY」：
    // 王小明 09:00-12:00 已排課衝堂；林業務當天請特休；AI 應推薦新北板橋教室具「節慶DIY」與「親子共學」標籤的陳倉管跨店支援
    const suggestion = recommendTeachersForClass(
      {
        id: "DEM-01",
        branch: "台北信義教室",
        date: "2026-10-28",
        startTime: "10:00",
        endTime: "12:00",
        courseName: "萬聖節親子手作 DIY",
        requiredSkill: "節慶DIY",
        targetAgeGroup: "親子共學",
        enrolledCount: 12,
        room: "手作教室 B",
      },
      teachers,
      existing,
      leaves,
    );
    assert.equal(suggestion.recommended?.teacher.id, "HR-EMP-00003");
    assert.equal(suggestion.recommended?.crossBranch, true);
    assert.equal(suggestion.blockedCandidates.length, 2);
    assert.ok(suggestion.staffingGapWarning?.includes("跨店支援提醒"));

    // 主管覆核留痕：測試採用與改派
    const adopted = buildScheduleAuditRecord({
      suggestion,
      chosenTeacher: { id: "HR-EMP-00003", name: "陳倉管" },
      nowIso: "2026-10-27 13:00",
    });
    assert.equal(adopted.decision, "adopted");
    assert.equal(adopted.aiSuggestedName, "陳倉管");

    const modified = buildScheduleAuditRecord({
      suggestion,
      chosenTeacher: { id: "HR-EMP-00004", name: "李師傅" },
      adjustmentNote: "改由總部巡迴指導師資代班",
      nowIso: "2026-10-27 13:05",
    });
    assert.equal(modified.decision, "modified");
    assert.equal(modified.aiSuggestedName, "陳倉管");
    assert.equal(modified.finalName, "李師傅");
    assert.equal(modified.adjustmentNote, "改由總部巡迴指導師資代班");
  });

  it("驗證輸入時間與必填欄位", () => {
    assert.equal(
      parseShiftInput({
        employee: "HR-EMP-00001",
        date: "2026-10-28",
        startTime: "14:00",
        endTime: "12:00",
        courseName: "課",
      }).ok,
      false,
    );
    assert.equal(
      parseShiftInput({
        employee: "HR-EMP-00001",
        date: "2026-10-28",
        startTime: "09:00",
        endTime: "12:00",
        courseName: "STEAM 機器人",
        room: " 教室 A ",
      }).ok,
      true,
    );
  });
});
