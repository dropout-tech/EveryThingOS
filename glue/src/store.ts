import type { Account } from "./accounts";
import { seal, unseal } from "./crypto";

export type GatewayKeys = { merchant_id: string; hash_key: string; hash_iv: string };

/** One company = one ERPNext site. Secrets are sealed with TENANT_KEY before D1. */
export type Tenant = {
  site: string;
  erpnext_url: string;
  erpnext_key: string;
  erpnext_secret: string;
  erpnext_webhook_secret: string;
  chatwoot_url?: string;
  chatwoot_account_id?: number;
  chatwoot_token?: string;
  chatwoot_path_token?: string;
  mail_from?: string;
  mail_provider?: "resend" | "generic";
  mail_webhook_secret?: string;
  unsubscribe_secret: string;
  confirm_redirect?: string;
  ecpay?: GatewayKeys;
  newebpay?: GatewayKeys;
  einvoice?: GatewayKeys & { provider: "ecpay"; sandbox?: boolean };
  vexa?: { url: string; api_key: string; bot_name?: string; webhook_token: string; language?: string };
  calendars?: string[];
  /** The shell's ERPNext OAuth client for this company (created by provisioning). */
  shell_oauth_client_id?: string;
  shell_oauth_client_secret?: string;
};

export type Meeting = { site: string; platform: string; meeting_id: string; title: string; attendees: string[]; started_at: string };

export type AccountEvent = { id: number; site: string; at: string; actor: string; action: string; detail: string | null };

export type DeadLetter = { id: number; site: string; kind: string; body: string; error: string; created_at: string };

export type InvoiceStatus = "open" | "paid" | "void";

/** DropOut's own renewal invoice to a customer company. Amounts are whole NT$. */
export type Invoice = {
  id: string;
  site: string;
  period: string;
  buyer_name: string;
  buyer_tax_id: string | null;
  buyer_email: string | null;
  buyer_address: string | null;
  net: number;
  tax: number;
  amount: number;
  status: InvoiceStatus;
  created_at: string;
  paid_at: string | null;
  paid_via: "ecpay" | "offline" | null;
  trade_no: string | null;
  gateway_txn: string | null;
  reference: string | null;
  renewed_until: string | null;
  void_reason: string | null;
  einvoice_number: string | null;
  einvoice_error: string | null;
  einvoice_at: string | null;
};

export type InvoicePatch = Partial<Omit<Invoice, "id" | "site" | "period" | "created_at">>;

export type InvoicePayment = { trade_no: string; invoice_id: string; amount: number; created_at: string };

const INVOICE_FIELDS = ["buyer_name", "buyer_tax_id", "buyer_email", "buyer_address", "net", "tax", "amount", "status", "paid_at", "paid_via", "trade_no", "gateway_txn", "reference", "renewed_until", "void_reason", "einvoice_number", "einvoice_error", "einvoice_at"] as const;

export interface Store {
  getTenant(site: string): Promise<Tenant | null>;
  putTenant(t: Tenant): Promise<void>;
  /** Forget a purged company's sealed credentials. */
  deleteTenant(site: string): Promise<void>;
  listSites(): Promise<string[]>;
  /** True the first time a key is seen. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  isClaimed(key: string): Promise<boolean>;
  addDeadLetter(site: string, kind: string, body: string, error: string): Promise<void>;
  listDeadLetters(site: string): Promise<DeadLetter[]>;
  takeDeadLetter(id: number): Promise<DeadLetter | null>;
  saveMeeting(m: Meeting): Promise<void>;
  getMeeting(site: string, platform: string, meetingId: string): Promise<Meeting | null>;
  getAccount(site: string): Promise<Account | null>;
  /** Replaces the account and its host names. */
  putAccount(a: Account): Promise<void>;
  listAccounts(): Promise<Account[]>;
  siteForHost(host: string): Promise<string | null>;
  addAccountEvent(site: string, actor: string, action: string, detail?: string): Promise<void>;
  listAccountEvents(site: string): Promise<AccountEvent[]>;
  /** Forget dedupe keys older than the cutoff; per-meeting skip choices are kept. */
  pruneSeen(before: string): Promise<number>;
  /** False when the company already has an open or paid invoice for that period. */
  insertInvoice(inv: Invoice): Promise<boolean>;
  getInvoice(id: string): Promise<Invoice | null>;
  /** One company's invoices, newest first; every company's when `site` is omitted. */
  listInvoices(site?: string): Promise<Invoice[]>;
  /** Applies the patch only while the invoice is still in `from` (when given); true if it did. */
  updateInvoice(id: string, from: InvoiceStatus | null, patch: InvoicePatch): Promise<boolean>;
  addPayment(p: InvoicePayment): Promise<void>;
  getPayment(tradeNo: string): Promise<InvoicePayment | null>;
}

