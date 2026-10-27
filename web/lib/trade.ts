import type { IndustryPack } from "./types";

/**
 * How this trade actually runs. Shelves, documents, booking fields, staff roles
 * and reply words come from the industry pack, not from a shared scene template.
 */
export type TradeFact = { id: string; label: string; hint: string };

export type TradeField = {
  name: string;
  label: string;
  kind: "text" | "date" | "number" | "select";
  options?: string[];
};

export type TradeStock = {
  sku: string;
  name: string;
  warehouse: string;
  onHand: number;
  safety: number;
  batch?: string;
  expiry?: string;
  serial?: string;
  unitCost: number;
  recipe?: string;
  grade?: string;
  soldTo?: string;
};

export type TradeShift = {
  staff: number;
  branch: string;
  start: string;
  end: string;
  what: string;
  room: string;
  skill: string;
};

export type Trade = {
  docNoun: string;
  partyLabel: string;
  bookVerb: string;
  deposit: boolean;
  changeOrder: boolean;
  monthlyBill: boolean;
  returns: boolean;
  returnDays: number;
  dineIn: boolean;
  stopSell: boolean;
  holdBuy: boolean;
  serial: boolean;
  expiry: boolean;
  waste: boolean;
  recipe: boolean;
  bookable: boolean;
  capacity: number;
  booked: number;
  offerCode: string;
  offerName: string;
  bookFields: TradeField[];
  bookLead: string;
  bookClosed: string;
  keywords: { keyword: string; publicReply: string; dm: string }[];
  postTitle: string;
  roles: string[];
  staff: { id: string; name: string; role: string; skill: string }[];
  leaveReason: string;
  weeklyRoster: boolean;
  coverShift: boolean;
  hero: "leave" | "shift";
  extra: TradeFact[];
  commentToOrder: boolean;
  depositLedger: boolean;
  stock: TradeStock[];
  shifts: TradeShift[];
  caption: string;
  hrTitle: string;
  stepPlain: { quote: string; order: string; fulfill: string; invoice: string; paid: string };
};

type Pack = Partial<IndustryPack> & { id?: string };

const NAMES = [
  "林安安", "陳冠宇", "王美玲", "黃志明", "張雅婷", "劉建宏", "吳佳蓉", "蔡承恩",
  "周品妤", "許承翰", "鄭雅筑", "謝明哲", "羅心慈", "潘柏宇", "范宜庭", "馮子傑",
  "蘇佩玲", "鍾家豪", "葉庭瑜", "高敏惠", "丁冠霖", "姚思妤", "江柏宏", "方雅文",
];

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function blob(pack: Pack) {
  return `${pack.id ?? ""} ${pack.nameZh ?? ""} ${pack.group ?? ""} ${pack.itemType ?? ""} ${pack.fulfillment ?? ""} ${(pack.pains ?? []).join(" ")} ${(pack.workflow?.stages ?? []).join(" ")}`;
}

function has(pack: Pack, ...words: string[]) {
  const text = blob(pack);
  return words.some((word) => text.includes(word));
}

function rolesFor(pack: Pack): string[] {
  const id = pack.id ?? "";
  if (id === "talent-center") return ["黏土雕塑", "美術創作", "STEAM 機器人", "親子手作"];
  if (id === "cram-school") return ["數學", "英文", "櫃檯", "主任"];
  if (id === "convenience-franchise") return ["早班工讀", "晚班工讀", "訂貨", "店長"];
  if (id === "cleaning-co") return ["據點", "代班", "巡場", "主管"];
  switch (pack.group) {
    case "零售":
      return ["櫃位", "補貨", "倉管", "店長"];
    case "餐飲":
      return ["出餐", "外場", "備料", "店長"];
    case "教育":
      return ["鐘點", "助教", "櫃檯", "主任"];
    case "健康美容":
      return ["預約", "診療", "耗材", "櫃檯"];
    case "專業服務":
      return ["承辦", "助理", "覆核", "所長"];
    case "製造":
      return ["產線", "品檢", "備料", "廠長"];
    case "營建不動產":
      return ["現場", "監工", "備料", "負責人"];
    case "運輸物流":
      return ["司機", "調度", "倉務", "主管"];
    case "旅宿活動":
      return ["櫃檯", "清潔", "早餐", "店長"];
    case "農林漁牧":
      return ["採收", "分級", "出貨", "場主"];
    default:
      return ["接待", "現場", "備料", "負責人"];
  }
}

