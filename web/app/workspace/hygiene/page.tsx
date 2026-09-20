import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "清庫" };

export default async function HygienePage() {
  const pack = await currentIndustry();
  const { hygiene } = demoRecords(pack);

  return (
    <ModuleFrame
      kicker="DropOut Hygiene"
      title="進線先清庫，不自研檢查器"
      hint={`${pack.nameZh} 的表單、官網、社群短網址都先經過 Reacher。invalid 不進 CRM。`}
    >
      <DataTable
        columns={["Email", "結果", "動作"]}
        rows={hygiene.map((row) => [row.email, row.result, row.action])}
      />
    </ModuleFrame>
  );
}
