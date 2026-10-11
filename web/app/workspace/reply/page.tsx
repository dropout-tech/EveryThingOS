import { ModuleFrame } from "@/components/ModuleFrame";
import { ReplyBoard } from "@/components/ReplyBoard";
import { seedReplyInbox, seedReplyRules } from "@/lib/reply";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "回覆" };

export default async function ReplyPage() {
  const pack = await currentIndustry();

  return (
    <ModuleFrame kicker="回覆" title="留言轉對話" hint="現在按送出不會傳到 Instagram。">
      <ReplyBoard
        pack={{ id: pack.id, workflow: pack.workflow }}
        initialRules={seedReplyRules(pack)}
        initialInbox={seedReplyInbox(pack)}
      />
    </ModuleFrame>
  );
}
