import "server-only";
import { ADMIN_ROLE } from "../access";
import { demoProjects, taipeiToday, type Activity, type Project, type ProjectsData, type ProjectStatus, type ProjectTask, type TaskStatus, type TimeLog } from "../projects";
import { sceneFromGroup } from "../shop";
import type { IndustryPack } from "../types";
import { currentIndustry, currentShop } from "../workspace";
import { liveConfig, type LiveConfig } from "./config";
import { SourceError, deskUrl, erpMethod } from "./erpnext";
import { getMe, isLive } from "./index";
import type { Sourced } from "./types";

const PROJECT_LIMIT = 100;
const TASK_LIMIT = 1000;
export const LOG_LIMIT = 2000;

/** Who may do what on the page. ERPNext still checks every write; this only decides which buttons show. */
const LOG_ROLES = [ADMIN_ROLE, "Projects User", "Projects Manager", "HR User", "Accounts User", "Manufacturing User"];
const TASK_ROLES = [ADMIN_ROLE, "Projects User", "Projects Manager"];
const INVOICE_ROLES = [ADMIN_ROLE, "Accounts User", "Accounts Manager"];

type RawProject = {
  name: string;
  project_name: string;
  customer: string | null;
  status: string;
  expected_start_date: string | null;
  expected_end_date: string | null;
  percent_complete: number | null;
  estimated_costing: number | null;
  total_sales_amount: number | null;
  total_billed_amount: number | null;
  total_purchase_cost: number | null;
  total_consumed_material_cost: number | null;
};

type RawTask = { name: string; subject: string; project: string; status: string; exp_end_date: string | null };

type RawLog = {
  name: string;
  employee_name: string | null;
  owner: string;
  docstatus: number;
  detail: string;
  project: string;
  task: string | null;
  hours: number | null;
  from_time: string | null;
  is_billable: number;
  billing_amount: number | null;
  costing_amount: number | null;
  sales_invoice: string | null;
  description: string | null;
  activity_type: string | null;
};

function list<T>(doctype: string, args: Record<string, unknown>, config: LiveConfig) {
  return erpMethod<T[]>("frappe.client.get_list", { doctype, ...args }, config);
}

/** A section the user may not read is listed as denied; anything else still fails the page. */
async function section<T>(label: string, denied: string[], read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof SourceError && error.kind === "denied") {
      denied.push(label);
      return [];
    }
    throw error;
  }
}

function projectStatus(status: string): ProjectStatus {
  if (status === "Open") return "active";
  if (status === "Completed") return "done";
  return "hold";
}

export function taskStatus(status: string): TaskStatus {
  if (status === "Completed") return "done";
  if (status === "Working" || status === "Pending Review") return "doing";
  return "todo";
}

export const ERP_TASK_STATUS: Record<TaskStatus, string> = { todo: "Open", doing: "Working", done: "Completed" };

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const desk = (doctype: string, name: string) => `/app/${doctype.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(name)}`;

