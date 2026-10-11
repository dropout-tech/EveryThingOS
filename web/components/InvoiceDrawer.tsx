"use client";

import { useMemo, useState } from "react";
import type { useLiveAction } from "./LiveAction";
import { Button } from "./ui/Button";
import { Drawer } from "./ui/Drawer";
import { Field } from "./ui/Field";
import { Money } from "./ui/Money";
import { formatTwd } from "@/lib/format";
import { formatHours, invoiceLines, isInvoiceable, sum, type Project, type TimeLog } from "@/lib/projects";

type Props = {
  open: boolean;
  onClose: () => void;
  project: Project;
  logs: TimeLog[];
  services: { code: string; name: string }[];
  live: boolean;
  canInvoice: boolean;
  action: ReturnType<typeof useLiveAction>;
  onDemoBill: (ids: string[]) => void;
};

/** 開成發票: pick the hours, see the lines, make the invoice. Live it is a draft in ERPNext for accounting to submit. */
export function InvoiceDrawer(props: Props) {
  return (
    <Drawer open={props.open} title={`開成發票｜${props.project.name}`} onClose={props.onClose}>
      {props.open ? <InvoiceForm {...props} /> : null}
    </Drawer>
  );
}

function InvoiceForm({ onClose, project, logs, services, live, canInvoice, action, onDemoBill }: Props) {
  const open = useMemo(() => logs.filter((l) => l.project === project.id && isInvoiceable(l)), [logs, project.id]);
  const drafts = sum(logs.filter((l) => l.project === project.id && l.billable && !l.submitted && !l.invoice).map((l) => l.hours));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(open.map((l) => l.id)));
  const [item, setItem] = useState(services[0]?.code ?? "");
  const chosen = open.filter((l) => picked.has(l.id));
  const preview = invoiceLines(chosen);
  const blocked = !canInvoice ? "你的 ERPNext 角色不能開發票，請會計來按。" : !project.customer ? "這個專案還沒填客人，請先在 ERPNext 的專案填上客人。" : live && !services.length ? "ERPNext 裡還沒有「不管庫存的服務品項」，請先建一個，例如「專業服務」。" : null;

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!chosen.length || blocked) return;
    const ids = chosen.map((l) => l.id);
    if (!live) {
      onDemoBill(ids);
      onClose();
      return;
    }
    const done = await action.run("/api/projects/invoice", { project: project.id, details: ids, item_code: item || null }, (r) => `已開發票草稿 ${r.created?.name ?? ""}：${formatHours(preview.hours)}，含稅 ${formatTwd(Number(r.grand_total ?? preview.total))}。請會計確認後送出。`);
    if (done?.ok) onClose();
  }

  if (!open.length) {
    return (
      <div className="space-y-2 text-sm">
        <p>這個專案沒有還沒請款的工時。</p>
        {drafts > 0 ? <p className="text-cream-dim">有 {formatHours(drafts)} 還在工時表草稿，送出後才能請款。</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-cream-dim">
        開給 <span className="text-cream">{project.customer ?? "（還沒填客人）"}</span>。勾掉這次不收的工時。
      </p>

      <fieldset className="space-y-1">
        <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-medium">
          <span>
            還沒請款的工時（{open.length} 筆）
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(picked.size === open.length ? new Set() : new Set(open.map((l) => l.id)))}>
            {picked.size === open.length ? "全部不選" : "全部選"}
          </button>
        </legend>
        <ul className="max-h-[40dvh] space-y-1 overflow-y-auto pr-1">
          {open.map((l) => (
            <li key={l.id}>
              <label className="glass-chip flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" className="size-5 shrink-0" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {l.date.slice(5)} · {l.person}
                    {l.activity ? ` · ${l.activity}` : ""}
                  </span>
                  {l.note ? <span className="block truncate text-xs text-cream-dim">{l.note}</span> : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block">{formatHours(l.hours)}</span>
                  <Money amount={l.billAmount} className="block text-xs text-cream-dim" />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <section aria-label="發票預覽" className="glass-well space-y-2 p-4 text-sm">
        <h3 className="font-medium">發票上會寫</h3>
        {preview.lines.length ? (
          <table className="w-full">
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.activity}>
                  <td className="py-1">
                    {line.activity}
                    <span className="block text-xs text-cream-dim">
                      {formatHours(line.hours)} × {formatTwd(line.rate)}
                    </span>
                  </td>
                  <td className="num py-1 text-right">
                    <Money amount={line.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-[var(--line)]">
              <tr>
                <td className="pt-2 text-cream-dim">未稅</td>
                <td className="num pt-2 text-right">
                  <Money amount={preview.net} />
                </td>
              </tr>
              <tr>
                <td className="text-cream-dim">營業稅 5%</td>
                <td className="num text-right">
                  <Money amount={preview.tax} />
                </td>
              </tr>
              <tr className="font-medium">
                <td>含稅</td>
                <td className="num text-right">
                  <Money amount={preview.total} />
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-cream-dim">至少選一筆工時。</p>
        )}
        {live ? <p className="text-xs text-cream-dim">稅額以 ERPNext 的稅別設定為準。</p> : null}
      </section>

      {live && services.length > 1 ? (
        <Field label="發票品項" hint="工時會寫在這個服務品項底下">
          <select className="field" value={item} onChange={(e) => setItem(e.target.value)}>
            {services.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {blocked ? (
        <p className="text-sm text-warn" role="status">
          {blocked}
        </p>
      ) : null}
      {drafts > 0 ? <p className="text-xs text-cream-dim">另外有 {formatHours(drafts)} 還在工時表草稿，送出後才能請款。</p> : null}

      <div className="form-actions sticky-submit">
        <Button variant="primary" block disabled={!chosen.length || Boolean(blocked)} pending={action.busy} pendingLabel="開立中…" onClick={submit}>
          {chosen.length ? `開成發票（含稅 ${formatTwd(preview.total)}）` : "開成發票"}
        </Button>
      </div>
      <p className="text-xs text-cream-dim">{live ? "會在 ERPNext 開一張發票草稿，會計確認後送出，才會開出電子發票。" : "練習：發票會出現在「銷售」的「請他付錢」那一欄，不會真的開出去。"}</p>
    </div>
  );
}
