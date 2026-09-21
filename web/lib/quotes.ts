export type Quote = {
  line: string;
  by: string;
};

export const QUOTES: Quote[] = [
  { line: "用昨天的工具，打不贏明天的市場。", by: "DropOut" },
  { line: "你不需要完整才能出發；你需要出發才會完整。", by: "DropOut" },
  { line: "先收到錢，才叫生意。先把畫面做完，只叫作業。", by: "DropOut" },
  { line: "客戶不在乎選單有多深，他在乎你今天有沒有回他。", by: "DropOut" },
  { line: "沒有現金流，願景只是投影片。", by: "DropOut" },
  { line: "保持飢渴，保持傻勁。", by: "Steve Jobs" },
  { line: "把時間花在會變成訂單的事上。", by: "DropOut" },
  { line: "舒適圈很暖，但也是別人超車的路肩。", by: "DropOut" },
  { line: "點子容易，做出來才難。", by: "Guy Kawasaki" },
  { line: "每天只問一件事：這一筆，收到錢了沒有。", by: "DropOut" },
  { line: "做艱困的事。容易的事，市場已經擠滿人。", by: "DropOut" },
  { line: "賣得出去，才叫真的。", by: "DropOut" },
  { line: "一個產業包、一筆真實生意，勝過一百頁規劃。", by: "DropOut" },
  { line: "那些夠瘋、覺得自己改得了世界的人，最後真的改了。", by: "Apple" },
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
