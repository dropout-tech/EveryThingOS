/**
 * 匯入資料精靈的純邏輯：讀檔、對欄位、檢查、轉成 ERPNext 文件。瀏覽器與
 * `/api/import/*` 共用同一份，所以畫面上看到的檢查結果就是伺服器會再檢查一次的規則。
 *
 * 欄位別名、轉換與檢查跟導入工具（toolkit/dropout_onboard 的 convert.py、
 * checks.py、taiwan.py 與 mappings/*）一致；`scripts/importer.test.mjs` 會讀
 * toolkit 的對照表、範本與 tests/fixtures/import_rules.json 確認兩邊沒有分歧。
 *
 * No imports on purpose: the test runs this file directly with Node's type stripping.
 */

export type ImportKind = "customers" | "suppliers" | "items";

export type FieldSpec = {
  key: string;
  label: string;
  required?: boolean;
  /** Header names this field is recognised by, compared after `headerKey()`. */
  synonyms: string[];
  hint?: string;
};

export type KindSpec = {
  id: ImportKind;
  label: string;
  /** What one row is called in sentences: 「客人」「供應商」「商品」. */
  noun: string;
  doctype: "Customer" | "Supplier" | "Item";
  /** The field that must be unique, in the file and against what already exists. */
  key: string;
  fields: FieldSpec[];
  template: string[][];
};

export type Grid = string[][];
export type Table = { headers: string[]; rows: string[][] };
export type Mapping = Record<string, number | null>;
export type SourceRow = { row: number; values: Record<string, string> };
export type Issue = { row: number; field: string; value: string; problem: string; level: "error" | "warning" };
export type PreparedRow = { row: number; values: Record<string, string>; issues: Issue[]; ok: boolean };

/** What already exists in ERPNext (or the demo books), and which link values are allowed. */
export type CheckContext = {
  existingKeys?: Iterable<string>;
  /** tax id → existing party name */
  existingTaxIds?: Map<string, string> | Record<string, string>;
  groups?: string[];
  territories?: string[];
  uoms?: string[];
};

export const MAX_ROWS = 2000;
export const BATCH_SIZE = 20;
export const MAX_CELL = 140;
export const MAX_TEXT = 1000;

const CONTACT = ["聯絡人", "聯絡人姓名", "窗口", "負責人", "contact", "contact person", "contact name", "first name"];
const PHONE = ["電話", "手機", "行動電話", "連絡電話", "聯絡電話", "電話(一)", "TEL_NO(一)", "mobile", "mobile no", "phone", "tel"];
const EMAIL = ["Email", "E-mail", "E-MAIL", "電子郵件", "電子信箱", "信箱", "mail", "email id", "email address"];
const ADDRESS = ["地址", "公司地址", "通訊地址", "營業地址", "送貨地址", "address", "address line 1"];
const TAX = ["統一編號", "統編", "營業登記號碼", "tax id", "tax_id", "vat", "vat number", "ubn", "business id"];

