import { createHash } from "node:crypto";
import { LedgerError } from "./errors";
import { paymentAmount, type PricedQuote } from "./money";
import { INVOICE_STATUS, LEDGER_TENANT_ID, type DocKind, type LedgerDb, type LedgerHead, type StoredDoc } from "./types";

const DOCTYPE: Record<DocKind, string> = {
  quotation: "Quotation",
  order: "Sales Order",
  delivery: "Delivery Note",
  invoice: "Sales Invoice",
  receipt: "Payment Entry",
};

const NEXT_KIND: Record<Exclude<DocKind, "receipt">, DocKind> = {
  quotation: "order",
  order: "delivery",
  delivery: "invoice",
  invoice: "receipt",
};

type HeadRow = {
  id: string;
  seq: number;
  chain_id: string;
  kind: DocKind;
  party_id: string;
  party_name: string;
  untaxed: number;
  tax: number;
  total: number;
  received: number;
  balance: number;
  invoice_status: string;
  item_name: string | null;
  qty: number | null;
};

function partyId(name: string) {
  return `p-${createHash("sha256").update(name).digest("hex").slice(0, 16)}`;
}

export function cleanPartyName(raw: string) {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return name || null;
}

function now() {
  return new Date().toISOString();
}

function bump(db: LedgerDb, tenant: string) {
  return [
    db.prepare("INSERT INTO ledger_counters (tenant_id, name, n) VALUES (?1, 'n', 0) ON CONFLICT(tenant_id, name) DO NOTHING").bind(tenant),
    db.prepare("UPDATE ledger_counters SET n = n + 1 WHERE tenant_id = ?1 AND name = 'n'").bind(tenant),
  ];
}

function stored(row: HeadRow): StoredDoc {
  return {
    id: row.id,
    no: row.chain_id,
    kind: row.kind,
    doctype: DOCTYPE[row.kind],
    party: row.party_name,
    untaxed: row.untaxed,
    tax: row.tax,
    total: row.total,
    received: row.received,
    balance: row.balance,
    invoiceStatus: row.invoice_status,
  };
}

async function latest(db: LedgerDb, chainId: string): Promise<HeadRow | null> {
  return db
    .prepare(
      `SELECT d.id, d.seq, d.chain_id, d.kind, d.party_id, d.party_name, d.untaxed, d.tax, d.total, d.received, d.balance, d.invoice_status,
              l.item_name, l.qty
       FROM ledger_documents d
       LEFT JOIN ledger_lines l ON l.tenant_id = d.tenant_id AND l.document_id = d.id AND l.line_no = 1
       WHERE d.tenant_id = ?1 AND d.chain_id = ?2
       ORDER BY d.seq DESC
       LIMIT 1`,
    )
    .bind(LEDGER_TENANT_ID, chainId)
    .first<HeadRow>();
}

export async function createQuote(
  db: LedgerDb,
  input: { party: string; partyType: "Customer" | "Lead"; priced: PricedQuote },
): Promise<StoredDoc> {
  const party = cleanPartyName(input.party);
  if (!party) throw new LedgerError("請填客戶名稱");
  if (!input.priced.ok) throw new LedgerError("金額不對");
  const tenant = LEDGER_TENANT_ID;
  const id = partyId(party);
  const stamp = now();
  const lines = input.priced.lines.map((line, index) =>
    db
      .prepare(
        `INSERT INTO ledger_lines (tenant_id, document_id, line_no, item_code, item_name, qty, rate, amount)
         SELECT ?1, printf('QT-%04d', n), ?2, ?3, ?4, ?5, ?6, ?7
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'`,
      )
      .bind(tenant, index + 1, line.itemCode, line.itemName, line.qty, line.rate, line.amount),
  );
  const results = await db.batch([
    ...bump(db, tenant),
    db
      .prepare(
        `INSERT INTO ledger_parties (tenant_id, id, name, party_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(tenant_id, id) DO UPDATE SET name = excluded.name, party_type = excluded.party_type`,
      )
      .bind(tenant, id, party, input.partyType, stamp),
    db
      .prepare(
        `INSERT INTO ledger_documents (
           tenant_id, id, seq, chain_id, kind, upstream_id, party_id, party_name,
           untaxed, tax, total, received, balance, invoice_status, created_at
         )
         SELECT ?1, printf('QT-%04d', n), n, printf('QT-%04d', n), 'quotation', NULL, ?2, ?3,
                ?4, ?5, ?6, 0, ?6, ?7, ?8
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'
         RETURNING id, seq, chain_id, kind, party_id, party_name, untaxed, tax, total, received, balance, invoice_status`,
      )
      .bind(tenant, id, party, input.priced.untaxed, input.priced.tax, input.priced.total, INVOICE_STATUS, stamp),
    ...lines,
  ]);
  const row = results[3]?.results?.[0] as HeadRow | undefined;
  if (!row?.chain_id) throw new LedgerError("報價沒有寫進測試帳本", 500);
  return stored({ ...row, item_name: input.priced.lines[0]?.itemName ?? null, qty: input.priced.lines[0]?.qty ?? null });
}

