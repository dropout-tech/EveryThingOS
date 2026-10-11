import { aesCbcDecrypt, fromHex, safeEqual, sha256Hex } from "./crypto";

/** Python `quote_plus` then lower-case, the encoding ECPay's own SDKs use. */
function ecpayEncode(s: string): string {
  const encoded = encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .toLowerCase();
  return encoded
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

export async function ecpayCheckMacValue(params: Record<string, string>, hashKey: string, hashIv: string): Promise<string> {
  const keys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  const raw = keys.map((k) => `${k}=${params[k]}`).join("&");
  return (await sha256Hex(ecpayEncode(`HashKey=${hashKey}&${raw}&HashIV=${hashIv}`))).toUpperCase();
}

export async function ecpayVerify(params: Record<string, string>, hashKey: string, hashIv: string): Promise<boolean> {
  const given = (params.CheckMacValue ?? "").toUpperCase();
  return given.length > 0 && safeEqual(given, await ecpayCheckMacValue(params, hashKey, hashIv));
}

export async function newebpayTradeSha(tradeInfo: string, hashKey: string, hashIv: string): Promise<string> {
  return (await sha256Hex(`HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIv}`)).toUpperCase();
}

export type NewebPayResult = {
  Status: string;
  Message?: string;
  Result?: { MerchantOrderNo: string; Amt: number | string; TradeNo?: string; PayTime?: string };
};

export async function newebpayDecode(form: Record<string, string>, hashKey: string, hashIv: string): Promise<NewebPayResult | null> {
  const expected = await newebpayTradeSha(form.TradeInfo ?? "", hashKey, hashIv);
  if (!form.TradeSha || !safeEqual(form.TradeSha.toUpperCase(), expected)) return null;
  const text = await aesCbcDecrypt(fromHex(form.TradeInfo), hashKey, hashIv);
  try {
    return JSON.parse(text) as NewebPayResult;
  } catch {
    const q = Object.fromEntries(new URLSearchParams(text));
    return { Status: q.Status, Message: q.Message, Result: { MerchantOrderNo: q.MerchantOrderNo, Amt: q.Amt, TradeNo: q.TradeNo } };
  }
}
