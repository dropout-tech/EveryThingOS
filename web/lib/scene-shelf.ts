import type { StockRow } from "./erp";
import { tradeOf } from "./trade";

/**
 * What a picky owner actually counts. Keyed by industry id, then by the
 * onboarding scene. Course seats and the clay BOM stay on 才藝中心 only.
 */
export type ShelfShift = {
  staff: number;
  branch: string;
  start: string;
  end: string;
  what: string;
  room: string;
  skill?: string;
};

export type SceneShelf = {
  stock: StockRow[];
  /** Public class booking with a material BOM. */
  courses: boolean;
  /** Low stock is listed, not purchased, until the deposit for this job is in. */
  holdBuy: boolean;
  caption: string;
  bookLead: string;
  /** When set, /book does not offer a course form. */
  bookClosed: string | null;
  hrKicker: string;
  hrTitle: string;
  hrHint: string;
  classBoard: boolean;
  shifts: ShelfShift[];
};

const HR = {
  hrKicker: "人事",
  hrTitle: "今天誰在、誰請假",
  hrHint: "打卡、請假和加班在這一頁。班表是給人看的，系統不自己排人。",
};

function row(sku: string, name: string, warehouse: string, onHand: number, safety: number, batch?: string, extra?: Partial<StockRow>): StockRow {
  return { sku, name, warehouse, onHand, safety, unitCost: extra?.unitCost ?? 120, ...(batch ? { batch } : {}), ...extra };
}

const RETAIL: SceneShelf = {
  stock: [
    row("SKU-TEE-M", "本季上衣 M 號", "門市倉", 2, 6),
    row("SKU-TEE-L", "本季上衣 L 號", "門市倉", 18, 6),
    row("SKU-BAG", "紙袋", "門市倉", 40, 20),
  ],
  courses: false,
  holdBuy: false,
  caption: "貨架（尺寸分開算，M 號不夠不代表 L 號夠）",
  bookLead: "尺寸和顏色先對貨架。這一頁不劃位。",
  bookClosed: "客人要的尺寸，先在倉庫對過再報價。斷碼的那一號不要先答應。",
  ...HR,
  hrTitle: "今天誰在櫃、誰請假",
  classBoard: false,
  shifts: [
    { staff: 0, branch: "門市", start: "11:00", end: "21:00", what: "櫃位", room: "賣場" },
    { staff: 2, branch: "門市", start: "09:00", end: "13:00", what: "對貨架", room: "倉庫" },
  ],
};

const DRUG: SceneShelf = {
  stock: [
    row("LOT-MASK", "醫用口罩", "門市倉", 6, 20, "LOT-2509", { expiry: "2026-09-30", unitCost: 4 }),
    row("LOT-LOTION", "乳液", "門市倉", 24, 8, "LOT-2512", { expiry: "2027-06-01", unitCost: 180 }),
    row("LOT-BAG", "藥袋", "門市倉", 50, 20),
  ],
  courses: false,
  holdBuy: false,
  caption: "批號貨（效期寫在批號上，過期的不要跟新貨加在一起）",
  bookLead: "先看批號和效期，再賣。",
  bookClosed: "藥妝不在這裡劃課程名額。櫃上先對批號，效期近的先賣。",
  ...HR,
  hrTitle: "今天誰在櫃、誰請假",
  classBoard: false,
  shifts: [{ staff: 0, branch: "門市", start: "10:00", end: "21:00", what: "櫃位", room: "賣場" }],
};

