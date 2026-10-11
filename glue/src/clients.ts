import type { Tenant } from "./store";

export type Fetch = typeof fetch;

/** 4xx means the request itself is wrong; retrying will not help. */
export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
  get retryable() {
    return this.status >= 500 || this.status === 429 || this.status === 0;
  }
}

async function call(fetcher: Fetch, url: string, init: RequestInit, label: string) {
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch (e) {
    throw new UpstreamError(`${label}: ${(e as Error).message}`, 0);
  }
  const text = await res.text();
  if (!res.ok) throw new UpstreamError(`${label} ${res.status}: ${text.slice(0, 500)}`, res.status);
  return text ? JSON.parse(text) : null;
}

export class ERPNext {
  constructor(private t: Tenant, private fetcher: Fetch) {}

  private headers() {
    return {
      Authorization: `token ${this.t.erpnext_key}:${this.t.erpnext_secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Frappe multi-tenant benches route by Host; behind a tunnel the URL host may differ.
      "X-Frappe-Site-Name": this.t.site,
    };
  }

  async method<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const body = await call(
      this.fetcher,
      `${this.t.erpnext_url}/api/method/${name}`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(args) },
      `erpnext ${name}`,
    );
    return body?.message as T;
  }

  async get<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
    const body = await call(
      this.fetcher,
      `${this.t.erpnext_url}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      { headers: this.headers() },
      `erpnext get ${doctype}`,
    );
    return body?.data as T;
  }

  /** Frappe REST list. Callers pass fixed field lists and filters they built themselves, never client input as-is. */
  async list<T = Record<string, unknown>>(doctype: string, q: { fields: readonly string[]; filters: unknown[][]; orderBy: string; start: number; limit: number }): Promise<T[]> {
    const params = new URLSearchParams({
      fields: JSON.stringify(q.fields),
      filters: JSON.stringify(q.filters),
      order_by: q.orderBy,
      limit_start: String(q.start),
      limit_page_length: String(q.limit),
    });
    const body = await call(
      this.fetcher,
      `${this.t.erpnext_url}/api/resource/${encodeURIComponent(doctype)}?${params}`,
      { headers: this.headers() },
      `erpnext list ${doctype}`,
    );
    return (body?.data ?? []) as T[];
  }

  /** Frappe REST insert; the document runs through its normal validation and permissions. */
  async insert<T = Record<string, unknown>>(doctype: string, doc: Record<string, unknown>): Promise<T> {
    const body = await call(
      this.fetcher,
      `${this.t.erpnext_url}/api/resource/${encodeURIComponent(doctype)}`,
      { method: "POST", headers: this.headers(), body: JSON.stringify(doc) },
      `erpnext insert ${doctype}`,
    );
    return body?.data as T;
  }

  api<T = unknown>(fn: string, args: Record<string, unknown> = {}) {
    return this.method<T>(`dropout_core.api.${fn}`, args);
  }
}

export class Chatwoot {
  constructor(private t: Tenant, private fetcher: Fetch) {}

  get enabled() {
    return Boolean(this.t.chatwoot_url && this.t.chatwoot_token && this.t.chatwoot_account_id);
  }

  private url(path: string) {
    return `${this.t.chatwoot_url}/api/v1/accounts/${this.t.chatwoot_account_id}${path}`;
  }

  private headers() {
    return { api_access_token: this.t.chatwoot_token ?? "", "Content-Type": "application/json" };
  }

  async findContact(q: string): Promise<{ id: number } | null> {
    const body = await call(this.fetcher, this.url(`/contacts/search?q=${encodeURIComponent(q)}`), { headers: this.headers() }, "chatwoot search");
    return body?.payload?.[0] ?? null;
  }

  /** Chatwoot's POST replaces the label list, so merge with what is there. */
  async addLabels(contactId: number, labels: string[]) {
    const path = this.url(`/contacts/${contactId}/labels`);
    const current = await call(this.fetcher, path, { headers: this.headers() }, "chatwoot labels");
    const merged = [...new Set([...(current?.payload ?? []), ...labels])];
    return call(this.fetcher, path, { method: "POST", headers: this.headers(), body: JSON.stringify({ labels: merged }) }, "chatwoot labels");
  }
}
