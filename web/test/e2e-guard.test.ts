import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertLocalBaseUrl, blankDemoEnvCommand, BLANK_DEMO_ENV } from "../e2e/guard.ts";

const webRoot = path.join(import.meta.dirname, "..");

test("空字串擋住 .env.local，unset 會把 ERPNext 網址填回來", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-env-"));
  writeFileSync(path.join(dir, ".env.local"), "ERPNEXT_URL=https://erp.example\nSESSION_SECRET=should-not-load\n");
  try {
    const unset = readEnvLoad(dir, { ERPNEXT_URL: undefined, SESSION_SECRET: undefined });
    assert.equal(unset.url, "https://erp.example");
    assert.equal(unset.secret, "should-not-load");

    const blank = readEnvLoad(dir, { ERPNEXT_URL: "", SESSION_SECRET: "" });
    assert.equal(blank.url, "");
    assert.equal(blank.secret, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("開發伺服器指令用空字串，不用 unset", () => {
  const command = blankDemoEnvCommand("npm run dev -- --hostname 127.0.0.1 --port 3017");
  assert.match(command, /^env /);
  assert.doesNotMatch(command, /-u /);
  for (const key of BLANK_DEMO_ENV) {
    assert.match(command, new RegExp(`(?:^|\\s)${key}=(?:\\s|$)`));
  }
});

test("E2E_BASE_URL 只接受 127.0.0.1 與 localhost", () => {
  assert.equal(assertLocalBaseUrl(undefined, "http://127.0.0.1:3017"), "http://127.0.0.1:3017");
  assert.equal(assertLocalBaseUrl("   ", "http://127.0.0.1:3017"), "http://127.0.0.1:3017");
  assert.equal(assertLocalBaseUrl("http://localhost:3017", "http://127.0.0.1:3017"), "http://localhost:3017");
  assert.throws(() => assertLocalBaseUrl("https://dropout-os.vercel.app", "http://127.0.0.1:3017"), /拒絕開啟 dropout-os\.vercel\.app/);
  assert.throws(() => assertLocalBaseUrl("https://os.dropout.tw", "http://127.0.0.1:3017"), /拒絕開啟 os\.dropout\.tw/);
  assert.throws(() => assertLocalBaseUrl("http://127.0.0.1.evil.com", "http://127.0.0.1:3017"), /拒絕開啟/);
});

test("Playwright 在開瀏覽器前拒絕 Vercel 預覽網址", () => {
  let output = "";
  let failed = false;
  try {
    output = execFileSync(path.join(webRoot, "node_modules", ".bin", "playwright"), ["test", "--list"], {
      cwd: webRoot,
      env: { ...process.env, E2E_BASE_URL: "https://dropout-os.vercel.app" },
      encoding: "utf8",
      timeout: 60_000,
    });
  } catch (error) {
    failed = true;
    const thrown = error as { stdout?: string; stderr?: string; message?: string };
    output = `${thrown.stdout ?? ""}\n${thrown.stderr ?? ""}\n${thrown.message ?? ""}`;
  }
  assert.equal(failed, true);
  assert.match(output, /拒絕開啟 dropout-os\.vercel\.app/);
  assert.doesNotMatch(output, /browserType\.launch|Launching chromium/i);
});

function readEnvLoad(dir: string, preset: { ERPNEXT_URL?: string; SESSION_SECRET?: string }) {
  const script = `
    const { createRequire } = require("node:module");
    const { loadEnvConfig } = createRequire(${JSON.stringify(path.join(webRoot, "package.json"))})("@next/env");
    loadEnvConfig(${JSON.stringify(dir)}, true);
    process.stdout.write(JSON.stringify({ url: process.env.ERPNEXT_URL ?? null, secret: process.env.SESSION_SECRET ?? null }));
  `;
  const env = { ...process.env, NODE_ENV: "development" };
  if (preset.ERPNEXT_URL === undefined) delete env.ERPNEXT_URL;
  else env.ERPNEXT_URL = preset.ERPNEXT_URL;
  if (preset.SESSION_SECRET === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = preset.SESSION_SECRET;
  const raw = execFileSync(process.execPath, ["--input-type=commonjs", "-e", script], {
    env,
    encoding: "utf8",
    timeout: 30_000,
  });
  return JSON.parse(raw) as { url: string | null; secret: string | null };
}
