import "server-only";
import type { LiveConfig } from "./sources/config";

export type OpenInvoice = { id: string; amount: number; net: number; tax: number; period: string; created_at: string; pay_url: string };

/** Billing integration is unavailable in this deployment. */
export async function openInvoice(_config: LiveConfig): Promise<OpenInvoice | null> {
  return null;
}
