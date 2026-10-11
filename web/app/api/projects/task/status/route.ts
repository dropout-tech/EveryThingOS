import type { NextRequest } from "next/server";
import { readJson, refuse } from "@/lib/actions";
import { docName, restWrite } from "@/lib/projects-server";
import type { TaskStatus } from "@/lib/projects";
import { ERP_TASK_STATUS } from "@/lib/sources/projects";

/** Moves one task between 待辦／進行中／完成. ERPNext refuses 完成 while a task it depends on is still open. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ name?: unknown; status?: unknown }>(request);
  const name = docName(body?.name);
  if (!name) return refuse("缺少工作項目");
  if (typeof body?.status !== "string" || !Object.hasOwn(ERP_TASK_STATUS, body.status)) return refuse("只能改成待辦、進行中或完成");
  const status = ERP_TASK_STATUS[body.status as TaskStatus];
  return restWrite(request, async (config, post) => {
    await post("frappe.client.set_value", { doctype: "Task", name, fieldname: "status", value: status }, config);
    return { ok: true };
  });
}
