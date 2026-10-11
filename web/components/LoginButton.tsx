"use client";

import { useState } from "react";

/** Full-page navigation to the OAuth start; the label changes so a slow ERPNext redirect is not clicked twice. */
export function LoginButton({ href, label }: { href: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      onClick={(e) => {
        if (busy) e.preventDefault();
        setBusy(true);
      }}
      aria-busy={busy}
      aria-disabled={busy}
      className={`glass-cta w-full rounded-full px-6 py-3 text-center font-medium ${busy ? "pointer-events-none opacity-70" : ""}`}
    >
      {busy ? "正在前往 ERPNext 登入…" : label}
    </a>
  );
}
