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
      title="往右，跟到答應"
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
