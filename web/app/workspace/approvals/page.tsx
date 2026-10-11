import { ApprovalsBoard, NewExpenseButton } from "@/components/ApprovalsBoard";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { taipeiDay } from "@/lib/approvals";
import { getApprovals } from "@/lib/sources/approvals";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "簽核與報帳" };

function renderedAt() {
  return Date.now();
}

export default async function ApprovalsPage() {
  const pack = await currentIndustry();
  const source = await getApprovals(pack);
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/approvals" />;

  if (source.origin === "live" && !source.data) {
    return (
      <ModuleFrame kicker="簽核" title="簽核還沒裝好">
        <EmptyState
          title="這家公司的 ERPNext 還沒更新到有簽核的版本。"
          detail="請 DropOut OS 導入顧問更新 ERPNext 上的 DropOut（bench migrate）。更新後，報帳、假單、大額採購會在這裡等你簽。"
          help="module-approvals"
        />
      </ModuleFrame>
    );
  }

  const data = source.data!;
  const live = source.origin === "live";
  const waiting = data.items.length;

  return (
    <ModuleFrame
      kicker="簽核"
      title={data.can.approve ? (waiting ? `${waiting} 張等你簽` : "沒有等你簽的") : "報帳"}
      hint={
        data.can.approve
          ? "報帳、假單、超過門檻的採購單和大折扣報價都在這裡。小額的可以一次核准；退回要寫原因。"
          : "拍收據、填金額就送出。主管核准或退回，都會在「我送出的」看到。"
      }
      action={<NewExpenseButton />}
    >
      <Hint id="approvals" help="module-approvals" />
      <ApprovalsBoard data={data} live={live} packId={pack.id} now={renderedAt()} today={taipeiDay()} />
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 後，換成同事送來的報帳、假單與單據。" />
    </ModuleFrame>
  );
}
