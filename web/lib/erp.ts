import { industryTodayJobs } from "./operator-day";
import type { IndustryPack } from "./types";

export type SalesStep = "quote" | "order" | "fulfill" | "invoice" | "paid";

export const SALES_STEPS: {
  id: SalesStep;
  plain: string;
  formal: string;
  a1Name: string;
}[] = [
  { id: "quote", plain: "客人在問", formal: "報價", a1Name: "報價單" },
  { id: "order", plain: "答應要了", formal: "訂單", a1Name: "訂單／銷貨通知" },
  { id: "fulfill", plain: "做完／貨走了", formal: "履行", a1Name: "銷貨單／出貨" },
  { id: "invoice", plain: "請他付錢", formal: "發票", a1Name: "銷貨單＋電子發票" },
  { id: "paid", plain: "錢進來了", formal: "收款", a1Name: "收款單沖帳" },
];

export type ParityRow = {
  capability: string;
  a1: string;
  ecount: string;
  dropout: string;
  better: string;
};

export const ERP_PARITY: ParityRow[] = [
  {
    capability: "報價 → 訂單 → 出貨／履行 → 發票 → 收款",
    a1: "有，但要進不同作業（報價單、銷貨單、收款單）",
    ecount: "有，選單深、單據名稱偏會計",
    dropout: "同一條線走完，每步只顯示下一步",
    better: "不必先背單據名稱",
  },
  {
    capability: "採購 → 進貨 → 應付 → 付款",
    a1: "進銷存基本功能",
    ecount: "採購／進貨完整",
    dropout: "缺貨時從倉庫直接請購，進貨與應付在同一條",
    better: "倉管看得懂，不必找另一張進貨單",
  },
  {
    capability: "多倉、庫存、盤點、安全庫存",
    a1: "多倉、盤點、組合",
    ecount: "倉庫數無上限、安全庫存",
    dropout: "有；服務業產業包預設關掉倉庫",
    better: "用不到的欄位不會出現",
  },
  {
    capability: "批號／效期",
    a1: "加值：批號管理",
    ecount: "有",
    dropout: "產業包打開才出現（藥妝、食品、製造）",
    better: "書店不會看到效期欄",
  },
  {
    capability: "用料／工單／輕工廠",
    a1: "偏進銷存，工廠比較弱",
    ecount: "強（用料、多製程、外包）",
    dropout: "有工廠才打開工單；賣東西的店看不到",
    better: "買賣業不必學工單",
  },
  {
    capability: "應收／應付帳齡、沖帳、訂金",
    a1: "有收款單、預收沖銷",
    ecount: "有",
    dropout: "帳齡用紅／黃／綠，點一筆就收款",
    better: "老闆看顏色就知道誰該催",
  },
  {
    capability: "進銷存拋轉傳票、損益／資產負債",
    a1: "雲端會計另租，單據拋轉",
    ecount: "會計內建",
    dropout: "開單就入帳；損益與資產負債在收錢那頁",
    better: "不必再買一套會計",
  },
  {
    capability: "台灣營業稅 5%、統編、電子發票",
    a1: "電子發票／營業稅另租模組＋關貿小平台",
    ecount: "稅制要自己調，電子發票通常外掛",
    dropout: "稅額內建；電子發票交給加值中心上傳",
    better: "年費含接發票，不拆三張帳單",
  },
  {
    capability: "POS／電商訂單",
    a1: "POS、蝦皮等電商另租",
    ecount: "客戶線上下單",
    dropout: "門市與電商訂單進同一份庫存",
    better: "不必和官網、LINE 各記一份貨",
  },
  {
    capability: "每天打開看到的數字",
    a1: "業績、存貨、應收",
    ecount: "報表多、畫面密",
    dropout: "老闆看錢、業務看客人、倉管看出貨、會計看誰欠錢",
    better: "打開就知道今天做哪三件事",
  },
  {
    capability: "客人、行銷、擋假信、短網址",
    a1: "掌客雲另算；沒有活動頁與擋假信",
    ecount: "幾乎沒有自動寄信",
    dropout: "客人、生意、行銷都在同一套畫面",
    better: "這是 A1／億看做不到的一層",
  },
  {
    capability: "導入與價錢",
    a1: "進銷存、會計、發票常拆開月租，導入另計",
    ecount: "約 1,500／月全功能，畫面像傳統進銷存",
    dropout: "NT$100,000／年含免費顧問導入",
    better: "一次講清楚，現場有人帶",
  },
];

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function pick(seed: number, min: number, max: number) {
  const span = max - min + 1;
  return min + ((seed >>> 0) % span);
}

