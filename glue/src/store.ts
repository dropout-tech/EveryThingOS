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
};

export type Meeting = { site: string; platform: string; meeting_id: string; title: string; attendees: string[]; started_at: string };

export type DeadLetter = { id: number; site: string; kind: string; body: string; error: string; created_at: string };

export interface Store {
  getTenant(site: string): Promise<Tenant | null>;
  putTenant(t: Tenant): Promise<void>;
  listSites(): Promise<string[]>;
  /** True the first time a key is seen. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
  addDeadLetter(site: string, kind: string, body: string, error: string): Promise<void>;
  listDeadLetters(site: string): Promise<DeadLetter[]>;
  takeDeadLetter(id: number): Promise<DeadLetter | null>;
  saveMeeting(m: Meeting): Promise<void>;
  getMeeting(site: string, platform: string, meetingId: string): Promise<Meeting | null>;
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
}

export class MemoryStore implements Store {
  tenants = new Map<string, Tenant>();
  seen = new Set<string>();
  dead: DeadLetter[] = [];
  meetings = new Map<string, Meeting>();

  async getTenant(site: string) {
    return this.tenants.get(site) ?? null;
  }
  async putTenant(t: Tenant) {
    this.tenants.set(t.site, t);
  }
  async listSites() {
    return [...this.tenants.keys()].sort();
  }
  async claim(key: string) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
  async release(key: string) {
    this.seen.delete(key);
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
}
