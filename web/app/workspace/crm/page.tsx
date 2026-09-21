import { CrmBoard } from "@/components/CrmBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { sanitizeImportedHandle } from "@/lib/reply";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "客人" };

export default async function CrmPage({ searchParams }: PageProps<"/workspace/crm">) {
  const pack = await currentIndustry();
  const { leads } = demoRecords(pack);
  const from = sanitizeImportedHandle((await searchParams).from);
  const initial = from
    ? [
        { name: from, stage: pack.workflow.stages[0], score: 24, channel: "IG 留言" },
        ...leads.filter((lead) => lead.name !== from),
      ]
    : leads;

  return (
    <ModuleFrame
      kicker="客人"
      title="人放在格子裡，往右跟到答應"
      hint="格子名稱照這個行業。最後一格「轉成一筆生意」會進下一張單，同一個人不必建兩次。"
    >
      <CrmBoard
        pack={{
          id: pack.id,
          itemType: pack.itemType,
          fulfillment: pack.fulfillment,
          modules: pack.modules,
          workflow: pack.workflow,
        }}
        initial={initial}
      />
    </ModuleFrame>
  );
}
