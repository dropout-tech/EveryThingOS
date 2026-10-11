import { describe, expect, it } from "vitest";
import { classify, parseClassification, polish, polishProblem, readAssist } from "../src/assist";
import { handle, type App, type Env } from "../src/app";
import { toBase64 } from "../src/crypto";
import type { Ai } from "../src/meetings";
import { MemoryStore, type Tenant } from "../src/store";

const ai = (response: unknown): Ai => ({ run: async () => ({ response }) });
const broken: Ai = {
  run: async () => {
    throw new Error("quota");
  },
};

describe("classification", () => {
  it("accepts a known intent, period and a name the person typed", () => {
    expect(parseClassification('{"intent":"customer","period":"this_week","name":"大同"}', "大同那邊最近還好嗎")).toEqual({ intent: "customer", period: "this_week", name: "大同" });
  });

  it("reads JSON wrapped in prose or code fences", () => {
    expect(parseClassification('```json\n{"intent":"cash","period":null,"name":null}\n```', "撐得過月底嗎").intent).toBe("cash");
  });

  it("drops names the model made up", () => {
    expect(parseClassification('{"intent":"customer","name":"王美玲"}', "那個常來的客人怎樣").name).toBeNull();
  });

  it("falls back to not understood on unknown intents, bad JSON or none", () => {
    for (const raw of ['{"intent":"delete_everything"}', '{"intent":"none"}', "not json", "{intent: receivables}", "[1,2]", ""]) {
      expect(parseClassification(raw, "隨便問問")).toEqual({ intent: null, period: null, name: null });
    }
  });

  it("ignores periods outside the list", () => {
    expect(parseClassification('{"intent":"revenue","period":"last_year"}', "去年營收").period).toBeNull();
  });

  it("never throws when the model fails", async () => {
    expect(await classify(broken, "m", "隨便")).toEqual({ intent: null, period: null, name: null });
    expect((await classify(ai({ intent: "overdue", period: null, name: null }), "m", "拖款的")).intent).toBe("overdue");
  });
});

describe("polishing", () => {
  const draft = "王美玲 您好，\n帳上還有 NT$32,000 尚未收到，最早一筆 10/14 到期。\n謝謝您！";
  const facts = { customer: "王美玲", owed: "NT$32,000", due: "10/14" };

  it("keeps a rewrite that has every fact and no new numbers", () => {
    expect(polishProblem("王美玲 您好：\n想跟您確認，帳上還有 NT$32,000 還沒收到，最早一筆是 10/14 到期。\n麻煩您了，謝謝！", draft, facts)).toBeNull();
    expect(polishProblem("王美玲 您好，帳上尚有ＮＴ$３２,０００未收，10/14 到期，謝謝！", draft, facts)).toBeNull();
  });

  it("rejects new or changed numbers", () => {
    expect(polishProblem("王美玲 您好，帳上還有 NT$35,000 尚未收到，10/14 到期，謝謝！", draft, facts)).toBe("new_number");
    expect(polishProblem("王美玲 您好，帳上還有 NT$32,000，10/14 到期，月底前付款可打 9 折。", draft, facts)).toBe("new_number");
    expect(polishProblem("王美玲 您好，帳上還有三萬二千元，10/14 到期，謝謝！", draft, facts)).not.toBeNull();
  });

  it("rejects drafts that lose a fact, add links or balloon", () => {
    expect(polishProblem("您好，帳上還有 NT$32,000 尚未收到，10/14 到期。", draft, facts)).toBe("lost_fact");
    expect(polishProblem("王美玲 您好，帳上還有款項尚未收到，謝謝！", draft, facts)).toBe("lost_number");
    expect(polishProblem("王美玲 您好，NT$32,000，10/14 到期，請到 https://pay.example 付款", draft, facts)).toBe("new_link");
    expect(polishProblem("好", draft, facts)).toBe("too_short");
    expect(polishProblem(`王美玲 NT$32,000 10/14 ${"很".repeat(400)}`, draft, facts)).toBe("too_long");
  });

  it("returns the original draft when the model misbehaves or fails", async () => {
    expect(await polish(ai("王美玲 您好，帳上還有 NT$99,000，10/14 到期。"), "m", draft, facts)).toMatchObject({ text: draft, polished: false, reason: "new_number" });
    expect(await polish(broken, "m", draft, facts)).toMatchObject({ text: draft, polished: false, reason: "ai_error" });
    const good = "王美玲 您好：帳上還有 NT$32,000 還沒收到，最早一筆 10/14 到期，再麻煩您確認，謝謝！";
    expect(await polish(ai(`「${good}」`), "m", draft, facts)).toEqual({ text: good, polished: true });
  });
});

describe("request validation", () => {
  it("accepts the two tasks and refuses anything else", () => {
    expect(readAssist({ task: "classify", question: " 撐得住嗎 " })).toEqual({ task: "classify", question: "撐得住嗎" });
    expect(readAssist({ task: "polish", draft: "您好", facts: { customer: "王美玲" } })).toMatchObject({ task: "polish" });
    expect(readAssist({ task: "classify", question: "x".repeat(201) })).toMatch(/longer/);
    expect(readAssist({ task: "classify", question: "" })).toBe("question required");
    expect(readAssist({ task: "polish", draft: "您好", facts: { "Bad-Key": "x" } })).toBe("bad fact");
    expect(readAssist({ task: "polish", draft: "您好", facts: { a: 1 } })).toBe("bad fact");
    expect(readAssist({ task: "polish", draft: "您好", facts: [] })).toBe("facts required");
    expect(readAssist({ task: "run_sql" })).toMatch(/task must be/);
    expect(readAssist(null)).toBe("body must be JSON");
  });
});

describe("route", () => {
  const tenant = { site: "make.dropout.tw", erpnext_url: "https://erp.example", erpnext_key: "k", erpnext_secret: "s", erpnext_webhook_secret: "h", unsubscribe_secret: "u" } as Tenant;
  function setup(withAi: Ai | undefined) {
    const store = new MemoryStore();
    store.tenants.set(tenant.site, tenant);
    const env = { AI: withAi, TENANT_KEY: toBase64(new Uint8Array(32)), ADMIN_TOKEN: "admin", SHELL_TOKEN: "shell" } as unknown as Env;
    const app: App = { store: () => store, fetcher: (async () => Response.json({})) as unknown as typeof fetch };
    const call = (body: unknown, token = "shell", site = tenant.site) =>
      handle(new Request(`https://glue.example/admin/tenants/${site}/assist`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", authorization: `Bearer ${token}` } }), env, app);
    return call;
  }

  it("lets the shell classify and polish for a known company", async () => {
    const call = setup(ai('{"intent":"cash","period":null,"name":null}'));
    const res = await call({ task: "classify", question: "撐得過月底嗎" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, intent: "cash", period: null, name: null });
    expect((await call({ task: "classify", question: "撐得過月底嗎" }, "wrong")).status).toBe(403);
    expect((await call({ task: "classify", question: "撐得過月底嗎" }, "shell", "nobody.example")).status).toBe(404);
    expect((await call({ task: "nope" })).status).toBe(400);
  });

  it("says unavailable without an AI binding", async () => {
    const res = await setup(undefined)({ task: "classify", question: "撐得過月底嗎" });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ available: false });
  });
});
