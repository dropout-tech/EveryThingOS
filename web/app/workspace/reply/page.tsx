import { ModuleFrame } from "@/components/ModuleFrame";
import { ReplyBoard } from "@/components/ReplyBoard";
import { seedReplyInbox, seedReplyRules } from "@/lib/reply";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "回覆" };

export default async function ReplyPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame
      kicker="回覆"
      title={`${pack.nameZh} 的留言轉私訊`}
      hint="留言出現關鍵字才私訊。同一個人可以轉進客人。現在按送出不會真的傳到 Instagram。"
    >
      <ReplyBoard
        pack={{ id: pack.id, workflow: pack.workflow }}
        initialRules={seedReplyRules(pack)}
        initialInbox={seedReplyInbox(pack)}
      />
    </ModuleFrame>
  );
}
