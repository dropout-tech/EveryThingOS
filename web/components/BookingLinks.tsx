import { headers } from "next/headers";

const LINKS = [
  { from: "line", label: "LINE 圖文選單" },
  { from: "ig", label: "Instagram 個人頁" },
  { from: "fb", label: "Facebook 粉專按鈕" },
  { from: "counter", label: "門市平板" },
] as const;

/** 同一個預約頁，依來源帶參數；預約進來就是一張課程訂單，材料夠才鎖料。 */
export async function BookingLinks() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  return (
    <details className="glass p-5">
      <summary className="cursor-pointer text-sm font-medium">預約連結：貼到 LINE、IG、FB 或門市平板</summary>
      <p className="mt-2 text-xs text-cream-dim">客人預約時，系統用課程 BOM 算名額：材料夠就開單並鎖料，不夠就排候補並標出缺哪一項。</p>
      <ul className="mt-3 space-y-2">
        {LINKS.map((l) => (
          <li key={l.from} className="glass-chip flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{l.label}</span>
            <a href={`/book?from=${l.from}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline underline-offset-2">
              {origin}/book?from={l.from}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