export function formatTwd(amount: number) {
  return `NT$${Math.round(amount).toLocaleString("zh-TW")}`;
}

export const SALES_STEP_ORDER: SalesStep[] = ["quote", "order", "fulfill", "invoice", "paid"];

export type SalesDoc = {
  no: string;
  party: string;
  item: string;
  qty: number;
  amount: number;
  tax: number;
  step: SalesStep;
  next: string;
  overdueDays?: number;
  invoiceNo?: string;
};

export type PurchaseDoc = {
  no: string;
  vendor: string;
  item: string;
  amount: number;
  status: string;
  next: string;
};

export type AgingRow = {
  party: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
};

const PURCHASE_CHAIN: { status: string; next: string }[] = [
  { status: "請購中", next: "轉進貨" },
  { status: "已進貨待付款", next: "付款沖帳" },
  { status: "已付款", next: "完成" },
];

export type StockRow = {
  sku: string;
  name: string;
  warehouse: string;
  onHand: number;
  safety: number;
  batch?: string;
};

export type LedgerLine = {
  no: string;
  date: string;
  memo: string;
  debit: string;
  credit: string;
  amount: number;
};

export type Books = {
  monthSales: number;
  monthCost: number;
  ar: number;
  ap: number;
  cash: number;
  inventoryValue: number;
  overdueAr: number;
  vatPayable: number;
  today: { title: string; detail: string; href: string; tone: "urgent" | "warn" | "ok" }[];
  sales: SalesDoc[];
  purchases: PurchaseDoc[];
  stock: StockRow[];
  arAging: AgingRow[];
  journals: LedgerLine[];
  pnl: { label: string; amount: number }[];
  einvoices: { no: string; status: string; amount: number; related: string }[];
};

const PARTIES = ["長翔商行", "九豆柴房", "守護者據點", "博美台灣", "提摩設計", "鄉育合作", "內湖門市客戶"];
const VENDORS = ["中盤供應", "原廠台灣", "物流夥伴", "包材行"];

