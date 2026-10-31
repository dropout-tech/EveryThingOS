/** What the customer pays for the AI plan. Tax is already inside this number. */
export const PRICE_YEAR_TWD = 69_000;
export const PRICE_LABEL = "AI 版每年含稅 NT$69,000";
export const PRICE_NOTE = "不用 AI，系統免費，可以自己先用。AI 版含到現場導入，不另外賣導入專案。一間公司，不限帳號。";
/** Said in full wherever the price appears. The cap is not a number yet. */
export const AI_USAGE_NOTE = "現在 AI 用量不限。以後會限量。上限多少、從哪一天開始，會先寫在價格頁，並在到期前書面通知。這一期不會靜默改成限量。";

export const COMMERCIAL = {
  product: "EveryThingOS",
  legalName: "琢奧科技",
  domain: "dropout.tw",
  siteUrl: "https://os.dropout.tw",
  email: "info@dropout.tw",
  promise: "一套畫面做完回覆、客人、生意、收錢。一百種行業可切換，顧問到現場免費帶。",
  audience: "給 5 到 100 人、現在用試算表、LINE 或鼎新 A1／億看在記帳的台灣中小企業。",
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
  ready: { label: "可用", hint: "簽約開站就能用" },
  setup: { label: "導入時接上", hint: "要先有你們自己的外部帳號" },
  pilot: { label: "試行", hint: "可以用，先跟顧問確認合不合適" },
};

export const MODULES: { id: string; name: string; detail: string; status: ModuleStatus; note?: string }[] = [
  { id: "crm", name: "CRM 客人", detail: "誰來過、跟到哪、下一步做什麼。同一個 Email 或電話不會建兩次。", status: "ready" },
  { id: "erp", name: "進銷存", detail: "報價、訂單、出貨、採購、進貨、多倉庫存。只顯示這張單的下一步。", status: "ready" },
  { id: "finance", name: "財務", detail: "應收應付帳齡、收付款、傳票、營業稅。", status: "ready", note: "電子發票接綠界，要先申請綠界帳號" },
  { id: "hr", name: "人事薪資", detail: "請假、核准、打卡、薪資。月中勞保按日，職災與獎金補充保費可設定。特休、婚假與加班倍數依勞基法。", status: "ready", note: "費率每年要對勞保局、健保署公告" },
  { id: "reports", name: "老闆報表", detail: "營收、毛利、帳齡、前十大客人、缺貨。手機可以加到主畫面。", status: "ready" },
  { id: "chat", name: "對話", detail: "LINE、IG、FB、官網訊息在同一個收件匣，回完直接轉成客人。", status: "setup", note: "要接你們的 LINE 官方帳號與粉專" },
  { id: "letter", name: "電子報", detail: "寫好就寄，退訂與同意紀錄自動留。退信的名單另外列出來。", status: "ready" },
  { id: "meetings", name: "會議紀錄", detail: "線上會議派機器人記錄、整理摘要，每一場都可以關掉。", status: "pilot" },
  { id: "api", name: "對外 API", detail: "每家公司自己的金鑰，客人、商品、訂單、發票；有事件時推 Webhook。", status: "setup", note: "由顧問幫你們開金鑰" },
];

export const ONBOARDING_FLOW = [
  { id: "1", title: "約 30 分鐘看現場", body: "顧問看你們現在怎麼做事、哪一段最花時間。不用先簽約，也不用先填統編。" },
  { id: "2", title: "開站、選產業包", body: "簽約付款後開好你們自己的網址，打開最像的產業包，用不到的功能先關。" },
  { id: "3", title: "搬資料、跑一筆真的", body: "從試算表、LINE、舊系統搬客人與商品，再一起跑完一筆進線到收款。" },
  { id: "4", title: "交給你們", body: "誰能看、誰能改都設好。之後有問題寫信或看說明中心，顧問時數內的調整不另收費。" },
];

export const FAQ = [
  { q: "不用 AI 要錢嗎？", a: "不用。客人、進銷存、帳、薪資、報表可以免費使用，不收每人帳號費，模組不另外加購。" },
  { q: "AI 版多少錢？用量會限嗎？", a: `${PRICE_LABEL}。${PRICE_NOTE}${AI_USAGE_NOTE}` },
  { q: "可以先試用嗎？", a: "可以。先約顧問看現場；決定要用之後開站，有試用期，試用期間資料都可以留下來接著用。" },
  { q: "跟鼎新 A1、億看差在哪？", a: "進銷存與帳的範圍對齊它們，但畫面只問「下一步是什麼」，並且把客人、對話、電子報、報表放在同一個登入裡。" },
  { q: "金流、簡訊、LINE、電子發票要另外付錢嗎？", a: "這些是外部服務，依各家原價收費，你們直接跟他們簽。我們負責接上，不抽成。" },
  { q: "資料是誰的？不續約怎麼辦？", a: "資料是你們的。隨時可以在設定匯出全部資料；到期或解約後仍可以看和匯出一段時間，細節寫在服務條款。" },
  { q: "資料放在哪裡、安不安全？", a: "每家公司有自己的資料庫，登入、權限、紀錄與每日備份的做法寫在資安說明與服務水準。" },
] as const;

export const TRUST_LINKS = [
  { href: "/sla", label: "服務水準", detail: "月可用率目標與沒做到的補償" },
  { href: "/security", label: "資安說明", detail: "登入、權限、紀錄、備份" },
  { href: "/privacy", label: "隱私權政策", detail: "蒐集什麼、用多久、怎麼刪" },
  { href: "/status", label: "系統狀態", detail: "現在是否正常、近期事故" },
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
  { id: "01", title: "三十分鐘摸現場", body: "先看你們現在工作怎麼做完、哪一段最耗時。不先填統編。" },
  { id: "02", title: "選定產業包", body: "一百種行業裡打開最接近的一包，再改跟客人的階段、每天看的數字。" },
  { id: "03", title: "客人、商品、能不能聯絡", body: "顧問把客人、在賣什麼、能不能寄信對上。用不到的步驟關掉。" },
  { id: "04", title: "資料搬家", body: "從試算表、LINE、舊系統搬進來。同一個人用信箱或統編對上，不要建兩次。" },
  { id: "05", title: "一起走過一筆", body: "用真實資料跑完進線到收款。例外記下來再改。" },
  { id: "06", title: "交給你們", body: "誰能看、誰能改、怎麼操作都留下。顧問不另外收費。" },
];
