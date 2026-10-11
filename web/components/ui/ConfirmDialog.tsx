"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { buttonClass } from "./Button";

/** Keeps Tab and Shift+Tab inside an open dialog. */
export function trapTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select, textarea")];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * Native modal <dialog>: the page behind is inert, Esc cancels, focus starts on 取消 and
 * returns to the button that opened it.
 */
export function ConfirmDialog({ options, onClose }: { options: ConfirmOptions | null; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (options && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      cancel.current?.focus();
    } else if (!options && dialog.open) {
      dialog.close();
    }
  }, [options]);

  function finish(ok: boolean) {
    ref.current?.close();
    onClose(ok);
    if (opener.current instanceof HTMLElement) opener.current.focus();
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={options?.body ? `${id}-body` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
      onKeyDown={trapTab}
      onClick={(event) => {
        if (event.target === ref.current) finish(false);
      }}
    >
      {options ? (
        <div className="space-y-4 p-6">
          <h2 id={`${id}-title`} className="text-lg font-medium">
            {options.title}
          </h2>
          {options.body ? (
            <div id={`${id}-body`} className="text-sm text-cream-dim">
              {options.body}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button ref={cancel} type="button" className={buttonClass({ variant: "secondary" })} onClick={() => finish(false)}>
              {options.cancelLabel ?? "取消"}
            </button>
            <button type="button" className={buttonClass({ variant: options.danger ? "danger" : "primary" })} onClick={() => finish(true)}>
              {options.confirmLabel ?? "確定"}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/** `const [confirm, dialog] = useConfirm()`; render `dialog`, then `if (!(await confirm({...}))) return;`. */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dialog = (
    <ConfirmDialog
      options={options}
      onClose={(ok) => {
        resolver.current?.(ok);
        resolver.current = null;
        setOptions(null);
      }}
    />
  );

  return [confirm, dialog] as const;
}
