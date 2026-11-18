import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { LedgerError } from "@/lib/ledger/errors";
import { openLedger } from "@/lib/ledger/read";
import { advanceQuote } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

const SALES = new Set(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"]);

/** 同一張單的下一步，寫進測試帳本。不呼叫 ERPNext。 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const body = await readJson<{ doctype?: string; name?: string }>(request);
  if (!body?.doctype || !body.name?.trim()) return refuse("缺少單據");
  if (!SALES.has(body.doctype)) return refuse("這一刀只記報價到收款");
  try {
    const created = await advanceQuote(await openLedger(), body.name.trim(), body.doctype);
    return reply({
      ok: true,
      created: {
        doctype: created.doctype,
        name: created.no,
        grand_total: created.total,
        balance: created.balance,
        received: created.received,
        invoice_status: created.invoiceStatus,
      },
    });
  } catch (error) {
    if (error instanceof LedgerError) return refuse(error.message, error.status);
    return refuse("下一步沒有寫進測試帳本", 500);
  }
}
