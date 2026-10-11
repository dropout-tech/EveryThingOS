"use client";

import { useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Money } from "../ui/Money";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { cleanName, DEMO_TRACK_PREFIX, NAME_MAX, NAME_MIN, readDemoTrack, timeText, writeDemoTrack } from "@/lib/portal";

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** A demo quote accepted earlier in this browser stays accepted when the page is opened again. */
function useDemoAccepted(linkId: string, demo: boolean) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => (demo ? localStorage.getItem(DEMO_TRACK_PREFIX + linkId) : null),
    () => null,
  );
  if (!raw) return null;
  const track = readDemoTrack(linkId);
  return track.acceptedAt && track.acceptedName ? { name: track.acceptedName, at: track.acceptedAt } : null;
}

type Accepted = { name: string; at: string; signature?: string | null };

/** 接受報價: typed full name (enough on its own), optional drawn signature, and a consent box. Then a receipt. */
export function PortalAccept({ token, docname, total, customer, demo, linkId }: { token: string; docname: string; total: number; customer: string; demo: boolean; linkId: string }) {
  const pad = useRef<SignaturePadHandle>(null);
  const hintId = useId();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; consent?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const [fresh, setFresh] = useState<Accepted | null>(null);
  const earlier = useDemoAccepted(linkId, demo);
  const accepted = fresh ?? earlier;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = cleanName(name);
    const found: typeof errors = {};
    if (clean.length < NAME_MIN || clean.length > NAME_MAX) found.name = `請輸入你的全名（${NAME_MIN} 到 ${NAME_MAX} 個字）。`;
    if (!consent) found.consent = "請先勾選同意。";
    setErrors(found);
    if (found.name || found.consent) {
      event.currentTarget.querySelector<HTMLInputElement>(found.name ? "input[name=fullname]" : "input[name=consent]")?.focus();
      return;
    }
    const signature = pad.current?.toPng() ?? null;
    setPending(true);
    try {
      const res = await fetch("/api/portal/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, name: clean, signature, consent: true }) });
      const out = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as { ok: boolean; message?: string; accepted?: { name: string; at: string } };
      if (!out.ok || !out.accepted) {
        setErrors({ form: out.message ?? "沒有送出，請再試一次。" });
        return;
      }
      if (demo) writeDemoTrack(linkId, (t) => ({ ...t, acceptedAt: out.accepted!.at, acceptedName: out.accepted!.name }));
      setFresh({ ...out.accepted, signature });
      requestAnimationFrame(() => document.getElementById("receipt")?.focus());
    } catch {
      setErrors({ form: "連不上網路，請確認後再按一次。" });
    } finally {
      setPending(false);
    }
  }

  if (accepted) return <AcceptedReceipt docname={docname} total={total} customer={customer} accepted={accepted} demo={demo} fresh={Boolean(fresh)} />;

  return (
    <form onSubmit={submit} noValidate className="glass space-y-4 p-5 md:p-6 site-noprint" aria-labelledby="accept-title">
      <div>
        <h2 id="accept-title" className="section-title">
          接受這張報價
        </h2>
        <p className="mt-1 text-sm text-cream-dim">確認內容沒問題，輸入全名、簽名後送出。業務會馬上看到，接著跟你確認交期。</p>
      </div>
      <Field label="你的全名" error={errors.name} hint="跟公司登記或名片上的一樣。">
        <input
          name="fullname"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={NAME_MAX}
          enterKeyHint="next"
          placeholder="例如：林安安"
          required
          className="field"
        />
      </Field>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="field-label" id={`${hintId}-label`}>
            手寫簽名（可以不簽）
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => pad.current?.clear()} disabled={pending}>
            清掉重簽
          </button>
        </div>
        <SignaturePad ref={pad} label="手寫簽名" describedBy={hintId} disabled={pending} />
        <p id={hintId} className="field-hint">
          用手指或滑鼠簽。不方便簽的話，只輸入全名也算數。
        </p>
      </div>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? `${hintId}-consent` : undefined}
            className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            我已經看過這張報價的品項、金額與條款，同意用電子方式接受，並以上面輸入的全名{" "}
            <span className="whitespace-nowrap">（和簽名）</span>作為我的簽名。
          </span>
        </label>
        {errors.consent ? (
          <p id={`${hintId}-consent`} className="field-error" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p className="field-error" role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className="form-actions sticky-submit">
        <Button type="submit" variant="primary" pending={pending} pendingLabel="送出中…" className="w-full sm:w-auto">
          接受報價（含稅 <Money amount={total} />）
        </Button>
      </div>
      <p className="text-xs text-cream-dim">
        送出時會記下你輸入的全名、時間、簽名圖，以及網路位址的雜湊值（不是位址本身），作為接受的紀錄。
        {demo ? "示範頁面不會送到任何公司。" : ""}
      </p>
    </form>
  );
}

export function AcceptedReceipt({ docname, total, customer, accepted, demo, fresh = false }: { docname: string; total: number; customer: string; accepted: Accepted; demo: boolean; fresh?: boolean }) {
  return (
    <section id="receipt" tabIndex={-1} className="glass glass-hero space-y-4 p-5 md:p-6 outline-none" aria-labelledby="receipt-title" role={fresh ? "status" : undefined}>
      <div className="flex items-center gap-3">
        <span className="portal-check" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2 id="receipt-title" className="text-lg font-medium">
            {fresh ? "已接受報價，謝謝！" : "這張報價已經接受了"}
          </h2>
          <p className="text-sm text-cream-dim">{fresh ? "業務會收到通知，接著跟你確認交期與付款。" : "有任何問題，直接聯絡下面的業務。"}</p>
        </div>
      </div>
      <dl className="portal-meta">
        <dt>單號</dt>
        <dd className="num">{docname}</dd>
        <dt>客戶</dt>
        <dd>{customer}</dd>
        <dt>含稅金額</dt>
        <dd>
          <Money amount={total} />
        </dd>
        <dt>接受人</dt>
        <dd>{accepted.name}</dd>
        <dt>時間</dt>
        <dd className="num">{timeText(accepted.at)}</dd>
      </dl>
      {accepted.signature ? (
        <figure className="portal-signature">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={accepted.signature} alt={`${accepted.name} 的手寫簽名`} />
          <figcaption className="text-xs text-cream-dim">手寫簽名</figcaption>
        </figure>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 site-noprint">
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          列印或存成 PDF（收據）
        </button>
        {demo ? <span className="text-xs text-cream-dim">示範：回到 DropOut OS 的「客戶入口」，會看到這張已簽。</span> : null}
      </div>
    </section>
  );
}
