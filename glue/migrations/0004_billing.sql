-- DropOut's own annual billing: one renewal invoice per company per contract period.
ALTER TABLE accounts ADD COLUMN tax_id TEXT;
ALTER TABLE accounts ADD COLUMN billing_address TEXT;

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  -- The contract end date this invoice renews (renews_on when it was opened; today for a first contract).
  period TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_tax_id TEXT,
  buyer_email TEXT,
  buyer_address TEXT,
  net INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  paid_at TEXT,
  paid_via TEXT,
  trade_no TEXT,
  gateway_txn TEXT,
  reference TEXT,
  renewed_until TEXT,
  void_reason TEXT,
  einvoice_number TEXT,
  einvoice_error TEXT,
  einvoice_at TEXT
);

-- At most one live (open or paid) invoice per company per period; a voided one can be reissued.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_period ON invoices (site, period) WHERE status != 'void';
CREATE INDEX IF NOT EXISTS invoices_site ON invoices (site, created_at);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices (status);

-- Each checkout attempt gets its own MerchantTradeNo (ECPay refuses a reused one).
CREATE TABLE IF NOT EXISTS invoice_payments (
  trade_no TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice ON invoice_payments (invoice_id);