function staffFor(pack: Pack, roles: string[]) {
  const seed = hash(pack.id || pack.nameZh || "shop");
  const picked: string[] = [];
  let cursor = seed % NAMES.length;
  while (picked.length < 4) {
    const name = NAMES[cursor % NAMES.length];
    if (!picked.includes(name)) picked.push(name);
    cursor += 1 + (seed % 7);
  }
  return picked.map((name, index) => ({
    id: `HR-${(pack.id ?? "shop").slice(0, 12)}-${index + 1}`,
    name,
    role: roles[index] ?? roles[0],
    skill: roles[index] ?? roles[0],
  }));
}

const EXTRA: Record<string, TradeFact[]> = {
  dental: [
    { id: "progress", label: "療程進度", hint: "做到哪一步，寫在這位客人身上。" },
    { id: "implant", label: "植牙批號", hint: "批號對到這一位，不另找紙本。" },
    { id: "installment", label: "分期收款", hint: "每一期記在這張單。" },
  ],
  tcm: [
    { id: "herb", label: "藥材批次", hint: "這一帖用的批次。" },
    { id: "science", label: "科學中藥庫存", hint: "跟藥材批次分開。" },
    { id: "return", label: "回診間隔", hint: "下次該回的日期。" },
  ],
  pharmacy: [
    { id: "slow", label: "慢箋提醒", hint: "快領完才提醒，不靠人記。" },
    { id: "combo", label: "自費組合", hint: "組合跟健保藥分開記。" },
  ],
  "aesthetic-clinic": [
    { id: "left", label: "剩餘堂數", hint: "還有幾堂寫在客人身上。" },
    { id: "device", label: "儀器耗材批號", hint: "這次用的批號。" },
    { id: "follow", label: "諮詢待追", hint: "諮詢後沒約的人留在這裡。" },
  ],
  gym: [
    { id: "membership", label: "會籍到期", hint: "到期前出現在今天。" },
    { id: "coach", label: "教練課另帳", hint: "會籍和教練課分開收。" },
  ],
  counseling: [
    { id: "privacy", label: "預約隱私", hint: "時段不攤在公開名單。" },
    { id: "noshow", label: "未到收費", hint: "規則寫在這張預約上。" },
    { id: "supervision", label: "督導時數", hint: "跟諮商時段分開記。" },
  ],
  "nail-lash": [
    { id: "style", label: "款式", hint: "款式留在這張單，不只有 IG。" },
    { id: "refill", label: "回補日", hint: "到日會出現在今天。" },
    { id: "remove", label: "卸甲超時", hint: "超時記在這筆預約。" },
  ],
  "law-firm": [
    { id: "hours", label: "時數", hint: "記在這張案件，不寫在紙上。" },
    { id: "file", label: "檔案在誰身上", hint: "檔案位置跟案件走。" },
    { id: "retainer", label: "諮詢轉委任", hint: "轉了才另開委任。" },
  ],
  "design-studio": [
    { id: "revisions", label: "修稿次數", hint: "報價寫的那一輪用完，下一輪要另開。" },
  ],
  "photo-studio": [
    { id: "slot", label: "檔期", hint: "這一天只留一組。" },
    { id: "select", label: "選片連結", hint: "連結跟這張單一起走。" },
    { id: "edit", label: "後製排程", hint: "拍完才排後製。" },
  ],
  "interior-design": [
    { id: "change", label: "變更單", hint: "多做的另開一張，不併進原價。" },
    { id: "photo", label: "監工照片", hint: "照片對到這個進度。" },
    { id: "bill", label: "請款對進度", hint: "請這一段，不是整包尾款。" },
  ],
  "me-contractor": [
    { id: "call", label: "叫修", hint: "電話進來就成一張工單。" },
    { id: "parts", label: "空跑的備料", hint: "沒約成的料留在這張單。" },
    { id: "warranty", label: "保固原單", hint: "保固找得到當初那張。" },
  ],
  "it-msp": [
    { id: "asset", label: "資產", hint: "這台機器在這張合約上。" },
    { id: "sla", label: "SLA", hint: "逾時會出現在今天。" },
    { id: "access", label: "帳號權限", hint: "權限跟這張工單走。" },
  ],
  recruiting: [
    { id: "candidate", label: "人選", hint: "人選在這張職缺上，不在聊天室。" },
    { id: "guarantee", label: "保證期", hint: "到職後開始算。" },
    { id: "dup", label: "職缺是否重複", hint: "同一職缺不開第二張。" },
  ],
  translation: [
    { id: "translator", label: "譯者檔期", hint: "這一天這位譯者只有一張。" },
    { id: "words", label: "字數", hint: "請款照字數。" },
    { id: "rev", label: "審稿版次", hint: "版次寫在檔名旁邊。" },
  ],
  "pr-agency": [
    { id: "clip", label: "露出", hint: "露出對到這個檔期。" },
    { id: "result", label: "成效", hint: "成效跟請款在同一張。" },
    { id: "bill", label: "請款對檔期", hint: "請這個檔期，不另做表。" },
  ],
  freight: [
    { id: "pod", label: "簽收", hint: "簽收或照片到了才算送到。" },
    { id: "exception", label: "異常", hint: "異常留在這張運單。" },
    { id: "month", label: "月結對帳", hint: "這個月的運單併成一張。" },
  ],
  courier: [
    { id: "retry", label: "失敗再送", hint: "再送記在同一張件上。" },
    { id: "trace", label: "查件", hint: "客服用這張件號回。" },
  ],
  "customs-broker": [
    { id: "missing", label: "缺件", hint: "缺的文件列在這張報單。" },
    { id: "release", label: "放行", hint: "放行時間寫在這張上。" },
    { id: "bill", label: "請款對櫃號", hint: "請款對得到櫃號。" },
  ],
  "moving-co": [
    { id: "survey", label: "勘場", hint: "勘場記在這張案件。" },
    { id: "truck", label: "車班", hint: "同一台車同一時段不接兩張。" },
    { id: "cover", label: "保險", hint: "保險寫在這張上。" },
  ],
  "3pl-warehouse": [
    { id: "bin", label: "儲位", hint: "這件在哪個儲位。" },
    { id: "count", label: "盤差", hint: "盤差留在這次盤點。" },
    { id: "return", label: "客退批次", hint: "退貨對到原批次。" },
  ],
  hotel: [
    { id: "banquet", label: "宴會與住房", hint: "宴會和住房搶同一時段時要看得見。" },
    { id: "master", label: "團體主帳", hint: "團體收在主帳，不分開到每個人。" },
    { id: "member", label: "跨渠道會員", hint: "同一個客人只留一筆。" },
  ],
  "travel-agency": [
    { id: "roster", label: "名冊", hint: "名冊在這團上。" },
    { id: "insurance", label: "保險對人", hint: "每一位的保險對得到名字。" },
    { id: "lead", label: "領隊回報", hint: "回報留在這團。" },
  ],
  campground: [
    { id: "map", label: "營位", hint: "營位分開留，不畫在紙上。" },
    { id: "rain", label: "雨天退訂", hint: "這家的退訂規則寫在這張單。" },
  ],
  fishery: [
    { id: "vessel", label: "船次", hint: "這批貨是哪一船。" },
    { id: "temp", label: "溫度", hint: "沒有溫度就不當有冷鏈。" },
  ],
  "auto-shop": [
    { id: "plate", label: "車牌", hint: "工單從車牌找。" },
    { id: "warranty", label: "保固", hint: "保固找得到原工單。" },
    { id: "return", label: "回廠", hint: "該回廠的日期在這張上。" },
  ],
  "vet-clinic": [
    { id: "vaccine", label: "疫苗到期", hint: "到期前出現在今天。" },
    { id: "ward", label: "住院醫囑", hint: "醫囑在這隻毛孩的這一次。" },
    { id: "lot", label: "耗材批號", hint: "這次用的批號。" },
  ],
  "live-commerce": [
    { id: "comment", label: "留言下單", hint: "留言可以直接變成一張單。" },
    { id: "short", label: "場次缺貨", hint: "這一場不夠的貨當下看得到。" },
  ],
  "franchise-hq": [
    { id: "store-po", label: "各店訂貨", hint: "訂貨留在這家店的單，不在各店的聊天裡。" },
    { id: "visit", label: "督導", hint: "督導紀錄對到這家店。" },
  ],
  "cross-border-trade": [
    { id: "sailing", label: "船期", hint: "船期寫在這張櫃上。" },
    { id: "docs", label: "文件缺件", hint: "缺的文件列出來。" },
    { id: "fx", label: "匯率", hint: "這張單用的匯率留在單上，不另做成本表。" },
  ],
  "electronics-store": [
    { id: "serial", label: "序號", hint: "賣出後用序號查到這位客人。" },
    { id: "warranty", label: "保固", hint: "保固從這張單起算。" },
  ],
  "convenience-franchise": [
    { id: "waste", label: "報廢", hint: "報廢留下數量，不靠感覺。" },
    { id: "hq", label: "總部訂貨", hint: "跟總部的訂單對得起來。" },
  ],
  "bubble-tea": [
    { id: "recipe", label: "一杯的配方", hint: "配方在這杯上，不在師傅腦子。" },
  ],
  bakery: [
    { id: "oven", label: "今日爐量", hint: "今天能烤多少先寫下來。" },
    { id: "waste", label: "報廢", hint: "丟掉的數量留下。" },
  ],
  commissary: [
    { id: "source", label: "批次來源", hint: "這批從哪一鍋來。" },
    { id: "temp", label: "配送溫度", hint: "溫度記在這趟配送。" },
  ],
  preschool: [
    { id: "allergy", label: "過敏", hint: "寫在這個孩子身上。" },
    { id: "pickup", label: "接送人", hint: "今天誰可以接。" },
    { id: "attend", label: "繳費對出勤", hint: "出勤和這月的費在一起看。" },
  ],
  "online-course": [
    { id: "access", label: "權限", hint: "付款後在這張單上開通，退費對得到觀看。" },
  ],
  "billiards-academy": [
    { id: "table", label: "球桌", hint: "這一桌這個時段只留一組。" },
    { id: "makeup", label: "教練補課", hint: "補課另留一格，不在訊息裡翻。" },
  ],
  "music-studio": [
    { id: "calendar", label: "老師檔期", hint: "老師的這一格被約走就不再開放。" },
    { id: "instrument", label: "樂器狀態", hint: "維修中的樂器不能被約。" },
  ],
  "yoga-pilates": [
    { id: "ticket", label: "堂票餘額", hint: "扣堂和過期都在這張上。" },
    { id: "sub", label: "代課", hint: "代課先看這一格還有沒有空。" },
  ],
  "hair-salon": [
    { id: "stylist", label: "指定設計師", hint: "這一位這個時段只有一格。" },
  ],
  florist: [
    { id: "route", label: "配送路線", hint: "今天的路線在這張上。" },
    { id: "holiday", label: "節日量", hint: "節日的量和日常分開。" },
  ],
  "d2c-brand": [
    { id: "inbox", label: "客服後台", hint: "留言下單進同一張單，不截圖。" },
  ],
  "rental-assets": [
    { id: "deposit", label: "押金", hint: "押金、沒收、退還分開記。" },
  ],
};

