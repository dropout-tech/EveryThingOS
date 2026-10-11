import "server-only";
import type { LiveConfig } from "./sources/config";

export type OpenInvoice = { id: string; amount: number; net: number; tax: number; period: string; created_at: string; pay_url: string };

/**
 * This company's unpaid DropOut renewal invoice, read with the shell's token for
 * the site its own host resolved to. Null in practice mode or when the glue is
 * unreachable, so the contract notice still shows without the button.
 */
export async function openInvoice(config: LiveConfig): Promise<OpenInvoice | null> {
  const glue = config.glue;
  if (!glue || !config.tenant) return null;
  try {
    const res = await fetch(`${glue.url}/admin/tenants/${encodeURIComponent(config.tenant.site)}/billing`, {
      headers: { authorization: `Bearer ${glue.adminToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { invoice: OpenInvoice | null };
    return body.invoice && /^https?:\/\//.test(body.invoice.pay_url) ? body.invoice : null;
  } catch {
    return null;
  }
}
