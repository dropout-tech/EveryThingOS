import { cookies } from "next/headers";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { HrBoard } from "@/components/HrBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { decodeHolds, demandsFromHolds, HOLD_COOKIE, holdLines } from "@/lib/holds";
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
    can: { approve: true, payroll: true, overtime: true, schedule: true },
    staff: [
      { id: "HR-EMP-00001", name: "王小明" },
      { id: "HR-EMP-00002", name: "林業務" },
      { id: "HR-EMP-00003", name: "陳倉管" },
      { id: "HR-EMP-00004", name: "李師傅" },
    ],
    schedule: [
      {
        id: "SH-2026-001",
        employee: "HR-EMP-00001",
        employeeName: "王小明",
        branch: "台北信義教室",
        date: today,
        startTime: "09:30",
        endTime: "12:00",
        courseName: "週末親子手作黏土 A 班",
        room: "手作教室 A",
      },
      {
        id: "SH-2026-002",
        employee: "HR-EMP-00002",
        employeeName: "林業務",
        branch: "台北信義教室",
        date: today,
        startTime: "14:00",
        endTime: "16:30",
        courseName: "節慶 DIY 創意美勞班",
        room: "美術教室 1",
      },
      {
        id: "SH-2026-003",
        employee: "HR-EMP-00004",
        employeeName: "李師傅",
        branch: "台中公益教室",
        date: taipeiDay(1),
        startTime: "18:30",
        endTime: "21:00",
        courseName: "STEAM 機器人與科學實作",
        room: "創客教室 B",
      },
    ],
  };
}

export default async function HrPage() {
  const source = await getHr();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/hr" />;
  const live = source.origin === "live";

  if (live && !source.data) {
    return (
      <ModuleFrame kicker="人事" title="這家公司還沒開人事">
        <EmptyState
          title="ERPNext 還沒裝人事模組，所以這裡沒有打卡、請假與薪資。"
          detail="請 EveryThingOS 導入顧問在導入工具選「人事」：會裝上 Frappe HRMS 與台灣的薪資元件、勞健保費率和假別。"
          help="module-hr"
        />
      </ModuleFrame>
    );
  }

  const data = source.data ?? demo();
  const holds = decodeHolds((await cookies()).get(HOLD_COOKIE)?.value);
  const openDemands = demandsFromHolds(holds);
  const manager = data.can.approve || data.can.payroll;

  return (
    <ModuleFrame
      kicker="人事與師資調度（HRM）"
      title={manager ? "今天誰在、誰請假、師資怎麼排" : "打卡與我的班表"}
      hint={manager ? "師資專長、請假與工時放在一起看；AI 只給建議，主管確認才排入。薪資與勞健保沿用既有系統。" : "上班、下班各按一次。請假到 ERPNext 填假單，主管核准後會出現在這裡。"}
    >
      <Hint id="hr" help="module-hr" />
      {holdLines(holds).length ? (
        <ul className="glass-well space-y-1 p-4 text-sm">
          {holdLines(holds).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <HrBoard data={data} live={live} openDemands={openDemands} />
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 人事後，換成你們的同事、假單與薪資。" />
    </ModuleFrame>
  );
}
