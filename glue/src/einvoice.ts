import { aesCbcDecrypt, aesCbcEncrypt, fromBase64, toBase64 } from "./crypto";
import type { Fetch } from "./clients";
import type { GatewayKeys } from "./store";

export type InvoiceInput = {
  name: string;
  customer_name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  grand_total: number;
  net_total: number;
  items: { item_name: string; qty: number; uom?: string; amount: number }[];
};

export type Issued = { number: string; date?: string; random?: string };

/** Every provider implements the same three verbs; switching provider swaps the adapter only. */
export interface EInvoiceProvider {
  issue(inv: InvoiceInput): Promise<Issued>;
  void(number: string, date: string, reason: string): Promise<void>;
  allowance(number: string, date: string, amount: number): Promise<{ allowance_no: string }>;
}

/** PHP `urlencode`, which ECPay's invoice API expects before AES. */
function phpUrlencode(s: string) {
  return encodeURIComponent(s)
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

export async function ecpayInvoiceEncrypt(data: unknown, key: string, iv: string) {
  return toBase64(await aesCbcEncrypt(phpUrlencode(JSON.stringify(data)), key, iv));
}

export async function ecpayInvoiceDecrypt(data: string, key: string, iv: string) {
  const text = await aesCbcDecrypt(fromBase64(data), key, iv);
  return JSON.parse(decodeURIComponent(text.replace(/\+/g, " ")));
}

/** Tax-inclusive line amounts that sum exactly to the invoice total (ECPay rejects any gap). */
export function inclusiveLines(inv: InvoiceInput) {
  const total = Math.round(inv.grand_total);
  const ratio = inv.net_total ? inv.grand_total / inv.net_total : 1;
  const lines = inv.items.map((it, i) => {
    const amount = Math.round(it.amount * ratio);
    return { ItemSeq: i + 1, ItemName: it.item_name.slice(0, 100), ItemCount: it.qty, ItemWord: (it.uom ?? "式").slice(0, 6), ItemPrice: it.qty ? Math.round((amount / it.qty) * 100) / 100 : amount, ItemTaxType: "1", ItemAmount: amount };
  });
  const gap = total - lines.reduce((s, l) => s + l.ItemAmount, 0);
  if (lines.length && gap) {
    const last = lines[lines.length - 1];
    last.ItemAmount += gap;
    last.ItemPrice = last.ItemCount ? Math.round((last.ItemAmount / last.ItemCount) * 100) / 100 : last.ItemAmount;
  }
  return { total, lines };
}

export class ECPayInvoice implements EInvoiceProvider {
  constructor(private keys: GatewayKeys & { sandbox?: boolean }, private fetcher: Fetch) {}

  private get base() {
    return this.keys.sandbox === false ? "https://einvoice.ecpay.com.tw/B2CInvoice" : "https://einvoice-stage.ecpay.com.tw/B2CInvoice";
  }

  private async post(path: string, data: Record<string, unknown>) {
    const body = {
      MerchantID: this.keys.merchant_id,
      RqHeader: { Timestamp: Math.floor(Date.now() / 1000) },
      Data: await ecpayInvoiceEncrypt({ MerchantID: this.keys.merchant_id, ...data }, this.keys.hash_key, this.keys.hash_iv),
    };
    const res = await this.fetcher(`${this.base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`ecpay invoice ${path} HTTP ${res.status}`);
    const json = (await res.json()) as { TransCode: number; TransMsg: string; Data?: string };
    if (json.TransCode !== 1 || !json.Data) throw new Error(`ecpay invoice ${path}: ${json.TransMsg}`);
    const out = await ecpayInvoiceDecrypt(json.Data, this.keys.hash_key, this.keys.hash_iv);
    if (out.RtnCode !== 1) throw new Error(`ecpay invoice ${path}: ${out.RtnMsg}`);
    return out as Record<string, string>;
  }

  async issue(inv: InvoiceInput): Promise<Issued> {
    const b2b = Boolean(inv.tax_id);
    const { total, lines } = inclusiveLines(inv);
    const out = await this.post("Issue", {
      RelateNumber: inv.name.replace(/[^A-Za-z0-9]/g, "").slice(-30),
      CustomerID: "",
      CustomerIdentifier: inv.tax_id ?? "",
      CustomerName: inv.customer_name.slice(0, 60),
      CustomerAddr: (inv.address ?? "").slice(0, 100),
      CustomerPhone: inv.phone ?? "",
      CustomerEmail: inv.email ?? "",
      ClearanceMark: "",
      Print: b2b ? "1" : "0",
      Donation: "0",
      LoveCode: "",
      CarrierType: "",
      CarrierNum: "",
      TaxType: "1",
      SalesAmount: total,
      InvoiceRemark: inv.name,
      InvType: "07",
      vat: "1",
      Items: lines,
    });
    return { number: out.InvoiceNo, date: out.InvoiceDate, random: out.RandomNumber };
  }

  async void(number: string, date: string, reason: string) {
    await this.post("Invalid", { InvoiceNo: number, InvoiceDate: date.slice(0, 10), Reason: reason.slice(0, 20) });
  }

  async allowance(number: string, date: string, amount: number) {
    const out = await this.post("Allowance", {
      InvoiceNo: number,
      InvoiceDate: date.slice(0, 10),
      AllowanceNotify: "N",
      AllowanceAmount: Math.round(amount),
      Items: [{ ItemSeq: 1, ItemName: "折讓", ItemCount: 1, ItemWord: "式", ItemPrice: Math.round(amount), ItemTaxType: "1", ItemAmount: Math.round(amount) }],
    });
    return { allowance_no: out.IA_Allow_No };
  }
}
