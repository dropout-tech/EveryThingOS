export type ApiKeyRow = {
  id: string;
  prefix: string;
  display: string;
  label: string;
  scopes: ("read" | "write")[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type WebhookRow = {
  id: string;
  url: string;
  events: string[];
  label: string;
  created_by: string;
  created_at: string;
  enabled: boolean;
  failures: number;
  disabled_reason: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
};

export type DeliveryRow = { id: number; event_id: string; event_type: string; attempt: number; status: number | null; ok: boolean; error: string | null; duration_ms: number | null; created_at: string };

export type Integrations = {
  apiBase: string;
  keys: ApiKeyRow[];
  maxKeys: number;
  webhooks: WebhookRow[];
  maxWebhooks: number;
  events: string[];
  deliveries: Record<string, DeliveryRow[]>;
};

export const EVENT_LABEL: Record<string, string> = {
  "customer.created": "新客戶建檔",
  "lead.created": "新的潛在客人",
  "quote.sent": "報價送出",
  "sales_order.submitted": "訂單成立",
  "delivery.submitted": "出貨完成",
  "invoice.submitted": "開了發票",
  "payment.received": "收到錢",
  ping: "測試",
};

export const DOCS_URL = "https://github.com/dropout-tech/EveryThingOS/blob/main/docs/PUBLIC-API.md";

export const KEY_ID = /^key_[0-9a-f]{16}$/;
export const HOOK_ID = /^wh_[0-9a-f]{16}$/;
