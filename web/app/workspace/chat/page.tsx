import { ModuleFrame } from "@/components/ModuleFrame";
import { ReplyBoard } from "@/components/ReplyBoard";
import { Badge } from "@/components/ui/Badge";
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
      <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-medium">{connected ? "收件匣" : "收件匣還沒接上"}</h2>
          <p className="mt-1 text-sm text-cream-dim">
            {connected
              ? "每則新對話會自動找到或建立客人，並記在客人的時間軸上。"
              : "接上之後，LINE 官方帳號、IG、FB 粉專與官網對話都進同一個收件匣。"}
          </p>
        </div>
        {connected ? (
          <a href="/api/chat/open" className="btn btn-primary">
            打開收件匣
          </a>
        ) : null}
      </div>
      {note ? (
        <p className="glass-chip px-4 py-2 text-sm" role="status">
          {note}
        </p>
      ) : null}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          留言自動轉私訊 <Badge tone="demo" />
        </h2>
        <p className="text-xs text-cream-dim">這裡按送出不會傳到 Instagram；規則在導入時設在對話系統。</p>
        <ReplyBoard pack={{ id: pack.id, workflow: pack.workflow }} initialRules={seedReplyRules(pack)} initialInbox={seedReplyInbox(pack)} />
      </div>
    </ModuleFrame>
  );
}
