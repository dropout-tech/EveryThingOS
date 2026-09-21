export const PRICE_YEAR_TWD = 100_000;
export const PRICE_LABEL = "每年 NT$100,000";
export const PRICE_NOTE = "未稅。含系統使用與免費顧問導入，不另收模組費。";

export const COMMERCIAL = {
  product: "DropOut OS",
  legalName: "琢奧科技",
  domain: "dropout.tw",
  email: "info@dropout.tw",
  promise: "一套系統，取代企業正在付費的零散 SaaS。一百個產業包可切換，顧問免費導入。",
};

export const PILLARS = [
  {
    id: "crm",
    name: "關係 CRM",
    replaces: "Salesforce、HubSpot、Pipedrive",
    detail: "名單、商機、跟進、客戶 360。階段可依公司改。",
  },
  {
    id: "erp",
    name: "生意（進銷存＋財務）",
    replaces: "鼎新 A1、億看 ECOUNT",
    detail: "對齊 A1／億看等級：報價到收款、採購到付款、庫存、帳齡、傳票、營業稅與電子發票。用「下一步」不是程式名稱。",
  },
  {
    id: "funnel",
    name: "魅力圈",
    replaces: "ClickFunnels、Unbounce、Mailchimp",
    detail: "官網、落地頁、磁鐵、序列、計分。業務不用再進第二套行銷雲。",
  },
  {
    id: "hygiene",
    name: "通道衛生",
    replaces: "NeverBounce、Bitly、UTM 試算表",
    detail: "進線先清庫，對外短網址與點擊歸因寫回同一個人。",
  },
  {
    id: "reply",
    name: "社群回覆",
    replaces: "ManyChat、IG 留言轉私訊工具",
    detail: "留言命中關鍵字才私訊。底層 OpenReply（MIT），同一個人可轉進客人看板。",
  },
] as const;

export const SAAS_MATRIX = [
  { category: "CRM", tools: ["Salesforce", "HubSpot", "Pipedrive", "Zoho CRM"], pillar: "CRM" },
  { category: "台灣雲端進銷存", tools: ["鼎新 A1 進銷存", "鼎新 A1 會計", "鼎新電子發票模組"], pillar: "生意" },
  { category: "全模組雲端 ERP", tools: ["億看 ECOUNT"], pillar: "生意" },
  { category: "ERP／進銷存", tools: ["SAP Business One", "NetSuite", "Odoo 雲端年費"], pillar: "生意" },
  { category: "會計應收", tools: ["QuickBooks", "Xero", "快速會計"], pillar: "ERP" },
  { category: "電商／POS", tools: ["Shopify", "Shopline", "Square"], pillar: "ERP" },
  { category: "行銷漏斗", tools: ["ClickFunnels", "Kartra", "Unbounce"], pillar: "魅力圈" },
  { category: "電子報自動化", tools: ["Mailchimp", "Klaviyo", "Benchmark"], pillar: "魅力圈" },
  { category: "表單問卷", tools: ["Typeform", "Google 表單", "SurveyMonkey"], pillar: "魅力圈" },
  { category: "官網建站", tools: ["Wix", "Squarespace", "WordPress 維護約"], pillar: "魅力圈" },
  { category: "短網址歸因", tools: ["Bitly", "Rebrandly", "UTM Excel"], pillar: "通道衛生" },
  { category: "名單清庫", tools: ["NeverBounce", "ZeroBounce", "Emailable"], pillar: "通道衛生" },
  { category: "客服信箱", tools: ["Zendesk", "Intercom", "Freshdesk"], pillar: "CRM" },
  { category: "預約日曆", tools: ["Calendly", "Cal.com 雲端", "預約 LINE"], pillar: "CRM" },
  { category: "專案工時", tools: ["Monday.com", "Asana", "Jira"], pillar: "ERP" },
  { category: "雲端硬碟主檔", tools: ["Google 試算表", "Dropbox", "個人碟"], pillar: "平台核" },
  { category: "社群私訊接單", tools: ["ManyChat", "IG 留言轉私訊", "CommentGuard"], pillar: "回覆（OpenReply）" },
  { category: "LINE 官方", tools: ["LINE OA 後台", "第三方聊天機器人"], pillar: "通道衛生" },
  { category: "分析", tools: ["GA4 當業務報表", "一堆廣告後台"], pillar: "魅力圈" },
] as const;

export const CONSULTING_STEPS = [
  { id: "01", title: "三十分鐘摸現場", body: "先看現在工作怎麼完成、哪一段最耗時。不先填統編。" },
  { id: "02", title: "選定產業包", body: "一百個情境裡打開最接近的一包，再改階段與 Dashboard，不重寫核心。" },
  { id: "03", title: "主檔與流程", body: "顧問把客戶、商品、同意、UTM 契約對上。能跳過的節點關掉。" },
  { id: "04", title: "資料搬家", body: "從試算表、LINE、舊 SaaS 匯入。重複的人以 email／統編對上。" },
  { id: "05", title: "一起走過一筆", body: "用真實資料跑完進線到收款。例外記下來再改。" },
  { id: "06", title: "交給你們", body: "帳號、權限、操作文件留下。顧問不另外收費。" },
];
