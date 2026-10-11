// Run: node --experimental-strip-types --test scripts/importer.test.mjs  (from web/)
// Checks web/lib/importer.ts against the onboarding toolkit's own mappings, templates,
// examples and shared rule fixture, so the web wizard and `dropout-onboard` agree.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { KINDS, autoMap, buildRows, decodeBytes, failedRowsCsv, isValidTaxId, missingRequired, normalizeEmail, normalizePhone, cleanNumber, parseDelimited, prepare, splitAddress, summarize, templateCsv, toCsv, toDoc, toTable } from "../lib/importer.ts";
import { readXlsx } from "../lib/xlsx.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLKIT = path.join(HERE, "..", "..", "toolkit");
const rules = JSON.parse(fs.readFileSync(path.join(TOOLKIT, "tests", "fixtures", "import_rules.json"), "utf8"));

function load(kind, file) {
  const table = toTable(parseDelimited(decodeBytes(fs.readFileSync(file)).text));
  const mapping = autoMap(kind, table.headers);
  return { table, mapping, rows: prepare(kind, buildRows(kind, table, mapping)) };
}

test("shared Taiwan rules match taiwan.py", () => {
  for (const c of rules.tax_id) assert.equal(isValidTaxId(c.value), c.valid, c.value);
  for (const c of rules.phone) assert.equal(normalizePhone(c.value), c.e164, c.value);
  for (const c of rules.email) assert.equal(normalizeEmail(c.value), c.normalized, c.value);
  for (const c of rules.number) assert.equal(cleanNumber(c.value), c.clean, c.value);
});

test("every header the toolkit mappings know maps to the same field", () => {
  const dir = path.join(TOOLKIT, "dropout_onboard", "mappings");
  for (const source of fs.readdirSync(dir)) {
    for (const kind of ["customers", "suppliers", "items"]) {
      const mapping = JSON.parse(fs.readFileSync(path.join(dir, source, `${kind}.json`), "utf8"));
      for (const [field, spec] of Object.entries(mapping.fields)) {
        for (const header of spec.from ?? []) {
          assert.equal(autoMap(kind, [header])[field], 0, `${source}/${kind}: 「${header}」 should map to ${field}`);
        }
      }
    }
  }
});

test("toolkit templates and examples pass with no errors", () => {
  const files = [];
  for (const kind of ["customers", "suppliers", "items"]) {
    files.push([kind, path.join(TOOLKIT, "templates", `${kind}.csv`)]);
    for (const scene of fs.readdirSync(path.join(TOOLKIT, "examples"))) {
      const file = path.join(TOOLKIT, "examples", scene, `${kind}.csv`);
      if (fs.existsSync(file)) files.push([kind, file]);
    }
  }
  for (const [kind, file] of files) {
    const { mapping, rows } = load(kind, file);
    assert.deepEqual(missingRequired(kind, mapping), [], file);
    const errors = rows.flatMap((r) => r.issues.filter((i) => i.level === "error"));
    assert.deepEqual(errors, [], file);
  }
});

test("web templates map every column and pass", () => {
  for (const kind of Object.keys(KINDS)) {
    const table = toTable(parseDelimited(templateCsv(kind)));
    const mapping = autoMap(kind, table.headers);
    assert.ok(table.headers.every((_, i) => Object.values(mapping).includes(i)), kind);
    assert.equal(summarize(prepare(kind, buildRows(kind, table, mapping))).errors, 0, kind);
  }
});

test("Big5 CSV from old Windows Excel", () => {
  const hex = "abc8a4e1a5fea6572cb2cea440bd73b8b92ca6e6b0cab971b8dc0a43a5dcbd64b0d3a6e62c31322d3334352d3637352c303931322d3334352d3637380a";
  const { text, encoding } = decodeBytes(Uint8Array.from(Buffer.from(hex, "hex")));
  assert.equal(encoding, "big5");
  const table = toTable(parseDelimited(text));
  const mapping = autoMap("customers", table.headers);
  const [row] = prepare("customers", buildRows("customers", table, mapping));
  assert.equal(row.values.customer_name, "C示範商行");
  assert.equal(row.values.tax_id, "12345675");
  assert.equal(row.values.mobile_no, "+886912345678");
  assert.ok(row.ok);
});

test("UTF-8 with BOM, quotes, commas and line breaks inside cells; pasted tabs", () => {
  const csv = '\uFEFF客戶名稱,地址\n"好,好 商行","台北市\n大安區"\n';
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(csv.slice(1))]);
  const grid = parseDelimited(decodeBytes(bytes).text);
  assert.deepEqual(grid, [["客戶名稱", "地址"], ["好,好 商行", "台北市\n大安區"]]);
  assert.deepEqual(parseDelimited("品名\t料號\t售價\r\n螺絲\tM3\t1,200\r\n\r\n"), [["品名", "料號", "售價"], ["螺絲", "M3", "1,200"]]);
});

test("English and full-width headers", () => {
  const m = autoMap("customers", ["Company Name", "ＶＡＴ", "E-Mail", "Contact Person", "Phone", "Address"]);
  assert.deepEqual([m.customer_name, m.tax_id, m.email_id, m.contact, m.mobile_no, m.address], [0, 1, 2, 3, 4, 5]);
  const items = autoMap("items", ["SKU", "Item Name", "Price", "UOM"]);
  assert.deepEqual([items.item_code, items.item_name, items.standard_rate, items.stock_uom], [0, 1, 2, 3]);
});

