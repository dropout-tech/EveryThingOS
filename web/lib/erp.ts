import type { CourseBom } from "./course-bom";
import { industryTodayJobs } from "./operator-day";
import { shelfFor } from "./scene-shelf";
import { practiceCast } from "./practice";
import { tradeOf } from "./trade";
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
    capability: "報價 → 訂單 → 出貨 → 發票 → 收款",
    a1: "分三張單",
    ecount: "選單深",
    dropout: "同一條線",
    better: "只按這一步",
  },
  {
    capability: "採購 → 進貨 → 應付 → 付款",
    a1: "有",
    ecount: "有",
    dropout: "缺貨直接請購",
    better: "同一條線",
  },
  {
    capability: "多倉、盤點、安全庫存",
    a1: "有",
    ecount: "有",
    dropout: "有（服務業自動關）",
    better: "少欄位",
  },
  {
    capability: "批號／效期",
    a1: "加購",
    ecount: "有",
    dropout: "內建（藥妝、食品才開）",
    better: "不加購",
  },
  {
    capability: "用料／工單",
    a1: "弱",
    ecount: "有",
    dropout: "有工廠才開",
    better: "買賣業不出現",
  },
  {
    capability: "應收應付帳齡、訂金",
    a1: "有",
    ecount: "有",
    dropout: "紅／黃／綠，點了就收",
    better: "一眼看逾期",
  },
  {
    capability: "傳票、損益、資產負債",
    a1: "會計另租",
    ecount: "內建",
    dropout: "開單即入帳",
    better: "不另租會計",
  },
  {
    capability: "營業稅 5%、統編、電子發票",
    a1: "發票另租",
    ecount: "外掛",
    dropout: "內建，接綠界",
    better: "一張帳單",
  },
  {
    capability: "門市／電商同庫存",
    a1: "另租",
    ecount: "有",
    dropout: "內建",
    better: "同一份貨",
  },
  {
    capability: "老闆與各職務儀表板",
    a1: "報表",
    ecount: "報表密",
    dropout: "依職務只看三件事",
    better: "打開就做",
  },
  {
    capability: "CRM、電子報、對話",
    a1: "另租",
    ecount: "無",
    dropout: "內建",
    better: "同一個登入",
  },
  {
    capability: "價格",
    a1: "分模組月租",
    ecount: "月租",
    dropout: "不用 AI 免費／AI 版 69,000 含稅",
    better: "現在不限量，以後限量先說",
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
  /** 訂了幾件。沒寫就不算還差多少。 */
  orderedQty?: number;
  /** 已經出了幾件。沒寫時，剩餘等於訂購數量。 */
  deliveredQty?: number;
  amount: number;
  tax: number;
  /** false = 未稅報價，稅額是 0。沒寫則沿用營業稅 5%。 */
  taxable?: boolean;
  /** false = 這一行不開發票，履行後直接記收款。 */
  invoiceable?: boolean;
  buyerTaxId?: string;
  deposit?: number;
  kind?: "standard" | "deposit" | "change" | "monthly" | "return";
  parentNo?: string;
  channel?: string;
  serial?: string;
  allowance?: boolean;
  step: SalesStep;
  next: string;
  overdueDays?: number;
  invoiceNo?: string;
  href?: string;
  doctype?: string;
  /** 這張單之前，客人已開發票還沒收的錢。沒寫就不印前餘。 */
  previousBalance?: number;
  /** 這張訂單最近一張非退貨的出貨單。沒寫就沒有「退這次」。 */
  deliveryNote?: string;
};

export function remainingQty(doc: Pick<SalesDoc, "orderedQty" | "deliveredQty">) {
  if (doc.orderedQty === undefined) return undefined;
  if (doc.deliveredQty === undefined) return doc.orderedQty;
  return doc.orderedQty - doc.deliveredQty;
}

export type PurchaseDoc = {
  no: string;
  vendor: string;
  item: string;
  amount: number;
  status: string;
  next: string;
  href?: string;
  doctype?: string;
};

export type AgingRow = {
  party: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  href?: string;
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
  expiry?: string;
  serial?: string;
  unitCost?: number;
  recipe?: string;
  grade?: string;
  soldTo?: string;
  href?: string;
};

export type LedgerLine = {
  no: string;
  date: string;
  memo: string;
  debit: string;
  credit: string;
  amount: number;
  href?: string;
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
  courseBoms?: CourseBom[];
  arAging: AgingRow[];
  journals: LedgerLine[];
  pnl: { label: string; amount: number }[];
  einvoices: { no: string; status: string; amount: number; related: string; party?: string; error?: string; href?: string }[];
  deposits?: { party: string; held: number; note: string }[];
};

const VENDORS = ["中盤供應", "原廠台灣", "物流夥伴", "包材行"];

function taipeiMonthDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${month}/${day}`;
}

function sellableName(stock: StockRow[], itemType: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  const row = stock.find((item) => !item.expiry || item.expiry >= today) ?? stock[0];
  return row?.name ?? itemType;
}

export function buildBooks(pack: IndustryPack): Books {
  const seed = hash(pack.id);
  const parties = practiceCast(pack.id);
  const shelf = shelfFor(pack);
  const trade = tradeOf(pack);
  const inventoryOn = pack.modules.erp.inventory;
  const monthSales = pick(seed, 48, 220) * 1000;
  const itemName = sellableName(shelf.stock, pack.itemType);
  const unit = shelf.stock.find((row) => row.name === itemName)?.unitCost ?? 120;
  const sales: SalesDoc[] = SALES_STEPS.map((step, index) => {
    const amount = pick(seed + index * 17, 8, 86) * 400;
    const untaxed = step.id === "quote";
    const tax = untaxed ? 0 : Math.round(amount * 0.05);
    const deposit = trade.deposit && step.id === "quote" ? Math.round(amount * 0.3) : undefined;
    const qty = pick(seed + index, 1, 6);
    return {
      no: `SO-${10400 + index}`,
      party: parties[index % parties.length],
      item: itemName,
      qty,
      ...(step.id === "order" ? { orderedQty: qty, deliveredQty: 0 } : {}),
      amount,
      tax,
      taxable: !untaxed,
      invoiceable: step.id !== "quote",
      buyerTaxId: step.id === "invoice" || step.id === "paid" ? "" : undefined,
      deposit,
      kind: deposit ? "deposit" : trade.changeOrder && step.id === "order" ? "change" : trade.monthlyBill && step.id === "invoice" ? "monthly" : "standard",
      parentNo: trade.changeOrder && step.id === "order" ? "SO-10400" : undefined,
      channel: trade.dineIn && step.id === "order" ? "內用" : undefined,
      serial: trade.serial && step.id === "order" ? shelf.stock.find((row) => row.serial)?.serial : undefined,
      step: step.id,
      next: nextLabel(step.id, pack),
      overdueDays: step.id === "invoice" ? pick(seed, 3, 21) : undefined,
      invoiceNo: step.id === "invoice" || step.id === "paid" ? `AB-${11200000 + seed % 8000 + index}` : undefined,
    };
  });
  const monthCost = inventoryOn
    ? sales.reduce((sum, doc) => sum + doc.qty * unit, 0)
    : 0;

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
    ? shelf.courses
      ? [
          {
            sku: "MAT-CLAY-SET",
            name: "節慶造型輕黏土材料包",
            warehouse: "台北信義教室倉",
            onHand: 8,
            safety: 15,
          },
          {
            sku: "MAT-FRAME-01",
            name: "木質展示相框與配件組",
            warehouse: "台北信義教室倉",
            onHand: 18,
            safety: 15,
          },
          {
            sku: "MAT-ACRYLIC-SET",
            name: "水洗無毒顏料與複合媒材包",
            warehouse: "台北信義教室倉",
            onHand: 14,
            safety: 20,
          },
          {
            sku: "MAT-CANVAS-01",
            name: "兒童創作畫布板與畫冊",
            warehouse: "台北信義教室倉",
            onHand: 22,
            safety: 15,
          },
          {
            sku: "MAT-STEAM-KIT",
            name: "感測器與馬達實驗材料包",
            warehouse: "台北信義教室倉",
            onHand: 7,
            safety: 15,
          },
          {
            sku: "MAT-STEAM-BOOK",
            name: "STEAM 機器人實作講義",
            warehouse: "台北信義教室倉",
            onHand: 18,
            safety: 15,
          },
        ]
      : shelf.stock
    : [];

  const courseBoms: CourseBom[] = inventoryOn && shelf.courses
    ? [
          {
            courseCode: "CRS-CLAY-01",
            courseName: "節慶親子手作輕黏土班（4 堂）",
            targetSeats: 7,
            bookedSeats: 6,
            lines: [
              { sku: "MAT-CLAY-SET", name: "節慶造型輕黏土材料包", qtyPerStudent: 1, uom: "組", unitCost: 450 },
              { sku: "MAT-FRAME-01", name: "木質展示相框與配件組", qtyPerStudent: 1, uom: "份", unitCost: 350 },
            ],
          },
          {
            courseCode: "CRS-ART-01",
            courseName: "兒童創意美術與媒材創作班（8 堂）",
            targetSeats: 12,
            bookedSeats: 5,
            lines: [
              { sku: "MAT-CANVAS-01", name: "兒童創作畫布板與畫冊", qtyPerStudent: 1, uom: "本", unitCost: 300 },
              { sku: "MAT-ACRYLIC-SET", name: "水洗無毒顏料與複合媒材包", qtyPerStudent: 2, uom: "組", unitCost: 450 },
            ],
          },
          {
            courseCode: "CRS-STEAM-01",
            courseName: "STEAM 機器人實作期班（8 堂）",
            targetSeats: 12,
            bookedSeats: 4,
            lines: [
              { sku: "MAT-STEAM-BOOK", name: "STEAM 機器人實作講義", qtyPerStudent: 1, uom: "本", unitCost: 250 },
              { sku: "MAT-STEAM-KIT", name: "感測器與馬達實驗材料包", qtyPerStudent: 1, uom: "組", unitCost: 950 },
            ],
          },
        ]
    : [];

  const openInvoice = sales.find((doc) => doc.step === "invoice");
  const arAging = openInvoice
    ? [{ party: openInvoice.party, current: 0, d30: 0, d60: openInvoice.amount, d90: 0 }]
    : [];
  const serviceCost = inventoryOn ? monthCost : purchases[0]?.amount ?? 0;
  const ar = openInvoice ? openInvoice.amount + openInvoice.tax : pick(seed >>> 2, 80, 360) * 1000;
  const ap = purchases[0]?.amount ?? 0;
  const cash = pick(seed >>> 4, 90, 420) * 1000;
  const inventoryValue = inventoryOn ? stock.reduce((sum, row) => sum + row.onHand * (row.unitCost ?? unit), 0) : 0;
  const overdueAr = openInvoice?.amount ?? 0;
  const vatPayable = sales.reduce((sum, doc) => sum + doc.tax, 0);
  const todayStamp = taipeiMonthDay();

  const journals: LedgerLine[] = [
    {
      no: `JV-${todayStamp.replace("/", "")}`,
      date: todayStamp,
      memo: `銷貨 ${pack.fulfillment}（開單就入帳）`,
      debit: "應收帳款",
      credit: "銷貨收入／稅額",
      amount: sales[2].amount + sales[2].tax,
    },
    {
      no: `JV-${todayStamp.replace("/", "")}B`,
      date: todayStamp,
      memo: inventoryOn ? "進貨入庫（開單就入帳）" : "費用認列（開單就入帳）",
      debit: inventoryOn ? "存貨" : "營業費用",
      credit: "應付帳款",
      amount: purchases[0].amount,
    },
  ];

  const lowStock = stock.filter((row) => row.onHand < row.safety);
  const today: Books["today"] = industryTodayJobs(pack, {
    person: parties[0],
    debtor: arAging[0]?.party ?? parties[1],
    overdueLabel: formatTwd(overdueAr),
    overdueAmount: overdueAr,
    inventoryOn,
    lowStockName: lowStock[0]?.name,
  });

  const pnl = [
    { label: "本月銷貨（未稅）", amount: monthSales },
    { label: inventoryOn ? "銷貨成本（這幾張單的進價）" : "直接成本（這幾張費用單）", amount: -serviceCost },
    { label: "毛利", amount: monthSales - serviceCost },
    { label: "營業費用（這家還沒入帳）", amount: 0 },
    { label: "本月損益", amount: monthSales - serviceCost },
  ];

  const einvoices = sales
    .filter((row) => row.invoiceNo)
    .map((row) => ({
      no: row.invoiceNo ?? "",
      status: row.step === "paid" ? "已上傳" : "開立待上傳",
      amount: row.amount + row.tax,
      related: row.no,
      party: row.party,
    }));
  const deposits = trade.depositLedger || trade.deposit
    ? sales.filter((doc) => doc.deposit).map((doc) => ({ party: doc.party, held: doc.deposit ?? 0, note: "訂金留下，尾款另計。押金跟訂金分開。" }))
    : [];

  return {
    monthSales,
    monthCost: serviceCost,
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
    courseBoms,
    arAging,
    journals,
    pnl,
    einvoices,
    deposits,
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
  let step = SALES_STEP_ORDER[index + 1];
  if (step === "invoice" && doc.invoiceable === false) step = "paid";
  const needsInvoice = doc.invoiceable !== false && (step === "invoice" || step === "paid");
  const shipped = step === "fulfill" || step === "invoice" || step === "paid";
  return {
    ...doc,
    deliveredQty: shipped && doc.orderedQty !== undefined ? doc.orderedQty : doc.deliveredQty,
    step,
    next: doc.invoiceable === false && step === "paid" ? "記入已收（不開發票）" : nextLabel(step, pack),
    overdueDays: step === "invoice" ? 0 : undefined,
    invoiceNo: needsInvoice ? (doc.invoiceNo ?? `AB-${11200000 + (Number(doc.no.replace(/\D/g, "")) % 8000)}`) : doc.invoiceNo,
  };
}

export function makeQuote(input: {
  party: string;
  item: string;
  amount: number;
  pack: Pick<IndustryPack, "fulfillment" | "modules">;
  taxable?: boolean;
  invoiceable?: boolean;
  deposit?: number;
  channel?: string;
  kind?: SalesDoc["kind"];
  parentNo?: string;
  serial?: string;
  buyerTaxId?: string;
}): SalesDoc | null {
  const party = input.party.trim().slice(0, 40);
  const amount = Math.round(input.amount);
  if (!party || !Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    return null;
  }
  const taxable = input.taxable !== false;
  const tax = taxable ? Math.round(amount * 0.05) : 0;
  const serial = Date.now().toString().slice(-5);
  return {
    no: `SO-${serial}`,
    party,
    item: input.item.slice(0, 40),
    qty: 1,
    amount,
    tax,
    taxable,
    invoiceable: input.invoiceable !== false,
    deposit: input.deposit,
    channel: input.channel,
    kind: input.kind ?? (input.deposit ? "deposit" : "standard"),
    parentNo: input.parentNo,
    serial: input.serial,
    buyerTaxId: input.buyerTaxId,
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
