import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "擋假信" };

export default async function HygienePage() {
  const pack = await currentIndustry();
  const { hygiene } = demoRecords(pack);

  return (
    <ModuleFrame
      kicker="擋假信"
      title="假的信不要進客人"
      hint={`${pack.nameZh} 從官網、表單、社群進來的信箱，先檢查再進客人。假的、暫時信箱擋下來，不要寄給空氣。現在這張表是練習。`}
    >
      <DataTable
        columns={["信箱", "結果", "怎麼處理"]}
        rows={hygiene.map((row) => [row.email, row.result, row.action])}
      />
    </ModuleFrame>
  );
}