test("checks: required, checksum, duplicates, existing records, Excel-eaten zeros", () => {
  const rows = [
    { row: 2, values: { customer_name: "甲", tax_id: "12345675", email_id: "a@example.com" } },
    { row: 3, values: { customer_name: "乙", tax_id: "11111111", email_id: "bad", mobile_no: "912345678" } },
    { row: 4, values: { customer_name: "甲", tax_id: "12345675" } },
    { row: 5, values: { customer_name: "", tax_id: "4595257" } },
    { row: 6, values: { customer_name: "丙公司", address: "沒有縣市的地址" } },
    { row: 7, values: { customer_name: "老客人" } },
    { row: 8, values: { customer_name: "丁", tax_id: "22099131" } },
  ];
  const out = prepare("customers", rows, { existingKeys: ["老客人"], existingTaxIds: { 22099131: "台積" } });
  const problems = (row) => out.find((r) => r.row === row).issues.map((i) => i.problem);
  assert.ok(problems(3).includes("統編檢查碼錯誤"));
  assert.ok(problems(2).some((p) => p.startsWith("客人名稱重複")));
  assert.ok(problems(2).includes("統編重複，可能是同一家"));
  assert.ok(problems(3).includes("Email 格式不對，這一格不會匯入"));
  assert.equal(out[1].values.email_id, "");
  assert.equal(out[1].values.mobile_no, "+886912345678");
  assert.ok(problems(5).includes("客人名稱是空的"));
  assert.equal(out[3].values.tax_id, "04595257");
  assert.ok(problems(6).includes("地址看不出縣市，會改放在備註"));
  assert.ok(problems(7).includes("系統裡已經有這個客人，這列會跳過"));
  assert.ok(problems(8).some((p) => p.includes("台積")));
  assert.deepEqual(out.map((r) => r.ok), [false, false, false, false, true, false, true]);
});

test("items: price, unit map, stock flag, links", () => {
  const rows = [
    { row: 2, values: { item_code: "A", item_name: "螺絲", standard_rate: "NT$1,200 元", stock_uom: "PCS", is_stock_item: "否" } },
    { row: 3, values: { item_code: "B", item_name: "", standard_rate: "-1" } },
    { row: 4, values: { item_code: "C", item_name: "x", standard_rate: "abc", stock_uom: "打", item_group: "不存在" } },
    { row: 5, values: { item_code: "D", item_name: "y" } },
  ];
  const out = prepare("items", rows, { uoms: ["Nos", "Box"], groups: ["Products"] });
  assert.deepEqual(out[0].values, { ...out[0].values, standard_rate: "1200", stock_uom: "Nos", is_stock_item: "0" });
  assert.ok(out[1].issues.some((i) => i.problem === "售價是負的"));
  assert.equal(out[1].values.item_name, "B");
  assert.ok(out[2].issues.some((i) => i.problem === "售價不是數字"));
  assert.equal(out[2].values.stock_uom, "");
  assert.equal(out[2].values.item_group, "");
  assert.ok(out[3].ok && out[3].issues.some((i) => i.problem.startsWith("沒有售價")));
});

test("toDoc only sends known fields and builds contact/address inputs", () => {
  const [p] = prepare("customers", [{ row: 2, values: { customer_name: "安安", customer_type: "個人", contact: "林安安", mobile_no: "0912345678", address: "106台北市大安區忠孝東路四段 100 號", owner: "x", name: "y" } }]);
  const doc = toDoc("customers", { ...p.values, docstatus: "1", owner: "evil" }, { customer_group: "Commercial", territory: "Taiwan" });
  assert.deepEqual(doc, {
    doctype: "Customer",
    customer_name: "安安",
    customer_type: "Individual",
    customer_group: "Commercial",
    territory: "Taiwan",
    mobile_no: "+886912345678",
    first_name: "林安安",
    address_line1: "106台北市大安區忠孝東路四段 100 號",
    city: "台北市",
    pincode: "106",
    country: "Taiwan",
  });
  assert.equal(splitAddress("臺灣新北市三重區").city, "新北市");
  const item = toDoc("items", { item_code: "A", item_name: "", standard_rate: "2.5", is_stock_item: "1" }, { item_group: "Products", stock_uom: "Nos" });
  assert.deepEqual(item, { doctype: "Item", item_code: "A", item_name: "A", item_group: "Products", stock_uom: "Nos", is_stock_item: 1, standard_rate: 2.5 });
});

test("CSV out never lets Excel run a formula", () => {
  assert.equal(toCsv([["=1+1", "-2", "+886912345678", "@x", 'a"b']]), "'=1+1,-2,+886912345678,'@x,\"a\"\"b\"\r\n");
  const table = { headers: ["名稱"], rows: [["甲"], ["乙"]] };
  assert.equal(failedRowsCsv(table, [{ row: 3, reason: "重複" }]), "列號,原因,名稱\r\n3,重複,乙\r\n");
});

function zip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = deflateRawSync(enc.encode(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(enc.encode(text).length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(enc.encode(text).length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

test("reads the first sheet of an .xlsx", async () => {
  const bytes = zip({
    "xl/workbook.xml": '<workbook><sheets><sheet name="客戶" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst><si><t>客戶名稱</t></si><si><t>統編</t></si><si><r><t>安安</t></r><r><t xml:space="preserve"> 商行</t></r><rPh><t>ㄢ</t></rPh></si><si><t>A&amp;B</t></si></sst>',
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>電話</t></is></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12345675</v></c><c r="D2"><v>912345678</v></c></row>' +
      '<row r="3"/><row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4"><v>0.30000000000000004</v></c></row></sheetData></worksheet>',
  });
  const rows = await readXlsx(bytes);
  assert.deepEqual(rows, [
    ["客戶名稱", "統編", "", "電話"],
    ["安安 商行", "12345675", "", "912345678"],
    ["A&B", "0.3"],
  ]);
});
