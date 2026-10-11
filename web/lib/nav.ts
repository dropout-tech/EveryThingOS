export type NavItem = { href: string; label: string; match?: string; count?: number };
export type NavSection = { id: string; title?: string; items: NavItem[] };

const LABELS: Record<string, string> = {
  "/workspace/erp/sales": "銷售",
  "/workspace/erp/stock": "庫存",
  "/workspace/erp/purchase": "採購",
  "/workspace/erp/finance": "收錢",
};

const GROUPS: { id: string; title?: string; hrefs: string[] }[] = [
  { id: "today", hrefs: ["/workspace", "/workspace/ask"] },
  { id: "people", title: "客人", hrefs: ["/workspace/crm", "/workspace/chat", "/workspace/letter", "/workspace/meetings", "/workspace/portal"] },
  { id: "business", title: "生意", hrefs: ["/workspace/erp/sales", "/workspace/erp/stock", "/workspace/erp/purchase", "/workspace/erp/finance", "/workspace/projects"] },
  { id: "company", title: "公司", hrefs: ["/workspace/reports", "/workspace/approvals", "/workspace/automations", "/workspace/hr", "/workspace/team", "/workspace/website"] },
  { id: "settings", hrefs: ["/workspace/settings"] },
];

/** The flat menu from `navItemsForShop`, grouped the way a shop thinks about its day. */
export function navSections(items: NavItem[]): NavSection[] {
  const byHref = new Map(items.map((item) => [item.href, item]));
  const placed = new Set<string>();
  const sections = GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.hrefs.flatMap((href) => {
      const item = byHref.get(href);
      if (!item) return [];
      placed.add(href);
      return [{ ...item, href, label: LABELS[href] ?? item.label }];
    }),
  }));
  const rest = items.filter((item) => !placed.has(item.href));
  if (rest.length) sections.splice(sections.length - 1, 0, { id: "more", title: "其他", items: rest });
  return sections.filter((section) => section.items.length);
}

export function isActive(path: string, href: string, match?: string) {
  if (match) return path === match || path.startsWith(`${match}/`);
  if (href === "/workspace") return path === "/workspace";
  if (href === "/workspace/erp/sales") return path === href || path === "/workspace/erp" || path === "/workspace/erp/compare";
  return path === href || path.startsWith(`${href}/`);
}

/** Phone tab bar: 今天, the first people page, 生意 (its own sub-tabs cover 銷售／庫存／採購／收錢), then one more. */
export function tabItems(sections: NavSection[]): NavItem[] {
  const find = (id: string) => sections.find((section) => section.id === id)?.items ?? [];
  const today = find("today").slice(0, 1);
  const people = find("people")[0];
  const business = find("business")[0];
  const flat = sections.flatMap((section) => section.items);
  const fourth = ["/workspace/chat", "/workspace/reports", "/workspace/hr", "/workspace/letter"]
    .map((href) => flat.find((item) => item.href === href))
    .find((item) => item && item !== people && item !== business);
  const tabs = [...today, people, business ? { href: business.href, label: "生意", match: "/workspace/erp" } : undefined, fourth];
  return tabs.filter((item): item is NavItem => Boolean(item)).slice(0, 4);
}

const TRAIL: Record<string, { label: string; parent?: string }> = {
  "/workspace": { label: "今天" },
  "/workspace/ask": { label: "問助理", parent: "/workspace" },
  "/workspace/projects": { label: "專案", parent: "/workspace" },
  "/workspace/approvals": { label: "簽核與報帳", parent: "/workspace" },
  "/workspace/portal": { label: "客戶入口", parent: "/workspace" },
  "/workspace/automations": { label: "自動化", parent: "/workspace" },
  "/workspace/settings/import": { label: "匯入資料", parent: "/workspace/settings" },
  "/workspace/crm": { label: "客人", parent: "/workspace" },
  "/workspace/chat": { label: "對話", parent: "/workspace" },
  "/workspace/letter": { label: "電子報", parent: "/workspace" },
  "/workspace/meetings": { label: "會議", parent: "/workspace" },
  "/workspace/erp": { label: "生意", parent: "/workspace" },
  "/workspace/erp/sales": { label: "銷售", parent: "/workspace/erp" },
  "/workspace/erp/stock": { label: "庫存", parent: "/workspace/erp" },
  "/workspace/erp/purchase": { label: "採購", parent: "/workspace/erp" },
  "/workspace/erp/finance": { label: "收錢", parent: "/workspace/erp" },
  "/workspace/erp/compare": { label: "對照 A1／億看", parent: "/workspace/erp" },
  "/workspace/reports": { label: "報表", parent: "/workspace" },
  "/workspace/hr": { label: "人事", parent: "/workspace" },
  "/workspace/team": { label: "團隊", parent: "/workspace" },
  "/workspace/website": { label: "官網", parent: "/workspace" },
  "/workspace/settings": { label: "設定", parent: "/workspace" },
  "/workspace/settings/api": { label: "對外 API", parent: "/workspace/settings" },
  "/workspace/practice": { label: "練習一筆生意", parent: "/workspace" },
  "/workspace/links": { label: "連結", parent: "/workspace/settings" },
  "/workspace/hygiene": { label: "資料健檢", parent: "/workspace/settings" },
};

