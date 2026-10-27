import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseShiftInput, scheduleConflict, shiftsNeedingSubstitute, type LeaveSpan, type ShiftSlot } from "./schedule.ts";

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

describe("師資排班與衝堂／代課檢查", () => {
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
