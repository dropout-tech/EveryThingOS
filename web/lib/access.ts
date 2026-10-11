import type { FeatureId } from "./shop";

/**
 * Which ERPNext roles open which part of the shell. This only decides what the
 * menu shows; ERPNext itself still checks every read and write, so a hidden
 * page reached by URL shows "沒有權限" sections rather than data.
 */
const FEATURE_ROLES: Record<FeatureId, string[]> = {
  crm: ["Sales User", "Sales Manager", "Support Team", "DropOut Marketing"],
  sales: ["Sales User", "Sales Manager", "Accounts User"],
  stock: ["Stock User", "Stock Manager", "Item Manager", "Manufacturing User"],
  purchase: ["Purchase User", "Purchase Manager"],
  finance: ["Accounts User", "Accounts Manager"],
  letter: ["Newsletter Manager", "DropOut Marketing"],
  chat: ["Sales User", "Support Team"],
  meetings: [],
  website: ["Website Manager", "Sales Manager"],
  // Everyone clocks in; leave approvals and payroll on the page follow the HRMS roles.
  hr: [],
};

export const ADMIN_ROLE = "System Manager";

/** `roles` is null when nobody is logged in personally (practice mode or a shared key): show everything that is switched on. */
export function featuresFor(modules: FeatureId[], roles: string[] | null): FeatureId[] {
  if (!roles || roles.includes(ADMIN_ROLE)) return modules;
  return modules.filter((id) => FEATURE_ROLES[id].length === 0 || FEATURE_ROLES[id].some((role) => roles.includes(role)));
}

export function canManageTeam(roles: string[] | null) {
  return roles === null || roles.includes(ADMIN_ROLE);
}