const FOOD: SceneShelf = {
  stock: [
    row("ING-FISH", "今日魚貨", "廚房", 3, 8, "LOT-1028"),
    row("ING-STAPLE", "主食材", "廚房", 16, 8, "LOT-1020"),
    row("PKG-BOX", "外帶盒", "櫃台", 40, 20),
  ],
  courses: false,
  holdBuy: false,
  caption: "食材（用完的那道先停賣）",
  bookLead: "訂位先記幾位、幾點。內用或外帶等客人到了再問。",
  bookClosed: "訂位在對話裡記人數和時間。食材不夠的那道，在倉庫停賣，不在這裡劃課程。",
  ...HR,
  hrTitle: "今天誰在內場、誰在外場",
  classBoard: false,
  shifts: [
    { staff: 0, branch: "本店", start: "10:00", end: "14:30", what: "午市出餐", room: "廚房" },
    { staff: 1, branch: "本店", start: "17:00", end: "22:00", what: "晚市外場", room: "大廳" },
  ],
};

const CRAM: SceneShelf = {
  stock: [
    row("EDU-NOTE", "這期講義", "櫃檯", 22, 10),
    row("EDU-EXAM", "週考考卷", "櫃檯", 40, 12),
  ],
  courses: false,
  holdBuy: false,
  caption: "講義（補習班不鎖手作材料包）",
  bookLead: "先約試聽。學費照報價單收，下期要重新報名。",
  bookClosed: "補習班先約試聽，再依報價收這期學費。堂數在報名那張單，不在這裡鎖材料包。",
  ...HR,
  hrTitle: "今天誰的鐘點、誰請假",
  hrHint: "請假和加班在這一頁核准。科目老師的配對還沒有各自的標籤，不會拿才藝課的技能來排補習班。",
  classBoard: false,
  shifts: [
    { staff: 0, branch: "教室", start: "18:30", end: "21:00", what: "國三數學", room: "教室 A", skill: "數學" },
    { staff: 1, branch: "教室", start: "16:00", end: "18:00", what: "國中英文", room: "教室 B", skill: "英文" },
  ],
};

const TALENT: SceneShelf = {
  stock: [],
  courses: true,
  holdBuy: false,
  caption: "教材／材料",
  bookLead: "選課程、分店和時間。頁上顯示可預約時，名額和材料包都已經確認夠用。",
  bookClosed: null,
  hrKicker: "人事與師資",
  hrTitle: "今天誰在、誰請假、師資怎麼排",
  hrHint: "師資專長、請假與工時放在一起看。AI 只給建議，主管確認才排入。",
  classBoard: true,
  shifts: [],
};

const CLINIC: SceneShelf = {
  stock: [
    row("CARE-GAUZE", "敷料", "診療室", 4, 12, "LOT-2509"),
    row("CARE-GLOVE", "手套", "診療室", 30, 20, "LOT-2511"),
  ],
  courses: false,
  holdBuy: false,
  caption: "耗材（批號分開，不做成課程名額）",
  bookLead: "選日期和診間。做完照報價收。",
  bookClosed: "選日期和診間時段。做完照報價收，這一趟是自費，也不申報健保。這不是課程名額。",
  ...HR,
  hrTitle: "今天誰在診間、誰請假",
  classBoard: false,
  shifts: [
    { staff: 0, branch: "診所", start: "09:00", end: "12:00", what: "上午預約", room: "診間 1" },
    { staff: 1, branch: "診所", start: "14:00", end: "17:30", what: "下午預約", room: "診間 2" },
  ],
};

const ACCOUNTING: SceneShelf = {
  stock: [],
  courses: false,
  holdBuy: false,
  caption: "沒有倉庫",
  bookLead: "先聽這次要做什麼，範圍沒聽完不報價。",
  bookClosed: "訂金寫在這張報價上，錢進來才開工。這裡沒有貨架，也不劃位。",
  ...HR,
  hrTitle: "今天誰在所裡、誰請假",
  classBoard: false,
  shifts: [{ staff: 0, branch: "事務所", start: "09:00", end: "18:00", what: "這張案件", room: "辦公室" }],
};

