import { COMMERCIAL, PRICE_LABEL, PRICE_NOTE, PRICE_YEAR_TWD } from "./commercial";

export const LEGAL_VERSION = "2026-10-11";

const todo = (label: string) => `【待填：${label}】`;

/** Everything the business owner must fill in before any document is signed. */
export const ENTITY = {
  brand: COMMERCIAL.legalName,
  name: todo("公司登記全名"),
  taxId: todo("統一編號"),
  address: todo("登記地址"),
  representative: todo("代表人"),
  email: COMMERCIAL.email,
  privacyEmail: todo("個資聯絡信箱，可沿用 " + COMMERCIAL.email),
  phone: todo("客服電話"),
  court: todo("合意管轄法院，例：臺灣臺北地方法院"),
  host: todo("主機商名稱與機房地區"),
  speechToText: todo("語音轉文字服務，自架 Whisper 則刪除此列"),
  paymentDays: todo("付款期限，例：發票開立後 30 天內"),
  monitor: todo("可用率監測工具"),
  backupRetention: todo("R2 備份保存天數"),
};

/** Mirrors glue/src/accounts.ts (NOTICE_DAYS, GRACE_DAYS) and the toolkit's --trial-days default. */
export const CONTRACT = {
  trialDays: 30,
  noticeDays: 60,
  graceDays: 14,
  exportDays: 90,
  exportPath: "設定 → 下載全部資料（客戶、商品、銷項發票 CSV，或整站 ERPNext 備份）",
};

const monthFee = Math.round(PRICE_YEAR_TWD / 12);
const twd = (n: number) => `NT$${Math.round(n).toLocaleString("zh-TW")}`;

export const SLA = {
  uptime: "99.5%",
  rpo: "24 小時",
  rto: "8 小時",
  severeResponse: "2 小時",
  hours: "週一至週五 09:00–18:00（國定假日除外）",
  maintenanceNotice: "72 小時",
  credits: [
    { below: "99.5%", percent: 5 },
    { below: "99%", percent: 10 },
    { below: "95%", percent: 25 },
  ],
  creditCap: 25,
};

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  table?: { head: string[]; rows: string[][] };
};

export type LegalDoc = {
  slug: "terms" | "privacy" | "dpa" | "sla" | "security";
  title: string;
  kicker: string;
  summary: string;
  sections: LegalSection[];
};

const lifecycleTable = {
  head: ["狀態", "什麼時候", "能不能改資料", "能不能看和匯出"],
  rows: [
    ["試用", `開站後 ${CONTRACT.trialDays} 天（依訂單）`, "可以", "可以"],
    ["使用中", "簽約付款後", "可以", "可以"],
    ["快到期", `到期前 ${CONTRACT.noticeDays} 天內，開始寄續約提醒`, "可以", "可以"],
    ["寬限", `到期後 ${CONTRACT.graceDays} 天內`, "可以", "可以"],
    ["只能看", "寬限過了還沒續約", "不行", "可以"],
    ["暫停", "依第 6 條暫停", "不行", "可以"],
    ["解約", "任一方依第 6 條終止", "不行", `可以，${CONTRACT.exportDays} 天內`],
  ],
};

const dataEnd = [
  `只能看、暫停、解約時，資料都留著，登入、看資料、管人、下載備份照常；只是不能新增或修改業務資料。`,
  `匯出方式：${CONTRACT.exportPath}。整站備份是整個站台的資料庫與檔案，可以搬到任何 ERPNext v15。`,
  `解約生效日起 ${CONTRACT.exportDays} 天內可以登入匯出；第 ${CONTRACT.exportDays + 1} 天起刪除站台，並刪除 R2 上這個站台的所有備份；刪除前留的最後一份備份另外保存 30 天後刪除，只用來處理刪除後 30 天內的爭議。刪除後無法復原，DropOut 會以 Email 告知刪除完成。`,
  "法律要求保存的資料（例如會計憑證），由客戶自己匯出保存。",
];

