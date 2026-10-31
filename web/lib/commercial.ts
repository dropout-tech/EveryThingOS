/** What the customer pays for the AI plan. Tax is already inside this number. */
export const PRICE_YEAR_TWD = 69_000;
export const PRICE_LABEL = "AI 版每年含稅 NT$69,000";
export const PRICE_NOTE = "不用 AI，免費。AI 版含到現場導入。";
/** Said wherever the price appears. The cap is not a number yet. */
export const AI_USAGE_NOTE = "現在 AI 用量不限；以後會限量，先寫在價格頁、到期前通知，當期不改。";

export const COMMERCIAL = {
  product: "EveryThingOS",
  legalName: "琢奧科技",
  domain: "dropout.tw",
  siteUrl: "https://os.dropout.tw",
  email: "info@dropout.tw",
  promise: "一個登入做完。",
  audience: "5 到 100 人的台灣中小企業。",
};

export const SITE_NAV = [
  { href: "/pricing", label: "產品與價格" },
  { href: "/saas", label: "對照鼎新・億看" },
  { href: "/industries", label: "產業包" },
  { href: "/blog", label: "部落格" },
  { href: "/consulting", label: "免費導入" },
  { href: "/help", label: "說明" },
] as const;

export type ModuleStatus = "ready" | "setup" | "pilot";

export const MODULE_STATUS: Record<ModuleStatus, { label: string; hint: string }> = {
  ready: { label: "可用", hint: "開站就能用" },
  setup: { label: "導入接上", hint: "要你們的外部帳號" },
  pilot: { label: "試行", hint: "先跟顧問確認" },
};

export const MODULES: { id: string; name: string; detail: string; status: ModuleStatus; note?: string }[] = [
  { id: "crm", name: "CRM 客人", detail: "誰來過、下一步", status: "ready" },
  { id: "erp", name: "進銷存", detail: "報價、訂單、出貨、庫存", status: "ready" },
  { id: "finance", name: "財務", detail: "帳齡、收付款、傳票、稅", status: "ready", note: "綠界發票" },
  { id: "hr", name: "人事薪資", detail: "打卡、請假、薪資、勞健保", status: "ready" },
  { id: "reports", name: "老闆報表", detail: "營收、毛利、帳齡、缺貨", status: "ready" },
  { id: "chat", name: "對話", detail: "LINE、IG、FB、官網", status: "setup", note: "接官方帳號" },
  { id: "letter", name: "電子報", detail: "寄信、退訂、退信", status: "ready" },
  { id: "meetings", name: "會議紀錄", detail: "自動進會、摘要", status: "pilot" },
  { id: "api", name: "對外 API", detail: "金鑰、Webhook", status: "setup" },
];

export const ONBOARDING_FLOW = [
  { id: "1", title: "看現場", body: "30 分鐘" },
  { id: "2", title: "選產業包", body: "100 種行業" },
  { id: "3", title: "搬資料", body: "跑完一筆" },
  { id: "4", title: "交給你們", body: "設好權限" },
];

export const FAQ = [
  { q: "不用 AI 要錢嗎？", a: "不用。客人、進銷存、帳、薪資、報表免費，不限帳號。" },
  { q: "AI 版多少錢？會限量嗎？", a: `${PRICE_LABEL}。${AI_USAGE_NOTE}` },
  { q: "可以先試用嗎？", a: "可以。試用期資料直接留下來用。" },
  { q: "跟鼎新 A1、億看差在哪？", a: "進銷存與帳對齊它們，畫面只留這一步的按鈕。" },
  { q: "金流、LINE、電子發票另外算嗎？", a: "外部服務照各家原價，我們接上、不抽成。" },
  { q: "不續約資料怎麼辦？", a: "設定裡隨時匯出全部資料。" },
] as const;

export const TRUST_LINKS = [
  { href: "/sla", label: "服務水準", detail: "99.5% 可用率" },
  { href: "/security", label: "資安說明", detail: "權限與每日備份" },
  { href: "/privacy", label: "隱私權政策", detail: "資料保存與刪除" },
  { href: "/status", label: "系統狀態", detail: "目前連線狀態" },
] as const;

