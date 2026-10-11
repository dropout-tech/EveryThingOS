"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { ActionNote } from "./ActionNote";
import { DeskLink } from "./DeskLink";
import { EmptyState } from "./EmptyState";
import { Section } from "./ModuleFrame";
import { ActionOutcomeNote, useLiveAction, type ActionOutcome } from "./LiveAction";
import { Avatar } from "./ui/Avatar";
import { Badge } from "./ui/Badge";
import { Button, buttonClass } from "./ui/Button";
import { trapTab, useConfirm } from "./ui/ConfirmDialog";
import { Drawer } from "./ui/Drawer";
import { Field } from "./ui/Field";
import { Money } from "./ui/Money";
import { MoreText } from "./ui/MoreText";
import {
  ageLabel,
  approveAction,
  EXPENSE_CATEGORIES,
  expenseErrors,
  isSmall,
  isStale,
  itemKey,
  KIND_LABEL,
  MAX_NOTE,
  MAX_REASON,
  parseAmount,
  rejectAction,
  RULE_LABEL,
  taipeiDay,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalRule,
  type Approvals,
  type Attachment,
  type ExpenseErrors,
  type SentItem,
} from "@/lib/approvals";
import { demoKey, useBoardState } from "@/lib/demo-state";
import { formatTwd } from "@/lib/format";
import { blobToDataUrl, formatBytes, shrinkPhoto } from "@/lib/receipt";

type Tab = "inbox" | "mine";
type Filter = "all" | ApprovalKind;
type BoardState = { items: ApprovalItem[]; mine: SentItem[]; rules: ApprovalRule[] };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "expense", label: "報帳" },
  { id: "leave", label: "假單" },
  { id: "purchase", label: "採購" },
  { id: "quote", label: "報價" },
  { id: "other", label: "其他" },
];

const QUICK_REASONS = ["請附收據或發票", "金額不對，請再核對", "請先跟我談一下", "超過這個月的預算"];

/** Search params are the page's state, so 返回 and shared links land on the same tab; changing them does not reload the page. */
function useParamState() {
  const params = useSearchParams();
  const pathname = usePathname();
  function set(updates: Record<string, string | null>, push = false) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const url = `${pathname}${next.size ? `?${next}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }
  function href(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `${pathname}${next.size ? `?${next}` : ""}`;
  }
  return { params, set, href };
}

/** The page's one 報帳 button; opens the form on the board below. */
export function NewExpenseButton() {
  const { set } = useParamState();
  return (
    <button type="button" className={buttonClass({ variant: "secondary" })} onClick={() => set({ new: "1" }, true)}>
      ＋ 報帳
    </button>
  );
}

function what(item: ApprovalItem) {
  switch (item.kind) {
    case "leave":
      return `${item.title}${item.dates ? ` · ${item.dates}` : ""}`;
    case "purchase":
      return item.party ? `給 ${item.party}：${item.title}` : item.title;
    case "quote":
      return item.party ? `${item.party}：${item.title}` : item.title;
    case "other":
      return `${item.doctype} ${item.title}`;
    default:
      return item.title;
  }
}

function plural(items: ApprovalItem[]) {
  return items.reduce((n, i) => n + (i.amount ?? 0), 0);
}

