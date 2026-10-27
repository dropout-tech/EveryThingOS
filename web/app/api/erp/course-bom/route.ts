import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { parseCourseBom } from "@/lib/course-bom";

/** Creates or updates a course Product Bundle (課程 BOM) in ERPNext. */
export async function POST(request: NextRequest) {
  const parsed = parseCourseBom(await readJson<unknown>(request));
  if (!parsed.ok) return refuse(parsed.message);
  return erpAction(request, "dropout_core.actions.upsert_course_bom", {
    course_code: parsed.value.courseCode,
    course_name: parsed.value.courseName,
    target_seats: parsed.value.targetSeats,
    lines: parsed.value.lines,
  });
}
