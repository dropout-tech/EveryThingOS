import { NextThing } from "@/components/NextThing";
import { channelById } from "@/lib/open-chat/channels";
import { nextThread } from "@/lib/open-chat/threads";
import { waitedText, type WaitingChat } from "@/lib/open-chat/live-queue";
import { windowNote } from "@/lib/open-chat/reply-window";

const SHOWN = 10;

const inboxButton = (
  <a href="/api/chat/open" className="btn btn-primary">
    去收件匣回訊息
  </a>
);

/** The live inbox: who has waited longest, then the next few. Each row opens that conversation in Chatwoot. */
export function LiveQueue({ chats, total, conversationUrl }: { chats: WaitingChat[]; total: number | null; conversationUrl: (id: number) => string }) {
  const first = nextThread(chats);
  if (!first) {
    return <NextThing title="現在沒有人在等你回" detail={`LINE、IG、FB、官網的對話都回過了${total ? `，開啟中 ${total} 個` : ""}。新訊息進來會排在這裡，等最久的在最上面。`} action={inboxButton} />;
  }
  const label = first.channel ? channelById(first.channel)?.label : null;
  return (
    <>
      <NextThing
        title={`${first.name} 等最久，${waitedText(first.waitedMinutes)}了`}
        detail={`${label ? `${label}。` : ""}${first.channel ? windowNote(first.channel, first.waitedMinutes) : ""} 現在 ${chats.length} 個對話在等你回。`}
        action={inboxButton}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-medium">等回的對話</h2>
        <ol className="space-y-2">
          {chats.slice(0, SHOWN).map((c) => (
            <li key={c.id} className="glass-chip flex items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0 truncate">
                {c.name}
                {c.channel ? <span className="ml-2 text-cream-dim">{channelById(c.channel)?.label}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-cream-dim">
                等了 {waitedText(c.waitedMinutes)}
                <a href={conversationUrl(c.id)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-cream">
                  打開
                </a>
              </span>
            </li>
          ))}
        </ol>
        {chats.length > SHOWN ? <p className="text-xs text-cream-dim">還有 {chats.length - SHOWN} 個，在收件匣看全部。</p> : null}
      </section>
    </>
  );
}

export function InboxOnly({ detail }: { detail: string }) {
  return <NextThing title="訊息在收件匣" detail={detail} action={inboxButton} />;
}
