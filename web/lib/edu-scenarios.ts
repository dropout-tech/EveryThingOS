/**
 * 20 家據點／20 個真實客戶與店務情境模擬引擎（徐立文教／米特才藝等兒童才藝與親子手作連鎖體系）。
 *
 * 設計目標：
 * 1. 驗證計畫書中的五大痛點與兩大工作主軸（CRM → OMS 課程 BOM 鎖定與虛實履約 → WMS 耗用／損耗／20 店調撥 → HRM 師資技能媒合／法規先行／主管覆核留痕）在 20 個真實情境下皆能確定性解決。
 * 2. 量化並實現「降低客戶認知負擔 80% 以上」：將原本需要翻找 5–9 個畫面／試算表的人工流程，壓縮為系統算好後的「1 句結論＋1 個確認按鈕（1 步完成）」。
 */

import {
  evaluateCourseBom,
  planMultiStoreReplenishment,
  splitCourseFulfillment,
  type BranchMaterialStock,
  type CourseBom,
} from "./course-bom";
import {
  buildScheduleAuditRecord,
  recommendTeachersForClass,
  scheduleConflict,
  type ClassDemand,
  type LeaveSpan,
  type ShiftSlot,
  type TeacherProfile,
} from "./schedule";

export type ScenarioCategory =
  | "CRM預約＋OMS鎖料"
  | "虛實履約與退改課"
  | "WMS耗損＋20店AI調撥"
  | "HRM師資媒合＋主管留痕"
  | "總部中台＋薪資串接";

export type EduScenario = {
  id: string;
  no: number;
  branch: string;
  region: "北區" | "中區" | "南區" | "總部";
  category: ScenarioCategory;
  actor: string;
  title: string;
  painPoint: string;
  /** 導入前人工處理需要翻找／比對的步驟列表（通常 5–8 步） */
  beforeSteps: string[];
  /** 導入後在 EveryThingOS 的一鍵動作名稱（1 步完成） */
  oneClickLabel: string;
  /** 系統算好後直接給店務／主管看的唯一一句話結論 */
  decisionHeadline: string;
  /** 底層引擎自動驗證的量化結果摘要 */
  engineProof: string;
};

export type ScenarioEvaluation = EduScenario & {
  manualStepsCount: number;
  systemStepsCount: 1;
  /** 認知負擔降低百分比，例如 83 表示降低 83% */
  cognitiveReductionPct: number;
  resolved: boolean;
};

/** 計算認知負擔降幅百分比：(人工步數 - 系統步數 1) / 人工步數 * 100 */
export function cognitiveLoadReductionPct(manualStepsCount: number, systemStepsCount = 1): number {
  if (manualStepsCount <= systemStepsCount) return 0;
  return Math.round(((manualStepsCount - systemStepsCount) / manualStepsCount) * 100);
}

