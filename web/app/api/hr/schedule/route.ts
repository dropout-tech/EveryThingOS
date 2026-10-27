import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { parseShiftInput } from "@/lib/schedule";

/** Assigns a teacher/staff shift after checking teacher, room, and leave conflicts, preserving AI suggestion and supervisor review audit fields. */
export async function POST(request: NextRequest) {
  const raw = await readJson<Record<string, unknown>>(request);
  const parsed = parseShiftInput(raw);
  if (!parsed.ok) return refuse(parsed.message);
  const v = parsed.value;
  const aiSuggestedEmployee = typeof raw?.aiSuggestedEmployee === "string" ? raw.aiSuggestedEmployee.trim().slice(0, 140) : undefined;
  const aiReason = typeof raw?.aiReason === "string" ? raw.aiReason.trim().slice(0, 500) : undefined;
  const adjustmentNote = typeof raw?.adjustmentNote === "string" ? raw.adjustmentNote.trim().slice(0, 500) : undefined;
  return erpAction(request, "dropout_hr_tw.schedule.assign", {
    employee: v.employee,
    date: v.date,
    start_time: v.startTime,
    end_time: v.endTime,
    course_name: v.courseName,
    ...(v.room ? { room: v.room } : {}),
    ...(v.branch ? { branch: v.branch } : {}),
    ...(aiSuggestedEmployee ? { ai_suggested_employee: aiSuggestedEmployee } : {}),
    ...(aiReason ? { ai_reason: aiReason } : {}),
    ...(adjustmentNote ? { adjustment_note: adjustmentNote } : {}),
  });
}
