"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

type LensProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  radius?: number;
  elasticity?: number;
};

function edgeMap(width: number, height: number, radius: number) {
  const w = Math.max(24, Math.min(360, Math.round(width)));
  const h = Math.max(24, Math.min(240, Math.round(height)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const { data } = img;
  const r = Math.min(radius * (w / Math.max(width, 1)), w / 2, h / 2);
  const cx = w / 2;
  const cy = h / 2;
  const hw = w / 2 - r;
  const hh = h / 2 - r;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - cx) - hw;
      const dy = Math.abs(y - cy) - hh;
      const ox = Math.max(dx, 0);
      const oy = Math.max(dy, 0);
      const dist = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
      const edge = Math.exp(-Math.abs(dist) * 0.11);
      const i = (y * w + x) * 4;
      data[i] = 128 + ((x - cx) / cx) * edge * 118;
      data[i + 1] = 128 + ((y - cy) / cy) * edge * 118;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export function Lens({ children, className = "", radius = 40, elasticity = 0.14 }: LensProps) {
  const rawId = useId().replace(/:/g, "");
  const filterId = `lens-${rawId}`;
  const root = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState("");
  const [shift, setShift] = useState({ x: 0, y: 0, sx: 1, sy: 1, px: 28, py: 18 });

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    function paint() {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      setMap(edgeMap(rect.width, rect.height, radius));
    }

    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(node);
    return () => observer.disconnect();
  }, [radius]);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    function onMove(event: PointerEvent) {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const reach = Math.min(1, Math.hypot(dx, dy) / 280);
      setShift({
        x: dx * elasticity * 0.08 * reach,
        y: dy * elasticity * 0.08 * reach,
        sx: 1 + Math.abs(dx) * elasticity * 0.00025 * reach,
        sy: 1 + Math.abs(dy) * elasticity * 0.00025 * reach,
        px: ((event.clientX - rect.left) / rect.width) * 100,
        py: ((event.clientY - rect.top) / rect.height) * 100,
      });
    }

    function onLeave() {
      setShift({ x: 0, y: 0, sx: 1, sy: 1, px: 28, py: 18 });
    }

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [elasticity]);

  const style = {
    "--glass-px": `${shift.px}%`,
    "--glass-py": `${shift.py}%`,
    transform: `translate(${shift.x.toFixed(2)}px, ${shift.y.toFixed(2)}px) scale(${shift.sx.toFixed(3)}, ${shift.sy.toFixed(3)})`,
    borderRadius: `${radius}px`,
  } as CSSProperties;

  return (
    <div ref={root} className={`lens ${className}`} style={style}>
      <svg className="lens-defs" aria-hidden="true" width="0" height="0">
        <filter id={filterId} x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
          {map ? (
            <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
          ) : null}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="G"
            result="mid"
          />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="78" xChannelSelector="R" yChannelSelector="G" result="r" />
          <feColorMatrix in="r" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="70" xChannelSelector="R" yChannelSelector="G" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="62" xChannelSelector="R" yChannelSelector="G" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
          <feBlend in="green" in2="blue" mode="screen" result="gb" />
          <feBlend in="red" in2="gb" mode="screen" />
        </filter>
      </svg>
      <div className="lens-film" style={{ filter: map ? `url(#${filterId})` : undefined }} />
      <div className="lens-body">{children}</div>
    </div>
  );
}
