import Link from "next/link";
import { ApiBoard } from "@/components/ApiBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import type { Integrations } from "@/lib/integrations";
import { loadIntegrations } from "@/lib/integrations-server";

export const metadata = { title: "對外 API 與 Webhook" };

const DEMO: Integrations = {
  apiBase: "https://glue.example.tw/v1",
  maxKeys: 10,
  maxWebhooks: 5,
  events: ["customer.created", "lead.created", "quote.sent", "sales_order.submitted", "delivery.submitted", "invoice.submitted", "payment.received"],
  keys: [
    { id: "key_demo0000000001", prefix: "dok_live_3f9a1c", display: "dok_live_3f9a1c…", label: "蝦皮訂單同步", scopes: ["read", "write"], created_by: "boss@example.tw", created_at: "2026-09-02T02:10:00Z", last_used_at: "2026-10-11T03:58:00Z", revoked_at: null },
    { id: "key_demo0000000002", prefix: "dok_live_b27e40", display: "dok_live_b27e40…", label: "會計師事務所匯出", scopes: ["read"], created_by: "boss@example.tw", created_at: "2026-09-15T06:30:00Z", last_used_at: "2026-10-01T01:00:00Z", revoked_at: null },
  ],
  webhooks: [
    {
      id: "wh_demo00000000001",
      url: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
      events: ["sales_order.submitted", "payment.received"],
      label: "Zapier：訂單通知到 LINE 群組",
      created_by: "boss@example.tw",
      created_at: "2026-09-20T08:00:00Z",
      enabled: true,
      failures: 0,
      disabled_reason: null,
      last_success_at: "2026-10-11T02:41:00Z",
      last_failure_at: null,
    },
  ],
  deliveries: {
    wh_demo00000000001: [
      { id: 2, event_id: "evt_demo2", event_type: "payment.received", attempt: 1, status: 200, ok: true, error: null, duration_ms: 182, created_at: "2026-10-11T02:41:00Z" },
      { id: 1, event_id: "evt_demo1", event_type: "sales_order.submitted", attempt: 2, status: 200, ok: true, error: null, duration_ms: 240, created_at: "2026-10-10T07:12:00Z" },
    ],
  },
};

export default async function ApiSettingsPage() {
  const source = await loadIntegrations();
  return (
    <ModuleFrame
      kicker="設定"
      title="對外 API 與 Webhook"
      hint="讓蝦皮、momo、會計師、你們自己的程式或 Zapier／n8n／Make 讀寫客人與單據；有新訂單、收到錢時主動通知它們。資料一樣以 ERPNext 為準。"
    >
      {source.origin === "denied" ? (
        <p className="glass p-5 text-sm text-cream-dim">{source.message}。請公司裡職務是「老闆」的人來設定。</p>
      ) : source.origin === "error" ? (
        <p className="glass p-5 text-sm text-orange">暫時讀不到設定：{source.message}</p>
      ) : (
        <ApiBoard data={source.origin === "live" ? source.data : DEMO} live={source.origin === "live"} />
      )}
      <p className="text-sm text-cream-dim">
        <Link href="/workspace/settings" className="hover:text-cream">
          ← 回設定
        </Link>
      </p>
    </ModuleFrame>
  );
}
