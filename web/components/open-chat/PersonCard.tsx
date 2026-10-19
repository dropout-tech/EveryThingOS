import type { OpenThread } from "@/lib/open-chat/types";
import { channelById } from "@/lib/open-chat/channels";
import { windowNote } from "@/lib/open-chat/reply-window";

/** Who this guest is: channel, how far the follow-up got, what they bought, what they still owe. */
export function PersonCard({ thread }: { thread: OpenThread }) {
  const channel = channelById(thread.channel);

  return (
    <aside className="glass space-y-2 p-4" aria-label="這個人">
      <h2 className="text-lg font-medium leading-snug">{thread.name}</h2>
      <p className="text-sm">
        {channel ? <span className="text-cream-dim">{channel.label} </span> : null}
        {thread.handle}
      </p>
      <p className="text-sm">跟到：{thread.stage}</p>
      <p className="text-sm">買過：{thread.bought}</p>
      <p className="text-sm">還欠：{thread.owed}</p>
      <p className="text-sm text-cream-dim">{windowNote(thread.channel, thread.waitedMinutes)}</p>
    </aside>
  );
}