const METAL: SceneShelf = {
  stock: [
    row("MAT-PLATE", "這張圖的板料", "料倉", 4, 12, "LOT-2509"),
    row("MAT-PART", "配件", "料倉", 48, 20),
    row("QC-HOLD", "沒過的，留在品檢", "品檢", 2, 0),
  ],
  courses: false,
  holdBuy: true,
  caption: "用料（不夠先列出來。這張單的訂金進了才向廠商叫）",
  bookLead: "先看這次給的圖，再估料。",
  bookClosed: "交期和訂金寫在報價上。料要等訂金進帳才買，不在這裡劃名額。",
  ...HR,
  hrTitle: "今天誰在廠、誰請假",
  classBoard: false,
  shifts: [{ staff: 3, branch: "廠房", start: "08:00", end: "17:00", what: "照這張單做", room: "產線" }],
};

const INN: SceneShelf = {
  stock: [],
  courses: false,
  holdBuy: false,
  caption: "房晚不是庫存件數",
  bookLead: "先問哪幾天、幾個人。訂金照報價收，錢進來才留房。",
  bookClosed: "住房先問日期和人數。訂金進帳才把那幾天留下。下面可以直接留下日期和房型。",
  ...HR,
  hrTitle: "今天誰在櫃檯、誰打掃",
  classBoard: false,
  shifts: [
    { staff: 0, branch: "民宿", start: "15:00", end: "22:00", what: "入住", room: "櫃檯" },
    { staff: 1, branch: "民宿", start: "10:00", end: "14:00", what: "退房清潔", room: "客房" },
  ],
};

const FARM: SceneShelf = {
  stock: [
    row("CROP-A", "這週 A 級", "冷藏", 12, 8, "LOT-1028A"),
    row("CROP-B", "這週 B 級", "冷藏", 4, 10, "LOT-1028B"),
    row("CROP-BOX", "紙箱", "包裝", 30, 12),
  ],
  courses: false,
  holdBuy: false,
  caption: "這週的貨（A 級和 B 級分開，不混箱）",
  bookLead: "先問這週要多少。沒有的等級不報。",
  bookClosed: "等級和數量寫在單上。A、B 級在倉庫分開，盤商月底對這個月出的單，不在這裡劃課程。",
  ...HR,
  hrTitle: "今天誰去採、誰請假",
  classBoard: false,
  shifts: [{ staff: 0, branch: "田區", start: "05:30", end: "11:00", what: "照單採收", room: "田" }],
};

const BY_INDUSTRY: Record<string, SceneShelf> = {
  "apparel-store": RETAIL,
  drugstore: DRUG,
  "full-service-restaurant": FOOD,
  "cram-school": CRAM,
  "talent-center": TALENT,
  clinic: CLINIC,
  "accounting-firm": ACCOUNTING,
  "metal-shop": METAL,
  bnb: INN,
  farm: FARM,
};

