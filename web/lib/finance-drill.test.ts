import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { voucherHref } from "./finance-drill.ts";

describe("傳票連結", () => {
  it("有 desk 網址時組成 ERPNext 單據路徑", () => {
    assert.equal(
      voucherHref("Journal Entry", "ACC-JV-2026-00001", "https://erp.example"),
      "https://erp.example/app/journal-entry/ACC-JV-2026-00001",
    );
    assert.equal(
      voucherHref("Sales Invoice", "SINV-0001", "https://erp.example/"),
      "https://erp.example/app/sales-invoice/SINV-0001",
    );
    assert.equal(
      voucherHref("Payment Entry", "ACC-PAY-2026-00012", "https://erp.example:8000"),
      "https://erp.example:8000/app/payment-entry/ACC-PAY-2026-00012",
    );
  });

  it("沒有 desk 網址就不連出去", () => {
    assert.equal(voucherHref("Journal Entry", "ACC-JV-2026-00001", undefined), undefined);
    assert.equal(voucherHref("Journal Entry", "ACC-JV-2026-00001", null), undefined);
    assert.equal(voucherHref("Journal Entry", "ACC-JV-2026-00001", ""), undefined);
    assert.equal(voucherHref("Journal Entry", "ACC-JV-2026-00001", "   "), undefined);
  });

  it("缺單據種類或單號就不編路徑", () => {
    assert.equal(voucherHref(undefined, "ACC-JV-2026-00001", "https://erp.example"), undefined);
    assert.equal(voucherHref(null, "ACC-JV-2026-00001", "https://erp.example"), undefined);
    assert.equal(voucherHref("  ", "ACC-JV-2026-00001", "https://erp.example"), undefined);
    assert.equal(voucherHref("Journal Entry", undefined, "https://erp.example"), undefined);
    assert.equal(voucherHref("Journal Entry", null, "https://erp.example"), undefined);
    assert.equal(voucherHref("Journal Entry", "  ", "https://erp.example"), undefined);
  });
});