export async function advanceQuote(db: LedgerDb, chainId: string, doctype: string): Promise<StoredDoc> {
  const current = await latest(db, chainId);
  if (!current) throw new LedgerError("找不到這張單");
  if (current.kind === "receipt") throw new LedgerError("這張單已經收完");
  const expected = DOCTYPE[current.kind];
  if (doctype !== expected) throw new LedgerError("這張單已經往下走了，請重新整理");
  const next = NEXT_KIND[current.kind];
  if (next === "receipt") return settle(db, current);
  if (next === "quotation") throw new LedgerError("這張單不能退回報價");
  return copyForward(db, current, next);
}

async function copyForward(db: LedgerDb, current: HeadRow, kind: Exclude<DocKind, "quotation" | "receipt">): Promise<StoredDoc> {
  const tenant = LEDGER_TENANT_ID;
  const id = `${current.chain_id}:${kind}`;
  const stamp = now();
  const results = await db.batch([
    ...bump(db, tenant),
    db
      .prepare(
        `INSERT INTO ledger_documents (
           tenant_id, id, seq, chain_id, kind, upstream_id, party_id, party_name,
           untaxed, tax, total, received, balance, invoice_status, created_at
         )
         SELECT ?1, ?2, n, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'
         RETURNING id, seq, chain_id, kind, party_id, party_name, untaxed, tax, total, received, balance, invoice_status`,
      )
      .bind(
        tenant,
        id,
        current.chain_id,
        kind,
        current.id,
        current.party_id,
        current.party_name,
        current.untaxed,
        current.tax,
        current.total,
        current.received,
        current.balance,
        INVOICE_STATUS,
        stamp,
      ),
    db
      .prepare(
        `INSERT INTO ledger_lines (tenant_id, document_id, line_no, item_code, item_name, qty, rate, amount)
         SELECT tenant_id, ?1, line_no, item_code, item_name, qty, rate, amount
         FROM ledger_lines WHERE tenant_id = ?2 AND document_id = ?3`,
      )
      .bind(id, tenant, current.id),
  ]);
  const row = results[2]?.results?.[0] as HeadRow | undefined;
  if (!row?.chain_id) throw new LedgerError("下一步沒有寫進測試帳本", 500);
  return stored({ ...row, item_name: current.item_name, qty: current.qty });
}

/** 記入已收：金額用帳上的餘額，不重算稅，也不讀瀏覽器的合計。 */
async function settle(db: LedgerDb, current: HeadRow): Promise<StoredDoc> {
  if (current.balance <= 0) throw new LedgerError("這張單沒有餘額");
  const tenant = LEDGER_TENANT_ID;
  const id = `${current.chain_id}:receipt`;
  const stamp = now();
  const received = current.received + current.balance;
  const results = await db.batch([
    ...bump(db, tenant),
    db
      .prepare(
        `INSERT INTO ledger_documents (
           tenant_id, id, seq, chain_id, kind, upstream_id, party_id, party_name,
           untaxed, tax, total, received, balance, invoice_status, created_at
         )
         SELECT ?1, ?2, n, ?3, 'receipt', ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'
         RETURNING id, seq, chain_id, kind, party_id, party_name, untaxed, tax, total, received, balance, invoice_status`,
      )
      .bind(
        tenant,
        id,
        current.chain_id,
        current.id,
        current.party_id,
        current.party_name,
        current.untaxed,
        current.tax,
        current.total,
        received,
        INVOICE_STATUS,
        stamp,
      ),
    db
      .prepare(
        `INSERT INTO ledger_lines (tenant_id, document_id, line_no, item_code, item_name, qty, rate, amount)
         SELECT tenant_id, ?1, line_no, item_code, item_name, qty, rate, amount
         FROM ledger_lines WHERE tenant_id = ?2 AND document_id = ?3`,
      )
      .bind(id, tenant, current.id),
    db
      .prepare(
        `INSERT INTO ledger_payments (tenant_id, id, party_id, amount, created_at)
         SELECT ?1, printf('RC-%04d', n), ?2, ?3, ?4
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'`,
      )
      .bind(tenant, current.party_id, current.balance, stamp),
    db
      .prepare(
        `INSERT INTO ledger_allocations (tenant_id, payment_id, document_id, amount)
         SELECT ?1, printf('RC-%04d', n), ?2, ?3
         FROM ledger_counters WHERE tenant_id = ?1 AND name = 'n'`,
      )
      .bind(tenant, current.id, current.balance),
  ]);
  const row = results[2]?.results?.[0] as HeadRow | undefined;
  if (!row?.chain_id) throw new LedgerError("收款沒有寫進測試帳本", 500);
  return stored({ ...row, item_name: current.item_name, qty: current.qty });
}

