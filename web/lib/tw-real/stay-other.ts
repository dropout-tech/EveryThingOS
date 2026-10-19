import type { SceneScript } from "./types";

export const stayScript: SceneScript = {
  id: "stay",
  label: "住宿／活動",
  beats: [
    {
      step: "問日期人數",
      detail: "客人來問，我先問哪幾天、幾個人，住房還是借場地。",
      href: "/workspace/chat",
    },
    {
      step: "報價",
      detail: "日期和人數定了，我開一張報價，價錢寫在這張單上。",
      href: "/workspace/erp/sales",
    },
    {
      step: "收訂金",
      detail: "訂金照這張報價寫的數字收，錢進來這間才留下。",
      href: "/workspace/erp/finance",
    },
    {
      step: "留房",
      detail: "訂金進帳，我把那幾天的房或場地留在這張單上，不再排給別人。",
      href: "/workspace/erp/sales",
    },
    {
      step: "入住",
      detail: "人到了，我核對姓名和人數，鑰匙或場地交給他。",
      href: "/workspace/crm",
    },
    {
      step: "加人或加購",
      detail: "多一個人、加早餐或晚退房，退房前就補在原來這一張帳上。",
      href: "/workspace/erp/sales",
    },
    {
      step: "退房點房",
      detail: "退房我把房間點過，缺的、壞的等一下跟這一張帳一起算。",
      href: "/workspace/crm",
    },
    {
      step: "結帳",
      detail: "人還沒走我就結這一張，訂金、加人和加購都算在裡面。",
      href: "/workspace/erp/finance",
    },
    {
      step: "開發票",
      detail: "客人給了統編就開三聯，沒給就開二聯。",
      href: "/workspace/erp/finance",
    },
    {
      step: "邀再訪",
      detail: "人走了，我寄一封短的邀再來，信末留下店裡的 LINE。",
      href: "/workspace/letter",
    },
  ],
};

export const otherScript: SceneScript = {
  id: "other",
  label: "其他現場",
  beats: [
    {
      step: "聽來意",
      detail: "客人進門，我先聽他這次要修、要租，還是要用工作室。",
      href: "/workspace/crm",
    },
    {
      step: "問清楚",
      detail: "我問壞在哪、租幾天，或工作室哪一段，沒問清楚不報價。",
      href: "/workspace/crm",
    },
    {
      step: "定這次做什麼",
      detail: "這一次我跟他講定是修好這台、租這幾天，還是工作室用到幾點，寫在這張單上。",
      href: "/workspace/erp/sales",
    },
    {
      step: "報價",
      detail: "範圍講定了，我照這一次開一張報價。",
      href: "/workspace/erp/sales",
    },
    {
      step: "客人答應",
      detail: "客人答應這張價，我才把這一次做成要做的單。",
      href: "/workspace/erp/sales",
    },
    {
      step: "開工",
      detail: "他答應了我就開工，開始修、把租的交出去，或把工作室開給他用。",
      href: "/workspace/erp/sales",
    },
    {
      step: "半途跟一聲",
      detail: "做到一半我跟他說現在做到哪，這張報價的範圍還沒做完。",
      href: "/workspace/chat",
    },
    {
      step: "交付",
      detail: "修好交回、租的收回，或這段工作室用完，我跟他對過這一次做完什麼。",
      href: "/workspace/erp/sales",
    },
    {
      step: "請款",
      detail: "做完我照這張單請他付這一次的錢。",
      href: "/workspace/erp/finance",
    },
    {
      step: "收到錢",
      detail: "錢真的進帳，我才把這筆記成已收。",
      href: "/workspace/erp/finance",
    },
  ],
};
