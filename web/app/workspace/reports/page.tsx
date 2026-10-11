import { EmptyState } from "@/components/EmptyState";
import { ModuleFrame } from "@/components/ModuleFrame";
import { ReportBoard } from "@/components/ReportBoard";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { canSeeReports } from "@/lib/access";
import { parseMonths } from "@/lib/reports";
import { getMe } from "@/lib/sources";
import { liveConfig, loginRequired } from "@/lib/sources/config";
import { getReports } from "@/lib/sources/reports";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "報表" };

export default async function ReportsPage({ searchParams }: PageProps<"/workspace/reports">) {
  const months = parseMonths((await searchParams).months);
  const frame = { kicker: "報表", title: "生意整體怎麼樣", hint: "營收、毛利、誰欠錢、誰買最多、成交率、快不夠的貨。數字都從 ERPNext 來，要看明細就點「在 ERPNext 打開」。" };

  if (loginRequired(await liveConfig())) {
    const me = await getMe();
    if (!canSeeReports(me.origin === "live" && me.data ? me.data.roles : [])) {
      return (
        <ModuleFrame {...frame}>
          <p className="glass p-5 text-sm text-cream-dim">報表只有老闆、主管、會計看得到。需要的話，請老闆到「團隊」調整你的職務。</p>
        </ModuleFrame>
      );
    }
  }

  const source = await getReports(await currentIndustry(), months);
  if (source.origin === "error") return <SourceFailure source={source} next={`/workspace/reports?months=${months}`} />;

  return (
    <ModuleFrame {...frame}>
      {source.origin === "live" && source.data.revenue?.every((r) => !r.amount) ? (
        <EmptyState
          compact
          title="這段期間還沒有開過發票，所以營收是 0"
          detail="報表從送出的銷售發票算起。開帳時匯入的期初帳不算營收；開出第一張發票後這裡就會有數字。"
          action={{ href: "/workspace/erp/sales", label: "到生意開單" }}
          help="module-reports"
        />
      ) : null}
      <ReportBoard report={source.data} demo={source.origin === "demo"} />
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 後換成你們的營收、帳齡、客人與庫存。" />
    </ModuleFrame>
  );
}