export const KINDS: Record<ImportKind, KindSpec> = {
  customers: {
    id: "customers",
    label: "客人",
    noun: "客人",
    doctype: "Customer",
    key: "customer_name",
    fields: [
      { key: "customer_name", label: "客人名稱", required: true, synonyms: ["客人名稱", "客戶名稱", "公司名稱", "名稱", "客戶全名", "客戶簡稱", "客戶/廠商名稱", "客戶", "customer", "customer name", "company", "company name", "name"] },
      { key: "customer_type", label: "類型", synonyms: ["類型", "客戶類型", "type", "customer type"], hint: "公司／個人；空白當公司" },
      { key: "tax_id", label: "統一編號", synonyms: TAX },
      { key: "contact", label: "聯絡人", synonyms: CONTACT },
      { key: "mobile_no", label: "電話", synonyms: PHONE },
      { key: "email_id", label: "Email", synonyms: EMAIL },
      { key: "address", label: "地址", synonyms: ADDRESS, hint: "要看得出縣市，例如「台北市⋯」" },
      { key: "customer_group", label: "群組", synonyms: ["群組", "客戶類別", "客群", "group", "customer group"] },
      { key: "territory", label: "地區", synonyms: ["地區", "區域", "territory", "region"] },
      { key: "customer_details", label: "舊代號", synonyms: ["舊代號", "代號", "客戶代號", "客戶/廠商代碼", "代碼", "客戶編號", "code", "customer code", "id"] },
    ],
    template: [
      ["客人名稱", "類型", "統一編號", "聯絡人", "電話", "Email", "地址", "群組", "舊代號"],
      ["安安商行", "公司", "12345675", "林安安", "0912-345-678", "anan@example.com", "台北市大安區忠孝東路四段 100 號", "", "C001"],
    ],
  },
  suppliers: {
    id: "suppliers",
    label: "供應商",
    noun: "供應商",
    doctype: "Supplier",
    key: "supplier_name",
    fields: [
      { key: "supplier_name", label: "供應商名稱", required: true, synonyms: ["供應商名稱", "廠商名稱", "名稱", "廠商全名", "廠商簡稱", "客戶/廠商名稱", "公司名稱", "供應商", "廠商", "supplier", "supplier name", "vendor", "vendor name", "company", "name"] },
      { key: "tax_id", label: "統一編號", synonyms: TAX },
      { key: "contact", label: "聯絡人", synonyms: CONTACT },
      { key: "mobile_no", label: "電話", synonyms: PHONE },
      { key: "email_id", label: "Email", synonyms: EMAIL },
      { key: "address", label: "地址", synonyms: ADDRESS, hint: "要看得出縣市，例如「新北市⋯」" },
      { key: "supplier_group", label: "群組", synonyms: ["群組", "廠商類別", "供應商類別", "group", "supplier group"] },
      { key: "supplier_details", label: "舊代號", synonyms: ["舊代號", "代號", "廠商代號", "客戶/廠商代碼", "代碼", "廠商編號", "code", "supplier code", "id"] },
    ],
    template: [
      ["供應商名稱", "統一編號", "聯絡人", "電話", "Email", "地址", "舊代號"],
      ["大同五金", "12345675", "陳大同", "02-2345-6789", "sales@datong.example.com", "新北市三重區重新路一段 1 號", "S001"],
    ],
  },
  items: {
    id: "items",
    label: "商品與售價",
    noun: "商品",
    doctype: "Item",
    key: "item_code",
    fields: [
      { key: "item_code", label: "料號", required: true, synonyms: ["料號", "品號", "品項代碼", "品項編碼", "商品編號", "貨號", "編號", "sku", "item code", "code", "part no", "part number"] },
      { key: "item_name", label: "品名", required: true, synonyms: ["品名", "名稱", "品項名稱", "商品名稱", "產品名稱", "item name", "name", "product", "product name"] },
      { key: "standard_rate", label: "售價", synonyms: ["售價", "標準售價", "售價定價一", "出庫單價", "單價", "定價", "price", "selling price", "rate", "standard rate"], hint: "未稅；會去掉千分位和「元」" },
      { key: "stock_uom", label: "單位", synonyms: ["單位", "庫存單位", "unit", "uom", "stock uom"], hint: "個、PCS、支、件都當「個」" },
      { key: "item_group", label: "群組", synonyms: ["群組", "分類", "品號類別", "品項群組", "類別", "group", "item group", "category"] },
      { key: "description", label: "規格", synonyms: ["規格", "說明", "規格資訊", "描述", "description", "spec"] },
      { key: "is_stock_item", label: "庫存品", synonyms: ["庫存品", "是否庫存", "stock item", "is stock item"], hint: "是／否；空白當庫存品，服務填「否」" },
    ],
    template: [
      ["料號", "品名", "售價", "單位", "群組", "規格", "庫存品"],
      ["M3-10", "螺絲 M3x10", "2.5", "個", "", "不鏽鋼", "是"],
      ["SVC-01", "到府安裝", "1500", "次", "", "", "否"],
    ],
  },
};

export const KIND_IDS = Object.keys(KINDS) as ImportKind[];

export function isKind(value: unknown): value is ImportKind {
  return typeof value === "string" && Object.hasOwn(KINDS, value);
}

/* ---------------------------------------------------------------- reading */

