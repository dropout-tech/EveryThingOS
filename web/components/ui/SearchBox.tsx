"use client";

import { useId } from "react";

/** The filter box at the top of a list. Label stays for screen readers; Esc clears. */
export function SearchBox({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="search-field">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="9" cy="9" r="6" />
        <path d="m14 14 4 4" strokeLinecap="round" />
      </svg>
      <input
        id={id}
        type="search"
        className="field"
        placeholder={placeholder ?? label}
        value={value}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.stopPropagation();
            onChange("");
          }
        }}
      />
    </div>
  );
}