export function ApprovalsBoard({ data, live, packId, now, today }: { data: Approvals; live: boolean; packId: string; now: number; today: string }) {
  const initial = useMemo<BoardState>(() => ({ items: data.items, mine: data.mine, rules: data.rules }), [data]);
  const [state, setState] = useBoardState(demoKey("approvals", packId), initial, live);
  const { params, set, href } = useParamState();
  const action = useLiveAction();
  const [note, setNote] = useState<string | null>(null);
  const [formOutcome, setFormOutcome] = useState<ActionOutcome | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const tab: Tab = data.can.approve && params.get("tab") !== "mine" ? "inbox" : "mine";
  const rawFilter = params.get("type");
  const filter: Filter = FILTERS.some((f) => f.id === rawFilter) ? (rawFilter as Filter) : "all";
  const composing = params.get("new") === "1";

  const counts = useMemo(() => {
    const c = new Map<Filter, number>([["all", state.items.length]]);
    for (const i of state.items) c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
    return c;
  }, [state.items]);
  const visible = filter === "all" ? state.items : state.items.filter((i) => i.kind === filter);
  const small = visible.filter(isSmall);
  const busy = action.busy || pending !== null;

  async function decide(items: ApprovalItem[], kind: "approve" | "reject", reason?: string) {
    const key = items.length === 1 ? `${itemKey(items[0])}:${kind}` : `bulk:${kind}`;
    const verb = kind === "approve" ? "核准" : "退回";
    if (live) {
      setPending(key);
      await action.run(
        "/api/approvals/decide",
        { items: items.map((i) => ({ doctype: i.doctype, name: i.name, action: (kind === "approve" ? approveAction(i) : rejectAction(i))!.action })), reason },
        (r) => String(r.message ?? `已${verb}`),
      );
      setPending(null);
      return;
    }
    const keys = new Set(items.map(itemKey));
    setState((s) => ({ ...s, items: s.items.filter((i) => !keys.has(itemKey(i))) }));
    setNote(
      items.length === 1
        ? `練習：已${verb} ${items[0].requester} 的${KIND_LABEL[items[0].kind]}${items[0].amount !== null ? ` ${formatTwd(items[0].amount)}` : ""}${reason ? `，原因「${reason}」` : ""}，沒有送出。`
        : `練習：一次核准 ${items.length} 張，合計 ${formatTwd(plural(items))}，沒有送出。`,
    );
  }

  async function bulkApprove() {
    const ok = await confirm({
      title: `一次核准 ${small.length} 張？`,
      body: (
        <ul className="space-y-1">
          {small.map((i) => (
            <li key={itemKey(i)} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {i.requester} · {KIND_LABEL[i.kind]} {i.title}
              </span>
              <span className="shrink-0">{i.amount !== null ? <Money amount={i.amount} /> : `${i.days} 天`}</span>
            </li>
          ))}
        </ul>
      ),
      confirmLabel: "全部核准",
    });
    if (ok) await decide(small, "approve");
  }

  function pickTab(next: Tab) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      set({ tab: next === "inbox" ? null : "mine" });
    };
  }

  function addSent(item: SentItem, message: string) {
    setState((s) => ({ ...s, mine: [item, ...s.mine] }));
    setNote(message);
  }

  return (
    <div className="space-y-5">
      <ActionNote>{note}</ActionNote>
      <ActionOutcomeNote outcome={action.outcome} />
      <ActionOutcomeNote outcome={formOutcome} />
      {confirmDialog}

      {data.unavailable.length ? (
        <p className="text-sm text-warn" role="status">
          {data.unavailable.join("、")}現在拿不到，其他照常。稍後再整理一次。
        </p>
      ) : null}

      {data.can.approve ? (
        <nav className="segmented" aria-label="簽核">
          <a href={href({ tab: null })} aria-current={tab === "inbox" ? "page" : undefined} onClick={pickTab("inbox")}>
            等我簽
            <span className="badge-count ml-1.5">{state.items.length}</span>
          </a>
          <a href={href({ tab: "mine" })} aria-current={tab === "mine" ? "page" : undefined} onClick={pickTab("mine")}>
            我送出的
          </a>
        </nav>
      ) : null}

      {tab === "inbox" ? (
        <section aria-labelledby="inbox-title" className="space-y-3">
          <h2 id="inbox-title" className="sr-only">
            等我簽
          </h2>
          {state.items.length ? (
            <div className="toolbar">
              <nav className="segmented" aria-label="種類">
                {FILTERS.filter((f) => f.id === "all" || counts.get(f.id)).map((f) => (
                  <a
                    key={f.id}
                    href={href({ type: f.id === "all" ? null : f.id })}
                    aria-current={filter === f.id ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      set({ type: f.id === "all" ? null : f.id });
                    }}
                  >
                    {f.label} {counts.get(f.id) ?? 0}
                  </a>
                ))}
              </nav>
              {small.length >= 2 ? (
                <Button variant="primary" size="sm" pending={pending === "bulk:approve"} disabled={busy} onClick={bulkApprove}>
                  小額一次核准 {small.length} 張
                </Button>
              ) : null}
            </div>
          ) : null}

          {visible.length ? (
            <ul className="approval-list">
              {visible.map((item) => (
                <ApprovalCard
                  key={itemKey(item)}
                  item={item}
                  now={now}
                  live={live}
                  busy={busy}
                  pending={pending}
                  onApprove={() => decide([item], "approve")}
                  onReject={() => setRejecting(item)}
                  onView={setViewing}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              title={state.items.length ? "這一類沒有等你簽的" : "沒有等你簽的單"}
              detail="同事送來的報帳、假單，超過門檻的採購單和大折扣報價，會排在這裡，等最久的在最上面。"
              help="module-approvals"
            />
          )}
        </section>
      ) : (
        <SentList items={state.mine} now={now} onView={setViewing} live={live} />
      )}

      {data.can.configure ? <Rules rules={state.rules} live={live} busy={busy} run={action.run} onPractice={(rules, message) => (setState((s) => ({ ...s, rules })), setNote(message))} /> : null}

      <RejectDialog
        item={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          const item = rejecting!;
          setRejecting(null);
          await decide([item], "reject", reason);
        }}
      />

      <Drawer open={viewing !== null} title={viewing?.name ?? "附件"} onClose={() => setViewing(null)}>
        {viewing ? viewing.src ? <ReceiptImage src={viewing.src} alt={`收據：${viewing.name}`} className="receipt-full" /> : <SampleReceipt large /> : null}
      </Drawer>

      <Drawer open={composing} title="報帳" onClose={() => set({ new: null })}>
        {composing ? (
          <ExpenseForm
            data={data}
            live={live}
            today={today}
            onDone={(outcome, sent) => {
              set({ new: null, tab: data.can.approve ? "mine" : null });
              if (sent) addSent(sent, outcome.message);
              else setFormOutcome(outcome);
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function ApprovalCard({
  item,
  now,
  live,
  busy,
  pending,
  onApprove,
  onReject,
  onView,
}: {
  item: ApprovalItem;
  now: number;
  live: boolean;
  busy: boolean;
  pending: string | null;
  onApprove: () => void;
  onReject: () => void;
  onView: (file: Attachment) => void;
}) {
  const approve = approveAction(item);
  const reject = rejectAction(item);
  const age = ageLabel(item.created, now);
  const key = itemKey(item);
  const titleId = useId();
  return (
    <li className="card approval-card" aria-labelledby={titleId}>
      <div className="flex items-start gap-3">
        <Avatar name={item.requester} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p id={titleId} className="min-w-0 font-medium">
              {item.requester}
              <span className="ml-2 text-sm font-normal text-cream-dim">{KIND_LABEL[item.kind]}</span>
            </p>
            <p className="approval-amount">{item.amount !== null ? <Money amount={item.amount} /> : item.days !== undefined ? `${item.days} 天` : null}</p>
          </div>
          <p className="text-sm">
            {what(item)}
            {item.discount ? (
              <Badge tone="warn" className="ml-2">
                折扣 {item.discount}%
              </Badge>
            ) : null}
          </p>
          {item.reason ? <MoreText className="text-sm text-cream-dim">{item.reason}</MoreText> : null}
          <p className="text-xs text-cream-dim">
            {age ? <span className={isStale(item.created, now) ? "text-warn" : undefined}>{`送來 ${age}`}</span> : null}
            {age ? " · " : null}
            {item.name}
            {item.state ? ` · ${item.state}` : null}
          </p>
          {item.attachments.length ? <Attachments files={item.attachments} href={item.href} live={live} onView={onView} /> : null}
        </div>
      </div>
      <div className="approval-actions">
        {approve ? (
          <Button variant="secondary" pending={pending === `${key}:approve`} disabled={busy} onClick={onApprove} aria-label={`核准 ${item.requester} 的${KIND_LABEL[item.kind]}`}>
            核准
          </Button>
        ) : null}
        {reject ? (
          <Button variant="ghost" pending={pending === `${key}:reject`} disabled={busy} onClick={onReject} aria-label={`退回 ${item.requester} 的${KIND_LABEL[item.kind]}`}>
            退回
          </Button>
        ) : null}
        {live && item.href ? (
          <DeskLink href={item.href} className={buttonClass({ variant: "ghost", size: "sm" })}>
            在 ERPNext 打開
          </DeskLink>
        ) : null}
      </div>
    </li>
  );
}

/** Receipts are private (served through our proxy) or still on the phone (blob/data URL), so next/image cannot fetch them. */
function ReceiptImage({ src, alt, className, lazy = false }: { src: string; alt: string; className?: string; lazy?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={lazy ? "lazy" : undefined} />;
}

function SampleReceipt({ large = false }: { large?: boolean }) {
  return (
    <span className={`receipt-sample ${large ? "receipt-sample-lg" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function Attachments({ files, href, live, onView }: { files: Attachment[]; href?: string; live: boolean; onView: (file: Attachment) => void }) {
  return (
    <ul className="flex flex-wrap gap-2 pt-1" aria-label="附件">
      {files.map((f) =>
        f.image ? (
          <li key={f.id}>
            <button type="button" className="receipt-thumb" onClick={() => onView(f)} aria-label={`看收據：${f.name}`}>
              {f.src ? <ReceiptImage src={f.src} alt="" lazy /> : <SampleReceipt />}
            </button>
          </li>
        ) : (
          <li key={f.id} className="self-center text-xs">
            {live && href ? (
              <DeskLink href={href} className="underline underline-offset-2">
                附件：{f.name}
              </DeskLink>
            ) : (
              <span className="text-cream-dim">附件：{f.name}</span>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

function SentList({ items, now, live, onView }: { items: SentItem[]; now: number; live: boolean; onView: (file: Attachment) => void }) {
  return (
    <section aria-labelledby="mine-title" className="space-y-3">
      <h2 id="mine-title" className="section-title">
        我送出的
      </h2>
      {items.length ? (
        <ul className="queue">
          {items.map((m) => (
            <li key={itemKey(m)} className="queue-item approval-sent">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p>
                  <span className="text-cream-dim">{KIND_LABEL[m.kind]} · </span>
                  {m.title}
                </p>
                {m.note ? (
                  <p className={`text-xs ${m.tone === "danger" ? "text-danger" : "text-cream-dim"}`}>
                    {m.tone === "danger" ? "退回原因：" : ""}
                    {m.note}
                  </p>
                ) : null}
                <p className="text-xs text-cream-dim">
                  {ageLabel(m.created, now)}
                  {live && m.href ? (
                    <>
                      {" · "}
                      <DeskLink href={m.href} className="underline underline-offset-2">
                        {m.name}
                      </DeskLink>
                    </>
                  ) : null}
                </p>
                {m.attachments?.length ? <Attachments files={m.attachments} live={live} onView={onView} /> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <span className="text-sm">{m.amount !== null ? <Money amount={m.amount} /> : m.days !== undefined ? `${m.days} 天` : null}</span>
                <Badge tone={m.tone}>{m.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title="最近 60 天沒有送出報帳或假單" detail="按上面的「報帳」，拍收據、填金額就能送出。" help="module-approvals" />
      )}
    </section>
  );
}

function RejectDialog({ item, onClose, onConfirm }: { item: ApprovalItem | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      opener.current = document.activeElement;
      setReason("");
      setError(null);
      dialog.showModal();
      area.current?.focus();
    } else if (!item && dialog.open) dialog.close();
  }, [item]);

  function close() {
    ref.current?.close();
    onClose();
    if (opener.current instanceof HTMLElement) opener.current.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = reason.trim();
    if (text.length < 2) {
      setError("請寫退回原因，讓對方知道要改什麼。");
      area.current?.focus();
      return;
    }
    ref.current?.close();
    onConfirm(text);
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={trapTab}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      {item ? (
        <form className="space-y-4 p-6" onSubmit={submit} noValidate>
          <h2 id={`${id}-title`} className="text-lg font-medium">
            退回 {item.requester} 的{KIND_LABEL[item.kind]}？
          </h2>
          <p className="text-sm text-cream-dim">
            {what(item)}
            {item.amount !== null ? ` · ${formatTwd(item.amount)}` : ""}。對方會在「我送出的」看到原因。
          </p>
          <Field label="退回原因" error={error ?? undefined} hint={`最多 ${MAX_REASON} 字`}>
            <textarea ref={area} className="field min-h-24" value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2" aria-label="常用原因">
            {QUICK_REASONS.map((r) => (
              <button key={r} type="button" className="choice-chip" onClick={() => (setReason(r), setError(null))}>
                {r}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" className={buttonClass({ variant: "secondary" })} onClick={close}>
              取消
            </button>
            <button type="submit" className={buttonClass({ variant: "danger" })}>
              退回
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}

type Photo = { blob: Blob; url: string; size: number; original: number };

function ExpenseForm({ data, live, today, onDone }: { data: Approvals; live: boolean; today: string; onDone: (outcome: ActionOutcome, sent?: SentItem) => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [shrinking, setShrinking] = useState(false);
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const categoryId = useId();
  const router = useRouter();

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  if (live && !data.hrms) {
    return (
      <EmptyState
        compact
        title="這家公司的 ERPNext 還沒裝人事模組，所以還不能在這裡報帳。"
        detail="報帳單（Expense Claim）在 Frappe HRMS 裡。請 DropOut OS 導入顧問在導入工具選「人事」。"
        help="module-approvals"
      />
    );
  }
  if (live && !data.employee) {
    return <EmptyState compact title="你的帳號還沒連到員工資料。" detail="請人資在 ERPNext 的員工資料（Employee）填上你的使用者帳號，就能在這裡報帳。" help="module-approvals" />;
  }

  async function pick(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    setShrinking(true);
    try {
      const blob = await shrinkPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob), size: blob.size, original: file.size });
      setErrors((e) => ({ ...e, note: undefined }));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "這張照片讀不出來。");
    } finally {
      setShrinking(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    const input = { amount, date, category, note: note.trim(), hasReceipt: Boolean(photo) };
    const found = expenseErrors(input, taipeiDay());
    setErrors(found);
    if (Object.keys(found).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const value = parseAmount(amount);
    setSending(true);
    try {
      if (!live) {
        const src = photo ? await blobToDataUrl(photo.blob) : undefined;
        const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "medium" }).format(new Date());
        onDone(
          { ok: true, message: `練習：報帳送出了，${category} ${formatTwd(value)}，沒有送到 ERPNext。` },
          {
            doctype: "Expense Claim",
            name: `練習-${Date.now()}`,
            kind: "expense",
            title: category,
            amount: value,
            status: "等核准",
            tone: "warn",
            note: input.note || undefined,
            created: stamp,
            attachments: src ? [{ id: `practice-${Date.now()}`, name: "收據.jpg", image: true, src }] : [],
          },
        );
        return;
      }
      const form = new FormData();
      form.set("amount", String(value));
      form.set("date", date);
      form.set("category", category);
      form.set("note", input.note);
      if (photo) form.set("receipt", photo.blob, "receipt.jpg");
      const res = await fetch("/api/approvals/expense", { method: "POST", body: form });
      const result = (await res.json().catch(() => ({ ok: false, message: `回應 ${res.status}` }))) as { ok: boolean; message?: string; errors?: ExpenseErrors; created?: { href?: string } };
      if (res.status === 401) {
        setFailure(result.message ?? "登入已過期，請重新登入");
        return;
      }
      if (!result.ok) {
        if (result.errors) setErrors(result.errors);
        setFailure(result.message ?? "沒有送出");
        return;
      }
      onDone({ ok: true, message: result.message ?? "報帳送出了", href: result.created?.href });
      router.refresh();
    } catch {
      setFailure("連不到 DropOut OS，請檢查網路後再試一次");
    } finally {
      setSending(false);
    }
  }

  return (
    <form ref={formRef} className="space-y-4" onSubmit={submit} noValidate>
      {failure ? (
        <p className="text-sm text-danger" role="alert">
          {failure}
          {failure.includes("登入") ? (
            <>
              {" "}
              <a className="underline" href={`/login?next=${encodeURIComponent("/workspace/approvals?new=1")}`}>
                重新登入
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="space-y-2">
        <span className="field-label">收據</span>
        {photo ? (
          <div className="flex items-start gap-3">
            <ReceiptImage src={photo.url} alt="收據預覽" className="receipt-preview" />
            <div className="space-y-2 text-xs text-cream-dim">
              <p>
                已縮小到 {formatBytes(photo.size)}
                {photo.original > photo.size ? `（原本 ${formatBytes(photo.original)}）` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass({ variant: "secondary", size: "sm" })} onClick={() => fileRef.current?.click()}>
                  換一張
                </button>
                <button type="button" className={buttonClass({ variant: "ghost", size: "sm" })} onClick={() => setPhoto(null)}>
                  拿掉
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="receipt-drop" onClick={() => fileRef.current?.click()} disabled={shrinking} aria-describedby={photoError ? `${categoryId}-photo` : undefined}>
            {shrinking ? <span className="spinner" aria-hidden="true" /> : null}
            <span className="font-medium">{shrinking ? "照片處理中…" : "拍收據或選照片"}</span>
            <span className="text-xs text-cream-dim">手機會打開相機；照片會先縮小再送出</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files?.[0])} />
        {photoError ? (
          <p id={`${categoryId}-photo`} className="field-error" role="alert">
            {photoError}
          </p>
        ) : null}
      </div>

      <Field label="金額（NT$）" error={errors.amount}>
        <input className="field" inputMode="decimal" autoComplete="off" placeholder="例如 1240" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="field-label">分類</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-describedby={errors.category ? `${categoryId}-error` : undefined} aria-invalid={errors.category ? true : undefined}>
          {EXPENSE_CATEGORIES.map((c) => (
            <label key={c} className="choice-chip">
              <input type="radio" name="category" value={c} checked={category === c} onChange={() => setCategory(c)} className="sr-only" />
              {c}
            </label>
          ))}
        </div>
        {errors.category ? (
          <p id={`${categoryId}-error`} className="field-error" role="alert">
            {errors.category}
          </p>
        ) : null}
      </fieldset>

      <Field label="日期" error={errors.date} hint="收據上的日期">
        <input className="field" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <Field label="備註" error={errors.note} hint={photo ? "去哪裡、做什麼，主管看得懂就好" : "沒有收據的話，請寫原因"}>
        <textarea className="field min-h-20" maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：到客戶那邊開會，高鐵來回" />
      </Field>

      <div className="form-actions">
        <Button type="submit" variant="primary" block pending={sending} pendingLabel="送出中…" disabled={shrinking}>
          送出報帳
        </Button>
      </div>
    </form>
  );
}

function Rules({
  rules,
  live,
  busy,
  run,
  onPractice,
}: {
  rules: ApprovalRule[];
  live: boolean;
  busy: boolean;
  run: ReturnType<typeof useLiveAction>["run"];
  onPractice: (rules: ApprovalRule[], message: string) => void;
}) {
  return (
    <Section id="rules" title="核准規則" aside={live ? "只有老闆能改，改了馬上生效" : "練習：只改這個畫面"}>
      <ul className="grid gap-3 md:grid-cols-2">
        {rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            live={live}
            busy={busy}
            onSave={async (enabled, threshold) => {
              const label = RULE_LABEL[rule.id];
              const message = enabled ? label.plain(threshold) : `${label.title}不用再核准`;
              if (live) {
                await run("/api/approvals/rules", { rule: rule.id, enabled, threshold }, () => `已更新：${message}`);
                return;
              }
              onPractice(
                rules.map((r) => (r.id === rule.id ? { ...r, active: enabled, threshold } : r)),
                `練習：${message}，沒有送出。`,
              );
            }}
          />
        ))}
      </ul>
    </Section>
  );
}

function RuleCard({ rule, live, busy, onSave }: { rule: ApprovalRule; live: boolean; busy: boolean; onSave: (enabled: boolean, threshold: number) => Promise<void> }) {
  const label = RULE_LABEL[rule.id];
  const [enabled, setEnabled] = useState(rule.active);
  const [value, setValue] = useState(String(rule.threshold));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggleId = useId();
  const max = rule.id === "quote" ? 99 : 100_000_000;
  const dirty = enabled !== rule.active || Number(value) !== rule.threshold;

  async function save(event: FormEvent) {
    event.preventDefault();
    const n = Number(value.replace(/[,\s]/g, ""));
    if (enabled && (!Number.isFinite(n) || n < 1 || n > max)) {
      setError(rule.id === "quote" ? "折扣門檻要在 1 到 99 之間。" : "金額門檻要大於 0。");
      return;
    }
    setError(null);
    setSaving(true);
    await onSave(enabled, enabled ? n : rule.threshold);
    setSaving(false);
  }

  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{label.title}</h3>
        <Badge tone={rule.active ? "ok" : "neutral"}>{rule.active ? "開著" : "沒開"}</Badge>
      </div>
      {rule.other ? (
        <p className="text-sm text-cream-dim">{`ERPNext 已經在用「${rule.other}」這個核准流程，這裡不能改。要換成 DropOut 的，請先在 ERPNext 停用它。`}</p>
      ) : (
        <form className="space-y-3" onSubmit={save} noValidate>
          <p className="text-sm text-cream-dim">{rule.active ? label.plain(rule.threshold) : `目前${label.title}不用核准，送出就算數。`}</p>
          <label htmlFor={toggleId} className="flex items-center gap-2 text-sm">
            <input id={toggleId} type="checkbox" className="size-5" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            要主管核准
          </label>
          {enabled ? (
            <Field label={rule.id === "quote" ? "折扣超過（%）" : "金額超過（NT$，含稅）"} error={error ?? undefined}>
              <input className="field" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          ) : null}
          <Button type="submit" variant="secondary" size="sm" pending={saving} disabled={busy || !dirty}>
            {live ? "儲存" : "儲存（練習）"}
          </Button>
        </form>
      )}
    </li>
  );
}
