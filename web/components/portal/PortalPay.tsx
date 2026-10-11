"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import { Money } from "../ui/Money";
import type { PortalBank } from "@/lib/portal";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={`複製${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* the number stays visible to copy by hand */
        }
      }}
    >
      {done ? "已複製" : "複製"}
    </button>
  );
}

/** 怎麼付: ERPNext's ECPay/NewebPay checkout when the company turned it on, its own bank account otherwise. Never a pretend button. */
export function PortalPay({ token, outstanding, bank, onlinePay, demo, contactName }: { token: string; outstanding: number; bank: PortalBank | null; onlinePay: boolean; demo: boolean; contactName: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/pay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const out = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; message?: string };
      if (out.ok && out.url && /^https:\/\//.test(out.url)) {
        window.location.assign(out.url);
        return;
      }
      setError(out.message ?? "現在開不了付款頁，請用轉帳，或稍後再試。");
    } catch {
      setError("連不上網路，請確認後再按一次。");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="glass space-y-4 p-5 md:p-6" aria-labelledby="pay-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pay-title" className="section-title">
          怎麼付款
        </h2>
        <p className="text-sm">
          還要付 <Money amount={outstanding} className="text-lg font-medium" />
        </p>
      </div>
      {onlinePay ? (
        <div className="space-y-2 site-noprint">
          <Button variant="primary" pending={pending} pendingLabel="開啟付款頁…" onClick={pay} className="w-full sm:w-auto">
            線上付款（信用卡／ATM）
          </Button>
          <p className="text-xs text-cream-dim">會開啟金流公司的付款頁。付完後，這張發票會自動記成已收款。</p>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {bank ? (
        <div className="glass-well space-y-1 p-4">
          <p className="text-sm font-medium">{onlinePay ? "或用銀行轉帳" : "銀行轉帳"}</p>
          <dl className="portal-meta">
            <dt>銀行</dt>
            <dd>
              {bank.bank}
              {bank.branch ? `（分行代碼 ${bank.branch}）` : ""}
            </dd>
            {bank.holder ? (
              <>
                <dt>戶名</dt>
                <dd>{bank.holder}</dd>
              </>
            ) : null}
            <dt>帳號</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="num text-base font-medium">{bank.account}</span>
              <CopyButton value={bank.account.replace(/[\s-]/g, "")} label="帳號" />
            </dd>
          </dl>
          <p className="pt-1 text-xs text-cream-dim">轉帳後請告訴{contactName ? ` ${contactName} ` : "業務"}你的帳號末五碼，方便對帳。{demo ? "這是示範帳號，請不要轉帳。" : ""}</p>
        </div>
      ) : null}
      {!onlinePay && !bank ? <p className="text-sm text-cream-dim">付款方式請直接聯絡{contactName ? ` ${contactName}` : "業務"}。</p> : null}
    </section>
  );
}
