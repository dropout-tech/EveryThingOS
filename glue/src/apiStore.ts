import { seal, unseal } from "./crypto";

export type Scope = "read" | "write";

export type ApiKey = {
  id: string;
  site: string;
  prefix: string;
  hash: string;
  label: string;
  scopes: Scope[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type Webhook = {
  id: string;
  site: string;
  url: string;
  events: string[];
  /** Plain signing secret; sealed at rest. */
  secret: string;
  label: string;
  created_by: string;
  created_at: string;
  enabled: boolean;
  /** Consecutive failed delivery attempts. */
  failures: number;
  disabled_reason: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
};

export type Delivery = {
  id: number;
  webhook_id: string;
  site: string;
  event_id: string;
  event_type: string;
  attempt: number;
  status: number | null;
  ok: boolean;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

export const DELIVERY_LOG = 50;

export interface ApiStore {
  addKey(k: ApiKey): Promise<void>;
  keyByHash(hash: string): Promise<ApiKey | null>;
  listKeys(site: string): Promise<ApiKey[]>;
  revokeKey(site: string, id: string, at: string): Promise<boolean>;
  touchKey(id: string, at: string): Promise<void>;
  addWebhook(w: Webhook): Promise<void>;
  getWebhook(site: string, id: string): Promise<Webhook | null>;
  listWebhooks(site: string): Promise<Webhook[]>;
  updateWebhook(site: string, id: string, patch: Partial<Pick<Webhook, "enabled" | "failures" | "disabled_reason" | "last_success_at" | "last_failure_at">>): Promise<void>;
  deleteWebhook(site: string, id: string): Promise<boolean>;
  /** Keeps the newest DELIVERY_LOG rows per webhook. */
  addDelivery(d: Omit<Delivery, "id">): Promise<void>;
  listDeliveries(site: string, webhookId: string): Promise<Delivery[]>;
}

type KeyRow = Omit<ApiKey, "scopes"> & { scopes: string };
type HookRow = Omit<Webhook, "events" | "enabled"> & { events: string; enabled: number };
type DeliveryRow = Omit<Delivery, "ok"> & { ok: number };

const HOOK_COLUMNS = ["enabled", "failures", "disabled_reason", "last_success_at", "last_failure_at"] as const;

const keyFromRow = (r: KeyRow): ApiKey => ({ ...r, scopes: r.scopes.split(",").filter(Boolean) as Scope[] });
const deliveryFromRow = (r: DeliveryRow): Delivery => ({ ...r, ok: Boolean(r.ok) });

export class D1ApiStore implements ApiStore {
  constructor(private db: D1Database, private key: string) {}

  private async hookFromRow(r: HookRow): Promise<Webhook> {
    return { ...r, events: JSON.parse(r.events) as string[], enabled: Boolean(r.enabled), secret: await unseal(r.secret, this.key) };
  }

  async addKey(k: ApiKey) {
    await this.db
      .prepare("INSERT INTO api_keys (id, site, prefix, hash, label, scopes, created_by, created_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)")
      .bind(k.id, k.site, k.prefix, k.hash, k.label, k.scopes.join(","), k.created_by, k.created_at)
      .run();
  }

  async keyByHash(hash: string) {
    const row = await this.db.prepare("SELECT * FROM api_keys WHERE hash = ?").bind(hash).first<KeyRow>();
    return row ? keyFromRow(row) : null;
  }

  async listKeys(site: string) {
    const { results } = await this.db.prepare("SELECT * FROM api_keys WHERE site = ? ORDER BY created_at DESC LIMIT 100").bind(site).all<KeyRow>();
    return results.map(keyFromRow);
  }

  async revokeKey(site: string, id: string, at: string) {
    const res = await this.db.prepare("UPDATE api_keys SET revoked_at = ? WHERE site = ? AND id = ? AND revoked_at IS NULL").bind(at, site, id).run();
    return (res.meta.changes ?? 0) > 0;
  }

  async touchKey(id: string, at: string) {
    await this.db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(at, id).run();
  }

  async addWebhook(w: Webhook) {
    await this.db
      .prepare("INSERT INTO webhooks (id, site, url, events, secret, label, created_by, created_at, enabled, failures) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)")
      .bind(w.id, w.site, w.url, JSON.stringify(w.events), await seal(w.secret, this.key), w.label, w.created_by, w.created_at, w.enabled ? 1 : 0)
      .run();
  }

  async getWebhook(site: string, id: string) {
    const row = await this.db.prepare("SELECT * FROM webhooks WHERE site = ? AND id = ?").bind(site, id).first<HookRow>();
    return row ? this.hookFromRow(row) : null;
  }

  async listWebhooks(site: string) {
    const { results } = await this.db.prepare("SELECT * FROM webhooks WHERE site = ? ORDER BY created_at").bind(site).all<HookRow>();
    return Promise.all(results.map((r) => this.hookFromRow(r)));
  }

  async updateWebhook(site: string, id: string, patch: Parameters<ApiStore["updateWebhook"]>[2]) {
    const cols = HOOK_COLUMNS.filter((c) => c in patch);
    if (!cols.length) return;
    const values = cols.map((c) => (c === "enabled" ? (patch.enabled ? 1 : 0) : (patch[c] ?? null)));
    await this.db
      .prepare(`UPDATE webhooks SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE site = ? AND id = ?`)
      .bind(...values, site, id)
      .run();
  }

  async deleteWebhook(site: string, id: string) {
    const res = await this.db.prepare("DELETE FROM webhooks WHERE site = ? AND id = ?").bind(site, id).run();
    if ((res.meta.changes ?? 0) === 0) return false;
    await this.db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ?").bind(id).run();
    return true;
  }

  async addDelivery(d: Omit<Delivery, "id">) {
    await this.db.batch([
      this.db
        .prepare("INSERT INTO webhook_deliveries (webhook_id, site, event_id, event_type, attempt, status, ok, error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(d.webhook_id, d.site, d.event_id, d.event_type, d.attempt, d.status, d.ok ? 1 : 0, d.error, d.duration_ms, d.created_at),
      this.db
        .prepare("DELETE FROM webhook_deliveries WHERE webhook_id = ? AND id NOT IN (SELECT id FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?)")
        .bind(d.webhook_id, d.webhook_id, DELIVERY_LOG),
    ]);
  }

  async listDeliveries(site: string, webhookId: string) {
    const { results } = await this.db
      .prepare("SELECT * FROM webhook_deliveries WHERE site = ? AND webhook_id = ? ORDER BY id DESC LIMIT ?")
      .bind(site, webhookId, DELIVERY_LOG)
      .all<DeliveryRow>();
    return results.map(deliveryFromRow);
  }
}

export class MemoryApiStore implements ApiStore {
  keys: ApiKey[] = [];
  hooks: Webhook[] = [];
  deliveries: Delivery[] = [];

  async addKey(k: ApiKey) {
    this.keys.push(structuredClone(k));
  }
  async keyByHash(hash: string) {
    const k = this.keys.find((x) => x.hash === hash);
    return k ? structuredClone(k) : null;
  }
  async listKeys(site: string) {
    return this.keys.filter((k) => k.site === site).reverse().map((k) => structuredClone(k));
  }
  async revokeKey(site: string, id: string, at: string) {
    const k = this.keys.find((x) => x.site === site && x.id === id && !x.revoked_at);
    if (!k) return false;
    k.revoked_at = at;
    return true;
  }
  async touchKey(id: string, at: string) {
    const k = this.keys.find((x) => x.id === id);
    if (k) k.last_used_at = at;
  }
  async addWebhook(w: Webhook) {
    this.hooks.push(structuredClone(w));
  }
  async getWebhook(site: string, id: string) {
    const w = this.hooks.find((x) => x.site === site && x.id === id);
    return w ? structuredClone(w) : null;
  }
  async listWebhooks(site: string) {
    return this.hooks.filter((w) => w.site === site).map((w) => structuredClone(w));
  }
  async updateWebhook(site: string, id: string, patch: Parameters<ApiStore["updateWebhook"]>[2]) {
    const w = this.hooks.find((x) => x.site === site && x.id === id);
    if (w) Object.assign(w, patch);
  }
  async deleteWebhook(site: string, id: string) {
    const before = this.hooks.length;
    this.hooks = this.hooks.filter((w) => !(w.site === site && w.id === id));
    this.deliveries = this.deliveries.filter((d) => d.webhook_id !== id);
    return this.hooks.length < before;
  }
  async addDelivery(d: Omit<Delivery, "id">) {
    this.deliveries.push({ ...d, id: this.deliveries.length + 1 });
    const mine = this.deliveries.filter((x) => x.webhook_id === d.webhook_id);
    if (mine.length > DELIVERY_LOG) {
      const drop = new Set(mine.slice(0, mine.length - DELIVERY_LOG).map((x) => x.id));
      this.deliveries = this.deliveries.filter((x) => !drop.has(x.id));
    }
  }
  async listDeliveries(site: string, webhookId: string) {
    return this.deliveries.filter((d) => d.site === site && d.webhook_id === webhookId).reverse();
  }
}
