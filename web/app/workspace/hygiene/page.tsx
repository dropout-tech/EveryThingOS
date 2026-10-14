import { DataTable, ModuleFrame } from "@/components/ModuleFrame";
import { NextThing } from "@/components/NextThing";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { nextHygiene } from "@/lib/next-thing";
import { getHygiene } from "@/lib/sources";
import { currentIndustry, demoRecords } from "@/lib/workspace";

export const metadata = { title: "擋假信" };

export default async function HygienePage() {
  const pack = await currentIndustry();
  const source = await getHygiene();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/hygiene" />;
  const live = source.origin === "live";
  const rows = live ? source.data ?? [] : demoRecords(pack).hygiene;
  const focus = nextHygiene(rows);

  return (
    <ModuleFrame
      kicker="擋假信"
      title="假的信不要進客人"
      hint={
        live
          ? "退信的信箱已自動停寄；勾了同意但還沒點確認信的人，不會收到電子報。"
          : `${pack.nameZh} 從官網、表單、社群進來的信箱，先檢查再進客人。假的、暫時信箱擋下來，不要寄給空氣。`
      }
    >
      {focus ? (
        <NextThing
          title={`${focus.email} 是${focus.result}`}
          detail={focus.action}
          action={
            focus.href ? (
              <a href={focus.href} className="btn btn-primary" target="_blank" rel="noreferrer">
                打開
              </a>
            ) : undefined
          }
        />
      ) : null}
      {live && !rows.length ? <p className="text-sm text-cream-dim">{source.denied?.length ? "你看得到的部分沒有退信，也沒有等確認的人。" : "沒有退信，也沒有等確認的人。"}</p> : null}
      {rows.length ? <DataTable columns={["信箱", "狀態", "怎麼處理"]} rows={rows.map((row) => [row.email, row.result, row.action])} /> : null}
      <SourceNote source={source} />
    </ModuleFrame>
  );
}
