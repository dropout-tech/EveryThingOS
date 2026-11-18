/** Job names the team page can assign. Only 老闆 may invite, disable, or change permissions. */
export const JOB_PROFILES: { name: string; note: string; roles: string[]; admin: boolean }[] = [
  { name: "老闆", note: "可邀請、停用同事，並管理權限", roles: ["System Manager"], admin: true },
  { name: "同事", note: "一般同事。看得到自己的工作，不能管人", roles: ["Sales User"], admin: false },
  { name: "主管", note: "看得到報表，不能管人", roles: ["Sales Manager", "Accounts Manager"], admin: false },
  { name: "業務", note: "客人、報價、訂單", roles: ["Sales User", "Sales Manager"], admin: false },
  { name: "倉管", note: "庫存、出貨、收貨", roles: ["Stock User", "Stock Manager", "Item Manager"], admin: false },
  { name: "採購", note: "請購、採購單、廠商", roles: ["Purchase User", "Purchase Manager"], admin: false },
  { name: "會計", note: "發票、收付款、帳務", roles: ["Accounts User", "Accounts Manager"], admin: false },
  { name: "客服", note: "對話、客人資料", roles: ["Sales User", "Support Team"], admin: false },
  { name: "行銷", note: "電子報、名單、官網", roles: ["Newsletter Manager", "DropOut Marketing", "Website Manager"], admin: false },
  { name: "人資", note: "員工資料、請假、打卡", roles: [], admin: false },
];

export type AccountRole = "owner" | "member";

export function profileByName(name: string) {
  return JOB_PROFILES.find((profile) => profile.name === name);
}

export function roleForProfile(name: string): AccountRole {
  return profileByName(name)?.admin ? "owner" : "member";
}

export function permissionRoles(name: string) {
  return profileByName(name)?.roles ?? ["Sales User"];
}
