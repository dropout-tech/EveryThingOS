import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiKeyInput, apiKeyScopeLabel } from "./api-key-scopes.ts";

describe("integration capability selection", () => {
  it("a Dodo service key never acquires general CRM scopes", () => {
    assert.deepEqual(apiKeyInput({ label: "Dodo", purpose: "service", write: false }), { label: "Dodo", scopes: ["service:read"] });
    assert.deepEqual(apiKeyInput({ label: "Dodo", purpose: "service", write: true }), { label: "Dodo", scopes: ["service:read", "service:write"] });
  });
  it("legacy forms keep general scopes and gain no service permissions", () => {
    assert.deepEqual(apiKeyInput({ label: " ERP ", write: true }), { label: "ERP", scopes: ["read", "write"] });
    assert.deepEqual(apiKeyInput({ label: "ERP" }), { label: "ERP", scopes: ["read"] });
  });
  it("rejects client-supplied scopes, tenant selection, unknown purposes and truthy writes", () => {
    for (const payload of [null, [], { label: "Dodo", scopes: ["write"] }, { label: "Dodo", site: "other" }, { label: "Dodo", purpose: "admin" }, { label: "Dodo", purpose: null }, { label: "Dodo", write: "true" }, { label: "Dodo", write: 1 }, { label: "x".repeat(81) }, { label: "Dodo\nadmin" }]) {
      assert.equal(typeof apiKeyInput(payload), "string");
    }
  });
  it("scope labels disclose both capability families without calling a service writer read-only", () => {
    assert.match(apiKeyScopeLabel(["service:read", "service:write"]), /建立服務紀錄與待辦/);
    assert.match(apiKeyScopeLabel(["read", "service:read"]), /一般業務資料.*客服紀錄/);
    assert.equal(apiKeyScopeLabel([]), "沒有可辨識的資料權限");
  });
});
