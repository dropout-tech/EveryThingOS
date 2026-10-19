import type { SceneScript } from "./types";

export const retailScript: SceneScript = {
  id: "retail",
  label: "賣東西",
  beats: [
    {
      step: "進門",
      detail: "客人從門口走進來，或是 LINE、IG 傳訊來，我先回他一聲，並用手機號碼在客檔建這個人。",
      href: "/workspace/crm",
    },
    {
      step: "問要什麼",
      detail: "我問他今天要哪一款、尺寸或顏色，把需求逐項寫在對話裡，貨還沒對過先不說有。",
      href: "/workspace/chat",
    },
    {
      step: "對貨架",
      detail: "答應之前我先對貨架和倉庫的實際數量，不夠就在庫存寫上缺幾件，不先跟客人打包票。",
      href: "/workspace/erp/stock",
    },
    {
      step: "報價錢",
      detail: "我當場報這件多少錢、有沒有現折，把品名、數量和單價寫進報價。",
      href: "/workspace/erp/sales",
    },
    {
      step: "客人答應",
      detail: "客人點頭或在 LINE 回好，我在他的客檔記下答應的品項和價錢。",
      href: "/workspace/crm",
    },
    {
      step: "開銷售單",
      detail: "他答應之後我開一張銷售單，品名、數量、單價都照剛報的寫進去。",
      href: "/workspace/erp/sales",
    },
    {
      step: "從架上拿",
      detail: "我照銷售單從架上拿貨，數量以倉庫現有為準，短少的件數記在庫存上。",
      href: "/workspace/erp/stock",
    },
    {
      step: "結帳",
      detail: "客人付現或轉帳，我在帳上收下這筆並開收據，收據寫明本店自己定的七天內憑收據可退換。",
      href: "/workspace/erp/finance",
    },
    {
      step: "開發票",
      detail: "個人客人開二聯式，有給統一編號就開三聯式，發票號碼和統編記在這筆帳上。",
      href: "/workspace/erp/finance",
    },
    {
      step: "約下次",
      detail: "貨交給他之後，我寄一封短函約下次換季或補貨再來，信末留下店裡的 LINE。",
      href: "/workspace/letter",
    },
  ],
};
