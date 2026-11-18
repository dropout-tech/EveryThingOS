import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { priceLines } from "./money.ts";
import { advanceQuote, createQuote, listHeads, recordPayment } from "./store.ts";
import { INVOICE_STATUS, type LedgerDb } from "./types.ts";

const webRoot = path.join(import.meta.dirname, "../..");

async function database() {
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy<{ DB: LedgerDb }>({
    configPath: path.join(webRoot, "wrangler.jsonc"),
    remoteBindings: false,
    persist: false,
  });
  try {
    const sql = readFileSync(path.join(webRoot, "migrations/0001_ledger.sql"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
      await proxy.env.DB.prepare(statement).run();
    }
  } catch (error) {
    await proxy.dispose();
    throw error;
  }
  return proxy;
}

test("報價寫進本機 D1，再讀還是同一單號與餘額", async () => {
  const proxy = await database();
  try {
    const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 12000 }]);
    assert.equal(priced.ok, true);
    if (!priced.ok) return;
    const created = await createQuote(proxy.env.DB, "test", { party: "E2E測報價客戶", partyType: "Customer", priced });
    assert.match(created.no, /^QT-\d{4}$/);
    assert.equal(created.total, 12600);
    assert.equal(created.tax, 600);
    assert.equal(created.balance, 12600);
    assert.equal(created.received, 0);
    assert.equal(created.invoiceStatus, INVOICE_STATUS);

    const first = await listHeads(proxy.env.DB, "test");
    const again = await listHeads(proxy.env.DB, "test");
    assert.equal(first[0]?.no, created.no);
    assert.equal(again[0]?.no, created.no);
    assert.equal(again[0]?.balance, 12600);
    assert.equal(again[0]?.party, "E2E測報價客戶");
    assert.equal(again[0]?.invoiceStatus, "尚未開統一發票");

    const lines = await proxy.env.DB.prepare("SELECT item_code, amount FROM ledger_lines WHERE tenant_id = ?1").bind("test").all<{ item_code: string; amount: number }>();
    assert.equal(lines.results.length, 1);
    assert.equal(lines.results[0]?.amount, 12000);
  } finally {
    await proxy.dispose();
  }
});

test("轉訂單、開發票、記入已收之後，單號不變，餘額歸零", async () => {
  const proxy = await database();
  try {
    const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 12000 }]);
    if (!priced.ok) throw new Error(priced.error);
    const quote = await createQuote(proxy.env.DB, "test", { party: "走完的客人", partyType: "Customer", priced });
    const order = await advanceQuote(proxy.env.DB, "test", quote.no, "Quotation");
    assert.equal(order.no, quote.no);
    assert.equal(order.doctype, "Sales Order");
    const delivered = await advanceQuote(proxy.env.DB, "test", quote.no, "Sales Order");
    assert.equal(delivered.doctype, "Delivery Note");
    const invoice = await advanceQuote(proxy.env.DB, "test", quote.no, "Delivery Note");
    assert.equal(invoice.doctype, "Sales Invoice");
    assert.equal(invoice.invoiceStatus, "尚未開統一發票");
    assert.equal(invoice.balance, 12600);
    const paid = await advanceQuote(proxy.env.DB, "test", quote.no, "Sales Invoice");
    assert.equal(paid.no, quote.no);
    assert.equal(paid.doctype, "Payment Entry");
    assert.equal(paid.received, 12600);
    assert.equal(paid.balance, 0);
    assert.equal(paid.invoiceStatus, "尚未開統一發票");
    const head = (await listHeads(proxy.env.DB, "test")).find((row) => row.no === quote.no);
    assert.equal(head?.balance, 0);
    assert.equal(head?.received, 12600);
  } finally {
    await proxy.dispose();
  }
});

test("部分收款不能超過餘額，也不重算稅", async () => {
  const proxy = await database();
  try {
    const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 1000 }]);
    if (!priced.ok) throw new Error(priced.error);
    const quote = await createQuote(proxy.env.DB, "test", { party: "收一部分", partyType: "Customer", priced });
    assert.equal(quote.total, 1050);
    const paid = await recordPayment(proxy.env.DB, "test", quote.no, 500.4);
    assert.equal(paid.received, 500);
    assert.equal(paid.balance, 550);
    assert.equal(paid.tax, 50);
    await assert.rejects(recordPayment(proxy.env.DB, "test", quote.no, 600), /不能超過餘額/);
  } finally {
    await proxy.dispose();
  }
});