/** What the last crumb says on a page below a known one, such as one project. */
const DETAIL_LABELS: Record<string, string> = { "/workspace/projects": "這一案" };

export function breadcrumbTrail(path: string): NavItem[] {
  const trail: NavItem[] = [];
  let parent = path;
  while (!TRAIL[parent] && parent.lastIndexOf("/") > 0) parent = parent.slice(0, parent.lastIndexOf("/"));
  if (!TRAIL[parent]) return trail;
  if (parent !== path) trail.push({ href: path, label: DETAIL_LABELS[parent] ?? "詳細" });
  let href: string | undefined = parent;
  while (href) {
    trail.unshift({ href, label: TRAIL[href].label });
    href = TRAIL[href].parent;
  }
  return trail;
}

export type PaletteAction = NavItem & { keywords: string; needs?: string };

/** Things people come to do, not just places. `needs` is the page that must be in their menu. */
export const PALETTE_ACTIONS: PaletteAction[] = [
  { href: "/workspace/erp/sales#new-quote", label: "開一張報價", keywords: "報價 估價 quote 開單 新增", needs: "/workspace/erp/sales" },
  { href: "/workspace/crm#find", label: "找一位客人", keywords: "客人 名單 搜尋 crm lead", needs: "/workspace/crm" },
  { href: "/workspace/erp/finance#aging", label: "看誰欠我們", keywords: "應收 帳齡 催收 逾期 欠款", needs: "/workspace/erp/finance" },
  { href: "/workspace/erp/stock", label: "看哪些貨快不夠", keywords: "庫存 補貨 請購 安全存量", needs: "/workspace/erp/stock" },
  { href: "/workspace/erp/purchase", label: "跟廠商進貨", keywords: "採購 進貨 廠商 付款", needs: "/workspace/erp/purchase" },
  { href: "/workspace/hr#leave", label: "核准假單、看誰請假", keywords: "請假 休假 特休 假單 核准 hr", needs: "/workspace/hr" },
  { href: "/workspace/hr", label: "打卡", keywords: "打卡 上班 下班 出勤", needs: "/workspace/hr" },
  { href: "/workspace/team#invite", label: "邀請同事", keywords: "邀請 同事 帳號 員工 權限", needs: "/workspace/team" },
  { href: "/workspace/letter", label: "寫一封電子報", keywords: "電子報 寄信 名單 行銷", needs: "/workspace/letter" },
  { href: "/workspace/reports", label: "看本月營收", keywords: "報表 營收 毛利 前十大", needs: "/workspace/reports" },
  { href: "/workspace/practice", label: "先練習一筆生意", keywords: "練習 教學 第一次 示範" },
  { href: "/workspace/erp/compare", label: "對照鼎新 A1／億看", keywords: "鼎新 億看 對照 比較", needs: "/workspace/erp/sales" },
  { href: "/workspace/settings/api", label: "對外 API 與 Webhook", keywords: "api webhook 金鑰 串接", needs: "/workspace/settings" },
  { href: "/workspace/settings#appearance", label: "換介面風格", keywords: "風格 外觀 主題 深色 淺色 極簡 流體 社群", needs: "/workspace/settings" },
  { href: "/workspace/ask", label: "問助理", keywords: "問 助理 ai 問題 幫我寫 催款 訊息" },
  { href: "/workspace/approvals?new=1", label: "報帳、拍收據", keywords: "報帳 報銷 收據 發票 費用 請款", needs: "/workspace/approvals" },
  { href: "/workspace/approvals", label: "看等我簽的", keywords: "簽核 核准 簽呈 退回 待簽", needs: "/workspace/approvals" },
  { href: "/workspace/projects", label: "記工時", keywords: "工時 專案 案子 timesheet 時數", needs: "/workspace/projects" },
  { href: "/workspace/portal", label: "傳報價給客人簽", keywords: "客戶入口 簽名 分享 連結 line 報價", needs: "/workspace/portal" },
  { href: "/workspace/automations", label: "設定自動提醒", keywords: "自動化 提醒 逾期 規則 請購", needs: "/workspace/automations" },
  { href: "/workspace/settings/import", label: "從 Excel 匯入", keywords: "匯入 excel csv 搬家 客人 商品 供應商", needs: "/workspace/settings" },
  { href: "/help", label: "看說明", keywords: "說明 幫助 help 怎麼用 教學" },
];
