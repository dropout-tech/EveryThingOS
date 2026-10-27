import { BookingLinks } from "@/components/BookingLinks";
import { ModuleFrame } from "@/components/ModuleFrame";
import { ManychatBoard } from "@/components/open-chat/ManychatBoard";
import { InboxOnly, LiveQueue } from "@/components/open-chat/LiveQueue";
import { OpenChatDesk } from "@/components/open-chat/OpenChatDesk";
import { ReplyBoard } from "@/components/ReplyBoard";
import { Badge } from "@/components/ui/Badge";
import { practiceThreads } from "@/lib/open-chat/threads";
import { seedReplyInbox, seedReplyRules } from "@/lib/reply";
import { tradeOf } from "@/lib/trade";
import { isLive } from "@/lib/sources";
import { liveConfig } from "@/lib/sources/config";
import { liveChatQueue, liveMe } from "@/lib/sources/live";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "對話" };

const CHAT_NOTES: Record<string, string> = {
  "not-connected": "對話系統還沒接上。導入時用導入工具開 Chatwoot 帳戶。",
  "no-user": "你的 ERPNext 帳號還沒對應到對話系統的使用者，請管理員在導入工具重跑「對話帳號」。",
  "sso-failed": "對話系統沒有給登入連結，請稍後再試。",
};

const INBOX_DETAIL = "LINE、IG、FB、官網的對話在同一個收件匣。去那裡回，來問的人會記在客人的時間軸上。";

/** Only people with an inbox account see who is waiting; the list carries customer names. */
async function liveInbox() {
  try {
    if (!(await liveMe()).chatwootUserId) return <InboxOnly detail={INBOX_DETAIL} />;
    const queue = await liveChatQueue();
    if (!queue) return <InboxOnly detail={`${INBOX_DETAIL}誰在等，以收件匣為準。`} />;
    const chat = (await liveConfig()).chatwoot;
    const conversationUrl = (id: number) => (chat?.accountId ? `${chat.url}/app/accounts/${encodeURIComponent(chat.accountId)}/conversations/${id}` : "/api/chat/open");
    return <LiveQueue chats={queue.chats} total={queue.total} conversationUrl={conversationUrl} />;
  } catch {
    return <InboxOnly detail={`${INBOX_DETAIL}現在讀不到誰在等，收件匣本身不受影響。`} />;
  }
}

export default async function ChatPage({ searchParams }: PageProps<"/workspace/chat">) {
  const pack = await currentIndustry();
  const { chat } = await searchParams;
  const connected = await isLive("chatwoot");
  const note = typeof chat === "string" ? CHAT_NOTES[chat] : null;

  return (
    <ModuleFrame kicker="對話" title="LINE、IG、FB、官網的訊息在同一個收件匣">
      {connected ? await liveInbox() : <OpenChatDesk threads={practiceThreads(pack)} packId={pack.id} storeName={pack.nameZh} />}
      {note ? (
        <p className="glass-chip px-4 py-2 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <BookingLinks />
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          留言自動轉私訊 <Badge tone="demo" />
        </h2>
        <p className="text-xs text-cream-dim">這裡按送出留在{pack.nameZh}的練習對話，不會送到 Instagram，規則也還沒在 Instagram 上跑。</p>
        <ManychatBoard />
        <ReplyBoard quiet pack={pack} initialRules={seedReplyRules(pack)} initialInbox={seedReplyInbox(pack)} commentToOrder={tradeOf(pack).commentToOrder} />
      </div>
    </ModuleFrame>
  );
}
