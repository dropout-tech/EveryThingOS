"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { trapTab } from "./ConfirmDialog";

/**
 * One item's details beside the list (bottom sheet on phones), so people keep their place.
 * Native modal <dialog>: Esc closes and focus returns to whatever opened it.
 */
export function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={trapTab}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      {open ? (
        <>
          <div className="drawer-head">
            <h2 id={titleId} className="section-title">
              {title}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm no-underline" onClick={() => ref.current?.close()}>
              關閉
            </button>
          </div>
          <div className="drawer-body">{children}</div>
          {footer ? <div className="form-actions border-t border-[var(--line)] px-5 py-4">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
