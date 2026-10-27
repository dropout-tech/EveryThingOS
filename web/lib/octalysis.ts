/**
 * 八角框架（Octalysis，周郁凱）在 EveryThingOS 的落點。
 * 說明中心與架構文件都讀這份，避免八個驅力各寫各的。
 * 設計決策見 docs/OCTALYSIS.md、docs/ARCHITECTURE.md 第 0.5 節。
 *
 * 框架名稱與八個驅力是周郁凱的公開架構。這裡只記 EveryThingOS 怎麼用，
 * 不重製他的圖表或教材。
 */

export type OctalysisSide = "white" | "black";

export type OctalysisDrive = {
  n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: string;
  side: OctalysisSide;
  /** Where a person already meets this drive in the product. */
  where: string;
  /** What we will not build in its name. */
  refuse: string;
};

export const OCTALYSIS_DRIVES: readonly OctalysisDrive[] = [
  {
    n: 1,
    name: "史詩意義與使命",
    side: "white",
    where: "每個會做事的頁面最上面都是「現在這件」：誰在等、哪張單卡住、哪場會要開。沒有卡住就不硬補一件。職務三件事與開站清單每一項都先寫為什麼要做。",
    refuse: "每日金句、虛擬頭銜、公司使命徽章。",
  },
  {
    n: 2,
    name: "發展與成就",
    side: "white",
    where: "開站清單做完自動打勾，單據按下一步就往前一格，做完的結果出現在右下角。練習可以走完一筆生意。",
    refuse: "經驗值、等級、每日積分、連續打卡天數。",
  },
  {
    n: 3,
    name: "創意授權與回饋",
    side: "white",
    where: "產業包決定看得到哪些步驟，公司可以改階段。按下去立刻看到這張單變了；練習帳本不會動到真的帳。",
    refuse: "另做一套跟帳無關的小遊戲，或把整頁 ERP 重做成可玩的沙盒。",
  },
  {
    n: 4,
    name: "所有權與擁有",
    side: "white",
    where: "一家公司一份資料，客人是同一個人。打卡與假單是自己的。資料可以匯出帶走。",
    refuse: "把客人做成收集卡，或用點數把資料綁死、不讓匯出。",
  },
  {
    n: 5,
    name: "社交影響與關聯",
    side: "white",
    where: "職務決定誰看到哪三件事。假單由主管核准。對話與生意回到同一張客人卡片。",
    refuse: "業績排行榜、公開點名誰最慢、拿同事來施壓的推播。",
  },
  {
    n: 6,
    name: "稀缺與渴望",
    side: "black",
    where: "只有真的不夠或真的有期限才出現：低於安全量的貨、通路的回覆時限、試用與合約上的日期。",
    refuse: "限時優惠倒數、假的「只剩幾個名額」。",
  },
  {
    n: 7,
    name: "未知與好奇",
    side: "black",
    where: "「今天」的順序會變，是因為生意變了。客人又點了電子報，卡片上會寫她又在看。",
    refuse: "隨機獎勵、開箱、不定時紅包。金額與帳務必須算得出來。",
  },
  {
    n: 8,
    name: "損失與避免",
    side: "black",
    where: "逾期未付、退信停寄、退回前先問、停用帳號立刻登出、沒送到的同步出現在「今天」。",
    refuse: "連勝中斷、扣分，或為了讓人打開而做的整頁紅色。",
  },
];

/** 改任何工作區畫面之前先過這四條。 */
export const OCTALYSIS_RULES: readonly string[] = [
  "先寫下一件事，再放一個主按鈕。其餘的排在後面。",
  "做完的回饋講這件事的結果（已出貨、已核准、清單打勾），不發點數。",
  "稀缺、未知、損失只能引用帳上、合約或通路裡已經存在的事實。",
  "不跟別人比名次。職務不同，看到的三件事就不同。",
];