async function liveProjects(roles: string[] | null, me: string): Promise<ProjectsData | null> {
  const config = await liveConfig();
  const link = (path: string) => deskUrl(path, config);
  let rawProjects: RawProject[];
  try {
    rawProjects = await list<RawProject>(
      "Project",
      {
        fields: ["name", "project_name", "customer", "status", "expected_start_date", "expected_end_date", "percent_complete", "estimated_costing", "total_sales_amount", "total_billed_amount", "total_purchase_cost", "total_consumed_material_cost"],
        filters: [["status", "!=", "Cancelled"]],
        order_by: "modified desc",
        limit_page_length: PROJECT_LIMIT,
      },
      config,
    );
  } catch (error) {
    if (error instanceof SourceError && error.kind === "denied") return null;
    throw error;
  }

  const ids = rawProjects.map((p) => p.name);
  const denied: string[] = [];
  const [rawTasks, rawLogs, rawActivities, rawServices] = ids.length
    ? await Promise.all([
        section("工作項目", denied, () =>
          list<RawTask>("Task", { fields: ["name", "subject", "project", "status", "exp_end_date"], filters: [["project", "in", ids], ["status", "not in", ["Cancelled", "Template"]], ["is_template", "=", 0]], order_by: "modified desc", limit_page_length: TASK_LIMIT }, config),
        ),
        section("工時", denied, () =>
          list<RawLog>(
            "Timesheet",
            {
              fields: [
                "name",
                "employee_name",
                "owner",
                "docstatus",
                "time_logs.name as detail",
                "time_logs.project as project",
                "time_logs.task as task",
                "time_logs.hours as hours",
                "time_logs.from_time as from_time",
                "time_logs.is_billable as is_billable",
                "time_logs.billing_amount as billing_amount",
                "time_logs.costing_amount as costing_amount",
                "time_logs.sales_invoice as sales_invoice",
                "time_logs.description as description",
                "time_logs.activity_type as activity_type",
              ],
              filters: [["Timesheet Detail", "project", "in", ids], ["Timesheet", "docstatus", "<", 2]],
              limit_page_length: LOG_LIMIT,
            },
            config,
          ),
        ),
        section("工作類型", denied, () => list<{ name: string; billing_rate: number | null; costing_rate: number | null }>("Activity Type", { fields: ["name", "billing_rate", "costing_rate"], filters: [["disabled", "=", 0]], limit_page_length: 50 }, config)),
        section("服務品項", denied, () =>
          list<{ name: string; item_name: string }>("Item", { fields: ["name", "item_name"], filters: [["is_sales_item", "=", 1], ["is_stock_item", "=", 0], ["disabled", "=", 0], ["has_variants", "=", 0]], order_by: "creation asc", limit_page_length: 30 }, config),
        ),
      ])
    : [[], [], [], []];

  const projects: Project[] = rawProjects.map((p) => ({
    id: p.name,
    name: p.project_name || p.name,
    customer: p.customer,
    status: projectStatus(p.status),
    contract: n(p.total_sales_amount),
    costBudget: n(p.estimated_costing),
    otherCost: n(p.total_purchase_cost) + n(p.total_consumed_material_cost),
    billed: n(p.total_billed_amount),
    start: p.expected_start_date,
    due: p.expected_end_date,
    percent: n(p.percent_complete),
    href: link(desk("Project", p.name)),
  }));
  const tasks: ProjectTask[] = rawTasks.map((t) => ({ id: t.name, project: t.project, subject: t.subject, status: taskStatus(t.status), due: t.exp_end_date, href: link(desk("Task", t.name)) }));
  const logs: TimeLog[] = rawLogs
    .filter((l) => l.detail && l.project)
    .map((l) => ({
      id: l.detail,
      sheet: l.name,
      project: l.project,
      task: l.task,
      person: l.employee_name || l.owner,
      date: (l.from_time ?? "").slice(0, 10),
      hours: n(l.hours),
      activity: l.activity_type ?? "",
      note: l.description ?? undefined,
      billable: Boolean(l.is_billable),
      billAmount: n(l.billing_amount),
      costAmount: n(l.costing_amount),
      invoice: l.sales_invoice,
      submitted: l.docstatus === 1,
      href: link(desk("Timesheet", l.name)),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const activities: Activity[] = rawActivities.map((a) => ({ name: a.name, billRate: n(a.billing_rate), costRate: n(a.costing_rate) }));
  const has = (allowed: string[]) => roles === null || allowed.some((role) => roles.includes(role));

  return {
    today: taipeiToday(),
    projects,
    tasks,
    logs,
    activities,
    services: rawServices.map((s) => ({ code: s.name, name: s.item_name || s.name })),
    me,
    can: { log: has(LOG_ROLES) && !denied.includes("工時"), invoice: has(INVOICE_ROLES), tasks: has(TASK_ROLES) && !denied.includes("工作項目") },
    denied,
    truncated: rawLogs.length >= LOG_LIMIT,
    newProjectHref: link("/app/project/new"),
  };
}

/**
 * 專案與工時. Live with `data: null` means this person's ERPNext role cannot read
 * projects at all (Projects User is the usual one).
 */
export async function getProjects(pack: IndustryPack, scene: string): Promise<Sourced<ProjectsData | null>> {
  if (!(await isLive("erpnext"))) return { origin: "demo", data: demoProjects(pack.id, scene, taipeiToday()) };
  const config = await liveConfig();
  try {
    const who = await getMe();
    const me = who.origin === "live" && who.data ? who.data.fullName || who.data.user : "";
    const roles = who.origin === "live" && who.data ? who.data.roles : null;
    const data = await liveProjects(roles, me);
    return { origin: "live", system: "erpnext", data, denied: data?.denied, deskUrl: config.erpnext?.url };
  } catch (error) {
    if (error instanceof SourceError) return { origin: "error", system: "erpnext", message: error.message, kind: error.kind };
    return { origin: "error", system: "erpnext", message: error instanceof Error ? error.message : String(error), kind: "upstream" };
  }
}

/** The industry pack and scene the demo data is built for; `demoId` keys the browser-kept demo edits. */
export async function projectsContext() {
  const [pack, shop] = await Promise.all([currentIndustry(), currentShop()]);
  const scene = shop?.scene ?? sceneFromGroup(pack.group).id;
  return { pack, scene, demoId: `${pack.id}:${scene}` };
}
