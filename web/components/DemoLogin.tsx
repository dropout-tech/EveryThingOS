"use client";

import Link from "next/link";
import { useState } from "react";

/** Practice login. The password stays in this tab and is never posted. */
export function DemoLogin() {
  const [note, setNote] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const email = String(data.get("email") ?? "").trim();
        const password = String(data.get("password") ?? "");
        if (!email.includes("@") || password.length < 8) {
          setNote("請填工作用的 Email，密碼至少 8 個字。這組資料不會送出。");
          return;
        }
        setNote("這個網站還沒接上公司的帳本。帳號與密碼留在這一頁，沒有送出，也不會建立登入。");
      }}
    >
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="username" required maxLength={80} className="site-field" />
      </label>
      <label className="block text-sm">
        密碼
        <input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={80} className="site-field" />
      </label>
      <button type="submit" className="glass-cta inline-flex w-full justify-center rounded-full px-6 py-3 font-medium">
        登入
      </button>
      <p className="text-sm text-cream-dim" role="status">
        {note ?? "還沒接上 ERPNext 時，登入不會核對帳號。可以先看示範。"}
      </p>
      <p className="text-center text-sm">
        <Link href="/?setup=1" className="text-cream-dim underline underline-offset-4 hover:text-cream">
          先看示範
        </Link>
      </p>
    </form>
  );
}