function bookable(pack: Pack) {
  const id = pack.id ?? "";
  if (id === "accounting-firm") return false;
  if (pack.group === "零售" || pack.group === "製造") return false;
  if (pack.group === "農林漁牧") return id === "farm";
  if (pack.group === "運輸物流") return id === "moving-co";
  if (pack.group === "專業服務") return ["photo-studio", "interior-design", "law-firm", "consulting-firm"].includes(id);
  if (pack.group === "營建不動產") return ["realtor", "fit-out", "landscaping"].includes(id);
  if (pack.group === "公共與其他") return ["auto-shop", "vet-clinic", "coworking", "faith-org"].includes(id);
  return pack.group === "餐飲" || pack.group === "教育" || pack.group === "健康美容" || pack.group === "旅宿活動";
}

function fieldsFor(pack: Pack, canBook: boolean): TradeField[] {
  if (!canBook) return [];
  const id = pack.id ?? "";
  const common: TradeField[] = [
    { name: "date", label: "日期", kind: "date" },
    { name: "slot", label: "時段", kind: "select", options: ["10:00", "13:30", "15:30", "19:00"] },
  ];
  if (id === "bnb" || id === "hotel" || id === "campground") {
    return [
      { name: "date", label: "入住", kind: "date" },
      { name: "checkOut", label: "退房", kind: "date" },
      { name: "slot", label: "抵達", kind: "select", options: ["15:00", "18:00", "20:00"] },
      { name: "room", label: "房型／營位", kind: "select", options: ["兩人", "四人", "包棟"] },
      { name: "seats", label: "人數", kind: "number" },
    ];
  }
  if (id === "full-service-restaurant" || id === "izakaya" || id === "hotpot-chain" || id === "vegetarian-restaurant") {
    return [
      ...common,
      { name: "seats", label: "幾位", kind: "number" },
      { name: "table", label: "哪一桌", kind: "select", options: ["2 人桌", "4 人桌", "包廂"] },
    ];
  }
  if (id === "clinic" || id === "dental" || id === "tcm" || id === "vet-clinic") {
    return [
      ...common,
      { name: "room", label: "診間", kind: "select", options: ["診間 1", "診間 2"] },
      { name: "seats", label: "人數", kind: "number" },
    ];
  }
  if (id === "hair-salon") {
    return [...common, { name: "designer", label: "設計師", kind: "select", options: ["不指定", "指定 A", "指定 B"] }];
  }
  if (id === "preschool" || id === "after-school") {
    return [
      ...common,
      { name: "allergy", label: "過敏", kind: "text" },
      { name: "pickup", label: "接送人", kind: "text" },
    ];
  }
  if (id === "music-studio") {
    return [...common, { name: "instrument", label: "樂器", kind: "text" }];
  }
  if (id === "billiards-academy") {
    return [...common, { name: "table", label: "球桌", kind: "select", options: ["1 桌", "2 桌", "3 桌"] }];
  }
  if (id === "cram-school") {
    return [...common, { name: "seats", label: "試聽人數", kind: "number" }];
  }
  return [...common, { name: "seats", label: "人數", kind: "number" }];
}

