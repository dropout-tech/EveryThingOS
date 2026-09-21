export type Quote = {
  line: string;
  by: string;
};

export const QUOTES: Quote[] = [
  { line: "用昨天的工具，打不贏明天的市場。", by: "DropOut" },
  { line: "你不需要完整才能出發；你需要出發才會完整。", by: "DropOut" },
  { line: "先收到錢，才叫生意。先做完系統，只叫專案。", by: "DropOut" },
  { line: "客戶不在乎選單有多深，他在乎你今天有沒有回他。", by: "DropOut" },
  { line: "沒有現金流，願景只是投影片。", by: "DropOut" },
  { line: "Stay hungry. Stay foolish.", by: "Steve Jobs" },
  { line: "把時間花在會變成訂單的事上。", by: "DropOut" },
  { line: "舒適圈很暖，但也是別人超車的路肩。", by: "DropOut" },
  { line: "Ideas are easy. Implementation is hard.", by: "Guy Kawasaki" },
  { line: "每天只問一件事：這一筆，收到錢了沒有。", by: "DropOut" },
  { line: "做艱困的事。容易的事，市場已經擠滿人。", by: "DropOut" },
  { line: "銷售是最誠實的產品開發。", by: "DropOut" },
  { line: "一個產業包、一筆真實生意，勝過一百頁規劃。", by: "DropOut" },
  { line: "The people who are crazy enough to think they can change the world are the ones who do.", by: "Apple" },
  { line: "速度不是趕工，是少讓客戶等。", by: "DropOut" },
  { line: "帳算得清，人才敢衝。", by: "DropOut" },
];

export function quoteForDay(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

export function nextQuote(current: Quote) {
  const index = QUOTES.findIndex((item) => item.line === current.line);
  return QUOTES[(index + 1) % QUOTES.length];
}
