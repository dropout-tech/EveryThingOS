import { ModuleFrame } from "@/components/ModuleFrame";
import { ReplyBoard } from "@/components/ReplyBoard";
import { seedReplyInbox, seedReplyRules } from "@/lib/reply";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "回覆" };

export default async function ReplyPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="DropOut Reply"
      title={`${pack.nameZh} 的留言轉私訊`}
      hint="對齊 ManyChat 的 comment-to-DM，底層用 OpenReply（MIT）。命中關鍵字才私訊，同一個人可轉進客人看板。"
    >
      <ReplyBoard
        pack={{ id: pack.id, workflow: pack.workflow }}
        initialRules={seedReplyRules(pack)}
        initialInbox={seedReplyInbox(pack)}
      />
    </ModuleFrame>
  );
}