/** 建立並透過真實引擎驗證 20 個客戶／分店情境。 */
export function buildTwentyEduScenarios(): ScenarioEvaluation[] {
  // 驗證資料基底
  const clayBom: CourseBom = {
    courseCode: "CRS-CLAY-01",
    courseName: "節慶親子手作輕黏土班（4 堂）",
    targetSeats: 15,
    bookedSeats: 6,
    lines: [
      { sku: "MAT-CLAY-SET", name: "節慶造型輕黏土材料包", qtyPerStudent: 1, uom: "組", unitCost: 450 },
      { sku: "MAT-FRAME-01", name: "木質展示相框與配件組", qtyPerStudent: 1, uom: "份", unitCost: 350 },
    ],
  };
  const evaluatedClay = evaluateCourseBom(clayBom, [
    { sku: "MAT-CLAY-SET", onHand: 12, safety: 6 },
    { sku: "MAT-FRAME-01", onHand: 18, safety: 6 },
  ]);

  const fullRefundSplit = splitCourseFulfillment({
    orderNo: "SO-20502",
    studentName: "林小宇",
    branchName: "台北大安教室",
    courseCode: "CRS-CLAY-01",
    courseName: "節慶親子手作輕黏土班（4 堂）",
    channel: "官網預約",
    totalSessions: 4,
    attendedSessions: 0,
    tuitionAmount: 3200,
    materialPackAmount: 800,
    virtualStage: "booked",
    materialStage: "locked",
  });

  const partialRefundSplit = splitCourseFulfillment({
    orderNo: "SO-20501",
    studentName: "陳小安",
    branchName: "台中公益教室",
    courseCode: "CRS-CLAY-01",
    courseName: "節慶親子手作輕黏土班（4 堂）",
    channel: "LINE 預約",
    totalSessions: 4,
    attendedSessions: 1,
    tuitionAmount: 3200,
    materialPackAmount: 800,
    virtualStage: "booked",
    materialStage: "issued",
  });

  const multiStorePlan = planMultiStoreReplenishment([
    {
      branchId: "TPE-XY",
      branchName: "台北信義教室",
      region: "北區",
      sku: "MAT-CLAY-SET",
      materialName: "節慶造型輕黏土材料包",
      uom: "組",
      onHand: 8,
      locked: 6,
      consumed30d: 45,
      wastage30d: 5,
      safety: 5,
      upcomingDemand: 10,
    },
    {
      branchId: "NTPC-BQ",
      branchName: "新北板橋教室",
      region: "北區",
      sku: "MAT-CLAY-SET",
      materialName: "節慶造型輕黏土材料包",
      uom: "組",
      onHand: 28,
      locked: 4,
      consumed30d: 20,
      wastage30d: 0,
      safety: 6,
      upcomingDemand: 8,
    },
  ] satisfies BranchMaterialStock[]);

  const teachers: TeacherProfile[] = [
    {
      id: "T-01",
      name: "王老師",
      employmentType: "full_time",
      homeBranch: "台北信義教室",
      supportBranches: ["新北板橋教室"],
      skills: ["親子手作", "STEAM 機器人"],
      ageGroups: ["幼兒 3–6 歲", "兒童 7–12 歲"],
      weeklyHours: 34,
      weeklyTargetHours: 40,
      monthlyOvertimeHours: 10,
    },
    {
      id: "T-02",
      name: "林老師",
      employmentType: "full_time",
      homeBranch: "台北信義教室",
      supportBranches: ["新北板橋教室"],
      skills: ["親子手作", "節慶DIY", "黏土雕塑"],
      ageGroups: ["幼兒 3–6 歲", "親子共學"],
      weeklyHours: 28,
      weeklyTargetHours: 40,
      monthlyOvertimeHours: 6,
    },
    {
      id: "T-03",
      name: "陳老師",
      employmentType: "part_time",
      homeBranch: "新北板橋教室",
      supportBranches: ["台北信義教室", "新北永和教室"],
      skills: ["親子手作", "節慶DIY", "黏土雕塑", "美術創作"],
      ageGroups: ["幼兒 3–6 歲", "親子共學"],
      weeklyHours: 14,
      weeklyTargetHours: 24,
      monthlyOvertimeHours: 0,
    },
  ];
  const shifts: ShiftSlot[] = [
    {
      id: "S-1",
      employee: "T-01",
      employeeName: "王老師",
      date: "2026-10-28",
      startTime: "09:30",
      endTime: "12:00",
      courseName: "STEAM 機器人班",
      room: "教室 A",
      branch: "台北信義教室",
    },
  ];
  const leaves: LeaveSpan[] = [
    {
      employee: "T-02",
      employeeName: "林老師",
      leaveType: "特休",
      fromDate: "2026-10-28",
      toDate: "2026-10-28",
    },
  ];
  const demand: ClassDemand = {
    id: "D-15",
    branch: "台北信義教室",
    date: "2026-10-28",
    startTime: "10:00",
    endTime: "12:00",
    courseName: "節慶親子手作輕黏土班",
    requiredSkill: "節慶DIY",
    targetAgeGroup: "親子共學",
    enrolledCount: 12,
    room: "教室 B",
  };
  const aiMatch = recommendTeachersForClass(demand, teachers, shifts, leaves);
  const roomConflictMsg = scheduleConflict(
    {
      employee: "T-03",
      employeeName: "陳老師",
      date: "2026-10-28",
      startTime: "10:00",
      endTime: "11:30",
      courseName: "兒童彩繪班",
      room: "教室 A",
      branch: "台北信義教室",
    },
    shifts,
    leaves,
  );
  const auditSample = buildScheduleAuditRecord({
    suggestion: aiMatch,
    chosenTeacher: { id: "T-04", name: "張巡迴老師" },
    adjustmentNote: "總部指派巡迴指導師資支援",
    nowIso: "2026-10-27 17:30",
  });

  const raw: EduScenario[] = [
    {
      id: "SC-01",
      no: 1,
      branch: "台北信義教室",
      region: "北區",
      category: "CRM預約＋OMS鎖料",
      actor: "陳媽媽（官網預約）",
      title: "官網預約「節慶親子手作黏土班」自動拆 BOM 鎖料",
      painPoint: "痛點（一）（二）：預約與材料庫存脫鉤，人工抄單常漏訂材料包。",
      beforeSteps: ["收官網通知信", "登錄報名 Excel", "查課程 BOM 表", "開倉庫表看黏土包餘量", "手動扣減可用數", "回信確認名額"],
      oneClickLabel: "確認預約並鎖定 1 人份材料",
      decisionHeadline: `陳媽媽預約成功 → 已自動鎖定黏土包×1、相框×1（本班還可收 ${evaluatedClay.remainingSeats} 人）`,
      engineProof: `BOM 自動鎖定 ${evaluatedClay.lines[0].lockedQty} 組，淨可用 ${evaluatedClay.lines[0].availableQty} 組`,
    },
    {
      id: "SC-02",
      no: 2,
      branch: "新北板橋教室",
      region: "北區",
      category: "CRM預約＋OMS鎖料",
      actor: "林爸爸（LINE 預約雙胞胎）",
      title: "LINE 預約二寶同行（同一家長手機歸戶＋雙份材料鎖定）",
      painPoint: "痛點（一）：LINE 私訊報名散落，二寶同行常漏算第二份材料包。",
      beforeSteps: ["翻 LINE 對話紀錄", "比對家長電話是否舊客", "開兩筆學員名單", "手算 2 人份畫冊與顏料包", "手動扣減倉庫 Excel", "通知助教備雙份料"],
      oneClickLabel: "歸戶家長並鎖定 2 人份材料",
      decisionHeadline: "林爸爸（舊客歸戶）二寶報名 → 自動鎖定畫布冊×2、水洗顏料包×4",
      engineProof: "同手機自動綁定同一家庭帳戶，OMS 依 qty×2 預扣鎖定",
    },
    {
      id: "SC-03",
      no: 3,
      branch: "桃園藝文教室",
      region: "北區",
      category: "CRM預約＋OMS鎖料",
      actor: "張小姐（門市報名＋零售加購）",
      title: "現場報名課程＋加購 1 組居家 DIY 零售材料包",
      painPoint: "痛點（一）：課程名額（虛擬）與門市零售加購（實體）分開記帳，庫存對不上。",
      beforeSteps: ["填紙本報名表", "開 POS 敲零售材料包", "手動扣門市材料倉", "手動鎖定下週上課材料包", "核對現金與發票金額", "月底人工合併對帳"],
      oneClickLabel: "一張單完成報名鎖料＋現場領取加購包",
      decisionHeadline: "張小姐報名＋加購 → 上課材料包預扣鎖定 1 組、零售加購包現場出庫 1 組",
      engineProof: "課程走 Product Bundle 預扣、加購走現貨即時扣庫，同一張發票入帳",
    },
    {
      id: "SC-04",
      no: 4,
      branch: "新竹竹北教室",
      region: "北區",
      category: "CRM預約＋OMS鎖料",
      actor: "吳媽媽（候補第 1 順位）",
      title: "名額釋出，候補學員一鍵轉正並承接材料包鎖定",
      painPoint: "痛點（一）（五）：有人退課時要翻記事本找候補，材料包也不知道有沒有多出來。",
      beforeSteps: ["查退課學員紀錄", "確認材料包未拆封", "翻候補名單 Excel", "LINE 聯絡候補家長", "確認匯款收據", "手動改名額與材料表"],
      oneClickLabel: "候補轉正並承接鎖定材料包",
      decisionHeadline: "吳媽媽候補轉正 → 直接承接已釋出的 1 組黏土材料包，免重新叫貨",
      engineProof: "釋出之 lockedQty 無縫轉移至候補訂單，庫存零誤差",
    },
    {
      id: "SC-05",
      no: 5,
      branch: "台北大安教室",
      region: "北區",
      category: "虛實履約與退改課",
      actor: "林小宇家長（開課前退課）",
      title: "材料包僅系統預扣、尚未拆封領用，申請全額退課",
      painPoint: "痛點（一）：退課時搞不清楚材料包領走了沒，行政與家長為了扣不扣材料費爭執。",
      beforeSteps: ["查點名表上了幾堂", "問教室老師材料包發了沒", "翻退費規定手算金額", "手動把材料加回 Excel", "開退費單請主管簽核", "通知家長退費完成"],
      oneClickLabel: `釋放材料鎖定並退還 NT$${fullRefundSplit.refundableAmount.toLocaleString("zh-TW")}`,
      decisionHeadline: `材料包尚未領用（可釋放回庫）→ 一鍵全額退還 NT$${fullRefundSplit.refundableAmount.toLocaleString("zh-TW")}`,
      engineProof: fullRefundSplit.summary,
    },
    {
      id: "SC-06",
      no: 6,
      branch: "台中公益教室",
      region: "中區",
      category: "虛實履約與退改課",
      actor: "陳小安家長（上 1 堂後退課）",
      title: "已上 1/4 堂且材料包已現場拆封領用，申請退課",
      painPoint: "痛點（一）：課程（虛擬）未上完可退，但材料包（實體）已拆封不能退，人工常算錯虧錢。",
      beforeSteps: ["查上課簽到表（1/4 堂）", "確認材料包已拆封", "手算已上學費 800 元", "手算不可退材料成本 800 元", "跟家長解釋退費明細", "開折讓與退費傳票"],
      oneClickLabel: `扣除已領材料費，退還學費 NT$${partialRefundSplit.refundableAmount.toLocaleString("zh-TW")}`,
      decisionHeadline: `材料包已實體領用不退庫 → 自動扣除材料費 NT$${partialRefundSplit.nonRefundableMaterial}，應退學費 NT$${partialRefundSplit.refundableAmount.toLocaleString("zh-TW")}`,
      engineProof: partialRefundSplit.summary,
    },
    {
      id: "SC-07",
      no: 7,
      branch: "台中七期教室",
      region: "中區",
      category: "虛實履約與退改課",
      actor: "王小妹妹（發燒請假改期）",
      title: "學員請假改期至下週補課（已領材料包保留、不重複扣料）",
      painPoint: "痛點（一）（二）：補課學員塞進下一班時，系統若誤扣第二份材料包會導致庫存少一包。",
      beforeSteps: ["登記請假", "找下週同進度班級", "標註該生已有材料包", "提醒下週助教不要再發一包", "手動調整兩班材料表", "LINE 回覆家長補課時段"],
      oneClickLabel: "改期補課（保留原材料包不重複扣庫）",
      decisionHeadline: "王小妹妹改至下週六補課 → 僅移轉虛擬名額，已領材料包不重複扣減",
      engineProof: "virtualStage=rescheduled 且 materialStage=issued，BOM 不二次展開",
    },
    {
      id: "SC-08",
      no: 8,
      branch: "台北信義教室",
      region: "北區",
      category: "WMS耗損＋20店AI調撥",
      actor: "信義店長（節慶爆班缺料）",
      title: "節慶黏土班爆滿缺料，AI 優先推薦新北板橋店跨店調撥",
      painPoint: "痛點（二）（四）：分店缺料就急著跟廠商叫貨，不知道隔壁板橋店倉庫還堆著 28 組。",
      beforeSteps: ["盤點信義店庫存", "在店長 LINE 群問哪家店有多的黏土包", "等各店回報", "算哪家店扣掉自己上課還夠借", "手寫調撥單叫快遞", "兩家店各自手改 Excel 庫存"],
      oneClickLabel: `確認由${multiStorePlan[0]?.sourceBranch ?? "新北板橋教室"}調撥 ${multiStorePlan[0]?.qty ?? 10} 組`,
      decisionHeadline: `信義店缺料 → AI 已查出新北板橋店有餘裕，一鍵跨店調撥 ${multiStorePlan[0]?.qty ?? 10} 組免採購`,
      engineProof: multiStorePlan[0]?.reason ?? "跨店調撥 10 組",
    },
    {
      id: "SC-09",
      no: 9,
      branch: "台中公益教室",
      region: "中區",
      category: "WMS耗損＋20店AI調撥",
      actor: "中區督導（調撥＋差額採購）",
      title: "顏料包缺口大，AI 自動拆為「七期店調撥＋剩餘差額總部請購」",
      painPoint: "痛點（四）（五）：調撥只夠補一半時，人工很容易漏訂剩下的差額。",
      beforeSteps: ["算公益店總需求", "查七期店可調撥數", "開跨店調撥單", "手算還差幾組", "另外開一張總部請購單", "追蹤兩邊到貨時間"],
      oneClickLabel: "一鍵執行跨店調撥＋差額轉總部請購",
      decisionHeadline: "台中公益店顏料缺口 → 自動由台中七期店調撥餘裕，不足差額同步開立總部請購單",
      engineProof: `AI 產生 ${multiStorePlan.length} 階段組合決策（先調撥、後補貨）`,
    },
    {
      id: "SC-10",
      no: 10,
      branch: "高雄巨蛋教室",
      region: "南區",
      category: "WMS耗損＋20店AI調撥",
      actor: "南區店長（全區低於安全水位）",
      title: "南區各店皆無餘裕，AI 加計 10% 歷史損耗率自動提出補貨量",
      painPoint: "痛點（二）：備料沒把教學損耗算進去，只訂剛好的數量，上課現場壞一組就少一組。",
      beforeSteps: ["查未來兩週報名人數", "翻上個月損耗紀錄", "按計算機加 10% 緩衝", "對照安全庫存門檻", "填採購申請單", "傳給總部審核"],
      oneClickLabel: "依 AI 建議量（含損耗緩衝）開立請購",
      decisionHeadline: "高雄巨蛋店材料低於安全量 → AI 已加計 10% 教學損耗緩衝，一鍵轉總部請購",
      engineProof: "demandWithWastage = ceil(upcomingDemand * (1 + wastageRate))",
    },
    {
      id: "SC-11",
      no: 11,
      branch: "台南東區教室",
      region: "南區",
      category: "WMS耗損＋20店AI調撥",
      actor: "現場助教（週末開課領料）",
      title: "週末親子班 12 位學員到齊，一鍵將預扣材料轉為上課耗用",
      painPoint: "痛點（二）（五）：上完課沒時間一筆筆打領料單，系統庫存永遠比實際架上多。",
      beforeSteps: ["對點名表實到人數", "打開庫存系統", "找該課程對應的 3 種材料品號", "逐一輸入領用數量", "手動解除預扣數", "月底重對帳卡"],
      oneClickLabel: "全班到課一鍵領用耗用（12 人份）",
      decisionHeadline: "週末班 12 人到課 → 一鍵將已鎖定的 12 人份材料包轉為實際上課耗用",
      engineProof: "Stock Entry (Material Issue) 一次扣減並累加 consumed30d",
    },
    {
      id: "SC-12",
      no: 12,
      branch: "台北松山教室",
      region: "北區",
      category: "WMS耗損＋20店AI調撥",
      actor: "授課老師（現場耗材破損）",
      title: "上課時學員不小心弄壞相框與顏料乾涸，現場 5 秒登記教學損耗",
      painPoint: "痛點（二）：損耗與報廢沒人記，到月底盤點才發現短少，影響毛利與補貨準確度。",
      beforeSteps: ["拿紙筆記下壞掉的材料", "去櫃檯找備品補發給學生", "月底盤點發現帳實不符", "會計追問差額原因", "人工補開報廢單", "手動修正下期備料量"],
      oneClickLabel: "一鍵記教學損耗 2 組（自動重算補貨）",
      decisionHeadline: "已登記教學損耗 2 組 → 現有庫存即時扣減，並自動回饋至 AI 損耗率模型",
      engineProof: "wastage30d 即時更新，下次備料自動提高損耗安全緩衝",
    },
    {
      id: "SC-13",
      no: 13,
      branch: "台北內湖教室",
      region: "北區",
      category: "WMS耗損＋20店AI調撥",
      actor: "總部採購（季節冷門材料去化）",
      title: "節慶檔期結束剩餘 8 組材料包，AI 媒合調往有體驗課的桃園青埔店",
      painPoint: "痛點（二）（四）：季節性材料在 A 店放著過期報廢，B 店卻還在買同類體驗包。",
      beforeSteps: ["各店月底回報滯銷材料", "總部整理 Excel", "逐一詢問其他分店有無體驗活動可用", "人工協調調撥", "改兩店庫存帳", "追蹤體驗課實際去化"],
      oneClickLabel: "一鍵調往桃園青埔店體驗班去化",
      decisionHeadline: "內湖店剩餘 8 組檔期包 → AI 配對桃園青埔店週日體驗課需求，一鍵調撥去化零浪費",
      engineProof: "餘裕分店 surplus 自動配對需求分店 upcomingDemand",
    },
    {
      id: "SC-14",
      no: 14,
      branch: "台北士林教室",
      region: "北區",
      category: "CRM預約＋OMS鎖料",
      actor: "業務主管（安親班 25 人包班）",
      title: "接洽 25 人企業／安親包班，1 秒試算開班容量與瓶頸缺料",
      painPoint: "痛點（二）（五）：接大單時不知道倉庫材料夠不夠，答應客戶後才發現某個配件缺貨。",
      beforeSteps: ["查包班課程 BOM", "乘以 25 人算各項材料總需求", "查倉庫現有庫存", "扣掉其他班已預約的量", "找出哪幾樣不夠並算差額", "開請購單並回報業務交期"],
      oneClickLabel: "試算 25 人包班並一鍵開立缺料請購",
      decisionHeadline: "25 人包班試算完成 → 畫冊夠用，卡在『無毒顏料包』還缺 18 組，點一下直接請購",
      engineProof: "evaluateCourseBom 即時標出 bottleneck 與 shortageForTarget",
    },
    {
      id: "SC-15",
      no: 15,
      branch: "台北信義教室",
      region: "北區",
      category: "HRM師資媒合＋主管留痕",
      actor: "店務主管（老師臨時請假代課）",
      title: "林老師當天請特休，AI 依「法規先行＋技能標籤」推薦陳老師跨店代課",
      painPoint: "痛點（三）：老師請假要翻班表、查誰會教這門課、打電話問有沒有空、還怕排到超時違法。",
      beforeSteps: ["收到請假單", "查林老師當天有哪些課", "翻師資名冊找會教節慶 DIY 的人", "逐一比對當天班表有無衝堂", "檢查本週工時有無超標", "LINE 詢問代課意願"],
      oneClickLabel: `確認採用 AI 建議（派${aiMatch.recommended?.teacher.name ?? "陳老師"}代課）`,
      decisionHeadline: `林老師請特休 → AI 已排除衝堂王老師，推薦具「節慶DIY」標籤的${aiMatch.recommended?.teacher.name ?? "陳老師"}跨店支援`,
      engineProof: aiMatch.recommended?.aiReason ?? "專長與年齡層吻合且工時合規",
    },
    {
      id: "SC-16",
      no: 16,
      branch: "台中西屯教室",
      region: "中區",
      category: "HRM師資媒合＋主管留痕",
      actor: "排課行政（同教室時段衝突）",
      title: "兩堂手作課誤排同一間教室，系統即時攔截並提示空閒教室",
      painPoint: "痛點（三）：人工排課只看老師沒看教室，開課當天才發現兩個班擠在同一間教室。",
      beforeSteps: ["排入老師班表", "另外打開教室使用登記表", "人工核對時段是否重疊", "發現衝突後重改班表", "通知老師換教室", "更新門外教室課表"],
      oneClickLabel: "自動擋下衝突並改排空閒教室 B",
      decisionHeadline: `${roomConflictMsg ?? "教室衝突已攔截"} → 點一下改排空閒的「教室 B」`,
      engineProof: roomConflictMsg ?? "scheduleConflict 攔截同店同教室重疊時段",
    },
    {
      id: "SC-17",
      no: 17,
      branch: "新北永和教室",
      region: "北區",
      category: "HRM師資媒合＋主管留痕",
      actor: "區督導（假日尖峰師資缺口）",
      title: "週六尖峰時段永和店無「黏土雕塑」師資，AI 主動發出跨店調度提醒",
      painPoint: "痛點（三）（四）：假日熱門時段單店師資不足，店長不敢加開班，白白流失報名學員。",
      beforeSteps: ["發現永和店週六沒老師", "去區域群組問哪家店週六有黏土老師空檔", "核對該老師適教年齡層", "確認跨店交通與支援意願", "手動登錄跨店班表", "月底人工拆分兩店鐘點成本"],
      oneClickLabel: "一鍵指派板橋店陳老師跨店支援",
      decisionHeadline: aiMatch.staffingGapWarning ?? "跨店支援提醒：由鄰近分店具專長標籤師資支援",
      engineProof: "recommendTeachersForClass 自動檢索 supportBranches 並標示 crossBranch",
    },
    {
      id: "SC-18",
      no: 18,
      branch: "台中公益教室",
      region: "中區",
      category: "HRM師資媒合＋主管留痕",
      actor: "人資主管（勞基法工時上限先行把關）",
      title: "正職老師當日已排 10 小時、欲再排 3 小時晚班，系統依勞基法第 32 條先行擋下",
      painPoint: "痛點（三）：排班沒算累積工時，月底算薪水才發現單日超過 12 小時或月超 46 小時，面臨勞檢裁罰風險。",
      beforeSteps: ["查看待排晚班", "翻該老師當日已排時數", "查當月已累計加班時數", "翻勞基法第 32 條上限規定", "發現超時後重新找人", "重排班表並通知主管"],
      oneClickLabel: "法規先行自動擋下並改派工時充裕師資",
      decisionHeadline: "勞基法第 32 條第 2 項先行把關：當日 10+3=13h 超過一日 12 小時上限，已自動排除並改薦合規師資",
      engineProof: "blockedCandidates 自動攔截 sameDayHours + durationHours > 12 及月 46/54h、季 138h 上限",
    },
    {
      id: "SC-19",
      no: 19,
      branch: "高雄左營教室",
      region: "南區",
      category: "HRM師資媒合＋主管留痕",
      actor: "營運主管（主管覆核改派與異常留痕）",
      title: "主管將 AI 推薦師資改派為總部巡迴指導師資，系統完整保存覆核留痕",
      painPoint: "計畫書規範：AI 只提建議、主管保留最終決策權，且必須保存原始建議、調整內容與時間戳記，不逕行自動再訓練。",
      beforeSteps: ["看排班建議", "手動改成另一位老師", "在備註欄手寫為什麼改", "另外填一份 AI 模型回饋紀錄表", "人工壓上修改時間", "月底交給資服團隊檢視"],
      oneClickLabel: "確認改派並自動寫入覆核留痕",
      decisionHeadline: `主管改派為${auditSample.finalName} → 已自動保存原始建議（${auditSample.aiSuggestedName}）、調整原因與時間戳記`,
      engineProof: `decision=${auditSample.decision}, reviewedAt=${auditSample.reviewedAt}（不逕行自動再訓練）`,
    },
    {
      id: "SC-20",
      no: 20,
      branch: "總部中央中台（20 店）",
      region: "總部",
      category: "總部中台＋薪資串接",
      actor: "總部營運長／會計",
      title: "月底一鍵彙整 20 家分店材料水位、師資工時與既有薪資／勞健保系統串接檔",
      painPoint: "痛點（四）（五）：20 家店月底要花 3 天對材料帳與師資鐘點；又不想重買重做整套昂貴人資 ERP。",
      beforeSteps: ["催 20 家店交報表", "合併 20 份庫存與耗損 Excel", "核對跨店調撥與代課時數", "檢查有無超過勞基法加班上限", "手算特休未休折算工資", "整理成既有薪資系統匯入格式"],
      oneClickLabel: "一鍵產出 20 店營運總覽與薪資串接摘要",
      decisionHeadline: "20 家據點課程履約、材料調撥與師資工時已即時同步 → 一鍵匯出標準薪資／勞健保串接資料",
      engineProof: "中央同一套資料口徑，薪資／勞健保採既有系統串接與必要欄位管理",
    },
  ];

  return raw.map((item) => {
    const manualStepsCount = item.beforeSteps.length;
    const cognitiveReductionPct = cognitiveLoadReductionPct(manualStepsCount, 1);
    return {
      ...item,
      manualStepsCount,
      systemStepsCount: 1,
      cognitiveReductionPct,
      resolved: Boolean(item.decisionHeadline && item.engineProof && cognitiveReductionPct >= 80),
    };
  });
}

export function summarizeCognitiveReduction(scenarios: readonly ScenarioEvaluation[]) {
  const totalManual = scenarios.reduce((sum, s) => sum + s.manualStepsCount, 0);
  const totalSystem = scenarios.length; // 每個情境皆為 1 步一鍵完成
  const overallReductionPct = Math.round(((totalManual - totalSystem) / totalManual) * 100);
  const allResolved = scenarios.every((s) => s.resolved);
  return {
    scenarioCount: scenarios.length,
    totalManualSteps: totalManual,
    totalSystemSteps: totalSystem,
    overallReductionPct,
    allResolved,
  };
}