export function buildBooks(pack: IndustryPack): Books {
  const seed = hash(pack.id);
  const inventoryOn = pack.modules.erp.inventory;
  const batchOn = pack.modules.erp.batch;
  const monthSales = pick(seed, 48, 220) * 1000;
  const monthCost = Math.round(monthSales * (inventoryOn ? 0.62 : 0.38));
  const ar = pick(seed >>> 2, 80, 360) * 1000;
  const ap = inventoryOn ? pick(seed >>> 3, 40, 180) * 1000 : pick(seed >>> 3, 8, 40) * 1000;
  const cash = pick(seed >>> 4, 90, 420) * 1000;
  const inventoryValue = inventoryOn ? pick(seed >>> 5, 60, 280) * 1000 : 0;
  const overdueAr = Math.round(ar * 0.18);
  const vatPayable = Math.round(monthSales * 0.05 - monthCost * 0.05);

  const sales: SalesDoc[] = SALES_STEPS.map((step, index) => {
    const amount = pick(seed + index * 17, 8, 86) * 400;
    const tax = Math.round(amount * 0.05);
    return {
      no: `SO-${10400 + index}`,
      party: PARTIES[(seed + index) % PARTIES.length],
      item: pack.itemType,
      qty: pick(seed + index, 1, 12),
      amount,
      tax,
      step: step.id,
      next: nextLabel(step.id, pack),
      overdueDays: step.id === "invoice" ? pick(seed, 3, 21) : undefined,
      invoiceNo: step.id === "invoice" || step.id === "paid" ? `AB-${11200000 + seed % 8000 + index}` : undefined,
    };
  });

  const purchases = inventoryOn
    ? [0, 1, 2].map((index) => ({
        no: `PO-33${index}`,
        vendor: VENDORS[(seed + index) % VENDORS.length],
        item: pack.itemType,
        amount: pick(seed + 40 + index, 12, 70) * 500,
        status: ["請購中", "已進貨待付款", "已付款"][index],
        next: ["轉進貨", "付款沖帳", "完成"][index],
      }))
    : [
        {
          no: "EX-01",
          vendor: "經常費用",
          item: "場租／外包",
          amount: pick(seed, 8, 24) * 1000,
          status: "待付款",
          next: "付款",
        },
      ];

  const stock: StockRow[] = inventoryOn
    ? [
        {
          sku: "SKU-A",
          name: `主力${pack.itemType}`,
          warehouse: "本倉",
          onHand: pick(seed, 2, 9),
          safety: 12,
          batch: batchOn ? "LOT-2509" : undefined,
        },
        {
          sku: "SKU-B",
          name: `常備${pack.itemType}`,
          warehouse: "本倉",
          onHand: pick(seed >>> 1, 20, 80),
          safety: 10,
          batch: batchOn ? "LOT-2508" : undefined,
        },
        {
          sku: "SKU-C",
          name: "包材／配件",
          warehouse: pack.modules.erp.pos ? "門市倉" : "本倉",
          onHand: pick(seed >>> 2, 40, 200),
          safety: 30,
        },
      ]
    : [];

  const arAging = PARTIES.slice(0, 4).map((party, index) => ({
    party,
    current: pick(seed + index, 4, 20) * 1000,
    d30: pick(seed + 8 + index, 0, 12) * 1000,
    d60: index === 0 ? pick(seed, 6, 18) * 1000 : 0,
    d90: index === 0 ? pick(seed >>> 3, 4, 14) * 1000 : 0,
  }));

  const journals: LedgerLine[] = [
    {
      no: "JV-0918",
      date: "09/18",
      memo: `銷貨 ${pack.fulfillment}（開單就入帳）`,
      debit: "應收帳款",
      credit: "銷貨收入／稅額",
      amount: sales[2].amount + sales[2].tax,
    },
    {
      no: "JV-0919",
      date: "09/19",
      memo: inventoryOn ? "進貨入庫（開單就入帳）" : "費用認列（開單就入帳）",
      debit: inventoryOn ? "存貨" : "營業費用",
      credit: "應付帳款",
      amount: purchases[0].amount,
    },
  ];

  const lowStock = stock.filter((row) => row.onHand < row.safety);
  const today: Books["today"] = industryTodayJobs(pack, {
    overdueLabel: formatTwd(overdueAr),
    overdueAmount: overdueAr,
    inventoryOn,
    lowStockName: lowStock[0]?.name,
  });

  const pnl = [
    { label: "本月銷貨（未稅）", amount: monthSales },
    { label: inventoryOn ? "銷貨成本" : "服務成本", amount: -monthCost },
    { label: "毛利", amount: monthSales - monthCost },
    { label: "營業費用", amount: -Math.round(monthSales * 0.18) },
    { label: "本月損益", amount: monthSales - monthCost - Math.round(monthSales * 0.18) },
  ];

  const einvoices = sales
    .filter((row) => row.invoiceNo)
    .map((row) => ({
      no: row.invoiceNo ?? "",
      status: row.step === "paid" ? "已上傳" : "開立待上傳",
      amount: row.amount + row.tax,
      related: row.no,
    }));

  return {
    monthSales,
    monthCost,
    ar,
    ap,
    cash,
    inventoryValue,
    overdueAr,
    vatPayable,
    today,
    sales,
    purchases,
    stock,
    arAging,
    journals,
    pnl,
    einvoices,
  };
}

