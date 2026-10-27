import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { parseShiftInput } from "@/lib/schedule";

/** Assigns a teacher/staff shift after checking teacher, room, and leave conflicts. */
export async function POST(request: NextRequest) {
  const parsed = parseShiftInput(await readJson<unknown>(request));
  if (!parsed.ok) return refuse(parsed.message);
  const v = parsed.value;
  return erpAction(request, "dropout_hr_tw.schedule.assign", {
    employee: v.employee,
    date: v.date,
    start_time: v.startTime,
    end_time: v.endTime,
    course_name: v.courseName,
    ...(v.room ? { room: v.room } : {}),
  });
}
