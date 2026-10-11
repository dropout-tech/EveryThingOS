"use client";

import { useId, useRef, useState } from "react";

type Props = {
  label: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  disabled?: boolean;
  reason?: { label: string; placeholder?: string; required?: boolean };
  /** The operator has to type this exactly, for actions that are hard to undo. */
  typeToConfirm?: string;
  className?: string;
  tone?: "bad";
};

export function ConfirmAction({ label, title, body, confirmLabel, onConfirm, disabled, reason, typeToConfirm, className, tone }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [why, setWhy] = useState("");
  const [typed, setTyped] = useState("");
  const ready = (!reason?.required || why.trim().length > 0) && (!typeToConfirm || typed.trim() === typeToConfirm);

  function close() {
    ref.current?.close();
    setWhy("");
    setTyped("");
  }

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.showModal()} className={className} data-tone={tone}>
        {label}
      </button>
      <dialog ref={ref} aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`} className="site-dialog site-sheet p-0" onClose={() => {
          setWhy("");
          setTyped("");
        }}>
        <form
          method="dialog"
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onConfirm(why.trim());
            close();
          }}
        >
          <h2 id={`${id}-t`} className="text-lg font-medium">
            {title}
          </h2>
          <p id={`${id}-b`} className="text-sm text-cream-dim">
            {body}
          </p>
          {reason ? (
            <label className="block text-sm">
              {reason.label}
              {reason.required ? null : <span className="ml-1 text-xs text-cream-dim">（可不填）</span>}
              <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={reason.placeholder} maxLength={200} className="site-field" autoFocus />
            </label>
          ) : null}
          {typeToConfirm ? (
            <label className="block text-sm">
              輸入「{typeToConfirm}」確認
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="site-field" autoComplete="off" autoFocus={!reason} />
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button type="button" onClick={close} className="glass-pill px-4 py-2 text-sm">
              取消
            </button>
            <button type="submit" disabled={!ready} className="site-chip site-chip-icon !px-4 !py-2 !text-sm disabled:opacity-40" data-tone="bad">
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
