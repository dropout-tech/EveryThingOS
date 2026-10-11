import { Chatwoot, ERPNext, UpstreamError, type Fetch } from "./clients";
import { ECPayInvoice, type EInvoiceProvider, type InvoiceInput } from "./einvoice";
import { sendConfirmation, type MailEvent, type SendEmail } from "./mail";
import { summarize, Vexa, type Ai, type MeetingLink } from "./meetings";
import type { ApiStore } from "./apiStore";
import type { Store, Tenant } from "./store";
import { deliver, fanOut, type WebhookJob } from "./webhooks";

export type ErpEvent = {
  name: string;
  event_type: string;
  idempotency_key: string;
  party_type?: string | null;
  party?: string | null;
  reference_doctype?: string | null;
  reference_name?: string | null;
  payload?: unknown;
};

export type Job =
  | { kind: "chatwoot"; site: string; conversation_id: string; channel: string; external_id: string; source_account: string; name?: string; email?: string; phone?: string; url?: string }
  | { kind: "form"; site: string; form_id: string; email: string; name?: string; phone?: string; consent: boolean; wording_version?: string; source?: string; message?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; origin: string }
  | { kind: "unsubscribe"; site: string; email: string; source: string }
  | { kind: "erpnext_event"; site: string; event: ErpEvent }
  | { kind: "mail"; site: string; event: MailEvent }
  | { kind: "payment"; site: string; gateway: "ecpay" | "newebpay"; trade_no: string; amount: number; gateway_txn?: string; raw?: unknown }
  | { kind: "meeting_start"; site: string; link: MeetingLink; title: string; attendees: string[]; start: string }
  | { kind: "meeting_done"; site: string; platform: string; meeting_id: string }
  | WebhookJob;

export type Deps = {
  store: Store;
  fetcher: Fetch;
  email?: SendEmail;
  ai?: Ai;
  summaryModel: string;
  aiGateway?: string;
  einvoice?: (t: Tenant) => EInvoiceProvider | null;
  /** Outbound webhooks; both unset means the company has none to send. */
  api?: ApiStore;
  queue?: { send(job: Job): Promise<unknown> };
};

export const DO_NOT_PUSH_LABEL = "勿推播";

export class PermanentError extends Error {}

function defaultEinvoice(t: Tenant, fetcher: Fetch): EInvoiceProvider | null {
  return t.einvoice?.provider === "ecpay" ? new ECPayInvoice(t.einvoice, fetcher) : null;
}

export async function runJob(job: Job, deps: Deps): Promise<unknown> {
  if (job.kind === "webhook") return deliver(job, deps);
  const tenant = await deps.store.getTenant(job.site);
  if (!tenant) throw new PermanentError(`unknown site ${job.site}`);
  const erp = new ERPNext(tenant, deps.fetcher);

  switch (job.kind) {
    case "chatwoot": {
      const party = await erp.api<{ party_type: string; party: string }>("resolve_party", {
        channel: job.channel,
        external_id: job.external_id,
        source_account: job.source_account,
        display_name: job.name,
        email: job.email,
        phone: job.phone,
      });
      return erp.api("record_event", {
        event_type: "message_received",
        idempotency_key: `chatwoot:${job.conversation_id}`,
        party_type: party.party_type,
        party: party.party,
        channel: job.channel,
        external_id: job.external_id,
        source_system: "chatwoot",
        payload: { url: job.url },
      });
    }

    case "form": {
      const lead = await erp.api<{ consent_token?: string; created: boolean }>("capture_lead", {
        form_id: job.form_id,
        email: job.email,
        display_name: job.name,
        phone: job.phone,
        consent_marketing: job.consent ? 1 : 0,
        wording_version: job.wording_version,
        source: job.source,
        message: job.message,
        utm_source: job.utm_source,
        utm_medium: job.utm_medium,
        utm_campaign: job.utm_campaign,
      });
      if (lead.consent_token && deps.email && (await deps.store.claim(`confirm-mail:${job.site}:${lead.consent_token}`))) {
        const url = `${job.origin}/confirm/${encodeURIComponent(job.site)}?token=${encodeURIComponent(lead.consent_token)}`;
        try {
          await sendConfirmation(deps.email, tenant, job.email, url, job.name);
        } catch (e) {
          await deps.store.release(`confirm-mail:${job.site}:${lead.consent_token}`);
          throw e;
        }
      }
      return lead;
    }

    case "unsubscribe": {
      const result = await erp.api<{ emails: string[]; identities: { channel: string; external_id: string }[] }>("unsubscribe", {
        email: job.email,
        source: job.source,
      });
      const chatwoot = new Chatwoot(tenant, deps.fetcher);
      if (chatwoot.enabled) {
        for (const q of [...result.identities.map((i) => i.external_id), ...result.emails]) {
          const contact = await chatwoot.findContact(q);
          if (contact) await chatwoot.addLabels(contact.id, [DO_NOT_PUSH_LABEL]);
        }
      }
      return result;
    }

    case "erpnext_event":
      await fanOut(job.site, job.event, deps);
      return handleErpEvent(job.event, tenant, erp, deps);

    case "mail": {
      const e = job.event;
      if (e.kind === "opened" || e.kind === "clicked")
        return erp.api("record_letter_event", { kind: e.kind, event_id: e.id, email: e.email, url: e.url, campaign: e.campaign, message_id: e.messageId });
      if (e.kind === "bounced") return erp.api("mark_bounced", { email: e.email, message_id: e.messageId, reason: e.reason, hard: e.hard ? 1 : 0 });
      if (e.kind === "complained") return erp.api("unsubscribe", { email: e.email, source: "complaint" });
      return null;
    }

    case "payment":
      return erp.api("record_payment", { gateway: job.gateway, trade_no: job.trade_no, amount: job.amount, gateway_txn: job.gateway_txn, raw: job.raw });

    case "meeting_start": {
      if (!tenant.vexa) throw new PermanentError("meeting bot not configured");
      await deps.store.saveMeeting({ site: job.site, platform: job.link.platform, meeting_id: job.link.id, title: job.title, attendees: job.attendees, started_at: job.start });
      return new Vexa(tenant.vexa, deps.fetcher).requestBot(job.link, tenant.vexa.language ?? "zh");
    }

    case "meeting_done": {
      if (!tenant.vexa || !deps.ai) throw new PermanentError("meeting bot or AI not configured");
      const meeting = await deps.store.getMeeting(job.site, job.platform, job.meeting_id);
      const { text } = await new Vexa(tenant.vexa, deps.fetcher).transcript(job.platform, job.meeting_id);
      if (!text.trim()) return { skipped: "empty transcript" };
      const summary = await summarize(deps.ai, deps.summaryModel, text, deps.aiGateway);
      return erp.api("record_meeting", {
        meeting_id: job.meeting_id,
        platform: job.platform,
        summary: meeting?.title ? `${meeting.title}\n${summary}` : summary,
        attendees: meeting?.attendees ?? [],
        started_at: meeting?.started_at?.replace("T", " ").slice(0, 19),
      });
    }
  }
}

