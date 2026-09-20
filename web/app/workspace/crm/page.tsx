import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "CRM" };

export default async function CrmPage() {
  const pack = await currentIndustry();
  const { leads } = demoRecords(pack);

  return (
    <ModuleFrame
      kicker="DropOut CRM"
      title={`${pack.nameZh} 的關係`}
      hint="階段來自此產業包，可在設定裡改名或增減。主檔與 ERP 同一個人。"
    >
      <ol className="flex flex-wrap gap-2">
        {pack.workflow.stages.map((stage) => (
          <li key={stage} className="rounded-full border border-teal/40 px-3 py-1 text-sm text-teal">
            {stage}
          </li>
        ))}
      </ol>
      <DataTable
        columns={["對象", "階段", "計分", "通道"]}
        rows={leads.map((lead) => [lead.name, lead.stage, String(lead.score), lead.channel])}
      />
    </ModuleFrame>
  );
}
