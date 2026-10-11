"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button, buttonClass } from "./ui/Button";

/** Friendly fallback for `error.tsx`: no stack trace, one retry, a way out. */
export function ErrorPanel({ error, retry, title = "這一頁暫時打不開" }: { error: Error & { digest?: string }; retry: () => void; title?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    heading.current?.focus();
  }, [error]);

  return (
    <section className="glass glass-hero max-w-xl space-y-4 p-6 md:p-8" role="alert">
      <p className="kicker">出了點狀況</p>
      <h1 ref={heading} tabIndex={-1} className="page-title outline-none">
        {title}
      </h1>
      <p className="text-sm text-cream-dim">資料都還在，沒有被改動。通常是網路或系統忙，按「再試一次」就好；一直不行，請把下面的代碼告訴導入顧問。</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => retry()}>
          再試一次
        </Button>
        <Link href="/workspace" className={buttonClass({ variant: "secondary" })}>
          回今天
        </Link>
      </div>
      {error.digest ? <p className="text-xs text-cream-dim">代碼：{error.digest}</p> : null}
    </section>
  );
}
