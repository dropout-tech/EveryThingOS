import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOrigin, redirectUri } from "./auth.ts";
import type { NextRequest } from "next/server";

test("登入網址不信任轉送標頭", () => {
  const request = { nextUrl: new URL("https://tenant.example/login"), headers: new Headers({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" }) } as unknown as NextRequest;
  const previous = process.env.SHELL_URL;
  try {
    delete process.env.SHELL_URL;
    assert.equal(publicOrigin(request), "https://tenant.example");
    assert.equal(redirectUri(request), "https://tenant.example/api/auth/callback");
    process.env.SHELL_URL = "https://shell.example";
    assert.equal(redirectUri(request), "https://shell.example/api/auth/callback");
  } finally {
    if (previous === undefined) delete process.env.SHELL_URL; else process.env.SHELL_URL = previous;
  }
});
