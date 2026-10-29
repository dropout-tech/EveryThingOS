import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_TOOLS, parseAgentCall } from "./agent-tools.ts";

const DENIED = "這個動作不能從這裡做";
const TAX = "稅額不由這裡決定";

describe("代理人可做的動作", () => {
  it("只列出這五個", () => {
    assert.deepEqual(AGENT_TOOLS, [
      "create_quotation",
      "advance",
      "record_deposit",
      "deliver_partial",
      "return_against_delivery",
    ]);
  });

  it("不是物件、沒有動作、或不認識的動作，都不能做", () => {
    for (const input of [null, undefined, "create_quotation", 1, true, [], { args: { party: "王小明" } }, { tool: "drop_database", args: {} }, { tool: "create_quotation" }, { tool: "create_quotation", args: null }, { tool: "create_quotation", args: [] }]) {
      assert.deepEqual(parseAgentCall(input), { ok: false, message: DENIED });
    }
  });

  it("開報價只留下客人和品項，不補稅、不帶多餘欄位", () => {
    const result = parseAgentCall({
      tool: " create_quotation ",
      args: {
        party_type: "Customer",
        party: " 王小明 ",
        company: "示範",
        items: [
          { item_code: " CLAY ", qty: 2, rate: 100 },
          { item_code: "FRAME", qty: 1.5 },
        ],
      },
    });
    assert.deepEqual(result, {
      ok: true,
      tool: "create_quotation",
      args: {
        party: "王小明",
        items: [
          { item_code: "CLAY", qty: 2 },
          { item_code: "FRAME", qty: 1.5 },
        ],
      },
    });
    assert.equal(JSON.stringify(result).includes("0.05"), false);
    assert.equal(JSON.stringify(result).includes("tax"), false);
    assert.deepEqual(Object.keys(result), ["ok", "tool", "args"]);
  });

  it("報價缺客人、品項、或數量不是大於 0 的有限數字", () => {
    const bad = [
      { party: " ", items: [{ item_code: "CLAY", qty: 1 }] },
      { party: "王小明", items: [] },
      { party: "王小明", items: [{ item_code: " ", qty: 1 }] },
      { party: "王小明", items: [{ item_code: "CLAY", qty: 0 }] },
      { party: "王小明", items: [{ item_code: "CLAY", qty: -1 }] },
      { party: "王小明", items: [{ item_code: "CLAY", qty: Number.NaN }] },
      { party: "王小明", items: [{ item_code: "CLAY", qty: Number.POSITIVE_INFINITY }] },
      { party: "王小明", items: [{ item_code: "CLAY", qty: "2" }] },
      { party: "王小明", items: [{ qty: 1 }] },
      { items: [{ item_code: "CLAY", qty: 1 }] },
    ];
    for (const args of bad) {
      assert.deepEqual(parseAgentCall({ tool: "create_quotation", args }), { ok: false, message: DENIED });
    }
  });

  it("往下走只接受報價、訂單、出貨、發票", () => {
    for (const doctype of ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"] as const) {
      assert.deepEqual(parseAgentCall({ tool: "advance", args: { doctype: ` ${doctype} `, name: " DOC-1 ", submit: true } }), {
        ok: true,
        tool: "advance",
        args: { doctype, name: "DOC-1" },
      });
    }
    for (const doctype of ["Purchase Order", "Purchase Invoice", "quotation", "SalesOrder", ""]) {
      assert.deepEqual(parseAgentCall({ tool: "advance", args: { doctype, name: "DOC-1" } }), { ok: false, message: DENIED });
    }
    assert.deepEqual(parseAgentCall({ tool: "advance", args: { doctype: "Quotation", name: "  " } }), { ok: false, message: DENIED });
  });

  it("收訂金要有訂單和大於 0 的金額", () => {
    assert.deepEqual(parseAgentCall({ tool: "record_deposit", args: { sales_order: " SO-1 ", amount: 500, mode: "cash" } }), {
      ok: true,
      tool: "record_deposit",
      args: { sales_order: "SO-1", amount: 500 },
    });
    assert.deepEqual(parseAgentCall({ tool: "record_deposit", args: { sales_order: "SO-1", amount: 0.05 } }), {
      ok: true,
      tool: "record_deposit",
      args: { sales_order: "SO-1", amount: 0.05 },
    });
    for (const amount of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, "500"]) {
      assert.deepEqual(parseAgentCall({ tool: "record_deposit", args: { sales_order: "SO-1", amount } }), { ok: false, message: DENIED });
    }
    assert.deepEqual(parseAgentCall({ tool: "record_deposit", args: { sales_order: " ", amount: 500 } }), { ok: false, message: DENIED });
  });

  it("部分出貨的數量可以是 0.05，那是數量不是稅", () => {
    assert.deepEqual(parseAgentCall({ tool: "deliver_partial", args: { sales_order: " SO-9 ", qty: 0.05 } }), {
      ok: true,
      tool: "deliver_partial",
      args: { sales_order: "SO-9", qty: 0.05 },
    });
    assert.deepEqual(parseAgentCall({ tool: "deliver_partial", args: { sales_order: "", qty: 1 } }), { ok: false, message: DENIED });
    assert.deepEqual(parseAgentCall({ tool: "deliver_partial", args: { sales_order: "SO-9", qty: 0 } }), { ok: false, message: DENIED });
  });

  it("退回原出貨單要有出貨單號和大於 0 的數量", () => {
    assert.deepEqual(parseAgentCall({ tool: "return_against_delivery", args: { delivery_note: " DN-3 ", qty: 1 } }), {
      ok: true,
      tool: "return_against_delivery",
      args: { delivery_note: "DN-3", qty: 1 },
    });
    assert.deepEqual(parseAgentCall({ tool: "return_against_delivery", args: { delivery_note: "DN-3" } }), { ok: false, message: DENIED });
    assert.deepEqual(parseAgentCall({ tool: "return_against_delivery", args: { qty: 1 } }), { ok: false, message: DENIED });
  });

  it("參數提到稅率、tax_rate、taxes，或把 0.05 當稅，就不做", () => {
    const taxed = [
      { tool: "create_quotation", args: { party: "王小明", items: [{ item_code: "CLAY", qty: 1 }], tax_rate: 0.05 } },
      { tool: "create_quotation", args: { party: "王小明", items: [{ item_code: "CLAY", qty: 1, taxRate: 5 }] } },
      { tool: "create_quotation", args: { party: "王小明", items: [{ item_code: "CLAY", qty: 1 }], taxes: [] } },
      { tool: "advance", args: { doctype: "Quotation", name: "QTN-1", note: "tax rate 5%" } },
      { tool: "record_deposit", args: { sales_order: "SO-1", amount: 100, tax: 0.05 } },
      { tool: "deliver_partial", args: { sales_order: "SO-1", qty: 1, note: "請加 5% 稅" } },
      { tool: "return_against_delivery", args: { delivery_note: "DN-1", qty: 1, note: "稅率 0.05" } },
      { tool: "create_quotation", args: { party: "王小明", items: [{ item_code: "CLAY", qty: 1 }], 營業稅: "5%" } },
    ];
    for (const input of taxed) {
      assert.deepEqual(parseAgentCall(input), { ok: false, message: TAX });
    }
  });

  it("不認識的動作即使帶了稅率，也是不能從這裡做", () => {
    assert.deepEqual(parseAgentCall({ tool: "set_tax", args: { tax_rate: 0.05 } }), { ok: false, message: DENIED });
  });
});