test("租戶隔離及並發收款明細一致", async () => {
 const proxy = await database();
 try {
  const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 1000 }]);
  if (!priced.ok) throw new Error(priced.error);
  const quote = await createQuote(proxy.env.DB, "a", { party: "A", partyType: "Customer", priced });
  assert.deepEqual(await listHeads(proxy.env.DB, "b"), []);
  await assert.rejects(recordPayment(proxy.env.DB, "b", quote.no, 1), /找不到/);
  const results = await Promise.allSettled([recordPayment(proxy.env.DB, "a", quote.no, 525), recordPayment(proxy.env.DB, "a", quote.no, 525)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  await assert.rejects(recordPayment(proxy.env.DB, "a", quote.no, 100), /不能超過餘額/);
  const head = (await listHeads(proxy.env.DB, "a"))[0]!;
  const payments = await proxy.env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_payments WHERE tenant_id = ?").bind("a").first<{total: number}>();
  const counter = await proxy.env.DB.prepare("SELECT n FROM ledger_counters WHERE tenant_id = ? AND name = 'n'").bind("a").first<{n: number}>();
  assert.equal(head.received + head.balance, head.total);
  assert.equal(payments?.total, head.received);
  assert.equal(counter?.n, 3);
 } finally { await proxy.dispose(); }
});

// 在轉單讀取後暫停批次，讓部分收款先完成。
function pauseBatch(db: LedgerDb) {
  let signalReady!: () => void;
  let resume!: () => void;
  const ready = new Promise<void>((resolve) => { signalReady = resolve; });
  const resumed = new Promise<void>((resolve) => { resume = resolve; });
  const paused: LedgerDb = {
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => db.exec(sql),
    batch: async (statements) => {
      signalReady();
      await resumed;
      return db.batch(statements);
    },
  };
  return { db: paused, ready, resume };
}

test("部分收款先完成時，舊資料的轉單必須失敗並可重試", async () => {
  const proxy = await database();
  try {
    const db = proxy.env.DB;
    const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 1000 }]);
    if (!priced.ok) throw new Error(priced.error);
    const quote = await createQuote(db, "test", { party: "轉單交錯", partyType: "Customer", priced });
    const pause = pauseBatch(db);
    const advancing = advanceQuote(pause.db, "test", quote.no, "Quotation");
    await pause.ready;
    await recordPayment(db, "test", quote.no, 400);
    pause.resume();
    await assert.rejects(advancing, /單據已變更.*重試/);
    const documents = await db.prepare("SELECT COUNT(*) AS count FROM ledger_documents WHERE tenant_id = ?1").bind("test").first<{ count: number }>();
    const lines = await db.prepare("SELECT COUNT(*) AS count FROM ledger_lines WHERE tenant_id = ?1").bind("test").first<{ count: number }>();
    assert.equal(documents?.count, 1);
    assert.equal(lines?.count, 1);
    const order = await advanceQuote(db, "test", quote.no, "Quotation");
    assert.equal(order.received, 400);
    assert.equal(order.balance, 650);
    assert.equal((await listHeads(db, "test"))[0]?.received, 400);
  } finally {
    await proxy.dispose();
  }
});

test("部分收款先完成時，舊資料的結清必須失敗，重試不會超收", async () => {
  const proxy = await database();
  try {
    const db = proxy.env.DB;
    const priced = priceLines([{ itemCode: "專案人天", qty: 1, rate: 1000 }]);
    if (!priced.ok) throw new Error(priced.error);
    const quote = await createQuote(db, "test", { party: "結清交錯", partyType: "Customer", priced });
    for (const type of ["Quotation", "Sales Order", "Delivery Note"]) {
      await advanceQuote(db, "test", quote.no, type);
    }
    const pause = pauseBatch(db);
    const settling = advanceQuote(pause.db, "test", quote.no, "Sales Invoice");
    await pause.ready;
    await recordPayment(db, "test", quote.no, 400);
    pause.resume();
    await assert.rejects(settling, /單據已變更.*重試/);
    const beforeRetry = await db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM ledger_payments WHERE tenant_id = ?1").bind("test").first<{ count: number; total: number }>();
    assert.deepEqual(beforeRetry, { count: 1, total: 400 });
    const paid = await advanceQuote(db, "test", quote.no, "Sales Invoice");
    const payments = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_payments WHERE tenant_id = ?1").bind("test").first<{ total: number }>();
    const allocations = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_allocations WHERE tenant_id = ?1").bind("test").first<{ total: number }>();
    assert.equal(paid.received + paid.balance, paid.total);
    assert.equal(paid.received, 1050);
    assert.equal(payments?.total, paid.received);
    assert.equal(allocations?.total, paid.received);
  } finally {
    await proxy.dispose();
  }
});
