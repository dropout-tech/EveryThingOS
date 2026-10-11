import { AskBoard } from "@/components/AskBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { Badge } from "@/components/ui/Badge";
import { MAX_QUESTION } from "@/lib/assistant";
import { assistantSetup } from "@/lib/assistant-server";

export const metadata = { title: "問助理" };

export default async function AskPage({ searchParams }: PageProps<"/workspace/ask">) {
  const { q } = await searchParams;
  const question = typeof q === "string" ? q.trim().slice(0, MAX_QUESTION) : "";
  const { facts, ai, packId } = await assistantSetup();

  return (
    <ModuleFrame
      kicker="問助理"
      title="想知道什麼，直接問"
      hint="用平常講話的方式問，例如「誰欠我們最多」「明天要做什麼」。數字都從你們自己的帳算出來，每個答案都寫出處；也能幫你寫催款、追報價、回客人的訊息。"
      badge={facts.mode === "demo" ? <Badge tone="demo" /> : undefined}
    >
      <AskBoard facts={facts} packId={packId} ai={ai} initial={question} />
    </ModuleFrame>
  );
}
