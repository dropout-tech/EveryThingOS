-- 平台自己的測試帳本。每張表都有 tenant_id。
-- 租戶由登入帳號的公司決定，不信請求傳來的公司。
-- 不寫年費帳單的 invoices，也不寫 DoBusiness 的庫。

CREATE TABLE IF NOT EXISTS ledger_counters (
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS ledger_parties (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('Customer', 'Lead')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS ledger_documents (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  chain_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quotation', 'order', 'delivery', 'invoice', 'receipt')),
  upstream_id TEXT,
  party_id TEXT NOT NULL,
  party_name TEXT NOT NULL,
  untaxed INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  total INTEGER NOT NULL,
  received INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  invoice_status TEXT NOT NULL CHECK (invoice_status = '尚未開統一發票'),
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, seq)
);

CREATE INDEX IF NOT EXISTS ledger_documents_chain ON ledger_documents (tenant_id, chain_id, seq);

CREATE TABLE IF NOT EXISTS ledger_lines (
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty REAL NOT NULL,
  rate INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, document_id, line_no)
);

CREATE TABLE IF NOT EXISTS ledger_payments (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  party_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS ledger_allocations (
  tenant_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, payment_id, document_id)
);
