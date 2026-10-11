import { EmptyState } from "@/components/EmptyState";
import { ModuleFrame } from "@/components/ModuleFrame";
import { ReplyBoard } from "@/components/ReplyBoard";
import { seedReplyInbox, seedReplyRules } from "@/lib/reply";
import { isLive } from "@/lib/sources";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "對話" };

const CHAT_NOTES: Record<string, string> = {
  "not-connected": "對話系統還沒接上。導入時用導入工具開 Chatwoot 帳戶。",
  "no-user": "你的 ERPNext 帳號還沒對應到對話系統的使用者，請管理員在導入工具重跑「對話帳號」。",
  "sso-failed": "對話系統沒有給登入連結，請稍後再試。",
};

export default async function ChatPage({ searchParams }: PageProps<"/workspace/chat">) {
  const pack = await currentIndustry();
  const { chat } = await searchParams;
  const connected = await isLive("chatwoot");
  const note = typeof chat === "string" ? CHAT_NOTES[chat] : null;

  return (
    <ModuleFrame kicker="對話" title="LINE、IG、FB、官網的訊息在同一個收件匣">
      {connected ? (
        <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p>收件匣</p>
            <p className="mt-1 text-sm text-cream-dim">每則新對話會自動找到或建立客人，並記在客人的時間軸上。</p>
          </div>
          <a href="/api/chat/open" className="glass-cta rounded-full px-5 py-2.5 text-sm">
            打開收件匣
          </a>
        </div>
      ) : (
        <EmptyState
          title="收件匣還沒接上"
          detail="接上之後，LINE 官方帳號、IG、FB 粉專與官網對話都進同一個收件匣，來問的人自動變成客人。導入顧問會用導入工具幫你開好。"
          action={{ href: "/help/module-chat", label: "看要準備什麼" }}
        />
      )}
      {note ? (
        <p className="glass-chip px-4 py-2 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <div className="space-y-2">
        <p className="text-sm">留言自動轉私訊</p>
        <p className="text-xs text-cream-dim">示範。這裡按送出不會傳到 Instagram；規則在導入時設在對話系統。</p>
        <ReplyBoard pack={{ id: pack.id, workflow: pack.workflow }} initialRules={seedReplyRules(pack)} initialInbox={seedReplyInbox(pack)} />
      </div>
    </ModuleFrame>
  );
}