export const PILLARS = [
  {
    id: "crm",
    name: "客人",
    replaces: "Salesforce、HubSpot、Pipedrive",
    detail: "誰來過、跟到哪、下一步做什麼。階段照你們行業改。",
  },
  {
    id: "erp",
    name: "生意（進銷存＋帳）",
    replaces: "鼎新 A1、億看 ECOUNT",
    detail: "報價到收款、進貨到付款、庫存、誰欠錢、發票與營業稅。先問下一步，不必先背單據名稱。",
  },
  {
    id: "funnel",
    name: "魅力圈",
    replaces: "ClickFunnels、Unbounce、Mailchimp",
    detail: "官網、活動頁、信件、誰該再聯絡。業務不必再進第二套行銷後台。",
  },
  {
    id: "hygiene",
    name: "擋假信與短網址",
    replaces: "NeverBounce、Bitly、UTM 試算表",
    detail: "假信箱不進客人。對外短網址點了誰，寫回同一個人。",
  },
  {
    id: "reply",
    name: "社群回覆",
    replaces: "ManyChat、IG 留言轉私訊工具",
    detail: "留言出現關鍵字才私訊。同一個人可以轉進客人，不必再複製帳號。",
  },
] as const;

export const SAAS_MATRIX = [
  { category: "客人名單", tools: ["Salesforce", "HubSpot", "Pipedrive", "Zoho CRM"], pillar: "客人" },
  { category: "台灣雲端進銷存", tools: ["鼎新 A1 進銷存", "鼎新 A1 會計", "鼎新電子發票模組"], pillar: "生意" },
  { category: "全功能雲端進銷存", tools: ["億看 ECOUNT"], pillar: "生意" },
  { category: "進銷存／帳", tools: ["SAP Business One", "NetSuite", "Odoo 雲端年費"], pillar: "生意" },
  { category: "會計應收", tools: ["QuickBooks", "Xero", "快速會計"], pillar: "生意" },
  { category: "電商／門市收銀", tools: ["Shopify", "Shopline", "Square"], pillar: "生意" },
  { category: "活動頁與導流", tools: ["ClickFunnels", "Kartra", "Unbounce"], pillar: "魅力圈" },
  { category: "電子報與自動寄信", tools: ["Mailchimp", "Klaviyo", "Benchmark"], pillar: "魅力圈" },
  { category: "表單問卷", tools: ["Typeform", "Google 表單", "SurveyMonkey"], pillar: "魅力圈" },
  { category: "官網建站", tools: ["Wix", "Squarespace", "WordPress 維護約"], pillar: "魅力圈" },
  { category: "短網址看誰點進來", tools: ["Bitly", "Rebrandly", "試算表自己記"], pillar: "擋假信" },
  { category: "擋假信、髒名單", tools: ["NeverBounce", "ZeroBounce", "Emailable"], pillar: "擋假信" },
  { category: "客服信箱", tools: ["Zendesk", "Intercom", "Freshdesk"], pillar: "客人" },
  { category: "預約日曆", tools: ["Calendly", "Cal.com 雲端", "預約 LINE"], pillar: "客人" },
  { category: "專案工時", tools: ["Monday.com", "Asana", "Jira"], pillar: "生意" },
  { category: "試算表當客戶名單", tools: ["Google 試算表", "Dropbox", "個人碟"], pillar: "客人與檔案" },
  { category: "社群私訊接單", tools: ["ManyChat", "IG 留言轉私訊", "CommentGuard"], pillar: "回覆" },
  { category: "LINE 官方", tools: ["LINE OA 後台", "第三方聊天機器人"], pillar: "擋假信" },
  { category: "分析", tools: ["GA4 當業務報表", "一堆廣告後台"], pillar: "魅力圈" },
] as const;

export const CONSULTING_STEPS = [
  { id: "01", title: "看現場", body: "30 分鐘" },
  { id: "02", title: "選產業包", body: "100 種行業" },
  { id: "03", title: "對商品與客人", body: "關掉不用的欄" },
  { id: "04", title: "搬資料", body: "試算表、舊系統" },
  { id: "05", title: "跑完一筆", body: "報價到收款" },
  { id: "06", title: "交給你們", body: "設好權限" },
];
