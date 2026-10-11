import { PRICE_LABEL } from "./commercial";
import { CHECKLIST, ROLES, ROLE_GUIDES } from "./guide";

/**
 * 說明中心. Every article lives here, so the help pages, search and the links
 * from empty states and hints all read one list. Inline links use
 * `[文字](/path)`; only site paths and https links are turned into links.
 */
export type HelpBlock =
  | { h: string; id?: string }
  | { p: string }
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { code: string };

export type HelpArticle = {
  slug: string;
  title: string;
  category: HelpCategory;
  summary: string;
  keywords: string[];
  blocks: HelpBlock[];
  related?: string[];
};

export const HELP_CATEGORIES = ["開始使用", "匯入資料", "每個模組怎麼用", "權限與職務", "續約與付款", "資料匯出", "常見問題"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

const MENU_BY_ROLE: Record<string, string> = {
  老闆: "全部打開的功能，加上報表、團隊",
  主管: "全部打開的功能，加上報表；沒有團隊",
  業務: "客人、生意、對話、會議、人事",
  倉管: "倉庫、會議、人事",
  採購: "進貨、會議、人事",
  會計: "生意、收錢、報表、會議、人事",
  客服: "客人、生意、對話、會議、人事",
  行銷: "客人、生意、電子報、對話、官網、會議、人事",
  人資: "會議、人事",
};

export const HELP: HelpArticle[] = [
  {
    slug: "start",
    title: "開始使用 DropOut OS",
    category: "開始使用",
    summary: "登入、看「今天」、練習一筆生意，第一個小時要做的事。",
    keywords: ["登入", "入門", "第一次", "今天", "示範", "練習"],
    blocks: [
      { p: "DropOut OS 是一個網址、一次登入，就能回客人訊息、跟進客人、走完報價到收款、發電子報。背後的帳、單據、客人資料都在你們公司自己的 ERPNext，DropOut OS 是上面那層比較好用的畫面。" },
      { h: "第一個小時" },
      {
        ordered: true,
        list: [
          "用公司給你的帳號登入（ERPNext 帳號）。第一次登入時，系統會寄設定密碼的信給你。",
          "打開「今天」：最上面是「你每天會用到的三件事」，照你的職務排好。看完按「知道了，收起來」。",
          "老闆會多看到「開站清單」：公司資料與統編、邀請同事、匯入客人和商品⋯⋯每一項做完會自動打勾。",
          "到[練習第一筆生意](/workspace/practice)走一次：報價 → 客人答應 → 出貨 → 請他付錢 → 收款。用練習帳本，不會動到真的資料。",
          "有問題，按畫面右上角的「? 說明」回到這裡。",
        ],
      },
      { h: "示範資料和真的資料" },
      { p: "還沒接上 ERPNext 的畫面是示範模式，每一頁下面都會寫「示範資料」或「練習」，按下一步只在這個瀏覽器走動。接上之後，畫面讀你們真的單據；連不上時會寫「現在拿不到資料」，不會偷偷換回示範數字。" },
      { h: "公司資料與統編" },
      { p: "公司名稱、統編、地址會印在報價單、發票、電子發票上。老闆或導入顧問在 ERPNext 的「Company（公司）」填好統編，開站清單的第一項就會打勾。" },
    ],
    related: ["checklist", "practice", "first-day", "import-data"],
  },
  {
    slug: "checklist",
    title: "開站清單怎麼算",
    category: "開始使用",
    summary: "老闆在「今天」看到的開站清單：每一項看什麼資料、按鈕去哪裡、怎麼收起來和叫回來。",
    keywords: ["開站", "清單", "進度", "導入", "打勾"],
    blocks: [
      { p: "開站清單只有老闆（ERPNext 的 System Manager）看得到。每一項都直接看 ERPNext 裡有沒有那筆資料，做完就自動打勾，不能手動勾，所以不會「勾了但沒做」。沒打開的功能（例如沒選電子報）不會出現在清單上。" },
      {
        table: {
          head: ["項目", "什麼時候算完成", "為什麼要做"],
          rows: [
            ["公司資料與統編", "公司資料裡填了統編", CHECKLIST[0].why],
            ["邀請同事", "除了你之外，還有一個啟用中的帳號", CHECKLIST[1].why],
            ["匯入客人", "至少有一位客人（Customer）", CHECKLIST[2].why],
            ["匯入商品與價格", "有啟用的商品，而且有價格", CHECKLIST[3].why],
            ["開第一張報價", "有一張送出的報價單", CHECKLIST[4].why],
            ["收到第一筆錢", "有一筆送出的收款（Payment Entry）", CHECKLIST[5].why],
            ["接上 LINE 和對話", "有客人從 LINE、IG、FB 或官網對話進來", CHECKLIST[6].why],
            ["寫第一封電子報", "有一封電子報（草稿也算）", CHECKLIST[7].why],
            ["建立員工資料", "有一位在職的員工資料（有裝人事模組才會出現）", CHECKLIST[8].why],
            ["開出第一張電子發票", "有一張銷項發票拿到電子發票號碼", CHECKLIST[9].why],
          ],
        },
      },
      { p: "按鈕會帶你到做那件事的地方：在 DropOut OS 裡做得到的就開對應的頁面；只能在 ERPNext 做的（公司資料、匯入、員工資料）會在新分頁打開 ERPNext 的那一頁。" },
      { h: "收起來、叫回來" },
      { p: "不想每天看到，按清單下面的「先收起來」。之後到「設定」，清單一直都在那裡，按「放回『今天』」就回來了。收起來只記在這台電腦的瀏覽器。" },
      { p: "練習模式沒有接 ERPNext，清單裡的「公司、客人、商品」用練習帳本算完成；「第一張報價」「第一筆收款」跟著你在練習帳本上做的走。" },
      { p: "設定頁另外還有「導入進度」，那是導入顧問搬家用的（科目表、期初庫存、期初應收應付、資料檢查），兩份不一樣。" },
    ],
    related: ["start", "import-data", "practice"],
  },
  {
    slug: "practice",
    title: "練習第一筆生意",
    category: "開始使用",
    summary: "不碰真的資料，五步走完一筆生意：報價、客人答應、出貨、請他付錢、收款。",
    keywords: ["練習", "教學", "報價", "收款", "流程", "試用"],
    blocks: [
      { p: "[練習第一筆生意](/workspace/practice)用的是練習帳本，標著「練習」。開的單客人名字前面會加「練習・」，金額和發票號碼都是練習用的。資料只存在這個瀏覽器分頁，關掉分頁就清掉。" },
      {
        ordered: true,
        list: ["報價：填客人和金額，稅 5% 自動加。", "客人答應：同一張單按「轉成訂單」。", "出貨／履行：東西交給客人了，按下一步。", "請他付錢：開發票，這張單會出現在「誰欠我們」。", "收款：按「記入已收」，這筆生意就走完了。"],
      },
      { p: "每一步下面都寫了「真的時候」ERPNext 會做什麼：報價單（Quotation）→ 訂單（Sales Order）→ 出貨單（Delivery Note）→ 銷項發票（Sales Invoice）→ 收款（Payment Entry）。" },
      { p: "還沒接 ERPNext 時，練習單也會出現在「生意」看板上，可以接著玩。已經接上 ERPNext 的公司，「生意」顯示的是真的單，練習單不會混進去。" },
      { p: "想重來，按「重來一次」，剛剛那張練習單會拿掉。" },
    ],
    related: ["module-sales", "start"],
  },
  {
    slug: "first-day",
    title: "第一天：每個職務每天會用到的三件事",
    category: "開始使用",
    summary: "老闆、主管、業務、倉管、採購、會計、客服、行銷、人資，各自打開系統先做什麼。",
    keywords: ["第一天", "新人", "職務", "教學", ...ROLES],
    blocks: [
      { p: "第一次登入時，「今天」最上面會出現你職務的三件事。收起來之後，到「設定」可以再叫出來。" },
      ...ROLES.flatMap((role): HelpBlock[] => [
        { h: role, id: role },
        { p: `${ROLE_GUIDES[role].who}。` },
        { ordered: true, list: ROLE_GUIDES[role].three.map((t) => `[${t.title}](${t.href})：${t.detail}`) },
      ]),
    ],
    related: ["roles", "practice"],
  },
  {
    slug: "mobile",
    title: "裝到手機",
    category: "開始使用",
    summary: "iPhone、Android 加到主畫面，像 App 一樣打開。",
    keywords: ["手機", "app", "iphone", "android", "主畫面", "pwa", "離線"],
    blocks: [
      { h: "iPhone（Safari）" },
      { ordered: true, list: ["用 Safari 打開公司的 DropOut OS 網址，先登入", "點下方的「分享」按鈕", "選「加入主畫面」，按「新增」"] },
      { h: "Android（Chrome）" },
      { ordered: true, list: ["用 Chrome 打開公司的 DropOut OS 網址，先登入", "點右上角「⋮」", "選「安裝應用程式」或「加到主畫面」"] },
      { p: "沒網路時打開，會看到「現在沒有網路」，連上後按「再試一次」。手機上不會存客人、帳、報表；手機遺失時，請老闆到「團隊」停用那個人。" },
    ],
    related: ["module-reports"],
  },
  {
    slug: "import-data",
    title: "匯入資料：CSV 範本與欄位",
    category: "匯入資料",
    summary: "客人、供應商、商品、期初庫存、期初應收應付的範本欄位，以及搬家的順序。",
    keywords: ["匯入", "搬家", "csv", "excel", "範本", "欄位", "a1", "ecount", "鼎新", "億看", "統編", "期初"],
    blocks: [
      { p: "搬家一般由導入顧問用導入工具做：拿你們舊系統（鼎新 A1、億看 ECOUNT、Excel）匯出的檔，轉成下面的格式、先檢查、再匯進 ERPNext。檔案可以是 UTF-8 或 Big5 的 CSV，也可以是 Excel（xlsx）。" },
      { h: "順序" },
      { ordered: true, list: ["公司與科目表", "客人、供應商（含統編）", "商品與價格", "期初庫存", "期初應收應付", "未結訂單", "LINE／IG／FB 帳號對到客人", "電子報名單：只匯入有同意紀錄的人；沒有的寄確認信重新取得"] },
      { p: "前一步沒過檢查就不做下一步。匯入後在 ERPNext 打開「DropOut Import Check」報表，同一套規則再檢查一次實際資料。" },
      { h: "客人 customers.csv", id: "customers" },
      {
        table: {
          head: ["欄位", "必填", "說明"],
          rows: [
            ["客人名稱", "是", "也認得「公司名稱」「名稱」"],
            ["類型", "", "公司／法人／個人／自然人；空白當公司"],
            ["統一編號", "", "8 碼，會驗檢查碼；也認得「統編」"],
            ["Email", "", "會檢查格式"],
            ["手機", "", "也認得「電話」；會轉成 +886 格式"],
            ["群組", "", "也認得「客戶類別」「客群」；空白用站台預設"],
            ["舊代號", "", "舊系統的客戶代號，方便對照"],
          ],
        },
      },
      { code: "客人名稱,類型,統一編號,Email,手機,群組,舊代號\n安安商行,公司,12345675,anan@example.com,0912-345-678,,C001" },
      { h: "供應商 suppliers.csv", id: "suppliers" },
      { table: { head: ["欄位", "必填", "說明"], rows: [["供應商名稱", "是", "也認得「廠商名稱」「名稱」"], ["統一編號", "", "8 碼，會驗檢查碼"], ["群組", "", "也認得「廠商類別」"], ["舊代號", "", "舊系統的廠商代號"]] } },
      { code: "供應商名稱,統一編號,舊代號\n大同五金,12345675,S001" },
      { h: "商品 items.csv", id: "items" },
      {
        table: {
          head: ["欄位", "必填", "說明"],
          rows: [
            ["料號", "是", "也認得「品號」；不能重複"],
            ["品名", "是", "也認得「名稱」"],
            ["群組", "", "也認得「分類」；空白用站台預設"],
            ["單位", "", "個、PCS、支、件都當「個」；空白用站台預設"],
            ["售價", "", "未稅；會去掉千分位和「元」。沒有售價會提醒"],
            ["規格", "", "也認得「說明」"],
            ["庫存品", "", "是／Y／✓；空白當庫存品。服務請填「否」"],
          ],
        },
      },
      { code: "料號,品名,群組,單位,售價,規格\nM3-10,螺絲 M3x10,,個,2.5,不鏽鋼" },
      { h: "期初庫存 opening_stock.csv", id: "opening-stock" },
      { table: { head: ["欄位", "必填", "說明"], rows: [["料號", "是", "要在商品檔裡"], ["倉庫", "", "空白用站台預設倉"], ["數量", "是", "不能是負的；同一倉同一料號不能重複"], ["單位成本", "", "也認得「成本」"]] } },
      { code: "料號,倉庫,數量,單位成本\nM3-10,,1200,1.2" },
      { h: "期初應收、應付", id: "opening-balances" },
      { p: "還沒收的錢（應收）一個客人一列：客人、未收金額、日期、到期日。還沒付的錢（應付）：供應商、未付金額、日期、到期日。用 ERPNext 的 Opening Invoice Creation Tool 建立。" },
      { code: "客人,未收金額,日期,到期日\n宏達機械股份有限公司,143000,2026-09-15,2026-10-15" },
      { h: "自己在 ERPNext 匯入" },
      { p: "老闆也可以自己匯：開站清單的「匯入客人」「匯入商品」會打開 ERPNext 的 Data Import（資料匯入），選好種類、下載 ERPNext 的範本、填好上傳。失敗的列可以在那裡逐筆看原因再重匯。欄位是英文的 ERPNext 名稱，不確定就請導入顧問幫忙轉。" },
      { h: "會被擋下來的情況" },
      { list: ["必填欄位空白、名稱或料號重複", "統編檢查碼錯誤（統編重複只提醒，可能是同一家）", "Email 格式不對、售價不是數字或是負的", "期初庫存數量不是數字或是負的、料號不在商品檔裡"] },
    ],
    related: ["checklist", "module-crm", "module-stock"],
  },
  {
    slug: "module-today",
    title: "今天",
    category: "每個模組怎麼用",
    summary: "打開系統的第一頁：一件最急的事、一個按鈕。",
    keywords: ["今天", "首頁", "待辦", "三件事"],
    blocks: [
      { p: "「今天」只放卡住的事，最急的排第一（「現在這件」），下面幾件依序排著。點一下就到要處理的那一頁。" },
      { p: "接上 ERPNext 後，會出現在這裡的有：系統之間同步沒送到的資料、沒開成的電子發票、逾期最多的客人、快不夠的貨、等回覆的報價、導入還沒做完的下一步。都沒有就寫「今天沒有卡住的事」。" },
      { p: "最上面的「你每天會用到的三件事」照你的職務排；老闆會再多一份開站清單。兩個都可以收起來，之後在「設定」叫回來。" },
    ],
    related: ["first-day", "checklist"],
  },
  {
    slug: "module-crm",
    title: "客人",
    category: "每個模組怎麼用",
    summary: "誰來過、跟到哪：階段看板、新增客人、從客人開報價。",
    keywords: ["客人", "crm", "名單", "潛在客戶", "lead", "customer", "跟進"],
    blocks: [
      { p: "每一欄是一個階段，往右走就是越接近答應。接上 ERPNext 時，欄位是 ERPNext 潛在客人（Lead）的狀態加上已成交的客人（Customer），每張卡片寫著從哪個通道來（LINE、IG、Email…）。" },
      { p: "「新增客人」填名字、Email 或電話其中一個就好。同一個 Email 或電話已經認識的人，會對到原本那位，不會重複建。" },
      { p: "官網表單、對話進來的人會自動出現在這裡；舊名單請看[匯入資料](/help/import-data)。卡片上的「開報價」會帶你到「生意」。" },
      { p: "練習模式的階段照你選的現場（例如：詢問 → 交付 → 請款），最後一格按「轉成一筆生意」會變成一張練習報價。" },
    ],
    related: ["module-sales", "import-data", "module-chat"],
  },
  {
    slug: "module-sales",
    title: "生意：報價到收款",
    category: "每個模組怎麼用",
    summary: "同一張單往右走：客人在問 → 答應要了 → 做完／貨走了 → 請他付錢 → 錢進來了。",
    keywords: ["生意", "報價", "訂單", "出貨", "發票", "收款", "銷貨", "quotation", "sales order"],
    blocks: [
      { table: { head: ["欄", "會計名詞", "這一欄的按鈕"], rows: [["客人在問", "報價", "轉成訂單"], ["答應要了", "訂單", "出貨（服務業寫交付方式）"], ["做完／貨走了", "履行", "開立發票"], ["請他付錢", "發票", "記入已收"], ["錢進來了", "收款", "完成"]] } },
      { p: "接上 ERPNext 時，上面的「開報價」選客人（或潛在客人）和商品，沒填單價就用價目表的售價，稅照公司設定。每張卡片只有一個下一步按鈕，按下去 ERPNext 會用它自己的轉單功能開出下一張單並送出：報價單 → 訂單 → 出貨單 → 銷項發票 → 收款。" },
      { p: "能不能按，照你在 ERPNext 的角色。例如業務不能記收款，按了會寫出原因。ERPNext 拒絕時（庫存不夠、公司還沒設預設銀行科目…）畫面會寫出原因，不會假裝成功。要改細節（折扣、多個品項、交期），按「在 ERPNext 開單」或卡片上的「打開」。" },
      { p: "逾期的發票會標「已逾期 N 天」；有電子發票號碼的會寫在卡片上。" },
      { p: "第一次用？先到[練習第一筆生意](/workspace/practice)走一次。" },
    ],
    related: ["practice", "module-finance", "module-stock"],
  },
  {
    slug: "module-portal",
    title: "客戶入口：傳報價給客人線上簽、發票線上看",
    category: "每個模組怎麼用",
    summary: "報價、訂單、發票做成一個連結，用 LINE 傳出去；客人用手機看明細、簽名接受、下載 PDF、看怎麼付款。",
    keywords: ["客戶入口", "線上簽名", "電子簽名", "報價", "簽回", "分享連結", "LINE", "付款", "匯款", "PDF", "portal"],
    blocks: [
      { h: "怎麼傳" },
      {
        ordered: true,
        list: [
          "在[生意](/workspace/erp/sales)的卡片上按「傳給客人」，或到[客戶入口](/workspace/portal)選一張報價、訂單或發票。",
          "選連結幾天後失效（預設 14 天），按「做分享連結」。",
          "按「用 LINE 傳」，選客人或群組送出；或按「複製連結」貼到 Email、簡訊。",
        ],
      },
      { h: "客人看到什麼" },
      { p: "不用註冊、不用下載。打開是你們公司名稱與統編、單號、日期、每一項的數量與金額、未稅、營業稅、含稅合計、有效期限、條款，以及業務的電話和 Email。不會出現成本、毛利或內部備註。" },
      { p: "報價單：客人輸入全名、用手指簽名（不方便簽的話只輸入全名也算），勾選同意後按「接受報價」，畫面會出一張收據。發票：可以下載 PDF；公司開了綠界或藍新線上付款時，會出現「線上付款」，沒有的話顯示公司在 ERPNext 設定的銀行帳戶讓客人轉帳。" },
      { h: "你在這裡看到什麼" },
      { table: { head: ["狀態", "意思"], rows: [["已寄出", "連結做好了，客人還沒打開"], ["看過 N 次", "客人打開過（LINE 的預覽不算）"], ["已簽", "客人已經線上接受報價"], ["過期", "超過到期日，客人打不開；可以延長"], ["已撤回", "你收回了連結，客人打不開；要再傳得重做一個"]] } },
      { p: "客人簽回後，ERPNext 的那張報價單會多一則留言（誰、什麼時候接受），簽名圖存成只有公司內部看得到的附件。下一步照常在生意那一欄按「轉成訂單」。" },
      { h: "安全與法律" },
      { p: "每個連結都有簽章，改一個字就打不開；只有收到連結的人看得到。可以隨時撤回或改到期日。客人接受時會記下輸入的全名、時間、簽名圖、連結編號與網路位址的雜湊值（不存位址本身）。電子簽章的效力依《電子簽章法》與雙方約定，金額大或條款特殊的合約，建議先請律師看過條款與流程。" },
      { p: "示範模式做的連結會在客人那頁標「示範」，簽了也不會送到任何公司。" },
    ],
    related: ["module-sales", "module-finance"],
  },
  {
    slug: "module-stock",
    title: "倉庫：庫存、出貨、收貨",
    category: "每個模組怎麼用",
    summary: "貨夠不夠、缺貨請購、出貨和收貨在哪裡做。",
    keywords: ["倉庫", "庫存", "出貨", "收貨", "請購", "安全庫存", "盤點", "批號"],
    blocks: [
      { p: "「倉庫」列出每個倉的現有數量和安全量（ERPNext 品項的再訂購點）。低於安全量會變橘色，旁邊有「請購」。接上 ERPNext 時，請購會打開 ERPNext 的請購單（Material Request）；練習模式會在「進貨」多一張練習請購。" },
      { p: "出貨：在「生意」的訂單按「出貨」，ERPNext 會開出貨單並扣庫存。要分批出、改數量，到 ERPNext 的出貨單（Delivery Note）。" },
      { p: "收貨：在「進貨」的採購單按「到貨入庫」，ERPNext 會開收貨單（Purchase Receipt）並加庫存。" },
      { p: "盤點與調整用 ERPNext 的庫存調整（Stock Reconciliation）。有批號的產業包會多一欄批號。" },
    ],
    related: ["module-purchase", "module-sales", "import-data"],
  },
  {
    slug: "module-purchase",
    title: "進貨：請購到付款",
    category: "每個模組怎麼用",
    summary: "採購單、到貨入庫、登錄進項發票、付款。",
    keywords: ["進貨", "採購", "廠商", "供應商", "應付", "付款", "purchase"],
    blocks: [
      { p: "「進貨」列出還沒走完的採購單和還沒付的進項發票，每一行一個下一步：已下單待到貨 → 到貨入庫；已到貨待請款 → 登錄進項發票；待付款 → 付款。按下去在 ERPNext 開出下一張單並送出，入庫和應付在同一條。" },
      { p: "只買服務、沒有庫存品的採購單會跳過到貨入庫，直接登錄進項發票。沒有倉庫的行業，這裡只記經常費用與外包。" },
      { p: "新增廠商、改付款條件、開新的採購單，在 ERPNext 的 Supplier（供應商）、Purchase Order（採購單）。舊的廠商清單可以[匯入](/help/import-data#suppliers)。" },
    ],
    related: ["module-stock", "module-finance"],
  },
  {
    slug: "module-finance",
    title: "收錢：帳齡、損益、電子發票",
    category: "每個模組怎麼用",
    summary: "誰欠我們、這個月賺多少、電子發票開了沒。",
    keywords: ["收錢", "帳齡", "應收", "催收", "損益", "營業稅", "電子發票", "傳票", "會計"],
    blocks: [
      { p: "誰欠我們（帳齡）：每位客人還欠多少，分未到期、30 天、60 天、90 天以上。超過 60 天的會建議「催收」。接上 ERPNext 時，按鈕會打開那位客人；實際收款在「生意」按「記入已收」或在 ERPNext 開收款。" },
      { p: "本月損益是這個月已送出的銷項、進項發票未稅金額；自動入帳列出最近的傳票（開單就入帳，不用另外做分錄）。下面估本期應納營業稅。" },
      { p: "電子發票：每張有電子發票狀態的銷項發票都列在這裡。開失敗的會出現在「今天」，打開發票看原因。電子發票要先接好加值中心（綠界），由導入顧問設定。" },
    ],
    related: ["module-sales", "module-reports"],
  },
  {
    slug: "module-chat",
    title: "對話：LINE、IG、FB、官網",
    category: "每個模組怎麼用",
    summary: "所有訊息在同一個收件匣，自動對到客人。",
    keywords: ["對話", "line", "ig", "fb", "facebook", "instagram", "客服", "收件匣", "chatwoot"],
    blocks: [
      { p: "按「打開收件匣」會用你的帳號直接登入對話系統（Chatwoot），不用再打一次密碼。每則新對話會自動找到或建立客人，記在客人的時間軸上。" },
      { p: "要先完成：部署對話系統、申請 LINE 官方帳號與 Meta（IG、FB）的連線，由導入顧問設定。還沒接上時，頁面會寫「收件匣還沒接上」。" },
      { p: "如果按了出現「你的 ERPNext 帳號還沒對應到對話系統的使用者」，請老闆找導入顧問重跑對話帳號。" },
      { p: "頁面下面的「留言自動轉私訊」是示範，規則在導入時設在對話系統裡。" },
    ],
    related: ["module-crm"],
  },
  {
    slug: "module-letter",
    title: "電子報",
    category: "每個模組怎麼用",
    summary: "只寄給說好的人：名單、寫一封、寄出、看結果。",
    keywords: ["電子報", "newsletter", "名單", "退訂", "同意", "寄信", "行銷"],
    blocks: [
      { p: "名單：勾了同意、又點了確認信的人才會進「新朋友」；付過錢的會移到「老客人」。上面三個數字是已同意、等確認信、已退訂。" },
      { p: "寫一封：填主旨、內容、挑名單，先存成草稿，確認後按「寄出」。寄信走 ERPNext 的電子報佇列，每封都會自動附退訂連結；退訂一次，所有行銷通道一起關。要排版，按「用 ERPNext 排版」。" },
      { p: "要先接好寄信服務，由導入顧問設定。寄不出去時畫面會寫 ERPNext 的原因。近 30 天的開信、點連結、退訂、退信會寫在最下面。" },
    ],
    related: ["module-crm", "module-website"],
  },
  {
    slug: "module-meetings",
    title: "會議紀錄",
    category: "每個模組怎麼用",
    summary: "機器人自己進 Zoom、Google Meet、Teams，會後摘要回到客人。",
    keywords: ["會議", "zoom", "meet", "teams", "摘要", "逐字稿", "機器人"],
    blocks: [
      { p: "會議機器人照公司的行事曆，開會前自己進會議；會後整理成重點、決定、待辦，記在與會客人的時間軸上（用與會者的 Email 對客人）。" },
      { p: "「接下來的會」可以一場一場關掉機器人，例如內部敏感的會。要先接好會議機器人（Vexa）和公司行事曆，由導入顧問設定。" },
    ],
    related: ["module-crm"],
  },
  {
    slug: "module-website",
    title: "官網",
    category: "每個模組怎麼用",
    summary: "上架商品、網路訂單、留資料表單。",
    keywords: ["官網", "網站", "商店", "表單", "webshop", "訂單"],
    blocks: [
      { p: "商品在 ERPNext 上架（Website Item 勾「發布」）就出現在官網；網路訂單直接是「生意」裡的一張訂單。這一頁列出上架數、近 30 天網路訂單和表單名單。" },
      { p: "「放在任何網站上的留資料表單」可以貼進現有官網（WordPress、Wix 都可以）。送出的人進「客人」；勾了同意的人會收到確認信，點了才進電子報名單。" },
    ],
    related: ["module-letter", "module-crm"],
  },
  {
    slug: "module-hr",
    title: "人事：打卡、請假、薪資",
    category: "每個模組怎麼用",
    summary: "打卡、今天誰請假、核准假單、薪資進度，以及每年一定要核對的費率。",
    keywords: ["人事", "打卡", "請假", "假單", "薪資", "勞保", "健保", "勞退", "扣繳", "hr", "員工"],
    blocks: [
      { p: "每個人：上班、下班各按一次打卡。帳號要先由人資在 ERPNext 的員工資料（Employee）填上「使用者帳號」，才打得了卡。請假到 ERPNext 填假單，主管核准後會出現在「今天誰請假」。" },
      { p: "主管和人資：等你核准的假單可以直接核准或退回；不能核准自己的假單。薪資進度寫著這個月的薪資單跑到哪。" },
      { p: "月底發薪：在 ERPNext 開一張「薪資發放」（Payroll Entry），選這個月，系統替每個人產生薪資單。勞保、健保、勞退自提、所得稅扣繳照費率設定算。" },
      { h: "每年一定要核對" },
      { p: "勞健保費率、投保薪資分級表、基本工資、扣繳率每年都會變。系統裡的預設值只是起點，第一次發薪前和每年一月，到 ERPNext 的「Taiwan Payroll Settings」對照官方公告改好，再勾「已對照官方公告核對」。還沒核對時，人事頁會提醒。" },
      { h: "還沒做的" },
      { list: ["扣繳憑單與各類所得申報", "勞保、健保、勞退的加退保與異動申報", "加班費不從打卡自動算，用額外薪資登打", "月中到職、離職的勞健保按日計算", "二代健保補充保費、職業災害保險"] },
    ],
    related: ["roles"],
  },
  {
    slug: "module-reports",
    title: "報表",
    category: "每個模組怎麼用",
    summary: "營收、毛利、帳齡、前十大客人、成交漏斗、快不夠的貨。",
    keywords: ["報表", "營收", "毛利", "帳齡", "漏斗", "老闆"],
    blocks: [
      { p: "報表給老闆、主管、會計看整體生意，不是用來改資料。每一段右上角有「在 ERPNext 打開」，要看明細、換篩選、匯出 Excel 都到 ERPNext 原本的報表。" },
      { p: "金額是公司本位幣、未稅；期間可以選近 6、12、24 個月。營收是已送出的銷項發票（退貨已扣）；毛利用出貨當下的庫存成本；帳齡依付款到期日分四段；成交漏斗是近 90 天各自新開了幾筆，是大概的比例，不是精準轉換率。" },
      { p: "你的角色看不到的段落會寫「你的 ERPNext 角色看不到這一段」，其他段落照常。" },
    ],
    related: ["module-finance", "roles"],
  },
  {
    slug: "module-team",
    title: "團隊：邀請、職務、停用",
    category: "每個模組怎麼用",
    summary: "老闆在這裡邀請同事、換職務、停用帳號、設定登入安全。",
    keywords: ["團隊", "邀請", "帳號", "停用", "離職", "兩步驟", "密碼", "安全"],
    blocks: [
      { p: "只有老闆看得到「團隊」。邀請：填 Email、名字、職務，對方會收到 ERPNext 設定密碼的信。帳號不收人頭費。" },
      { p: "換職務立刻生效。停用的人馬上登出，DropOut OS 拿著的登入也一起撤銷。不能把自己的老闆權限拿掉，也不能讓公司沒有老闆。" },
      { p: "登入安全：全員兩步驟驗證（驗證器 App 或 Email）、密碼強度、連續輸錯幾次鎖住、閒置自動登出。下面的「最近紀錄」是誰登入、誰改了什麼、誰匯出資料。" },
    ],
    related: ["roles"],
  },
  {
    slug: "module-api",
    title: "對外 API 與 Webhook",
    category: "每個模組怎麼用",
    summary: "讓蝦皮、momo、會計師、Zapier／n8n 讀寫客人與單據，有新訂單時主動通知。",
    keywords: ["api", "webhook", "金鑰", "串接", "zapier", "n8n", "make", "蝦皮", "momo"],
    blocks: [
      { p: "老闆到「設定 → 對外 API 與 Webhook」開金鑰。金鑰 `dok_live_` 開頭，只在開的時候出現一次，弄丟了就停用再開一把。可以選只能讀，或也能新增客戶、潛在客人。每家公司最多 10 把金鑰、5 個 Webhook。" },
      { p: "API 能讀客人、商品、訂單、銷項發票，能新增客戶和潛在客人。Webhook 會在新客戶、新潛在客人、報價送出、訂單成立、出貨、開發票、收到錢時通知你的網址（只接受 https），每次都有簽章可以驗證。" },
      { p: "金鑰只能放在伺服器端（例如 n8n、自己的後端），不要放進網頁或 App。完整的端點、欄位與簽章驗證範例，請找導入顧問拿技術文件。" },
    ],
    related: ["export", "module-team"],
  },
  {
    slug: "roles",
    title: "權限與職務",
    category: "權限與職務",
    summary: "九種職務各自看得到哪些選單、能做什麼；真正擋人的是 ERPNext。",
    keywords: ["權限", "職務", "角色", "role", "看不到", "選單", ...ROLES],
    blocks: [
      { p: "職務就是 ERPNext 的角色組合（Role Profile）。開站時會建好下面這些職務，公司要調某個職務能做什麼，在 ERPNext 改那個角色組合就好，系統不會改回來。" },
      { table: { head: ["職務", "做什麼", "選單看得到"], rows: ROLES.map((role) => [role, ROLE_GUIDES[role].who, MENU_BY_ROLE[role]]) } },
      { p: "選單只會出現公司打開的功能。選單只是方便，真正擋人的是 ERPNext：直接打網址也只會看到「你的角色看不到」。「人資」是有裝人事模組的公司才有。" },
      ...ROLES.flatMap((role): HelpBlock[] => [
        { h: role, id: role },
        { list: ROLE_GUIDES[role].three.map((t) => `[${t.title}](${t.href})：${t.detail}`) },
      ]),
      { p: "換職務、邀請、停用請看[團隊](/help/module-team)。" },
    ],
    related: ["module-team", "first-day"],
  },
  {
    slug: "renewal",
    title: "續約與付款",
    category: "續約與付款",
    summary: "年費多少、什麼時候開帳單、怎麼線上付款、到期沒付會怎樣。",
    keywords: ["續約", "付款", "年費", "帳單", "發票", "到期", "試用", "價錢", "綠界"],
    blocks: [
      { p: `${PRICE_LABEL}（未稅），加 5% 營業稅，帳單金額 NT$105,000。含系統與免費顧問導入，不收人頭費，產業包不另外收費。LINE、金流、簡訊、電子發票加值中心、寄信服務是外部供應商，照他們的原價。` },
      { h: "帳單與付款" },
      { list: ["到期前 60 天開這一期的帳單，續約提醒信附付款連結。", "老闆會在畫面上方的提醒條和「設定 → 方案與續約」看到「線上付款」（綠界，刷卡或 ATM）。", "付款成功就續約一年：準時付就接著原本的到期日；過期才付就從付款那天起算。", "付款後會開電子發票；有統編就開三聯式。", "匯款或支票也可以，DropOut 收到後標記已付款，一樣續約、開發票。"] },
      { h: "合約狀態" },
      {
        table: {
          head: ["狀態", "什麼時候", "畫面", "能不能改資料"],
          rows: [
            ["試用", "開站後，預設 30 天", "「試用還有 N 天」", "可以"],
            ["使用中", "續約後", "—", "可以"],
            ["快到期", "到期前 60 天內", "「還有 N 天到期」", "可以"],
            ["寬限", "到期後 14 天內", "紅色提醒", "可以"],
            ["只能看", "寬限過了", "「資料都在，可以看和匯出」", "不行"],
            ["暫停、解約", "DropOut 手動", "同上，加原因", "不行"],
          ],
        },
      },
      { p: "只能看的時候：登入、改密碼、管人、下載備份照常；LINE 訊息、表單名單、金流通知也照常收進來，不會遺失。日期都用台灣時間，到期日當天 23:59:59 才算過期。" },
    ],
    related: ["export", "faq"],
  },
  {
    slug: "export",
    title: "資料匯出",
    category: "資料匯出",
    summary: "資料是你們的：整站備份、清單匯出 Excel、API。",
    keywords: ["匯出", "備份", "下載", "excel", "資料", "解約", "搬走"],
    blocks: [
      { list: ["整站備份：「設定 → 匯出全部資料」打開 ERPNext 的備份下載（資料庫與檔案）。要有 ERPNext 的 System Manager 權限。", "某一種資料：在 ERPNext 打開那個清單或報表，從選單匯出 Excel／CSV；報表頁每一段都有「在 ERPNext 打開」。", "給別的系統持續讀：用[對外 API](/help/module-api)。", "「設定 → 下載設定檔」是你們選的現場與功能，給導入工具用，不含客人與帳。"] },
      { p: "合約變成只能看、暫停或解約時，資料都還在，一樣可以看和匯出。誰匯出了資料會記在「團隊」的最近紀錄。" },
      { p: "每天會自動備份；DropOut 每月會實際還原一次到測試站，確認備份真的能用。" },
    ],
    related: ["renewal", "module-api"],
  },
  {
    slug: "faq",
    title: "常見問題",
    category: "常見問題",
    summary: "看不到選單、按了沒反應、忘記密碼、讀不到資料⋯⋯",
    keywords: ["問題", "faq", "密碼", "看不到", "錯誤", "沒反應", "讀不到"],
    blocks: [
      { h: "為什麼我看不到某個選單？" },
      { p: "選單照職務和公司打開的功能。需要的話請老闆到「團隊」調整你的職務，見[權限與職務](/help/roles)。" },
      { h: "按了下一步，跳出一段原因？" },
      { p: "那是 ERPNext 拒絕的原因，例如庫存不夠、公司還沒設預設銀行科目、你的角色不能做這一步。照原因處理後再按一次；不確定就把那段字傳給導入顧問。" },
      { h: "畫面寫「現在拿不到資料」？" },
      { p: "連不到 ERPNext 或對話系統。畫面不會改用示範資料，免得把假數字當真。過幾分鐘再整理一次；整體狀況可以看[服務狀態](/status)。" },
      { h: "忘記密碼？" },
      { p: "在登入頁按「用 ERPNext 帳號登入」，到 ERPNext 的登入畫面按「忘記密碼」，系統會寄重設的信。連續輸錯太多次會暫時鎖住，等一下再試，或請老闆幫你確認帳號。" },
      { h: "示範資料會不會混進真的帳？" },
      { p: "不會。示範和練習只存在你的瀏覽器分頁；接上 ERPNext 的畫面讀的是真的資料，每頁下面都會寫來源。" },
      { h: "新同事來了要多付錢嗎？" },
      { p: "不用，帳號不收人頭費。老闆到「團隊」邀請就好。" },
      { h: "可以在手機用嗎？" },
      { p: "可以，見[裝到手機](/help/mobile)。" },
      { h: "不續約的話資料怎麼辦？" },
      { p: "合約會變成只能看，資料都在，可以看和匯出，見[資料匯出](/help/export)。" },
    ],
    related: ["start", "roles", "export"],
  },
];

export function helpArticle(slug: string) {
  return HELP.find((a) => a.slug === slug);
}

function blockText(block: HelpBlock): string {
  if ("h" in block) return block.h;
  if ("p" in block) return block.p;
  if ("list" in block) return block.list.join(" ");
  if ("table" in block) return [...block.table.head, ...block.table.rows.flat()].join(" ");
  return block.code;
}

export function articleText(article: HelpArticle) {
  return [article.title, article.summary, ...article.keywords, ...article.blocks.map(blockText)].join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

/** Every word of the query has to appear somewhere; title and keyword hits rank first. */
export function searchHelp(query: string, articles: HelpArticle[] = HELP) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return articles;
  return articles
    .map((article) => {
      const head = `${article.title} ${article.keywords.join(" ")}`.toLowerCase();
      const all = articleText(article).toLowerCase();
      if (!words.every((w) => all.includes(w))) return null;
      return { article, score: words.reduce((n, w) => n + (head.includes(w) ? 2 : 1), 0) };
    })
    .filter((hit): hit is { article: HelpArticle; score: number } => hit !== null)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.article);
}
