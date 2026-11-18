import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openAccountsAt } from "./accounts/d1.ts";
import { googleAuthorizeUrl, googleConfig, googleProfile } from "./accounts/google.ts";
import { acceptGoogle, inviteAccount, outboxFor, setAccountEnabled, setAccountProfile } from "./accounts/service.ts";
import { erpIdentityRefusal } from "./erp-identity.ts";

const root = path.join(import.meta.dirname, "..");
const boss = { sub: "google-boss", email: "boss@example.com", emailVerified: true, name: "王老闆" };
const colleague = { sub: "google-amy", email: "amy@example.com", emailVerified: true, name: "林同事" };

describe("Google 登入與本機 D1 權限", () => {
  it("沒有 client 時不組 Google 網址，有 client 時才前往 Google", () => {
    const previous = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    assert.equal(googleConfig(), null);
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    const url = googleAuthorizeUrl({ clientId: "client", redirectUri: "http://127.0.0.1:3000/api/auth/callback", state: "s", challenge: "c" });
    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), "client");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    if (previous.id === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous.id;
    if (previous.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = previous.secret;
  });

  it("換 Google 憑證時只打 Google 的兩個位址", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      assert.equal((init?.headers as { authorization?: string }).authorization, "Bearer tok");
      return new Response(JSON.stringify({ sub: "sub", email: "Boss@Example.com", email_verified: true, name: "王" }), { status: 200 });
    };
    const profile = await googleProfile(
      { code: "code", verifier: "verifier", redirectUri: "http://127.0.0.1/api/auth/callback", clientId: "id", clientSecret: "secret" },
      fetchImpl,
    );
    assert.equal(profile.ok && profile.profile.email, "boss@example.com");
    assert.deepEqual(seen, ["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
  });

  it("第一位 Google 使用者是老闆，同事要邀請，信標成未寄出", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "accounts-d1-"));
    const opened = await openAccountsAt(dir);
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("帳號庫不該對外連線");
    };
    try {
      const owner = await acceptGoogle(opened.db, { companyId: "local", profile: boss });
      assert.equal(owner.ok && owner.account.role, "owner");
      const stranger = await acceptGoogle(opened.db, { companyId: "local", profile: colleague });
      assert.equal(stranger.ok, false);
      if (!owner.ok) return;
      const invited = await inviteAccount(opened.db, { actorId: owner.account.id, email: colleague.email, name: "林同事", profile: "同事" });
      assert.equal(invited.ok && invited.delivery, "unsent");
      const mail = await outboxFor(opened.db, "local");
      assert.equal(mail.length, 1);
      assert.equal(mail[0]?.status, "unsent");
      assert.match(mail[0]?.body ?? "", /沒有寄出/);
      const member = await acceptGoogle(opened.db, { companyId: "local", profile: colleague });
      assert.equal(member.ok && member.account.role, "member");
      if (!member.ok) return;
      const blocked = await inviteAccount(opened.db, { actorId: member.account.id, email: "other@example.com", name: "別人", profile: "同事" });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.ok === false && blocked.status, 403);
      const disabled = await setAccountEnabled(opened.db, { actorId: owner.account.id, email: colleague.email, enabled: false });
      assert.equal(disabled.ok, true);
      const again = await acceptGoogle(opened.db, { companyId: "local", profile: colleague });
      assert.equal(again.ok, false);
      const demote = await setAccountProfile(opened.db, { actorId: owner.account.id, email: boss.email, profile: "同事" });
      assert.equal(demote.ok, false);
    } finally {
      globalThis.fetch = original;
      await opened.dispose();
    }
  });

  it("wrangler 只對本機 D1 套 migration，不寫遠端", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wrangler-d1-"));
    const bin = path.join(root, "node_modules", ".bin", "wrangler");
    const output = execFileSync(bin, ["d1", "migrations", "apply", "ACCOUNTS", "--local", "--persist-to", dir, "--config", "wrangler.accounts.jsonc"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, CI: "1" },
    });
    assert.match(output, /Resource location: local/);
    assert.match(output, /Executing on local database ACCOUNTS/);
    assert.match(output, /0001_accounts\.sql/);
    const listed = execFileSync(bin, ["d1", "execute", "ACCOUNTS", "--local", "--persist-to", dir, "--config", "wrangler.accounts.jsonc", "--command", "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'accounts'", "--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, CI: "1" },
    });
    assert.match(listed, /accounts/);
  });
});

describe("ERPNext 不再是身份", () => {
  it("沒有 OAuth client 時不掉回共用整合帳號", () => {
    assert.equal(erpIdentityRefusal(undefined), "沒有 OAuth client，不再使用共用整合帳號");
    assert.equal(erpIdentityRefusal({}), "沒有 OAuth client，不再使用共用整合帳號");
    assert.match(erpIdentityRefusal({ oauth: { clientId: "cid" } }), /平台帳號/);
  });
});
