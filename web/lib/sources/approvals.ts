import "server-only";
import { demoApprovals, type ApprovalItem, type ApprovalRule, type Approvals, type Attachment, type SentItem } from "../approvals";
import type { IndustryPack } from "../types";
import { liveConfig } from "./config";
import { deskUrl, erpMethod, SourceError } from "./erpnext";
import { liveHr } from "./live";
import type { Sourced } from "./types";

type RawInbox = {
  items: (Omit<ApprovalItem, "attachments"> & { attachments: Attachment[] })[];
  mine: SentItem[];
  rules: ApprovalRule[];
  hrms: boolean;
  employee: string | null;
  can: Approvals["can"];
  denied: string[];
};

/** The site's dropout_core (or dropout_hr_tw) is older than this shell, or not installed. */
function missingMethod(error: unknown, module: string) {
  return error instanceof SourceError && error.kind === "upstream" && error.message.includes(module);
}

function receiptSrc(file: Attachment): Attachment {
  return file.image ? { ...file, src: `/api/approvals/file?id=${encodeURIComponent(file.id)}` } : file;
}

/**
 * Everything waiting for the logged-in person. Leave applications come from the
 * 人事 module (`dropout_hr_tw.shell.today`, the same read the 人事 page uses);
 * the rest from `dropout_core.approvals.inbox`.
 */
export async function liveApprovals(): Promise<Approvals> {
  const config = await liveConfig();
  const [raw, hr] = await Promise.all([
    erpMethod<RawInbox>("dropout_core.approvals.inbox", {}, config),
    liveHr().then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error }),
    ),
  ]);
  const link = (path?: string) => (path ? deskUrl(path, config) : undefined);
  const unavailable: string[] = [];
  const leaves: ApprovalItem[] = [];
  if (hr.data && !hr.data.denied?.includes("approvals")) {
    for (const a of hr.data.approvals) {
      leaves.push({
        doctype: "Leave Application",
        name: a.name,
        kind: "leave",
        requester: a.employee,
        title: a.leaveType,
        amount: null,
        days: a.days,
        dates: a.fromDate === a.toDate ? a.fromDate.slice(5) : `${a.fromDate.slice(5)} – ${a.toDate.slice(5)}`,
        reason: a.reason,
        created: "",
        href: a.href,
        actions: [
          { action: "approve", kind: "approve" },
          { action: "reject", kind: "reject" },
        ],
        attachments: [],
      });
    }
  } else if (hr.error && !missingMethod(hr.error, "dropout_hr_tw")) {
    if (hr.error instanceof SourceError && hr.error.kind === "login") throw hr.error;
    unavailable.push("假單");
  }
  const seen = new Set(raw.items.map((i) => `${i.doctype}:${i.name}`));
  return {
    items: [...leaves.filter((l) => !seen.has(`${l.doctype}:${l.name}`)), ...raw.items.map((i) => ({ ...i, href: link(i.href), attachments: i.attachments.map(receiptSrc) }))],
    mine: raw.mine.map((m) => ({ ...m, href: link(m.href) })),
    rules: raw.rules,
    hrms: raw.hrms,
    employee: raw.employee,
    can: { ...raw.can, approve: raw.can.approve || Boolean(hr.data?.can.approve) },
    unavailable,
    denied: raw.denied,
  };
}

/** Live with `data: null` means this company's ERPNext has a dropout_core without 簽核 yet (needs `bench migrate`). */
export async function getApprovals(pack: IndustryPack): Promise<Sourced<Approvals | null>> {
  const config = await liveConfig();
  if (!config.erpnext) return { origin: "demo", data: demoApprovals(pack) };
  const desk = config.erpnext.url;
  try {
    const data = await liveApprovals();
    return { origin: "live", system: "erpnext", data, denied: data.denied, deskUrl: desk };
  } catch (error) {
    if (missingMethod(error, "dropout_core.approvals")) return { origin: "live", system: "erpnext", data: null, deskUrl: desk };
    if (error instanceof SourceError) return { origin: "error", system: "erpnext", message: error.message, kind: error.kind };
    return { origin: "error", system: "erpnext", message: error instanceof Error ? error.message : String(error), kind: "upstream" };
  }
}

/**
 * How many things wait for the logged-in person's signature, for a badge on 今天 or the menu.
 * null when it cannot be known right now (ERPNext down, not logged in, module missing).
 */
export async function pendingApprovals(pack: IndustryPack): Promise<number | null> {
  const source = await getApprovals(pack);
  if (source.origin === "error" || !source.data) return null;
  return source.data.items.length;
}
