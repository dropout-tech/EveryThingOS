"use client";

export function PrintButtonClient({ label = "列印或存成 PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-ghost">
      {label}
    </button>
  );
}