async function handleErpEvent(event: ErpEvent, tenant: Tenant, erp: ERPNext, deps: Deps) {
  if ((event.event_type === "won" || event.event_type === "paid") && event.party_type && event.party) {
    return erp.api("update_segments", { event_type: event.event_type, party_type: event.party_type, party: event.party, reference: event.reference_name });
  }
  if (event.event_type === "invoiced" && event.reference_doctype === "Sales Invoice" && event.reference_name) {
    const provider = (deps.einvoice ?? ((t) => defaultEinvoice(t, deps.fetcher)))(tenant);
    if (!provider) return erp.api("set_einvoice", { sales_invoice: event.reference_name, status: "待上傳" });
    const inv = await erp.get<Record<string, any>>("Sales Invoice", event.reference_name);
    if (inv.is_return) return erp.api("set_einvoice", { sales_invoice: inv.name, status: "待上傳", error: "退貨請在加值中心開折讓" });
    if (inv.dropout_einvoice_number) return { skipped: "already issued" };
    const customer = await erp.get<Record<string, any>>("Customer", inv.customer);
    const input: InvoiceInput = {
      name: inv.name,
      customer_name: inv.customer_name,
      tax_id: inv.tax_id || customer.tax_id || null,
      email: inv.contact_email || customer.email_id || null,
      phone: customer.mobile_no || null,
      address: inv.address_display ? String(inv.address_display).replace(/<[^>]+>/g, " ").trim() : null,
      grand_total: Number(inv.rounded_total || inv.grand_total),
      net_total: Number(inv.net_total),
      items: (inv.items as any[]).map((it) => ({ item_name: it.item_name, qty: Number(it.qty), uom: it.uom, amount: Number(it.amount) })),
    };
    const issued = await provider.issue(input);
    return erp.api("set_einvoice", { sales_invoice: inv.name, status: "已開立", number: issued.number });
  }
  return { skipped: event.event_type };
}

export function isRetryable(e: unknown): boolean {
  if (e instanceof PermanentError) return false;
  if (e instanceof UpstreamError) return e.retryable;
  return true;
}

/** Best-effort side effects when a job is given up on, so people see it in ERPNext too. */
export async function onGiveUp(job: Job, error: string, deps: Deps) {
  if (job.kind === "erpnext_event" && job.event.event_type === "invoiced" && job.event.reference_name) {
    const tenant = await deps.store.getTenant(job.site);
    if (tenant) {
      await new ERPNext(tenant, deps.fetcher)
        .api("set_einvoice", { sales_invoice: job.event.reference_name, status: "失敗", error: error.slice(0, 500) })
        .catch(() => undefined);
    }
  }
}
