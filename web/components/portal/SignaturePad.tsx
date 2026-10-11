"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

type Point = { x: number; y: number };

export type SignaturePadHandle = {
  /** PNG data URL in dark ink on a transparent background, whatever the theme, or null when nothing is drawn. */
  toPng: () => string | null;
  clear: () => void;
};

const EXPORT_WIDTH = 1000;
const EXPORT_HEIGHT = 400;
const EXPORT_INK = "#111111";

/** Finger or mouse signature. The drawing is kept as strokes so the saved image does not depend on the screen colours. */
export function SignaturePad({ ref, label, describedBy, onChange, disabled }: { ref: Ref<SignaturePadHandle>; label: string; describedBy?: string; onChange?: (empty: boolean) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const paint = useCallback(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const rect = node.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (node.width !== Math.round(rect.width * ratio) || node.height !== Math.round(rect.height * ratio)) {
      node.width = Math.round(rect.width * ratio);
      node.height = Math.round(rect.height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = getComputedStyle(node).color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) drawStroke(ctx, stroke, rect.width, rect.height);
  }, []);

  useEffect(() => {
    paint();
    const observer = new ResizeObserver(paint);
    if (canvas.current) observer.observe(canvas.current);
    const themes = new MutationObserver(paint);
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-style"] });
    return () => {
      observer.disconnect();
      themes.disconnect();
    };
  }, [paint]);

  const update = useCallback(
    (next: boolean) => {
      setEmpty(next);
      onChange?.(next);
    },
    [onChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      clear() {
        strokes.current = [];
        paint();
        update(true);
      },
      toPng() {
        if (!strokes.current.some((s) => s.length > 1)) return null;
        const out = document.createElement("canvas");
        out.width = EXPORT_WIDTH;
        out.height = EXPORT_HEIGHT;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.strokeStyle = EXPORT_INK;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const stroke of strokes.current) drawStroke(ctx, stroke, EXPORT_WIDTH, EXPORT_HEIGHT);
        return out.toDataURL("image/png");
      },
    }),
    [paint, update],
  );

  function point(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1), y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) };
  }

  return (
    <div className="signature-pad" data-empty={empty || undefined} data-disabled={disabled || undefined}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={empty ? `${label}（空白）` : `${label}（已簽）`}
        aria-describedby={describedBy}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          strokes.current.push([point(event)]);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const stroke = strokes.current[strokes.current.length - 1];
          for (const e of event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]) {
            const rect = event.currentTarget.getBoundingClientRect();
            stroke.push({ x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1), y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1) });
          }
          if (strokes.current.length > 200 || stroke.length > 4000) drawing.current = false;
          paint();
          if (empty && stroke.length > 1) update(false);
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      {empty ? (
        <span className="signature-pad-hint" aria-hidden="true">
          在這裡簽名
        </span>
      ) : null}
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Point[], width: number, height: number) {
  if (!stroke.length) return;
  ctx.beginPath();
  ctx.moveTo(stroke[0].x * width, stroke[0].y * height);
  if (stroke.length === 1) ctx.lineTo(stroke[0].x * width + 0.1, stroke[0].y * height);
  for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x * width, stroke[i].y * height);
  ctx.stroke();
}
