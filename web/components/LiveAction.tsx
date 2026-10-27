"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Toast } from "./ActionNote";
import { buttonClass } from "./ui/Button";

export type ActionOutcome = { ok: boolean; message: string; href?: string };

type Result = { ok: boolean; message?: string; created?: { doctype: string; name: string; href?: string }; href?: string; [key: string]: unknown };

const DOCTYPE_LABEL: Record<string, string> = {
  Quotation: "報價單",
  "Sales Order": "訂單",
  "Delivery Note": "出貨單",
  "Sales Invoice": "銷貨發票",
  "Payment Entry": "收付款",
  "Purchase Receipt": "進貨單",
  "Purchase Invoice": "進項發票",
  Lead: "潛在客人",
  Newsletter: "電子報",
};

export function doctypeLabel(doctype: string) {
  return DOCTYPE_LABEL[doctype] ?? doctype;
}

/** Posts one action to the shell's API, refreshes the server data, and keeps the outcome for an `ActionOutcomeNote`. */
export function useLiveAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  async function run(path: string, body: unknown, describe: (result: Result) => string): Promise<Result | null> {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as Result;
      if (res.status === 401) {
        setOutcome({ ok: false, message: result.message ?? "登入已過期，請重新登入", href: `/login?next=${encodeURIComponent(location.pathname)}` });
        return null;
      }
      if (!result.ok) {
        setOutcome({ ok: false, message: result.message ?? "沒有完成" });
        return result;
      }
      setOutcome({ ok: true, message: describe(result), href: result.created?.href ?? (typeof result.href === "string" ? result.href : undefined) });
      startTransition(() => router.refresh());
      return result;
    } catch {
      setOutcome({ ok: false, message: "連不到 EveryThingOS，請檢查網路後再試一次" });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy: busy || refreshing, outcome, clear: () => setOutcome(null) };
}

export function ActionOutcomeNote({ outcome }: { outcome: ActionOutcome | null }) {
  const [closed, setClosed] = useState<ActionOutcome | null>(null);
  if (!outcome || closed === outcome) return null;
  return (
    <Toast tone={outcome.ok ? "ok" : "error"} onClose={() => setClosed(outcome)}>
      {outcome.message}
      {outcome.href ? (
        <>
          {" "}
          <a href={outcome.href} target={outcome.href.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="font-medium underline">
            {outcome.href.startsWith("/login") ? "重新登入" : "打開"}
          </a>
        </>
      ) : null}
    </Toast>
  );
}

/** One "下一步" that really happens in ERPNext. */
export function AdvanceButton({
  doctype,
  name,
  label,
  run,
  busy,
  className = buttonClass({ variant: "secondary", size: "sm", block: true, className: "mt-2" }),
}: {
  doctype?: string;
  name: string;
  label: string;
  run: ReturnType<typeof useLiveAction>["run"];
  busy: boolean;
  className?: string;
}) {
  const [mine, setMine] = useState(false);
  if (!doctype) return null;
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={(busy && mine) || undefined}
      className={className}
      onClick={async () => {
        setMine(true);
        await run("/api/erp/advance", { doctype, name }, (r) => `${name}：${label}，已開 ${doctypeLabel(r.created!.doctype)} ${r.created!.name}。`);
        setMine(false);
      }}
    >
      {busy && mine ? <span className="spinner" aria-hidden="true" /> : null}
      {busy && mine ? "處理中…" : label}
    </button>
  );
}
