"use client";

export function PrintButton({ label = "列印或存成 PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="glass-pill site-noprint px-4 py-2 text-sm">
      {label}
    </button>
  );
}
