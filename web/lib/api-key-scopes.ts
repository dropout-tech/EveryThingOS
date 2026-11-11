export type ApiKeyScope = "read" | "write" | "service:read" | "service:write";
export type ApiKeyPurpose = "general" | "service";

/** The settings form chooses one capability family; it never forwards client scopes. */
export function apiKeyInput(value: unknown): { label: string; scopes: ApiKeyScope[] } | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "金鑰設定格式不正確";
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((field) => !["label", "write", "purpose"].includes(field))) return "金鑰設定包含不支援的欄位";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) return "請填寫 1–80 字的金鑰名稱";
  if (body.write !== undefined && typeof body.write !== "boolean") return "新增資料權限必須明確勾選";
  const purpose = body.purpose === undefined ? "general" : body.purpose;
  if (purpose !== "general" && purpose !== "service") return "請選擇一般業務資料或 Dodo 客服紀錄";
  const scopes: ApiKeyScope[] = purpose === "service" ? ["service:read"] : ["read"];
  if (body.write === true) scopes.push(purpose === "service" ? "service:write" : "write");
  return { label, scopes };
}

export function apiKeyScopeLabel(scopes: readonly ApiKeyScope[]): string {
  const labels = [];
  if (scopes.includes("write")) labels.push("一般業務資料：可讀取、建立客戶與潛客");
  else if (scopes.includes("read")) labels.push("一般業務資料：只能讀取");
  if (scopes.includes("service:write")) labels.push("客服紀錄：可查候選與收據、建立服務紀錄與待辦");
  else if (scopes.includes("service:read")) labels.push("客服紀錄：只能查候選與收據");
  return labels.join("；") || "沒有可辨識的資料權限";
}