const subprocessors = {
  head: ["廠商", "做什麼", "會碰到的資料", "地區"],
  rows: [
    ["Cloudflare, Inc.", "網站外殼、系統同步、檔案與備份（R2）、Tunnel、營運後台登入關卡、交易信", "所有經過網站的資料、備份檔", "美國公司，全球節點"],
    [ENTITY.host, "主機：ERPNext、對話（Chatwoot）、會議機器人（Vexa）", "所有客戶資料", ENTITY.host],
    ["Resend（或屆時選定的寄信服務）", "電子報、續約提醒寄送", "收件人 Email、姓名、信件內容", "美國"],
    ["綠界科技 ECPay、藍新金流 NewebPay", "官網收款（客戶有開商店才用）", "訂單金額、付款人聯絡資料", "台灣"],
    ["綠界科技 ECPay（電子發票加值中心）", "開立、作廢電子發票", "買受人統編、載具、Email、品項金額", "台灣"],
    ["Cloudflare Workers AI（選用）", "會議逐字稿摘要", "會議逐字稿", "美國公司，全球節點"],
    [ENTITY.speechToText, "會議錄音轉文字（選用）", "會議錄音", todo("地區")],
    ["Vercel Inc.", "目前的預覽網址；正式站搬到 Cloudflare 後停用", "預覽網址上輸入的資料", "美國"],
  ],
};

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  terms: {
    slug: "terms",
    title: "服務條款",
    kicker: "合約",
    summary: `訂閱 ${COMMERCIAL.product} 時，雙方各自要做什麼、錢怎麼付、到期和解約後資料怎麼辦。`,
    sections: [
      {
        heading: "1. 誰跟誰簽",
        paragraphs: [
          `服務提供者：${ENTITY.brand}（${ENTITY.name}，統一編號 ${ENTITY.taxId}，代表人 ${ENTITY.representative}，地址 ${ENTITY.address}，下稱 DropOut）。`,
          `客戶：在訂單或報價單上簽名的公司。訂單與本條款不同時，以訂單為準。資料處理附約、服務水準、隱私權政策都是本條款的一部分。`,
        ],
      },
      {
        heading: "2. 服務內容",
        items: [
          `一家公司一個獨立站台：客人、生意（報價到收款、採購、庫存、帳）、電子報、官網、對話、會議紀錄，依訂單打開。`,
          "免費顧問導入：選定產業包、搬資料、一起跑完一筆真實生意。",
          "不收每人帳號費，不另外加購功能；年費含更新。",
          "金流、簡訊、LINE 官方帳號、電子發票加值中心、寄信服務是外部服務，客戶依各家條款與收費自己簽約；DropOut 幫忙接上，不抽成。",
        ],
      },
      {
        heading: "3. 費用與付款",
        items: [
          `${PRICE_LABEL}。${PRICE_NOTE}`,
          `年繳。DropOut 開立發票，付款期限 ${ENTITY.paymentDays}。`,
          `要調整下一年度的年費，DropOut 會在到期前 ${CONTRACT.noticeDays} 天書面通知；沒通知就照原價續約。`,
        ],
      },
      {
        heading: "4. 試用",
        paragraphs: [
          `開站後試用 ${CONTRACT.trialDays} 天（依訂單可調）。試用期間功能與正式相同。試用到期沒簽約，依第 5 條進入寬限，再改成只能看。`,
        ],
      },
      {
        heading: "5. 期間、續約與到期",
        paragraphs: [
          "合約一年一期，到期日當天台灣時間 23:59:59 才算過期。DropOut 會在到期前與到期後寄續約提醒給客戶聯絡人。",
        ],
        table: lifecycleTable,
      },
      {
        heading: "6. 暫停與終止",
        items: [
          "DropOut 可以暫停服務的情形：逾期未付款超過寬限期、客戶帳號被用來發垃圾信或攻擊他人、發生資安事件需要隔離。暫停前會先通知，緊急資安情形除外，事後馬上通知。",
          "任一方可以在當期到期前 30 天書面通知不續約。",
          "一方嚴重違約，經書面通知 30 天內未改善，另一方可以終止。",
          "DropOut 可歸責而終止時，退還未使用期間的年費。",
        ],
      },
      { heading: "7. 資料歸誰、到期與解約後怎麼辦", paragraphs: ["客戶放進系統的資料屬於客戶。DropOut 只依資料處理附約處理，不拿去賣、不拿去行銷。"], items: dataEnd },
      {
        heading: "8. 客戶要做的事",
        items: [
          "保管帳號密碼；建議在團隊頁替全員打開兩步驟登入。",
          "放進系統的客人個資，要依《個人資料保護法》合法蒐集；寄行銷信要有對方同意。",
          "不用本服務寄垃圾信、侵害他人權利或做違法的事。",
          "遵守自己接上的 LINE、Meta、金流、電子發票等外部服務的條款。",
        ],
      },
      {
        heading: "9. 智慧財產與開源",
        paragraphs: [
          "EveryThingOS 的外殼、識別、產業包與整合程式屬於 DropOut。底下使用的開源軟體（ERPNext GPL-3.0、Frappe MIT、Chatwoot 社群版 MIT、Vexa Apache-2.0 等）依各自授權，客戶的權利不因本條款減少。",
        ],
      },
      { heading: "10. 服務水準", paragraphs: [`月可用率 ${SLA.uptime}，未達標依服務水準文件抵扣費用。詳見服務水準。`] },
      {
        heading: "11. 責任限制",
        paragraphs: [
          "DropOut 對客戶的賠償總額，以事故發生前 12 個月客戶實際支付的費用為上限；間接損失、營業利益損失不在賠償範圍。故意或重大過失、違反保密義務、依法不得限制的責任，不受此限。",
        ],
      },
      { heading: "12. 保密", paragraphs: ["雙方對因合作知道的對方營業秘密與資料保密，合約結束後仍有效。"] },
      { heading: "13. 條款變更", paragraphs: ["DropOut 修改本條款會在生效前 30 天以 Email 通知；對客戶不利的修改，在當期合約內不適用。"] },
      { heading: "14. 準據法與管轄", paragraphs: [`適用中華民國法律。因本合約涉訟，以 ${ENTITY.court} 為第一審管轄法院。`] },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "隱私權政策",
    kicker: "個資",
    summary: "依《個人資料保護法》第 8 條告知：DropOut 自己蒐集哪些個資、為什麼、用多久、給誰，以及你可以怎麼要回來。",
    sections: [
      {
        heading: "1. 誰在蒐集",
        paragraphs: [
          `${ENTITY.brand}（${ENTITY.name}，統一編號 ${ENTITY.taxId}，地址 ${ENTITY.address}）。`,
          "這份政策只管 DropOut 自己的客戶、使用者與官網訪客。客戶公司放進 EveryThingOS 的客人資料，由客戶公司負責，DropOut 是受託處理者，見資料處理附約。",
        ],
      },
      {
        heading: "2. 蒐集目的",
        items: [
          "〇六九 契約、類似契約或其他法律關係事務：簽約、開站、開發票、收款、續約提醒。",
          "〇九〇 消費者、客戶管理與服務：導入顧問、客服、事故通知。",
          "一三五 資（通）訊服務、一三六 資（通）訊與資料庫管理：讓你登入、記住設定、保存操作紀錄。",
          "一三七 資通安全與管理：偵測異常登入、稽核、備份還原。",
          "〇四〇 行銷：寄產品更新與活動訊息；只寄給同意的人，信裡可以退訂。",
        ],
      },
      {
        heading: "3. 蒐集哪些資料",
        table: {
          head: ["誰", "資料", "從哪來"],
          rows: [
            ["官網訪客、來信詢問的人", "姓名、Email、電話、公司、詢問內容（C001 辨識個人者、C038 職業）", "你寫信或填表"],
            ["客戶公司的聯絡人", "姓名、職稱、Email、電話、公司統編、發票資料（C001、C002 辨識財務者、C038）", "簽約、導入時提供"],
            ["EveryThingOS 使用者（客戶員工）", "姓名、Email、職務、登入時間、IP 位址、誰改了什麼（C001、C038）", "公司老闆邀請你、你使用系統時自動記錄"],
            ["所有人", "Cookie：登入狀態、外觀、選過的行業", "瀏覽器"],
          ],
        },
        paragraphs: ["Cookie 只用來讓網站正常運作，沒有放廣告或追蹤分析工具。關掉 Cookie 就無法登入。"],
      },
      {
        heading: "4. 用多久、在哪裡、給誰、怎麼用",
        items: [
          `期間：合約存續期間，加上解約後 ${CONTRACT.exportDays} 天；法律要求保存更久的（例如帳務憑證依《商業會計法》）照法律。行銷用途到你退訂為止。`,
          "地區：中華民國，以及資料處理附約列出的受託廠商所在地（例如 Cloudflare、寄信服務在美國）。",
          "對象：DropOut、資料處理附約列出的受託廠商、依法有權調閱的機關。不賣給任何人。",
          "方式：用電腦或人工，以電子方式蒐集、處理、利用與國際傳輸。",
        ],
      },
      {
        heading: "5. 你可以要求的事",
        paragraphs: ["依《個人資料保護法》第 3 條，你可以要求："],
        items: [
          "查詢或閱覽你的個資",
          "製給複製本（可能酌收成本費用）",
          "補充或更正",
          "停止蒐集、處理或利用",
          "刪除",
        ],
      },
      {
        heading: "6. 怎麼要求、多久回覆",
        paragraphs: [
          `寫信到 ${ENTITY.privacyEmail}，寫明你是誰、要做哪一項。我們確認是本人後，查詢、閱覽、複製在 15 天內處理；補充更正、停止、刪除在 30 天內處理，必要時各可延長一次並告訴你原因。`,
          "如果你是某家客戶公司的客人，我們會把你的要求轉給那家公司處理。",
          "你可以不提供個資，但我們可能無法回覆、開站或讓你登入。",
        ],
      },
      { heading: "7. 安全與外洩通知", paragraphs: ["安全措施見資安說明。發生個資外洩，查明後依法通知你。"] },
      { heading: "8. 修訂", paragraphs: ["修改這份政策會更新上方的版本日期，重大修改會以 Email 通知客戶聯絡人。"] },
      { heading: "9. 聯絡我們", paragraphs: [`個資問題：${ENTITY.privacyEmail}　一般問題：${ENTITY.email}　電話：${ENTITY.phone}`] },
    ],
  },
  dpa: {
    slug: "dpa",
    title: "資料處理附約",
    kicker: "委託處理",
    summary: "客戶把自己客人的個資放進 EveryThingOS 時，DropOut 是受託者。這份附約依《個人資料保護法》第 4 條與施行細則第 8 條寫明雙方的事。",
    sections: [
      {
        heading: "1. 角色",
        paragraphs: [
          "客戶是委託機關，決定蒐集誰的資料、為什麼蒐集，並負責取得告知與同意。DropOut 是受託者，只依客戶的指示與本附約處理。",
        ],
      },
      {
        heading: "2. 處理哪些資料、做什麼",
        table: {
          head: ["項目", "內容"],
          rows: [
            ["當事人", "客戶的客人、潛在客人、聯絡人、電子報訂閱者、供應商聯絡人、員工"],
            ["資料類別", "姓名、Email、電話、地址、統編、LINE／IG／FB 帳號 ID、對話內容、訂單與發票、行銷同意紀錄、會議錄音、逐字稿與摘要"],
            ["處理目的", "提供 EveryThingOS：存放、顯示、同步、寄信、開發票、收款、會議摘要、備份"],
            ["期間", `合約期間，加上解約後 ${CONTRACT.exportDays} 天`],
          ],
        },
      },
      {
        heading: "3. DropOut 承諾",
        items: [
          "只為提供服務處理，不拿去行銷、不賣、不拿來訓練模型。",
          "能碰到客戶資料的 DropOut 人員簽保密約定，只在導入、客服、排除故障時看。",
          "依資安說明的措施保護資料。",
          "客戶的指示違反法令時，DropOut 會馬上告知客戶。",
        ],
      },
      {
        heading: "4. 複委託（受託廠商）",
        paragraphs: [
          "客戶同意 DropOut 使用下列廠商。要新增或更換，DropOut 會在 30 天前以 Email 通知；客戶不同意可以終止合約，退還未使用期間費用。",
          "客戶自己接上的 LINE、Meta、Zoom、Google Meet、Microsoft Teams 等服務，是客戶與該廠商之間的關係，不在此列。",
        ],
        table: subprocessors,
      },
      {
        heading: "5. 協助當事人行使權利",
        paragraphs: [
          "客戶可以在系統裡自己查詢、更正、刪除客人資料。DropOut 收到客人直接來的要求，會轉給客戶，不自己回覆內容。客戶需要協助時，DropOut 在支援時段內協助。",
        ],
      },
      {
        heading: "6. 事故通知",
        paragraphs: [
          "DropOut 知道客戶資料被竊取、洩漏、竄改或毀損時，72 小時內通知客戶聯絡人，告訴客戶發生什麼、影響哪些資料、已經做了什麼，並協助客戶依法通知當事人。",
        ],
      },
      {
        heading: "7. 客戶的監督",
        paragraphs: [
          "客戶每年可以要求一次書面說明安全措施與受託廠商現況。客戶自己可以在團隊頁看到誰登入、誰改了什麼、誰匯出資料。",
        ],
      },
      {
        heading: "8. 跨境傳輸",
        paragraphs: ["部分受託廠商在中華民國以外處理資料（見第 4 條）。如主管機關依《個人資料保護法》第 21 條限制傳輸，DropOut 會配合調整。"],
      },
      { heading: "9. 合約結束：返還與刪除", items: dataEnd },
    ],
  },
  sla: {
    slug: "sla",
    title: "服務水準",
    kicker: "SLA",
    summary: "EveryThingOS 每個月要做到多穩、出事多快回、資料最多掉多少、沒做到怎麼補償。",
    sections: [
      {
        heading: "1. 承諾的數字",
        table: {
          head: ["項目", "承諾"],
          rows: [
            ["月可用率", SLA.uptime],
            ["資料最多掉多久（RPO）", `${SLA.rpo}（每日備份）`],
            ["多久恢復（RTO）", SLA.rto],
            ["嚴重事故回應", `${SLA.severeResponse}內，不分時段`],
            ["一般問題回應", "下一個支援工作日內"],
            ["支援時段", SLA.hours],
            ["計畫維護預告", `至少 ${SLA.maintenanceNotice}前`],
          ],
        },
      },
      {
        heading: "2. 可用率怎麼算",
        paragraphs: [
          "以台灣時間每個日曆月計算：可用率 ＝（當月總分鐘 − 不可用分鐘）÷ 當月總分鐘。",
          "不可用：客戶的站台無法登入，或登入後讀不到資料，連續 5 分鐘以上。",
          `以 DropOut 的外部監測紀錄為準（${ENTITY.monitor}），客戶可以要求當月紀錄。`,
        ],
      },
      {
        heading: "3. 不算在內",
        items: [
          `至少 ${SLA.maintenanceNotice}前公告的計畫維護。`,
          "第三方服務出問題：LINE、Meta、金流、電子發票加值中心、寄信服務、Zoom／Google Meet／Teams、客戶自己的網域或網路。",
          "客戶自己造成的，例如改壞設定、帳號被盜用。",
          "因合約到期改成只能看、暫停或解約。",
          "天災、戰爭、大規模網路中斷等不可抗力。",
        ],
      },
      {
        heading: "4. 沒做到怎麼補償",
        paragraphs: [
          `以當月月費計算（年費 ÷ 12，約 ${twd(monthFee)}），從下一期年費扣抵，或解約時退還。補償合計最多當月月費 ${SLA.creditCap}%。`,
        ],
        table: {
          head: ["當月可用率", "抵扣", "以年費換算約"],
          rows: SLA.credits.map((c) => [`低於 ${c.below}`, `當月月費 ${c.percent}%`, twd((monthFee * c.percent) / 100)]),
        },
        items: ["次月底前寫信申請，附上受影響的時間。", "抵扣是可用率未達標的唯一補償，但不影響服務條款第 11 條的責任。"],
      },
      {
        heading: "5. 事故等級",
        table: {
          head: ["等級", "例子", "回應"],
          rows: [
            ["嚴重", "整家公司無法登入、資料讀不到、疑似資料外洩", `${SLA.severeResponse}內，不分時段；處理期間每 2 小時更新一次`],
            ["一般", "單一功能不正常、匯入失敗、操作問題", "下一個支援工作日內"],
          ],
        },
      },
      {
        heading: "6. 備份與還原",
        items: [
          "每個站台每天備份一次資料庫與檔案到 Cloudflare R2，每家公司一個資料夾。",
          `備份保存 ${ENTITY.backupRetention}。`,
          "每月實際還原一次到測試站，確認備份能用。",
          `需要還原時，在 ${SLA.rto}內恢復到最近一次備份。`,
        ],
      },
      { heading: "7. 怎麼找我們", paragraphs: [`Email：${ENTITY.email}　電話：${ENTITY.phone}。嚴重事故請在信件主旨寫「嚴重」。`] },
    ],
  },
  security: {
    slug: "security",
    title: "資安說明",
    kicker: "資安",
    summary: "這裡只寫系統裡真的有的做法，以及在哪裡設定。還沒做的也寫出來。",
    sections: [
      {
        heading: "1. 登入",
        items: [
          "只用 ERPNext 帳號登入（OAuth2 授權碼加 PKCE）。DropOut 外殼不另存密碼。",
          "登入狀態用加密的 Cookie（AES-GCM）保存，而且綁定那一家公司的站台；拿 A 公司的登入去開 B 公司，會被要求重新登入。",
          "兩步驟登入：驗證器 App 或 Email。老闆在團隊頁一鍵替全員打開。",
          "密碼強度：打開 ERPNext 密碼政策，太弱的密碼不能用。",
          "連續輸錯 5 次鎖住帳號，一段時間後才能再試。",
          "閒置自動登出，時間由老闆在團隊頁設定。",
          "停用一個人時，他的登入馬上失效，外殼拿到的授權也一併撤銷。",
        ],
        paragraphs: ["兩步驟、密碼強度、鎖帳號、閒置登出都是 ERPNext 內建設定，由老闆在團隊頁打開。"],
      },
      {
        heading: "2. 誰能看什麼",
        items: [
          "職務：老闆、主管、業務、倉管、採購、會計、客服、行銷，對應 ERPNext 的 Role Profile。公司可以自己調。",
          "選單照職務顯示，但能不能讀寫最後由 ERPNext 判斷，外殼不另開後門。",
          "只有老闆能管人和安全設定；系統不讓公司沒有老闆。",
        ],
      },
      {
        heading: "3. 紀錄",
        items: [
          "誰登入、登出、登入失敗（ERPNext Activity Log，含 IP）。",
          "誰改了哪張單（ERPNext Version）。",
          "誰匯出資料（ERPNext Access Log）。",
          "老闆在團隊頁的「最近紀錄」看得到。續約、暫停等合約變更記在 DropOut 營運後台，記下是誰做的。",
        ],
      },
      {
        heading: "4. 公司之間隔開",
        items: [
          "一家公司一個 ERPNext 站台，各自獨立的資料庫。",
          "對話（Chatwoot）一家一個帳戶；會議機器人（Vexa）一家一把金鑰。",
          "各公司連線用的金鑰先加密（AES-GCM）再存進資料庫。",
        ],
      },
      {
        heading: "5. 網路",
        items: [
          "主機不開任何對外連接埠，只透過 Cloudflare Tunnel 連出去。",
          "DropOut 員工用的營運後台另外部署，前面放 Cloudflare Access；每個請求都驗 Access 的簽章與 Email 名單。",
          "LINE、Meta、金流送來的通知先驗簽章或檢查碼才處理；外殼的寫入 API 只收同網域送來的請求。",
          "金鑰只放在伺服器環境變數，不進程式碼、不送到瀏覽器。",
        ],
      },
      {
        heading: "6. 備份",
        items: [
          "每個站台每天用 ERPNext 內建的 S3 備份，把資料庫與檔案存到 Cloudflare R2，每家一個資料夾，還原時不會混到別家。",
          `客戶自己隨時可以匯出：${CONTRACT.exportPath}。合約到期改成只能看、暫停、解約時也能匯出。`,
        ],
      },
      {
        heading: "7. 還沒有的",
        items: ["目前沒有 ISO 27001、SOC 2 等第三方認證。", "還沒有做過第三方滲透測試。"],
        paragraphs: ["要做的話會更新這頁。採購需要填資安問卷，請來信。"],
      },
    ],
  },
};

export const LEGAL_LINKS = Object.values(LEGAL_DOCS).map((d) => ({ href: `/${d.slug}`, label: d.title }));