const BY_SCENE: Record<string, SceneShelf> = {
  retail: {
    ...RETAIL,
    stock: [
      row("SKU-MAIN", "架上主推的那一款", "門市倉", 3, 8),
      row("SKU-SIZE", "同一款的另一個尺寸", "門市倉", 16, 6),
      row("SKU-BAG", "袋子", "門市倉", 40, 20),
    ],
    caption: "貨架（先對實際數量，尺寸分開，再答應客人）",
  },
  food: {
    ...FOOD,
    stock: [
      row("ING-TODAY", "今日會用完的食材", "廚房", 4, 12, "LOT-1028"),
      row("ING-KEEP", "常備食材", "廚房", 18, 8, "LOT-1020"),
      row("PKG-BOX", "外帶容器", "櫃台", 40, 20),
    ],
    caption: "食材（用完的那道先停賣）",
    shifts: [
      { staff: 0, branch: "本店", start: "10:00", end: "14:30", what: "午市", room: "廚房" },
      { staff: 1, branch: "本店", start: "17:00", end: "22:00", what: "晚市", room: "大廳" },
    ],
  },
  edu: {
    ...CRAM,
    hrTitle: "今天誰的鐘點、誰請假",
    shifts: [{ staff: 0, branch: "教室", start: "16:00", end: "18:00", what: "這期的固定時段", room: "教室 A" }],
  },
  care: {
    ...CLINIC,
    stock: [row("CARE-USE", "今天會用到的耗材", "店內", 4, 12, "LOT-2509")],
    caption: "耗材（不做成課程名額）",
    hrTitle: "今天誰有約、誰請假",
    shifts: [{ staff: 0, branch: "店裡", start: "10:00", end: "18:00", what: "今天約的那一項", room: "預約席" }],
  },
  service: ACCOUNTING,
  make: METAL,
  stay: INN,
  farm: FARM,
  build: {
    ...ACCOUNTING,
    caption: "料在採購單，不在課程裡",
    bookLead: "先到現場量完，再照尺寸報價。",
    bookClosed: "訂金沒入帳不備料。多做的項目另開一張報價，不併進原價，也不在這裡劃名額。",
    hrTitle: "今天誰在工地、誰請假",
    shifts: [{ staff: 3, branch: "這戶工地", start: "08:00", end: "17:00", what: "照原報價施工", room: "現場" }],
  },
  move: {
    ...ACCOUNTING,
    stock: [
      row("MOVE-PICK", "今天待取", "集貨", 6, 2),
      row("MOVE-ROAD", "在途，還沒送到", "車上", 11, 0),
      row("MOVE-SHORT", "取貨短少", "異常", 1, 0),
    ],
    caption: "今天的件數（在途還不算送到）",
    bookLead: "先問從哪到哪、幾件、何時要到。",
    bookClosed: "運費寫在這張單上。公司戶多半月結。在途先記著，簽收或照片到了才算送到。",
    hrTitle: "今天誰出車、誰請假",
    shifts: [{ staff: 0, branch: "車隊", start: "08:00", end: "12:00", what: "早班取貨", room: "車庫" }],
  },
  other: {
    ...ACCOUNTING,
    stock: [row("JOB-PART", "這次要用的零件", "工場", 1, 4)],
    caption: "這一次的零件",
    bookLead: "先聽這次要修、要租，還是要用到幾點。",
    bookClosed: "範圍講定才報價。這一頁不劃課程名額。",
    hrTitle: "今天誰在場、誰請假",
    shifts: [{ staff: 3, branch: "工場", start: "09:00", end: "18:00", what: "這一次的工", room: "工場" }],
  },
};

export function shelfFor(pack: { id: string; nameZh?: string; itemType?: string; fulfillment?: string; group?: string; pains?: string[]; code?: string; workflow?: { id?: string; stages?: string[] }; modules?: { erp: { inventory: boolean; batch?: boolean } } }): SceneShelf {
  const owned = BY_INDUSTRY[pack.id];
  if (owned) return owned;
  if (pack.nameZh && pack.itemType) {
    const trade = tradeOf(pack as Parameters<typeof tradeOf>[0]);
    const stock = trade.stock.map((item) =>
      row(item.sku, item.name, item.warehouse, item.onHand, item.safety, item.batch, {
        expiry: item.expiry,
        serial: item.serial,
        unitCost: item.unitCost,
        recipe: item.recipe,
        grade: item.grade,
        soldTo: item.soldTo,
      }),
    );
    return {
      stock,
      courses: false,
      holdBuy: trade.holdBuy,
      caption: stock.length ? trade.caption : `${pack.nameZh}沒有倉庫，履行是${pack.fulfillment ?? "交付"}`,
      bookLead: trade.bookLead,
      bookClosed: trade.bookable ? null : trade.bookClosed,
      ...HR,
      hrTitle: trade.hrTitle,
      classBoard: false,
      shifts: trade.shifts,
    };
  }
  return BY_SCENE[pack.workflow?.id ?? ""] ?? BY_SCENE.other;
}
