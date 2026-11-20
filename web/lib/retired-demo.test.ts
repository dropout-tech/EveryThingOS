import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetiredDemoApiPath, isRetiredDemoHref, remapRetiredWorkspaceHref, withoutRetiredDemoModules } from "./retired-demo.ts";
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

  it("下架 API 路徑固定七支", () => {
    assert.equal(isRetiredDemoApiPath("/api/hr/checkin"), true);
    assert.equal(isRetiredDemoApiPath("/api/chat/open"), true);
    assert.equal(isRetiredDemoApiPath("/api/erp/quotation"), false);
  });

  it("指南連結改到今天，不再連下架頁", () => {
    assert.equal(remapRetiredWorkspaceHref("/workspace/chat"), "/workspace");
    assert.equal(remapRetiredWorkspaceHref("/workspace/crm"), "/workspace/crm");
  });
});