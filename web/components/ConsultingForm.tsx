"use client";

import Link from "next/link";
import Script from "next/script";
import { useState, type FormEvent, type ReactNode } from "react";
import { CURRENT_SYSTEMS, EMPLOYEE_RANGES, TIME_SLOTS, normalizeLead, validateLead, type LeadErrors, type LeadInput } from "@/lib/consulting";

type Sent = { demo: boolean; name: string; email: string };

function Field({ id, label, optional, error, children }: { id: keyof LeadInput; label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={`lead-${id}`} className="text-sm">
        {label}
        {optional ? <span className="ml-1 text-xs text-cream-dim">（可不填）</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`lead-${id}-error`} className="site-error mt-1 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 免費導入預約. Validates here for quick feedback; the API validates again. */
export function ConsultingForm({ demo, turnstileSiteKey, email }: { demo: boolean; turnstileSiteKey?: string; email: string }) {
  const [errors, setErrors] = useState<LeadErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const a11y = (id: keyof LeadInput) => ({
    id: `lead-${id}`,
    name: id,
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? `lead-${id}-error` : undefined,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data: Record<string, unknown> = Object.fromEntries(new FormData(form).entries());
    const found = validateLead(normalizeLead(data));
    setErrors(found);
    setFailure(null);
    const first = Object.keys(found)[0];
    if (first) {
      form.querySelector<HTMLElement>(`#lead-${first}`)?.focus();
      return;
    }
    const params = new URLSearchParams(location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign"]) if (params.get(k)) data[k] = params.get(k);
    setBusy(true);
    try {
      const res = await fetch("/api/consulting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as { ok: boolean; demo?: boolean; message?: string; errors?: LeadErrors };
      if (!body.ok) {
        setErrors(body.errors ?? {});
        setFailure(body.message ?? "沒有送出，請再試一次");
        return;
      }
      setSent({ demo: Boolean(body.demo), name: String(data.name ?? ""), email: String(data.email ?? "") });
    } catch {
      setFailure(`連不到伺服器，請檢查網路，或直接寫信到 ${email}`);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="site-sheet space-y-4 p-6 sm:p-8" role="status" aria-live="polite">
        {sent.demo ? <span className="site-chip" data-tone="warn">示範模式：沒有真的送出</span> : <span className="site-chip" data-tone="ok">已送出</span>}
        <h2 className="text-2xl font-medium">謝謝 {sent.name}，收到了。</h2>
        <p className="text-cream-dim">
          {sent.demo
            ? "這個網站現在是示範模式，表單不會寄到任何地方。正式上線後，顧問會在上班時間用你留的電話或 LINE 聯絡你。"
            : `顧問會在上班時間（週一至週五）用你留的電話或 LINE 跟你約時間；需要時也會寫信到 ${sent.email}。`}
        </p>
        <p className="text-sm text-cream-dim">
          等的時候可以先
          <Link href="/" className="mx-1 underline underline-offset-4 hover:text-cream">
            看示範
          </Link>
          或
          <Link href="/pricing#faq" className="mx-1 underline underline-offset-4 hover:text-cream">
            常見問題
          </Link>
          。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="site-sheet space-y-4 p-6 sm:p-8" aria-labelledby="book-title">
      <div>
        <h2 id="book-title" className="text-2xl font-medium">
          約 30 分鐘看現場
        </h2>
        <p className="mt-1 text-sm text-cream-dim">免費，不用先簽約。顧問會在上班時間（週一至週五）聯絡你。</p>
        {demo ? (
          <p className="mt-3">
            <span className="site-chip" data-tone="warn">示範模式：送出不會寄到任何地方</span>
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="怎麼稱呼" error={errors.name}>
          <input {...a11y("name")} autoComplete="name" maxLength={60} className="site-field" placeholder="王小姐" />
        </Field>
        <Field id="company" label="公司或店名" error={errors.company}>
          <input {...a11y("company")} autoComplete="organization" maxLength={100} className="site-field" />
        </Field>
        <Field id="tax_id" label="統一編號" optional error={errors.tax_id}>
          <input {...a11y("tax_id")} inputMode="numeric" maxLength={8} className="site-field" placeholder="8 位數字" />
        </Field>
        <Field id="employees" label="公司大約幾個人" error={errors.employees}>
          <select {...a11y("employees")} defaultValue="" className="site-field">
            <option value="" disabled>
              請選
            </option>
            {EMPLOYEE_RANGES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field id="contact" label="手機或 LINE ID" error={errors.contact}>
          <input {...a11y("contact")} autoComplete="tel" maxLength={60} className="site-field" placeholder="0912345678" />
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          <input {...a11y("email")} type="email" autoComplete="email" maxLength={120} className="site-field" placeholder="you@company.tw" />
        </Field>
        <Field id="system" label="現在用什麼記帳或管客人" error={errors.system}>
          <select {...a11y("system")} defaultValue="" className="site-field">
            <option value="" disabled>
              請選
            </option>
            {CURRENT_SYSTEMS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field id="time" label="方便聯絡的時間" error={errors.time}>
          <select {...a11y("time")} defaultValue="" className="site-field">
            <option value="" disabled>
              請選
            </option>
            {TIME_SLOTS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="note" label="最想先解決的事" optional error={errors.note}>
        <textarea {...a11y("note")} rows={3} maxLength={500} className="site-field" placeholder="例：報價到收款要開三個系統、月底對帳要兩天" />
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="lead-website">網站（請留空）</label>
        <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-3">
          <input type="checkbox" {...a11y("privacy")} className="mt-1 size-4 shrink-0" />
          <span>
            我同意琢奧科技依
            <Link href="/privacy" target="_blank" className="mx-1 underline underline-offset-4 hover:text-cream">
              隱私權政策
            </Link>
            用這些資料聯絡我、安排導入。
          </span>
        </label>
        {errors.privacy ? (
          <p id="lead-privacy-error" className="site-error text-xs">
            {errors.privacy}
          </p>
        ) : null}
        <label className="flex items-start gap-3 text-cream-dim">
          <input type="checkbox" id="lead-updates" name="updates" className="mt-1 size-4 shrink-0" />
          <span>也想收產品更新電子報（會先寄確認信，可隨時退訂）。</span>
        </label>
      </div>
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-language="zh-tw" />
        </>
      ) : null}
      {failure ? (
        <p role="alert" className="site-error text-sm">
          {failure}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} aria-busy={busy} className="glass-cta rounded-full px-6 py-3 font-medium disabled:opacity-60">
          {busy ? "送出中…" : "送出，等顧問聯絡"}
        </button>
        <a href={`mailto:${email}?subject=${encodeURIComponent("EveryThingOS 免費導入")}`} className="text-sm text-cream-dim underline underline-offset-4 hover:text-cream">
          不想填表？直接寫信
        </a>
      </div>
    </form>
  );
}
