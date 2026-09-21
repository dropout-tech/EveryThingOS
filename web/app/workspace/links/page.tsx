import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "短網址" };

export default async function LinksPage() {
  const pack = await currentIndustry();
  const { links } = demoRecords(pack);

  return (
    <ModuleFrame
      kicker="短網址"
      title={`${pack.nameZh} 對外怎麼連`}
      hint="官網、IG、LINE、名片 QR 用同一套短網址。信件裡的連結另外算點擊，不會算兩次。"
    >
      <DataTable
        columns={["短碼", "連到哪", "點了幾次", "從哪來"]}
        rows={links.map((link) => [link.code, link.dest, String(link.clicks), link.source])}
      />
    </ModuleFrame>
  );
}
