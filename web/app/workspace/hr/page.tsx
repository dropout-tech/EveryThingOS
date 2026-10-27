import { cookies } from "next/headers";
import { EmptyState } from "@/components/EmptyState";
import { Hint } from "@/components/Hint";
import { HrBoard } from "@/components/HrBoard";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { decodeHolds, demandsFromHolds, HOLD_COOKIE, holdLines } from "@/lib/holds";
import { ledgerHolds, mergeHolds } from "@/lib/practice-ledger";
import { shelfFor, type ShelfShift } from "@/lib/scene-shelf";
import { tradeOf } from "@/lib/trade";
import { getHr } from "@/lib/sources";
import type { HrToday } from "@/lib/sources/types";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "人事" };

function taipeiDay(offset = 0) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offset * 86_400_000));
}

function shiftsOf(shifts: ShelfShift[], today: string, staff: { id: string; name: string }[]): NonNullable<HrToday["schedule"]> {
  return shifts.map((shift, index) => {
    const person = staff[shift.staff] ?? staff[0];
    return {
      id: `SH-SCENE-${index}`,
      employee: person?.id ?? `HR-${index}`,
      employeeName: person?.name ?? "尚未建檔",
      branch: shift.branch,
      date: today,
      startTime: shift.start,
      endTime: shift.end,
      courseName: shift.skill ? `${shift.what} · 專長 ${shift.skill}` : shift.what,
      room: shift.room,
    };
  });
}

function demo(classBoard: boolean, shifts: ShelfShift[], staff: { id: string; name: string; role: string }[], leaveReason: string): HrToday {
  const today = taipeiDay();
  const people = staff.length ? staff : [{ id: "HR-0", name: "尚未建檔", role: "員工" }];
  return {
    date: today,
    me: { employee: people[0].id, name: people[0].name, logs: [{ type: "IN", time: "08:56" }], next: "OUT" },
    onLeave: people[1] ? [{ name: people[1].name, leaveType: "特休", fromDate: today, toDate: taipeiDay(1), halfDay: false }] : [],
    approvals: [
      { name: "HR-LAP-001", employee: people[2]?.name ?? people[0].name, leaveType: "事假", fromDate: taipeiDay(2), toDate: taipeiDay(2), days: 1, reason: leaveReason },
    ],
    payroll: { month: today.slice(0, 7), state: "not_started", employees: people.length, draft: 0, submitted: 0, netPay: 0, entries: [] },
    rates: { year: Number(today.slice(0, 4)), verified: false, current: true },
    can: { approve: true, payroll: true, overtime: true, schedule: true },
    staff: people.map((person) => ({ id: person.id, name: person.name })),
    schedule: classBoard
      ? [
          {
            id: "SH-2026-001",
            employee: people[0].id,
            employeeName: people[0].name,
            branch: "台北信義教室",
            date: today,
            startTime: "09:30",
            endTime: "12:00",
            courseName: "週末親子手作黏土 A 班",
            room: "手作教室 A",
          },
          {
            id: "SH-2026-002",
            employee: people[1]?.id ?? people[0].id,
            employeeName: people[1]?.name ?? people[0].name,
            branch: "台北信義教室",
            date: today,
            startTime: "14:00",
            endTime: "16:30",
            courseName: "節慶 DIY 創意美勞班",
            room: "美術教室 1",
          },
        ]
      : shiftsOf(shifts, today, people),
  };
}

export default async function HrPage() {
  const pack = await currentIndustry();
  const shelf = shelfFor(pack);
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

  const trade = tradeOf(pack);
  const data = source.data ?? demo(shelf.classBoard, shelf.shifts, trade.staff, trade.leaveReason);
  const holds = mergeHolds(decodeHolds((await cookies()).get(HOLD_COOKIE)?.value), ledgerHolds(pack.id));
  const openDemands = shelf.classBoard ? demandsFromHolds(holds) : [];
  const manager = data.can.approve || data.can.payroll;

  return (
    <ModuleFrame
      kicker={shelf.hrKicker}
      title={manager ? shelf.hrTitle : "打卡與我的班表"}
      hint={manager ? shelf.hrHint : "上班、下班各按一次。請假到 ERPNext 填假單，主管核准後會出現在這裡。"}
    >
      <Hint id="hr" help="module-hr" />
      {shelf.classBoard && holdLines(holds).length ? (
        <ul className="glass-well space-y-1 p-4 text-sm">
          {holdLines(holds).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <HrBoard
        data={data}
        live={live}
        openDemands={openDemands}
        classBoard={shelf.classBoard}
        hero={trade.hero}
        weekly={trade.weeklyRoster}
        cover={trade.coverShift}
        rateLine={`${pack.nameZh}有 ${trade.staff.length} 位練習員工（${trade.staff.map((person) => `${person.name}·${person.role}`).join("、")}）。實發先空白。`}
      />
      <SourceNote source={source} demoText="示範資料。接上 ERPNext 人事後，換成你們的同事、假單與薪資。" />
    </ModuleFrame>
  );
}
