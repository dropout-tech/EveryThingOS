import { readActor } from "@/lib/accounts/guard";
import type { NextRequest } from "next/server";
import { readJson, refuse, reply, sameOrigin } from "@/lib/actions";
import { LedgerError } from "@/lib/ledger/errors";
import { priceLines } from "@/lib/ledger/money";
import { openLedger } from "@/lib/ledger/read";
import { cleanPartyName, createQuote } from "@/lib/ledger/store";

export const dynamic = "force-dynamic";

type Body = { party_type?: string; party?: string; items?: { item_code?: string; qty?: number; rate?: number | null }[] };

/** 開一張報價進測試帳本。合計只信伺服器，不呼叫 ERPNext。 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return refuse("這個請求不是從 EveryThingOS 送出的", 403);
  const actor = await readActor();
  if (actor.status !== "ok") return refuse(actor.status === "error" ? actor.message : "請先登入", actor.status === "error" && actor.kind === "unreachable" ? 503 : 401);
  const body = await readJson<Body>(request);
  const party = cleanPartyName(body?.party ?? "");
  const partyType = body?.party_type === "Lead" ? "Lead" : body?.party_type === "Customer" ? "Customer" : null;
  if (!party || !partyType) return refuse("請選客人");
  const items = (body?.items ?? []).slice(0, 50).map((item) => ({
    itemCode: item.item_code,
    qty: Number(item.qty),
    rate: item.rate == null ? Number.NaN : Number(item.rate),
  }));
  const priced = priceLines(items);
  if (!priced.ok) return refuse(priced.error);
  try {
    const created = await createQuote(await openLedger(), actor.account.companyId, { party, partyType, priced });
    return reply({
      ok: true,
      created: {
        doctype: created.doctype,
        name: created.no,
        grand_total: created.total,
        untaxed: created.untaxed,
        tax: created.tax,
        balance: created.balance,
        invoice_status: created.invoiceStatus,
      },
    });
  } catch (error) {
    if (error instanceof LedgerError) return refuse(error.message, error.status);
    return refuse("報價沒有寫進測試帳本", 500);
  }
}
