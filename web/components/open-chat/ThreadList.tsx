import type { OpenThread } from "@/lib/open-chat/types";
import { sortThreads } from "@/lib/open-chat/threads";
import { channelById } from "@/lib/open-chat/channels";

export function ThreadList({ threads, activeId }: { threads: OpenThread[]; activeId?: string }) {
  const ordered = sortThreads(threads);
  if (!ordered.length) {
    return <p className="text-sm text-cream-dim">沒有人在等。</p>;
  }

  return (
    <ol aria-label="等回的對話" className="space-y-2">
      {ordered.map((thread) => {
        const label = channelById(thread.channel)?.label;
        return (
          <li key={thread.id} className="glass-chip p-3 text-sm">
            <p>
              {thread.name}
              {label ? <span className="text-cream-dim"> {label}</span> : null}
            </p>
            <p className="text-cream-dim">{thread.preview}</p>
            <p className="text-cream-dim">等了 {thread.waitedMinutes} 分鐘</p>
            {thread.id === activeId ? <p>現在</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