/**
 * Excel 存出來的檔：UTF-8（有沒有 BOM 都行）、Big5（繁中 Windows 的「CSV」）、
 * UTF-16（「Unicode 文字」）。UTF-8 解不開才當 Big5，跟 convert.py 的順序一樣。
 */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: "utf-8" | "big5" | "utf-16le" | "utf-16be" } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("big5").decode(bytes), encoding: "big5" };
  }
}

function detectDelimiter(text: string) {
  const counts = { "\t": 0, ",": 0, ";": 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts] += 1;
  }
  if (counts["\t"] && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

/** CSV (RFC 4180) or what Excel puts on the clipboard (tab-separated, same quoting). */
export function parseDelimited(input: string): Grid {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const grid: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      grid.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    grid.push(row);
  }
  return grid.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

export function toTable(grid: Grid): Table {
  const [head = [], ...body] = grid;
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (head[i] ?? "").trim() || `第 ${i + 1} 欄`);
  return { headers, rows: body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) };
}

/* ---------------------------------------------------------------- mapping */

/** 全形轉半形、去空白與標點、英文小寫：「 E-Mail 」「ｅｍａｉｌ」都變 `email`. */
export function headerKey(header: string) {
  return header
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s_\-.:：()（）/／*＊]/g, "");
}

export function autoMap(kind: ImportKind, headers: string[]): Mapping {
  const keys = headers.map(headerKey);
  const taken = new Set<number>();
  const mapping: Mapping = {};
  for (const field of KINDS[kind].fields) {
    let found: number | null = null;
    for (const synonym of field.synonyms) {
      const index = keys.findIndex((k, i) => !taken.has(i) && k === headerKey(synonym));
      if (index >= 0) {
        found = index;
        break;
      }
    }
    if (found !== null) taken.add(found);
    mapping[field.key] = found;
  }
  return mapping;
}

export function missingRequired(kind: ImportKind, mapping: Mapping) {
  return KINDS[kind].fields.filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined));
}

/** Header row is line 1, so the first data row is 2 — the same numbering as checks.py. */
export function buildRows(kind: ImportKind, table: Table, mapping: Mapping): SourceRow[] {
  return table.rows.map((cells, i) => {
    const values: Record<string, string> = {};
    for (const field of KINDS[kind].fields) {
      const index = mapping[field.key];
      values[field.key] = index === null || index === undefined ? "" : (cells[index] ?? "").trim();
    }
    return { row: i + 2, values };
  });
}

/* ---------------------------------------------------------------- Taiwan rules (taiwan.py) */

const TAX_WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1];

/**
 * 統一編號檢查碼。各位數乘權數 1,2,1,2,1,2,4,1，乘積的十位數加個位數後加總；
 * 2023 年起總和能被 5 整除就對（以前是 10，能被 10 整除的也一定能被 5 整除）。
 * 第七位是 7 時乘積 28 → 10，可以再算成 1 或 0，任一種能整除就對。
 */
export function isValidTaxId(value: string | null | undefined) {
  if (!value || !/^\d{8}$/.test(value)) return false;
  let total = 0;
  for (let i = 0; i < 8; i += 1) {
    const product = Number(value[i]) * TAX_WEIGHTS[i];
    total += Math.floor(product / 10) + (product % 10);
  }
  if (total % 5 === 0) return true;
  return value[6] === "7" && (total + 1) % 5 === 0;
}

export function normalizeEmail(value: string | null | undefined) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/** Taiwan numbers to E.164 (+8869XXXXXXXX, +886 landlines); other +E.164 kept. */
export function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("886")) {
    digits = "+" + digits;
    return /^\+886\d{8,9}$/.test(digits) ? digits : null;
  }
  if (/^0\d{8,9}$/.test(digits)) return "+886" + digits.slice(1);
  return null;
}

/** convert.py `_transform(..., "number")`. */
export function cleanNumber(value: string) {
  return value.replace(/[,\s$NT元]/g, "");
}

const YES = new Set(["1", "y", "yes", "true", "是", "v", "✓"]);

const CUSTOMER_TYPE: Record<string, string> = { 公司: "Company", 法人: "Company", 個人: "Individual", 自然人: "Individual", company: "Company", individual: "Individual" };

