/** 這一刀寫死的測試租戶。登入改接 Google 之前，不讀請求裡的公司。 */
export const LEDGER_TENANT_ID = "test";

/** 這一刀不是統一發票，狀態固定這一句。 */
export const INVOICE_STATUS = "尚未開統一發票";

export type DocKind = "quotation" | "order" | "delivery" | "invoice" | "receipt";

export type SqlValue = string | number | null;

export interface LedgerStatement {
  bind(...values: SqlValue[]): LedgerStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface LedgerDb {
  prepare(sql: string): LedgerStatement;
  batch(statements: LedgerStatement[]): Promise<{ results?: unknown[]; meta?: { changes?: number } }[]>;
  exec(sql: string): Promise<unknown>;
}

export type LedgerHead = {
  no: string;
  party: string;
  item: string;
  qty: number;
  kind: DocKind;
  untaxed: number;
  tax: number;
  total: number;
  received: number;
  balance: number;
  invoiceStatus: string;
};

export type StoredDoc = {
  id: string;
  no: string;
  kind: DocKind;
  doctype: string;
  party: string;
  untaxed: number;
  tax: number;
  total: number;
  received: number;
  balance: number;
  invoiceStatus: string;
};
