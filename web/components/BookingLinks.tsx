import { headers } from "next/headers";
import { Icon, type IconName } from "./ui/Viz";

const LINKS: { from: string; label: string; icon: IconName }[] = [
  { from: "line", label: "LINE 圖文選單", icon: "chat" },
  { from: "ig", label: "Instagram", icon: "camera" },
  { from: "fb", label: "Facebook 粉專", icon: "thumb" },
  { from: "counter", label: "門市平板", icon: "tablet" },
];

/** 同一個預約頁，依來源帶參數；預約進來就是一張課程訂單，材料夠才鎖料。 */
export async function BookingLinks() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  return (
    <details className="glass p-5">
      <summary className="cursor-pointer text-sm font-medium">預約連結：貼到 LINE、IG、FB 或門市平板</summary>
      <div className="viz-flow mt-3">
        <span><Icon name="users" />客人預約</span>
        <Icon name="arrow" />
        <span><Icon name="box" />材料夠：開單鎖料</span>
        <span><Icon name="clock" />不夠：排候補</span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((l) => (
          <li key={l.from} className="glass-chip flex flex-col gap-2 p-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span className="viz-avatar viz-avatar-accent">
                <Icon name={l.icon} />
              </span>
              {l.label}
            </span>
            <a href={`/book?from=${l.from}`} target="_blank" rel="noreferrer" className="truncate font-mono text-xs text-cream-dim underline underline-offset-2">
              {origin.replace(/^https?:\/\//, "")}/book?from={l.from}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