function warehouse(pack: Pack) {
  switch (pack.group) {
    case "餐飲":
      return "廚房";
    case "教育":
      return "櫃檯";
    case "健康美容":
      return "店內";
    case "製造":
      return "料倉";
    case "運輸物流":
      return "集貨";
    case "農林漁牧":
      return "冷藏";
    default:
      return "門市倉";
  }
}

export function tradeOf(pack: Pack): Trade {
  const id = pack.id ?? "";
  const name = pack.nameZh || "這家";
  const item = pack.itemType || "一件";
  const noun = item.split("／")[0];
  const fulfill = pack.fulfillment || "交付";
  const pains = pack.pains ?? [];
  const deposit = has(pack, "訂金", "尾款", "分期") || ["metal-shop", "bnb", "hotel", "accounting-firm", "fit-out", "general-contractor", "interior-design", "woodshop"].includes(id);
  const changeOrder = has(pack, "追加", "變更", "客變", "修稿") || pack.group === "營建不動產";
  const monthlyBill = has(pack, "月結", "對帳", "月配") || ["freight", "farm", "cloud-kitchen", "live-commerce", "florist", "3pl-warehouse"].includes(id);
  const returns = has(pack, "退", "換貨") || ["apparel-store", "bookstore", "secondhand", "campground", "food-processing"].includes(id);
  const dineIn = has(pack, "內用", "外帶");
  const serial = has(pack, "序號", "保固", "車牌") || ["electronics-store", "auto-shop", "secondhand", "fleet-rental"].includes(id);
  const expiry = has(pack, "效期", "過期") || Boolean(pack.modules?.erp?.batch) || ["drugstore", "pharmacy", "bakery", "cafe", "food-processing"].includes(id);
  const waste = has(pack, "報廢", "丟掉", "耗損") || ["convenience-franchise", "bakery", "izakaya", "nursery"].includes(id);
  const recipe = has(pack, "配方") || id === "bubble-tea";
  const stopSell = pack.group === "餐飲" && !recipe;
  const holdBuy = id === "metal-shop" || (pack.group === "製造" && deposit) || (pack.group === "營建不動產" && deposit);
  const canBook = bookable(pack);
  const roles = rolesFor(pack);
  const staff = staffFor(pack, roles);
  const code = (pack.code || id || "SKU").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase() || "SKU";
  const inventory = pack.modules ? pack.modules.erp.inventory : true;
  const stock: TradeStock[] = inventory
    ? [
        {
          sku: `${code}-1`,
          name: `${name}的${noun}`,
          warehouse: warehouse(pack),
          onHand: 3,
          safety: 8,
          unitCost: 180 + (hash(id) % 40),
          ...(serial ? { serial: `SN-${code}-001` } : {}),
          ...(expiry ? { batch: `LOT-${code}`, expiry: "2026-11-05" } : {}),
          ...(recipe ? { recipe: `${noun}：主料、配料、包材` } : {}),
        },
        {
          sku: `${code}-2`,
          name: pains[0] ? `${name}要盯的${pains[0].slice(0, 10)}` : `${name}的另一項`,
          warehouse: warehouse(pack),
          onHand: 16,
          safety: 6,
          unitCost: 90,
        },
        ...(dineIn
          ? [{ sku: "PKG-BOX", name: `${name}的外帶容器`, warehouse: "櫃台", onHand: 40, safety: 20, unitCost: 3 }]
          : []),
        ...(waste
          ? [{ sku: `${code}-W`, name: `${name}待報廢`, warehouse: warehouse(pack), onHand: 2, safety: 0, unitCost: 1 }]
          : []),
      ]
    : [];
  const offerName = id === "cram-school" ? `${name}試聽` : id === "online-course" ? `${name}開通` : `${name}的${noun}`;
  const keywords = [
    {
      keyword: noun.slice(0, 8) || "這項",
      publicReply: "私訊對這項",
      dm: `這是${name}的${item}。回這則即可，同一個客人不必再填一次。`,
    },
    {
      keyword: (pains[0] || fulfill).slice(0, 8),
      publicReply: "私訊跟你對",
      dm: `${name}這裡處理的是「${pains[0] || fulfill}」。`,
    },
    {
      keyword: canBook ? "時段" : "報價",
      publicReply: canBook ? "時段在私訊對" : "報價在私訊",
      dm: canBook ? `跟你對${name}的時段。` : `跟你對${name}的報價。`,
    },
  ];
  return {
    docNoun: noun,
    partyLabel: pack.group === "教育" ? "家長稱呼" : "稱呼",
    bookVerb: id === "full-service-restaurant" || dineIn ? "訂位" : canBook ? "留下" : "預約",
    deposit,
    changeOrder,
    monthlyBill,
    returns,
    returnDays: returns ? (id === "apparel-store" ? 7 : 3) : 0,
    dineIn,
    stopSell,
    holdBuy,
    serial,
    expiry,
    waste,
    recipe,
    bookable: canBook,
    capacity: pack.group === "餐飲" ? 8 : 6,
    booked: pack.group === "餐飲" ? 6 : 5,
    offerCode: `SLOT-${code}`,
    offerName,
    bookFields: fieldsFor(pack, canBook),
    bookLead: canBook ? `留下${offerName}。名額記在這一家，另一台也看得到。` : `${name}把${item}寫在單上。這一頁不劃位。`,
    bookClosed: `${name}先把${item}寫在單上。履行是${fulfill}。`,
    keywords,
    postTitle: `${name}的近況`,
    roles,
    staff,
    leaveReason: `${name}：${(pains[0] || "事假").slice(0, 18)}`,
    weeklyRoster: id === "convenience-franchise",
    coverShift: id === "cleaning-co",
    hero: pack.group === "餐飲" ? "shift" : "leave",
    extra: EXTRA[id] ?? pains.slice(0, 3).map((pain, index) => ({ id: `pain-${index}`, label: pain, hint: "記在這一家，不借用別的行業的欄。" })),
    commentToOrder: ["live-commerce", "d2c-brand", "bookstore"].includes(id),
    depositLedger: ["bnb", "hotel", "rental-assets", "venue-rental"].includes(id) || has(pack, "押金"),
    stock,
    shifts: [
      { staff: 0, branch: name, start: "09:00", end: "13:00", what: roles[0], room: warehouse(pack), skill: roles[0] },
      { staff: 1, branch: name, start: "14:00", end: "18:00", what: roles[1] ?? roles[0], room: warehouse(pack), skill: roles[1] ?? roles[0] },
    ],
    caption: `${name}的${noun}`,
    hrTitle: `今天誰在${roles[0]}、誰請假`,
    stepPlain: {
      quote: deposit ? "先報價，可只收訂金" : "客人在問",
      order: dineIn ? "點餐，要分內用或外帶" : changeOrder ? "原單或追加" : "答應要了",
      fulfill,
      invoice: monthlyBill ? "併進月結再請款" : "請他付錢",
      paid: "錢進來了",
    },
  };
}
