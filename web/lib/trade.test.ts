import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildBooks } from "./erp.ts";
import { decideHold } from "./holds.ts";
import { evaluateCourseBom } from "./course-bom.ts";
import { seedReplyInbox, seedReplyRules } from "./reply.ts";
import { applyShop, recommendModules, type ShopProfile } from "./shop.ts";
import { shelfFor } from "./scene-shelf.ts";
import { tradeOf } from "./trade.ts";
import type { IndustryPack } from "./types.ts";

const packs = JSON.parse(readFileSync(new URL("../data/industries.json", import.meta.url), "utf8")) as IndustryPack[];

function pack(id: string) {
  const found = packs.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe("一百個行業各走各的", () => {
  it("每一家的第一眼貨或說明都不一樣", () => {
    const marks = packs.map((item) => {
      const shelf = shelfFor(item);
      return shelf.stock[0]?.name ?? `${item.nameZh}:${shelf.caption}`;
    });
    assert.equal(new Set(marks).size, 100);
  });

  it("花店看不到上衣，3C 有序號，藥妝有效期", () => {
    const florist = shelfFor(pack("florist"));
    assert.equal(florist.stock.some((row) => row.name.includes("上衣")), false);
    assert.match(florist.stock.map((row) => row.name).join(" "), /花/);
    const electronics = shelfFor(pack("electronics-store"));
    assert.ok(electronics.stock.some((row) => row.serial));
    const drug = shelfFor(pack("drugstore"));
    assert.ok(drug.stock.some((row) => row.expiry));
  });

  it("餐廳能訂位並停賣，診所和民宿能留下，服飾不劃位", () => {
    assert.equal(tradeOf(pack("full-service-restaurant")).bookable, true);
    assert.equal(tradeOf(pack("full-service-restaurant")).stopSell, true);
    assert.equal(tradeOf(pack("full-service-restaurant")).dineIn, true);
    assert.ok(tradeOf(pack("clinic")).bookFields.some((field) => field.label.includes("診間")));
    assert.ok(tradeOf(pack("bnb")).bookFields.some((field) => field.label === "退房"));
    assert.equal(tradeOf(pack("cram-school")).bookable, true);
    assert.equal(tradeOf(pack("apparel-store")).bookable, false);
    assert.equal(tradeOf(pack("hair-salon")).bookable, true);
    assert.equal(tradeOf(pack("dental")).extra.some((fact) => fact.label === "植牙批號"), true);
    assert.equal(tradeOf(pack("auto-shop")).extra.some((fact) => fact.label === "車牌"), true);
    assert.equal(tradeOf(pack("fishery")).extra.some((fact) => fact.label === "船次"), true);
  });

  it("沒有材料配方的名額照人數留下", () => {
    const bom = evaluateCourseBom({ courseCode: "SLOT-X", courseName: "訂位", targetSeats: 4, bookedSeats: 3, lines: [] }, []);
    const decision = decideHold(bom, { courseCode: "SLOT-X", branch: "本店", date: "2026-10-29", slot: "19:00", seats: 1, parentName: "林", phone: "0912000111", channel: "官網" }, []);
    assert.equal(decision.status, "locked");
    const full = decideHold(evaluateCourseBom({ courseCode: "SLOT-X", courseName: "訂位", targetSeats: 4, bookedSeats: 4, lines: [] }, []), { courseCode: "SLOT-X", branch: "本店", date: "2026-10-29", slot: "19:00", seats: 1, parentName: "陳", phone: "0988000222", channel: "官網" }, []);
    assert.equal(full.reason, "full");
  });

  it("單據有未稅報價，帳齡對到那張發票，日記帳不是 09/18", () => {
    const books = buildBooks(pack("apparel-store"));
    const quote = books.sales.find((doc) => doc.step === "quote");
    const invoice = books.sales.find((doc) => doc.step === "invoice");
    assert.equal(quote?.tax, 0);
    assert.equal(quote?.taxable, false);
    assert.equal(books.arAging[0]?.party, invoice?.party);
    assert.equal(books.arAging[0]?.d60, invoice?.amount);
    assert.notEqual(books.journals[0]?.date, "09/18");
    assert.equal(books.pnl.some((row) => row.label.includes("18%")), false);
    assert.equal(books.sales.every((doc) => doc.item === books.sales[0]?.item), true);
  });

  it("換行業不會蓋掉這一家的階段，也不會每家都看到報名", () => {
    const source = pack("cram-school");
    const shop: ShopProfile = { scene: "edu", size: "small", modules: ["crm", "sales"] };
    const next = applyShop(source, shop);
    assert.equal(next.workflow.stages[0], source.workflow.stages[0]);
    assert.equal(next.sampleLoop, source.sampleLoop);
    const freight = seedReplyRules(pack("freight"));
    assert.equal(freight.some((rule) => rule.keyword === "報名"), false);
    assert.notEqual(seedReplyInbox(pack("clinic"))[0]?.post, "春季主視覺");
    assert.equal(recommendModules("food", "small", ["sales"]).includes("hr"), false);
    assert.equal(recommendModules("care", "solo", ["crm", "chat", "finance"]).includes("chat"), true);
  });

  it("人事名單跟行業走，金屬廠和補習班不是同一組", () => {
    const metal = tradeOf(pack("metal-shop")).staff.map((person) => `${person.name}${person.role}`).join();
    const cram = tradeOf(pack("cram-school")).staff.map((person) => `${person.name}${person.role}`).join();
    assert.notEqual(metal, cram);
    assert.match(tradeOf(pack("cram-school")).staff.map((person) => person.skill).join(" "), /數學/);
    assert.notEqual(tradeOf(pack("apparel-store")).leaveReason, "小孩學校日");
  });
});
