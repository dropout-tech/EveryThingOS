import type { NextRequest } from "next/server";
import { erpAction, readJson, refuse } from "@/lib/actions";
import { docName } from "@/lib/projects-server";

const MAX_LINES = 500;

/** 開成發票: a draft Sales Invoice for the picked, unbilled time logs of one project. */
export async function POST(request: NextRequest) {
  const body = await readJson<{ project?: unknown; details?: unknown; item_code?: unknown }>(request);
  const project = docName(body?.project);
  if (!project) return refuse("請選專案");
  if (!Array.isArray(body?.details) || !body.details.length) return refuse("請至少選一筆工時");
  if (body.details.length > MAX_LINES) return refuse(`一張發票最多 ${MAX_LINES} 筆工時`);
  const details = body.details.map(docName);
  if (details.some((d) => !d)) return refuse("選到的工時不對，請重新整理再選");
  const item = body.item_code == null || body.item_code === "" ? null : docName(body.item_code);
  if (body.item_code && !item) return refuse("請重新選發票品項");
  return erpAction(request, "dropout_core.projects.make_invoice", { project, details: [...new Set(details)], item_code: item });
}
