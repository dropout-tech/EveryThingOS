"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** One line, and 看更多 only when the text actually runs past it. */
export function MoreText({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setLong(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={className}>
      <p ref={ref} id={id} className={open ? "" : "clamp-1"}>
        {children}
      </p>
      {long || open ? (
        <button type="button" className="more-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
          {open ? "收起" : "看更多"}
        </button>
      ) : null}
    </div>
  );
}
