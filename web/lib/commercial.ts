export const PRICE_YEAR_TWD = 100_000;
export const PRICE_LABEL = "每年 NT$100,000";
export const PRICE_NOTE = "未稅。含每天使用與顧問到現場，不另外加購功能。";

export const COMMERCIAL = {
  product: "DropOut OS",
  legalName: "琢奧科技",
  domain: "dropout.tw",
  email: "info@dropout.tw",
  promise: "一套畫面做完回覆、客人、生意、收錢。一百種行業可切換，顧問到現場免費帶。",
};

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
  { id: "01", title: "三十分鐘摸現場", body: "先看你們現在工作怎麼做完、哪一段最耗時。不先填統編。" },
  { id: "02", title: "選定產業包", body: "一百種行業裡打開最接近的一包，再改跟客人的階段、每天看的數字。" },
  { id: "03", title: "客人、商品、能不能聯絡", body: "顧問把客人、在賣什麼、能不能寄信對上。用不到的步驟關掉。" },
  { id: "04", title: "資料搬家", body: "從試算表、LINE、舊系統搬進來。同一個人用信箱或統編對上，不要建兩次。" },
  { id: "05", title: "一起走過一筆", body: "用真實資料跑完進線到收款。例外記下來再改。" },
  { id: "06", title: "交給你們", body: "誰能看、誰能改、怎麼操作都留下。顧問不另外收費。" },
];
