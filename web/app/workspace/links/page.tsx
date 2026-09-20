import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "短網址" };

export default async function LinksPage() {
  const pack = await currentIndustry();
  const { links } = demoRecords(pack);

  return (
    <ModuleFrame
      kicker="DropOut Links"
      title={`${pack.nameZh} 的通道`}
      hint="官網、IG、LINE、QR 共用 Shlink。信件內文連結仍由 Mautic 追蹤，不套兩層。"
    >
      <DataTable
        columns={["短碼", "目的", "點擊", "utm_source"]}
        rows={links.map((link) => [link.code, link.dest, String(link.clicks), link.source])}
      />
    </ModuleFrame>
  );
}
