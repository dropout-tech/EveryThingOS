"use client";

import { useId, useState, type ReactNode } from "react";
import { findDocs, type DocRow } from "@/lib/find-doc";

export function DocSearch<T extends DocRow>({ rows, children }: { rows: T[]; children?: (found: T[]) => ReactNode }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const found = findDocs(query, rows);

  return (
    <div className="space-y-3">
      <div className="glass p-3">
        <label htmlFor={inputId} className="field-label">
          找單據
        </label>
        <input
          id={inputId}
          className="field"
          type="text"
          value={query}
          placeholder="單號、客人或品名"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {children ? (
        children(found)
      ) : rows.length === 0 ? (
        <p className="text-sm">這裡沒有單</p>
      ) : (
        <ul className="text-sm">
          {found.map((row, index) => (
            <li key={`${row.no}-${index}`}>
              {row.no} {row.party} {row.item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