const UOM: Record<string, string> = { 個: "Nos", PCS: "Nos", pcs: "Nos", EA: "Nos", ea: "Nos", 支: "Nos", 件: "Nos" };

const TW_CITY = /^(?:台灣|臺灣)?\s*((?:[台臺](?:北|中|南)市)|新北市|桃園市|高雄市|基隆市|新竹[市縣]|嘉義[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|屏東縣|宜蘭縣|花蓮縣|[台臺]東縣|澎湖縣|金門縣|連江縣)/;

/** 「106台北市大安區⋯」→ city 台北市, pincode 106. ERPNext needs a city and country to make an Address. */
export function splitAddress(value: string) {
  const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const zip = text.match(/^(\d{3}(?:\d{2,3})?)\s*/);
  const rest = zip ? text.slice(zip[0].length) : text;
  const city = rest.match(TW_CITY);
  return { line1: text.slice(0, MAX_CELL), line2: text.slice(MAX_CELL, MAX_CELL * 2), city: city ? city[1] : "", pincode: zip ? zip[1] : "" };
}

/* ---------------------------------------------------------------- checking */

function lookup(source: CheckContext["existingTaxIds"], key: string) {
  if (!source) return undefined;
  return source instanceof Map ? source.get(key) : Object.hasOwn(source, key) ? source[key] : undefined;
}

/**
 * Normalises every row and lists what is wrong. Errors skip the row; warnings
 * import it, sometimes without the cell that was wrong (said in the message).
 * Same rules as checks.py, plus what ERPNext would reject anyway (length, links).
 */
export function prepare(kind: ImportKind, rows: SourceRow[], ctx: CheckContext = {}): PreparedRow[] {
  const spec = KINDS[kind];
  const existing = new Set([...(ctx.existingKeys ?? [])].map((k) => k.trim().toLowerCase()));
  const label = (key: string) => spec.fields.find((f) => f.key === key)?.label ?? key;

  const prepared = rows.map(({ row, values: raw }) => {
    const issues: Issue[] = [];
    const add = (field: string, value: string, problem: string, level: Issue["level"] = "error") => issues.push({ row, field, value, problem, level });
    const v: Record<string, string> = {};
    for (const field of spec.fields) v[field.key] = String(raw[field.key] ?? "").trim();

    for (const field of spec.fields) {
      const value = v[field.key];
      if (field.required && !value) {
        if (field.key === "item_name" && v.item_code) {
          v.item_name = v.item_code;
          add("item_name", "", "沒有品名，會用料號當品名", "warning");
        } else add(field.key, "", `${field.label}是空的`);
      }
      const limit = field.key === "description" || field.key.endsWith("_details") || field.key === "address" ? MAX_TEXT : MAX_CELL;
      if (value.length > limit) add(field.key, value.slice(0, 20) + "…", `${field.label}太長（最多 ${limit} 字）`);
    }

    if (kind === "items" && /[<>"]/.test(v.item_code)) add("item_code", v.item_code, "料號不能有 < > \" 這些符號");

    if ("tax_id" in v && v.tax_id) {
      let tax = v.tax_id.replace(/\D/g, "");
      if (tax.length === 7 && isValidTaxId("0" + tax)) {
        tax = "0" + tax;
        add("tax_id", v.tax_id, "統編少了開頭的 0（Excel 常把 0 吃掉），已補上", "warning");
      }
      if (!isValidTaxId(tax)) add("tax_id", v.tax_id, "統編檢查碼錯誤");
      v.tax_id = tax;
    }

    if ("email_id" in v && v.email_id) {
      const email = normalizeEmail(v.email_id);
      if (!email) {
        add("email_id", v.email_id, "Email 格式不對，這一格不會匯入", "warning");
        v.email_id = "";
      } else v.email_id = email;
    }

    if ("mobile_no" in v && v.mobile_no) {
      const typed = v.mobile_no;
      const digits = typed.replace(/\D/g, "");
      const phone = normalizePhone(typed) ?? (/^9\d{8}$/.test(digits) ? normalizePhone("0" + digits) : null);
      if (phone && !normalizePhone(typed)) add("mobile_no", typed, "手機少了開頭的 0（Excel 常把 0 吃掉），已補上", "warning");
      if (phone) v.mobile_no = phone;
      else if (/^[\d\s+\-()#]{6,20}$/.test(typed)) add("mobile_no", typed, "電話看不出區碼，照原樣存", "warning");
      else {
        add("mobile_no", typed, "電話格式看不懂，這一格不會匯入", "warning");
        v.mobile_no = "";
      }
    }

    if ("address" in v && v.address && !splitAddress(v.address).city) {
      add("address", v.address, "地址看不出縣市，會改放在備註", "warning");
    }

    if (kind === "customers") {
      if (v.customer_type) {
        const type = CUSTOMER_TYPE[v.customer_type.toLowerCase()] ?? CUSTOMER_TYPE[v.customer_type];
        if (!type) add("customer_type", v.customer_type, "類型看不懂，當成公司", "warning");
        v.customer_type = type ?? "Company";
      } else v.customer_type = "Company";
    }

    for (const [field, allowed, what] of [
      ["customer_group", ctx.groups, "群組"],
      ["supplier_group", ctx.groups, "群組"],
      ["item_group", ctx.groups, "群組"],
      ["territory", ctx.territories, "地區"],
    ] as const) {
      if (field in v && v[field] && allowed && !allowed.includes(v[field])) {
        add(field, v[field], `系統裡沒有「${v[field]}」這個${what}，會用預設的`, "warning");
        v[field] = "";
      }
    }

    if (kind === "items") {
      if (v.stock_uom) {
        const uom = UOM[v.stock_uom] ?? v.stock_uom;
        if (ctx.uoms && !ctx.uoms.includes(uom)) {
          add("stock_uom", v.stock_uom, `系統裡沒有「${v.stock_uom}」這個單位，會用預設的`, "warning");
          v.stock_uom = "";
        } else v.stock_uom = uom;
      }
      v.is_stock_item = v.is_stock_item ? (YES.has(v.is_stock_item.trim().toLowerCase()) ? "1" : "0") : "1";
      if (v.standard_rate) {
        const typed = v.standard_rate;
        const rate = cleanNumber(typed);
        if (!/^-?\d+(\.\d+)?$/.test(rate)) add("standard_rate", typed, "售價不是數字");
        else if (Number(rate) < 0) add("standard_rate", typed, "售價是負的");
        else if (Number(rate) >= 1e12) add("standard_rate", typed, "售價太大");
        v.standard_rate = rate;
      } else add("standard_rate", "", "沒有售價，官網與報價會是 0 元", "warning");
    }

    const key = v[spec.key];
    if (key && existing.has(key.toLowerCase())) add(spec.key, key, `系統裡已經有這個${spec.noun}，這列會跳過`);
    if ("tax_id" in v && v.tax_id) {
      const owner = lookup(ctx.existingTaxIds, v.tax_id);
      if (owner && owner.trim().toLowerCase() !== key.toLowerCase()) add("tax_id", v.tax_id, `統編跟系統裡的「${owner}」一樣，可能是同一家`, "warning");
    }
    return { row, values: v, issues, ok: true };
  });

  const seen = new Map<string, number[]>();
  const taxes = new Map<string, number[]>();
  for (const p of prepared) {
    const key = p.values[spec.key]?.toLowerCase();
    if (key) seen.set(key, [...(seen.get(key) ?? []), p.row]);
    const tax = p.values.tax_id;
    if (tax && isValidTaxId(tax)) taxes.set(tax, [...(taxes.get(tax) ?? []), p.row]);
  }
  for (const p of prepared) {
    const key = p.values[spec.key]?.toLowerCase();
    const same = key ? (seen.get(key) ?? []) : [];
    if (same.length > 1) p.issues.push({ row: p.row, field: spec.key, value: p.values[spec.key], problem: `${label(spec.key)}重複（第 ${same.join("、")} 列）`, level: "error" });
    const sameTax = p.values.tax_id ? (taxes.get(p.values.tax_id) ?? []) : [];
    if (sameTax.length > 1) p.issues.push({ row: p.row, field: "tax_id", value: p.values.tax_id, problem: "統編重複，可能是同一家", level: "warning" });
    p.ok = !p.issues.some((i) => i.level === "error");
  }
  return prepared;
}

export function summarize(rows: PreparedRow[]) {
  const errors = rows.filter((r) => !r.ok).length;
  const warnings = rows.filter((r) => r.ok && r.issues.length).length;
  return { total: rows.length, ready: rows.length - errors, errors, warnings };
}

/* ---------------------------------------------------------------- ERPNext documents */

export type DocDefaults = {
  customer_group?: string;
  territory?: string;
  supplier_group?: string;
  item_group?: string;
  stock_uom?: string;
};

function details(...parts: string[]) {
  return parts.filter(Boolean).join("\n").slice(0, MAX_TEXT);
}

/**
 * The document handed to `frappe.client.insert`. Only fields listed here leave
 * the shell, whatever the browser sent. Customer/Supplier `on_update` turn
 * email/mobile/first_name into the primary Contact and address_line1+city+country
 * into the primary Address; Item `after_insert` turns standard_rate into an Item
 * Price on the default selling price list.
 */
export function toDoc(kind: ImportKind, v: Record<string, string>, defaults: DocDefaults = {}): Record<string, unknown> {
  if (kind === "items") {
    return {
      doctype: "Item",
      item_code: v.item_code,
      item_name: v.item_name || v.item_code,
      item_group: v.item_group || defaults.item_group,
      stock_uom: v.stock_uom || defaults.stock_uom,
      is_stock_item: v.is_stock_item === "0" ? 0 : 1,
      ...(v.standard_rate ? { standard_rate: Number(v.standard_rate) } : {}),
      ...(v.description ? { description: v.description } : {}),
    };
  }
  const address = v.address ? splitAddress(v.address) : null;
  const usable = address?.city ? address : null;
  const party: Record<string, unknown> = {
    tax_id: v.tax_id || undefined,
    email_id: v.email_id || undefined,
    mobile_no: v.mobile_no || undefined,
    first_name: v.contact || undefined,
    ...(usable ? { address_line1: usable.line1, address_line2: usable.line2 || undefined, city: usable.city, pincode: usable.pincode || undefined, country: "Taiwan" } : {}),
  };
  const note = address && !usable ? `地址：${v.address}` : "";
  const doc =
    kind === "customers"
      ? {
          doctype: "Customer",
          customer_name: v.customer_name,
          customer_type: v.customer_type === "Individual" ? "Individual" : "Company",
          customer_group: v.customer_group || defaults.customer_group || undefined,
          territory: v.territory || defaults.territory || undefined,
          customer_details: details(v.customer_details ? `舊代號：${v.customer_details}` : "", note) || undefined,
          ...party,
        }
      : {
          doctype: "Supplier",
          supplier_name: v.supplier_name,
          supplier_type: "Company",
          supplier_group: v.supplier_group || defaults.supplier_group || undefined,
          country: "Taiwan",
          supplier_details: details(v.supplier_details ? `舊代號：${v.supplier_details}` : "", note) || undefined,
          ...party,
        };
  return Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined && value !== ""));
}

/* ---------------------------------------------------------------- CSV out */

function csvCell(value: string) {
  const formula = /^[=+\-@\t\r]/.test(value) && !/^[+-]?[\d\s\-().]+$/.test(value);
  const v = formula ? `'${value}` : value;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Cells that start with = + - @ get a leading ' so Excel never runs them as formulas. */
export function toCsv(grid: Grid) {
  return grid.map((r) => r.map((c) => csvCell(c ?? "")).join(",")).join("\r\n") + "\r\n";
}

export function templateCsv(kind: ImportKind) {
  return toCsv(KINDS[kind].template);
}

/** The original columns of every row that did not go in, plus 列號 and 原因, so it can be fixed and pasted back. */
export function failedRowsCsv(table: Table, failed: { row: number; reason: string }[]) {
  const out: Grid = [["列號", "原因", ...table.headers]];
  for (const f of [...failed].sort((a, b) => a.row - b.row)) out.push([String(f.row), f.reason, ...(table.rows[f.row - 2] ?? [])]);
  return toCsv(out);
}
