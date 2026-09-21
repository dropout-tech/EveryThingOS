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
      title="把人放在格子裡，不要先開客戶主檔"
      hint="階段名稱來自產業包。最後一格「轉成一張報價」會進銷售流水，同一個人不必在 CRM 與進銷存各建一次。"
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
