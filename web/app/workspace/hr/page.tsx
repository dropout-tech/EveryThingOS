import { HrBoard } from "@/components/HrBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { getHr } from "@/lib/sources";
import type { HrToday } from "@/lib/sources/types";

export const metadata = { title: "人事" };

function taipeiDay(offset = 0) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offset * 86_400_000));
}

function demo(): HrToday {
  const today = taipeiDay();
  return {
    date: today,
    me: { employee: "HR-EMP-00001", name: "王小明", logs: [{ type: "IN", time: "08:56" }], next: "OUT" },
    onLeave: [
      { name: "林業務", leaveType: "特休", fromDate: today, toDate: taipeiDay(1), halfDay: false },
      { name: "陳倉管", leaveType: "病假", fromDate: today, toDate: today, halfDay: true },
    ],
    approvals: [
      { name: "HR-LAP-2026-00012", employee: "張會計", leaveType: "事假", fromDate: taipeiDay(2), toDate: taipeiDay(2), days: 1, reason: "小孩學校日" },
      { name: "HR-LAP-2026-00013", employee: "李師傅", leaveType: "家庭照顧假", fromDate: taipeiDay(5), toDate: taipeiDay(6), days: 2, reason: "家人開刀住院" },
    ],
    payroll: { month: today.slice(0, 7), state: "slips", employees: 8, draft: 8, submitted: 0, netPay: 312_480, entries: [] },
    rates: { year: Number(today.slice(0, 4)), verified: false, current: true },
    can: { approve: true, payroll: true },
  };
}

export default async function HrPage() {
  const source = await getHr();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/hr" />;
  const live = source.origin === "live";

  if (live && !source.data) {
    return (
      <ModuleFrame kicker="人事" title="這家公司還沒開人事">
        <div className="glass space-y-2 p-5 text-sm">
          <p>ERPNext 還沒裝人事模組，所以這裡沒有打卡、請假與薪資。</p>
          <p className="text-cream-dim">請 DropOut OS 導入顧問在導入工具選「人事」：會裝上 Frappe HRMS 與台灣的薪資元件、勞健保費率和假別。</p>
        </div>
      </ModuleFrame>
    );
  }

  const data = source.data ?? demo();
  const manager = data.can.approve || data.can.payroll;

  return (
    <ModuleFrame
      kicker="人事"
      title={manager ? "今天誰在、誰請假" : "打卡"}
      hint={manager ? "打卡、核准假單在這裡做完。員工資料、排班、薪資結構在 ERPNext 人事後台。" : "上班、下班各按一次。請假到 ERPNext 填假單，主管核准後會出現在這裡。"}
    >
      <HrBoard data={data} live={live} />
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 人事後，換成你們的同事、假單與薪資。" />
    </ModuleFrame>
  );
}