/** 部分收款。金額是這次收到的整數新台幣，不能超過餘額，不重算稅。 */
export async function recordPayment(db: LedgerDb, chainId: string, rawAmount: number): Promise<StoredDoc> {
  const amount = paymentAmount(rawAmount);
  if (amount == null) throw new LedgerError("收款要大於 0");
  const current = await latest(db, chainId);
  if (!current) throw new LedgerError("找不到這張單");
  if (current.balance < amount) throw new LedgerError("收款不能超過餘額");
  const tenant = LEDGER_TENANT_ID;
  const stamp = now();
  const results = await db.batch([
    ...bump(db, tenant),
    db
      .prepare(
        `UPDATE ledger_documents
         SET received = received + ?1, balance = balance - ?1
         WHERE tenant_id = ?2 AND id = ?3 AND balance >= ?1`,
      )
      .bind(amount, tenant, current.id),
    db
      .prepare(
        `INSERT INTO ledger_payments (tenant_id, id, party_id, amount, created_at)
         SELECT ?1, printf('RC-%04d', c.n), ?2, ?3, ?4
         FROM ledger_counters c
         WHERE c.tenant_id = ?1 AND c.name = 'n'
           AND EXISTS (
             SELECT 1 FROM ledger_documents d
             WHERE d.tenant_id = ?1 AND d.id = ?5 AND d.received = ?6
           )`,
      )
      .bind(tenant, current.party_id, amount, stamp, current.id, current.received + amount),
    db
      .prepare(
        `INSERT INTO ledger_allocations (tenant_id, payment_id, document_id, amount)
         SELECT ?1, printf('RC-%04d', n), ?2, ?3
         FROM ledger_counters c
         WHERE c.tenant_id = ?1 AND c.name = 'n'
           AND EXISTS (
             SELECT 1 FROM ledger_documents d
             WHERE d.tenant_id = ?1 AND d.id = ?2 AND d.received = ?4
           )`,
      )
      .bind(tenant, current.id, amount, current.received + amount),
  ]);
  const changes = results[2]?.meta?.changes ?? 0;
  if (!changes) throw new LedgerError("收款沒有寫進測試帳本", 500);
  const row = await latest(db, chainId);
  if (!row) throw new LedgerError("找不到這張單", 500);
  return stored(row);
}

export async function listHeads(db: LedgerDb): Promise<LedgerHead[]> {
  const listed = await db
    .prepare(
      `SELECT d.id, d.seq, d.chain_id, d.kind, d.party_id, d.party_name, d.untaxed, d.tax, d.total, d.received, d.balance, d.invoice_status,
              l.item_name, l.qty
       FROM ledger_documents d
       JOIN (
         SELECT chain_id, MAX(seq) AS seq
         FROM ledger_documents
         WHERE tenant_id = ?1
         GROUP BY chain_id
       ) h ON h.chain_id = d.chain_id AND h.seq = d.seq
       LEFT JOIN ledger_lines l ON l.tenant_id = d.tenant_id AND l.document_id = d.id AND l.line_no = 1
       WHERE d.tenant_id = ?1
       ORDER BY d.seq DESC`,
    )
    .bind(LEDGER_TENANT_ID)
    .all<HeadRow>();
  return (listed.results ?? []).map((row) => ({
    no: row.chain_id,
    party: row.party_name,
    item: row.item_name ?? "",
    qty: row.qty ?? 1,
    kind: row.kind,
    untaxed: row.untaxed,
    tax: row.tax,
    total: row.total,
    received: row.received,
    balance: row.balance,
    invoiceStatus: row.invoice_status,
  }));
}

export async function tenantOf(db: LedgerDb, chainId: string) {
  const row = await db
    .prepare("SELECT tenant_id FROM ledger_documents WHERE chain_id = ?1 LIMIT 1")
    .bind(chainId)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}
