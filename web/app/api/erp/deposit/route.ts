import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { LedgerError } from "@/lib/ledger/errors";
import { openLedger } from "@/lib/ledger/read";
import { recordPayment } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

type Body = { sales_order?: string; amount?: number };

/** 記一筆收款到測試帳本。金額收成整數新台幣，不呼叫 ERPNext。 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const body = await readJson<Body>(request);
  if (!body?.sales_order?.trim()) return refuse("請指定訂單");
  try {
    const created = await recordPayment(await openLedger(), body.sales_order.trim(), Number(body.amount));
    return reply({
      ok: true,
      created: {
        doctype: "Payment Entry",
        name: created.no,
        balance: created.balance,
        received: created.received,
        invoice_status: created.invoiceStatus,
      },
    });
  } catch (error) {
    if (error instanceof LedgerError) return refuse(error.message, error.status);
    return refuse("收款沒有寫進測試帳本", 500);
  }
}
