import type { NextRequest } from "next/server";
import { erpAction, readJson, reply } from "@/lib/actions";
import { checkTimeEntry, taipeiToday } from "@/lib/projects";

/** 記工時: one submitted time log on one project. The day's 16-hour cap and free time slot are checked again in ERPNext. */
export async function POST(request: NextRequest) {
  const body = await readJson<Record<string, unknown>>(request);
  const checked = checkTimeEntry(body, taipeiToday());
  if (!checked.ok) return reply({ ok: false, message: Object.values(checked.errors)[0], errors: checked.errors }, 400);
  const e = checked.value;
  return erpAction(request, "dropout_core.projects.log_time", {
    project: e.project,
    hours: e.hours,
    date: e.date,
    task: e.task,
    note: e.note || null,
    activity_type: e.activity,
    billable: e.billable ? 1 : 0,
  });
}
