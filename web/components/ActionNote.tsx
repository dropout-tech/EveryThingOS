"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/** The shell renders one `#toast-root` (an aria-live region); outside the shell toasts stay inline. */
function useToastRoot() {
  return useSyncExternalStore(
    noop,
    () => document.getElementById("toast-root"),
    () => null,
  );
}

export function ToastRoot() {
  return <div id="toast-root" className="toast-stack" aria-live="polite" aria-relevant="additions text" />;
}

export function Toast({ tone = "ok", children, onClose }: { tone?: "ok" | "error"; children: ReactNode; onClose?: () => void }) {
  const root = useToastRoot();
  const body = (
    <div className={`toast ${tone === "error" ? "toast-error" : ""}`} role={tone === "error" ? "alert" : undefined}>
      <div className="min-w-0 flex-1 py-1">{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm shrink-0 no-underline" aria-label="關掉這則訊息">
          ✕
        </button>
      ) : null}
    </div>
  );
  return root ? createPortal(body, root) : body;
}

export function ActionNote({ children }: { children: string | null }) {
  const [closed, setClosed] = useState<string | null>(null);
  if (!children || closed === children) return null;
  return <Toast onClose={() => setClosed(children)}>{children}</Toast>;
}
