import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetiredDemoHref, withoutRetiredDemoModules } from "./retired-demo.ts";
import { navItemsForShop } from "./shop.ts";

describe("retired demo modules", () => {
  it("導覽不列出人事、對話、電子報", () => {
    const items = navItemsForShop({
      scene: "edu",
      size: "small",
      modules: ["crm", "sales", "finance", "hr", "chat", "letter"],
    });
    const labels = items.map((item) => item.label);
    assert.deepEqual(labels, ["今天", "客人", "生意", "收錢", "設定"]);
  });

  it("直接打的舊路由會被標成已下架", () => {
    assert.equal(isRetiredDemoHref("/workspace/hr"), true);
    assert.equal(isRetiredDemoHref("/workspace/chat"), true);
    assert.equal(isRetiredDemoHref("/workspace/letter"), true);
    assert.equal(isRetiredDemoHref("/workspace/crm"), false);
  });

  it("模組清單會拿掉示範三項", () => {
    assert.deepEqual(withoutRetiredDemoModules(["crm", "hr", "chat", "letter", "finance"]), ["crm", "finance"]);
  });
});