type AccountRow = Omit<Account, "profile" | "usage" | "hosts"> & { profile: string | null; usage: string | null };

function fromRow(row: AccountRow, hosts: string[]): Account {
  return { ...row, profile: row.profile ? JSON.parse(row.profile) : null, usage: row.usage ? JSON.parse(row.usage) : null, hosts };
}

export class D1Store implements Store {
  constructor(private db: D1Database, private key: string) {}

  async getTenant(site: string) {
    const row = await this.db.prepare("SELECT config FROM tenants WHERE site = ?").bind(site).first<{ config: string }>();
    return row ? (JSON.parse(await unseal(row.config, this.key)) as Tenant) : null;
  }

  async putTenant(t: Tenant) {
    const sealed = await seal(JSON.stringify(t), this.key);
    await this.db
      .prepare("INSERT INTO tenants (site, config, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(site) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at")
      .bind(t.site, sealed)
      .run();
  }

  async deleteTenant(site: string) {
    await this.db.prepare("DELETE FROM tenants WHERE site = ?").bind(site).run();
  }

  async listSites() {
    const { results } = await this.db.prepare("SELECT site FROM tenants ORDER BY site").all<{ site: string }>();
    return results.map((r) => r.site);
  }

  async claim(key: string) {
    const res = await this.db.prepare("INSERT OR IGNORE INTO seen (key, created_at) VALUES (?, datetime('now'))").bind(key).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async release(key: string) {
    await this.db.prepare("DELETE FROM seen WHERE key = ?").bind(key).run();
  }

  async isClaimed(key: string) {
    return Boolean(await this.db.prepare("SELECT 1 AS hit FROM seen WHERE key = ?").bind(key).first());
  }

  async addDeadLetter(site: string, kind: string, body: string, error: string) {
    await this.db
      .prepare("INSERT INTO dead_letters (site, kind, body, error, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .bind(site, kind, body, error.slice(0, 2000))
      .run();
  }

  async listDeadLetters(site: string) {
    const { results } = await this.db.prepare("SELECT * FROM dead_letters WHERE site = ? ORDER BY id DESC LIMIT 200").bind(site).all<DeadLetter>();
    return results;
  }

  async takeDeadLetter(id: number) {
    const row = await this.db.prepare("DELETE FROM dead_letters WHERE id = ? RETURNING *").bind(id).first<DeadLetter>();
    return row ?? null;
  }

  async saveMeeting(m: Meeting) {
    await this.db
      .prepare("INSERT OR REPLACE INTO meetings (site, platform, meeting_id, title, attendees, started_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(m.site, m.platform, m.meeting_id, m.title, JSON.stringify(m.attendees), m.started_at)
      .run();
  }

  async getMeeting(site: string, platform: string, meetingId: string) {
    const row = await this.db
      .prepare("SELECT * FROM meetings WHERE site = ? AND platform = ? AND meeting_id = ?")
      .bind(site, platform, meetingId)
      .first<Omit<Meeting, "attendees"> & { attendees: string }>();
    return row ? { ...row, attendees: JSON.parse(row.attendees) as string[] } : null;
  }

  async getAccount(site: string) {
    const row = await this.db.prepare("SELECT * FROM accounts WHERE site = ?").bind(site).first<AccountRow>();
    if (!row) return null;
    const { results } = await this.db.prepare("SELECT host FROM hosts WHERE site = ? ORDER BY host").bind(site).all<{ host: string }>();
    return fromRow(row, results.map((r) => r.host));
  }

  async putAccount(a: Account) {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO accounts (site, company, plan, state, state_reason, trial_ends, renews_on, contact_email, tax_id, billing_address, profile, usage, usage_at, cancelled_at, purged_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(site) DO UPDATE SET company = excluded.company, plan = excluded.plan, state = excluded.state, state_reason = excluded.state_reason,
             trial_ends = excluded.trial_ends, renews_on = excluded.renews_on, contact_email = excluded.contact_email, tax_id = excluded.tax_id,
             billing_address = excluded.billing_address, profile = excluded.profile, usage = excluded.usage, usage_at = excluded.usage_at,
             cancelled_at = excluded.cancelled_at, purged_at = excluded.purged_at, updated_at = excluded.updated_at`,
        )
        .bind(a.site, a.company, a.plan, a.state, a.state_reason ?? null, a.trial_ends ?? null, a.renews_on ?? null, a.contact_email ?? null, a.tax_id ?? null,
          a.billing_address ?? null, a.profile == null ? null : JSON.stringify(a.profile), a.usage == null ? null : JSON.stringify(a.usage), a.usage_at ?? null,
          a.cancelled_at ?? null, a.purged_at ?? null, a.created_at, a.updated_at),
      this.db.prepare("DELETE FROM hosts WHERE site = ?").bind(a.site),
      ...a.hosts.map((h) => this.db.prepare("INSERT INTO hosts (host, site) VALUES (?, ?)").bind(h, a.site)),
    ]);
  }

  async listAccounts() {
    const { results } = await this.db.prepare("SELECT * FROM accounts ORDER BY company").all<AccountRow>();
    const { results: hosts } = await this.db.prepare("SELECT host, site FROM hosts ORDER BY host").all<{ host: string; site: string }>();
    return results.map((r) => fromRow(r, hosts.filter((h) => h.site === r.site).map((h) => h.host)));
  }

  async siteForHost(host: string) {
    const row = await this.db.prepare("SELECT site FROM hosts WHERE host = ?").bind(host).first<{ site: string }>();
    return row?.site ?? null;
  }

  async addAccountEvent(site: string, actor: string, action: string, detail?: string) {
    await this.db
      .prepare("INSERT INTO account_events (site, at, actor, action, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(site, new Date().toISOString(), actor, action, detail ?? null)
      .run();
  }

  async listAccountEvents(site: string) {
    const { results } = await this.db.prepare("SELECT * FROM account_events WHERE site = ? ORDER BY id DESC LIMIT 200").bind(site).all<AccountEvent>();
    return results;
  }

  async pruneSeen(before: string) {
    const res = await this.db.prepare("DELETE FROM seen WHERE created_at < ? AND key NOT LIKE 'skip:%'").bind(before.replace("T", " ").slice(0, 19)).run();
    return res.meta.changes ?? 0;
  }

  async insertInvoice(inv: Invoice) {
    const cols = ["id", "site", "period", "created_at", ...INVOICE_FIELDS] as const;
    const res = await this.db
      .prepare(`INSERT OR IGNORE INTO invoices (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .bind(...cols.map((c) => inv[c] ?? null))
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async getInvoice(id: string) {
    return (await this.db.prepare("SELECT * FROM invoices WHERE id = ?").bind(id).first<Invoice>()) ?? null;
  }

  async listInvoices(site?: string) {
    const q = site
      ? this.db.prepare("SELECT * FROM invoices WHERE site = ? ORDER BY created_at DESC LIMIT 100").bind(site)
      : this.db.prepare("SELECT * FROM invoices ORDER BY created_at DESC LIMIT 5000");
    return (await q.all<Invoice>()).results;
  }

  async updateInvoice(id: string, from: InvoiceStatus | null, patch: InvoicePatch) {
    const keys = INVOICE_FIELDS.filter((k) => patch[k] !== undefined);
    if (!keys.length) return false;
    const res = await this.db
      .prepare(`UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?${from ? " AND status = ?" : ""}`)
      .bind(...keys.map((k) => patch[k] ?? null), id, ...(from ? [from] : []))
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async addPayment(p: InvoicePayment) {
    await this.db.prepare("INSERT INTO invoice_payments (trade_no, invoice_id, amount, created_at) VALUES (?, ?, ?, ?)").bind(p.trade_no, p.invoice_id, p.amount, p.created_at).run();
  }

  async getPayment(tradeNo: string) {
    return (await this.db.prepare("SELECT * FROM invoice_payments WHERE trade_no = ?").bind(tradeNo).first<InvoicePayment>()) ?? null;
  }
}

export class MemoryStore implements Store {
  tenants = new Map<string, Tenant>();
  seen = new Set<string>();
  dead: DeadLetter[] = [];
  meetings = new Map<string, Meeting>();
  accounts = new Map<string, Account>();
  events: AccountEvent[] = [];
  seenAt = new Map<string, string>();

  async getTenant(site: string) {
    return this.tenants.get(site) ?? null;
  }
  async putTenant(t: Tenant) {
    this.tenants.set(t.site, t);
  }
  async deleteTenant(site: string) {
    this.tenants.delete(site);
  }
  async listSites() {
    return [...this.tenants.keys()].sort();
  }
  async claim(key: string) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.seenAt.set(key, new Date().toISOString());
    return true;
  }
  async release(key: string) {
    this.seen.delete(key);
  }
  async isClaimed(key: string) {
    return this.seen.has(key);
  }
  async addDeadLetter(site: string, kind: string, body: string, error: string) {
    this.dead.push({ id: this.dead.length + 1, site, kind, body, error, created_at: new Date().toISOString() });
  }
  async listDeadLetters(site: string) {
    return this.dead.filter((d) => d.site === site);
  }
  async takeDeadLetter(id: number) {
    const i = this.dead.findIndex((d) => d.id === id);
    return i < 0 ? null : this.dead.splice(i, 1)[0];
  }
  async saveMeeting(m: Meeting) {
    this.meetings.set(`${m.site}|${m.platform}|${m.meeting_id}`, m);
  }
  async getMeeting(site: string, platform: string, meetingId: string) {
    return this.meetings.get(`${site}|${platform}|${meetingId}`) ?? null;
  }
  async getAccount(site: string) {
    const a = this.accounts.get(site);
    return a ? structuredClone(a) : null;
  }
  async putAccount(a: Account) {
    this.accounts.set(a.site, structuredClone(a));
  }
  async listAccounts() {
    return [...this.accounts.values()].sort((a, b) => a.company.localeCompare(b.company)).map((a) => structuredClone(a));
  }
  async siteForHost(host: string) {
    return [...this.accounts.values()].find((a) => a.hosts.includes(host))?.site ?? null;
  }
  async addAccountEvent(site: string, actor: string, action: string, detail?: string) {
    this.events.push({ id: this.events.length + 1, site, at: new Date().toISOString(), actor, action, detail: detail ?? null });
  }
  async listAccountEvents(site: string) {
    return this.events.filter((e) => e.site === site).reverse();
  }
  async pruneSeen(before: string) {
    let n = 0;
    for (const [key, at] of this.seenAt) {
      if (at < before && !key.startsWith("skip:")) {
        this.seen.delete(key);
        this.seenAt.delete(key);
        n++;
      }
    }
    return n;
  }
  invoices: Invoice[] = [];
  payments = new Map<string, InvoicePayment>();
  async insertInvoice(inv: Invoice) {
    if (this.invoices.some((i) => i.id === inv.id || (i.site === inv.site && i.period === inv.period && i.status !== "void"))) return false;
    this.invoices.push(structuredClone(inv));
    return true;
  }
  async getInvoice(id: string) {
    const inv = this.invoices.find((i) => i.id === id);
    return inv ? structuredClone(inv) : null;
  }
  async listInvoices(site?: string) {
    return this.invoices.filter((i) => !site || i.site === site).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((i) => structuredClone(i));
  }
  async updateInvoice(id: string, from: InvoiceStatus | null, patch: InvoicePatch) {
    const inv = this.invoices.find((i) => i.id === id);
    if (!inv || (from && inv.status !== from)) return false;
    for (const k of INVOICE_FIELDS) if (patch[k] !== undefined) (inv as Record<string, unknown>)[k] = patch[k];
    return true;
  }
  async addPayment(p: InvoicePayment) {
    if (this.payments.has(p.trade_no)) throw new Error("UNIQUE constraint failed: invoice_payments.trade_no");
    this.payments.set(p.trade_no, { ...p });
  }
  async getPayment(tradeNo: string) {
    const p = this.payments.get(tradeNo);
    return p ? { ...p } : null;
  }
}