export function nextLabel(step: SalesStep, pack: Pick<IndustryPack, "fulfillment" | "modules">) {
  switch (step) {
    case "quote":
      return "轉成訂單";
    case "order":
      return pack.modules.erp.inventory ? "出貨" : pack.fulfillment;
    case "fulfill":
      return "開立發票";
    case "invoice":
      return "記入已收";
    default:
      return "完成";
  }
}

export function advanceSalesDoc(
  doc: SalesDoc,
  pack: Pick<IndustryPack, "fulfillment" | "modules">,
): SalesDoc {
  const index = SALES_STEP_ORDER.indexOf(doc.step);
  if (index < 0 || index >= SALES_STEP_ORDER.length - 1) {
    return { ...doc, next: "完成", overdueDays: undefined };
  }
  const step = SALES_STEP_ORDER[index + 1];
  const needsInvoice = step === "invoice" || step === "paid";
  return {
    ...doc,
    step,
    next: nextLabel(step, pack),
    overdueDays: step === "invoice" ? 0 : undefined,
    invoiceNo: needsInvoice ? (doc.invoiceNo ?? `AB-${11200000 + (Number(doc.no.replace(/\D/g, "")) % 8000)}`) : doc.invoiceNo,
  };
}

export function makeQuote(input: {
  party: string;
  item: string;
  amount: number;
  pack: Pick<IndustryPack, "fulfillment" | "modules">;
}): SalesDoc | null {
  const party = input.party.trim().slice(0, 40);
  const amount = Math.round(input.amount);
  if (!party || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return null;
  }
  const tax = Math.round(amount * 0.05);
  const serial = Date.now().toString().slice(-5);
  return {
    no: `SO-${serial}`,
    party,
    item: input.item.slice(0, 40),
    qty: 1,
    amount,
    tax,
    step: "quote",
    next: nextLabel("quote", input.pack),
  };
}

export function advancePurchase(row: PurchaseDoc): PurchaseDoc {
  if (row.next === "完成" || row.status === "已付款") {
    return { ...row, status: "已付款", next: "完成" };
  }
  if (row.status === "待付款" || row.next === "付款") {
    return { ...row, status: "已付款", next: "完成" };
  }
  const index = PURCHASE_CHAIN.findIndex((item) => item.status === row.status);
  const next = PURCHASE_CHAIN[Math.min(Math.max(index, 0) + 1, PURCHASE_CHAIN.length - 1)];
  return { ...row, status: next.status, next: next.next };
}

export function makePurchaseRequest(input: { sku: string; name: string; amount: number }): PurchaseDoc {
  return {
    no: `PO-${input.sku.slice(-4)}-${Date.now().toString().slice(-4)}`,
    vendor: "建議供應商",
    item: input.name.slice(0, 40),
    amount: Math.max(1, Math.round(input.amount)),
    status: "請購中",
    next: "轉進貨",
  };
}

export function collectOverdue(row: AgingRow): { row: AgingRow; collected: number } {
  const collected = row.d30 + row.d60 + row.d90;
  return {
    collected,
    row: { ...row, d30: 0, d60: 0, d90: 0 },
  };
}

export function salesByStep(books: Books) {
  return SALES_STEPS.map((step) => ({
    ...step,
    docs: books.sales.filter((doc) => doc.step === step.id),
  }));
}

export function groupSales(docs: SalesDoc[]) {
  return SALES_STEPS.map((step) => ({
    ...step,
    docs: docs.filter((doc) => doc.step === step.id),
  }));
}
