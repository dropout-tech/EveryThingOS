import { COMMERCIAL } from "./commercial";

export type Post = {
  slug: string;
  title: string;
  description: string;
  /** Calendar date in Asia/Taipei, YYYY-MM-DD. */
  date: string;
  paragraphs: string[];
};

const POSTS: Post[] = [
  {
    slug: "shell-is-live",
    title: "公開網站現在跑的是殼",
    description: "dropout-os.vercel.app 可以選行業、走單據。帳本、對話和會議還沒接上，所以數字是示範。",
    date: "2026-10-29",
    paragraphs: [
      "現在打開的 EveryThingOS 是產品的殼。導入、今天、客人、生意、倉庫、進貨、對帳、預約、人事、對話、電子報、報表這些畫面都可以開。",
      "行業的單據名稱、貨架和預約欄位寫在殼裡。停賣、缺料、對過帳留在你這台瀏覽器。換一台電腦就看不到。",
      "ERPNext、Chatwoot、會議機器人和系統之間的膠水還沒接上。所以沒有真的客人、真的庫存、真的訊息，也沒有機器人進過會議。頁面上若寫示範，就是這個意思。",
      "公司登記名稱、統編、地址這些簽約要用的資料，條款頁仍標成待填。薪資的實發金額也先空白，等費率對過公告再填。",
    ],
  },
  {
    slug: "each-trade",
    title: "一百個行業，各自的單據與貨架",
    description: "導入可以選花店，不必被鎖成服飾店。報價可以未稅，過期批號不能賣。",
    date: "2026-10-28",
    paragraphs: [
      "打開示範時先選現場，再選這一家。賣東西裡可以選花店，也可以選服飾店。選了花店，倉庫看到的是花，不是上衣。",
      "單據跟著這一行走。餐飲要先問內用或外帶，材料不夠可以先停賣。民宿要填入住、退房和房型。金屬加工可以先收訂金。貨運可以把幾張單併成月結。",
      "報價預設未稅，稅額是 0。這張單要開發票時才加 5% 營業稅。過期的批號不能請購、不能賣。",
      "其中一部分行業有自己的欄，例如植牙批號、船次、車牌。其餘行業的「今天」先用這一行自己的痛點當欄位，不借用別的行業的句子。",
    ],
  },
  {
    slug: "payroll-blank",
    title: "薪資先對公告，實發先空白",
    description: "每月延長工時沿用既有的 46 小時上限。費率沒核對之前，練習薪資不顯示實發金額。",
    date: "2026-10-22",
    paragraphs: [
      "人事頁可以看班表、請假和打卡練習。餐飲這一行，這一頁的主要動作是確認今天的班。系統不會自己把人排進去。",
      "每月延長工時的上限沿用既有規則：46 小時。有同意書的情況，程式裡另有 54 小時這一檔。接近上限時會提醒。",
      "勞保、健保、扣繳的費率每年要對勞保局、健保署和財政部的公告。沒核對之前，練習薪資的實發先空白，不先寫一個看起來像發出去的數字。",
      "打卡練習留在這一頁，還沒送進薪資單。真的打卡要等這家公司的 ERPNext 裝上人事，而且員工資料連到登入帳號。",
    ],
  },
  {
    slug: "one-login",
    title: "客人、生意、帳，放在同一個登入",
    description: "不用 AI 免費。AI 版一年含稅 NT$69,000，現在用量不限，以後會限量並先說。",
    date: "2026-10-11",
    paragraphs: [
      `${COMMERCIAL.product} 給 5 到 100 人、現在用試算表、LINE 或鼎新 A1／億看在記帳的台灣中小企業。不用 AI，系統免費。AI 版一年含稅 NT$69,000。現在 AI 用量不限；以後會限量，上限和開始日會先寫在價格頁。`,
      "一年費用裡有客人、進銷存、財務、人事薪資、老闆報表。對話、對外 API 要等你們自己的外部帳號。會議紀錄可以先試，先跟顧問確認合不合適。",
      "進銷存對齊的範圍是報價到收款、請購到付款、庫存、帳齡、傳票和營業稅。電子發票要交給加值中心，金流跟 LINE 官方帳號依各家原價，我們不抽成。",
      "帳號在公司自己的 ERPNext。這個網站還沒接上時，登入頁不會核對密碼，示範資料只留在瀏覽器。接上之後，職務看到的範圍跟 ERPNext 一樣。",
    ],
  },
];

export function listPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export function formatPostDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}
