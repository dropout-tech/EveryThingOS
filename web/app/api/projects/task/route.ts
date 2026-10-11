import type { NextRequest } from "next/server";
import { readJson, refuse } from "@/lib/actions";
import { docName, restWrite } from "@/lib/projects-server";
import { deskUrl } from "@/lib/sources/erpnext";

/** Adds one task to a project through Frappe's REST insert; ERPNext checks the Task create permission. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ project?: unknown; subject?: unknown }>(request);
  const project = docName(body?.project);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  if (!project) return refuse("請選專案");
  if (!subject) return refuse("請填工作項目，例如「水電配管」。");
  if (subject.length > 140 || /[\u0000-\u001f<>]/.test(subject)) return refuse("工作項目最多 140 個字，不能有 < >。");
  return restWrite(request, async (config, post) => {
    const doc = await post<{ name: string }>("frappe.client.insert", { doc: { doctype: "Task", subject, project, status: "Open" } }, config);
    return { ok: true, created: { doctype: "Task", name: doc.name, href: deskUrl(`/app/task/${encodeURIComponent(doc.name)}`, config) } };
  });
}
