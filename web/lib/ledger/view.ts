import { nextLabel, type SalesDoc, type SalesStep } from "../erp";
import type { IndustryPack } from "../types";
import type { DocKind, LedgerHead } from "./types";

const STEP: Record<DocKind, SalesStep> = {
  quotation: "quote",
  order: "order",
  delivery: "fulfill",
  invoice: "invoice",
  receipt: "paid",
};

const DOCTYPE: Record<DocKind, string> = {
  quotation: "Quotation",
  order: "Sales Order",
  delivery: "Delivery Note",
  invoice: "Sales Invoice",
  receipt: "Payment Entry",
};

export function ledgerToSalesDoc(head: LedgerHead, pack: Pick<IndustryPack, "fulfillment" | "modules">): SalesDoc {
  const step = STEP[head.kind];
  return {
    no: head.no,
    party: head.party,
    item: head.item,
    qty: head.qty,
    amount: head.untaxed,
    balance: head.balance,
    tax: head.tax,
    taxable: true,
    step,
    next: nextLabel(step, pack),
    doctype: DOCTYPE[head.kind],
    invoiceStatus: head.invoiceStatus,
  };
}
