import type { SceneScript } from "./types";

export const foodScript: SceneScript = {
  id: "food",
  label: "做餐飲",
  beats: [
    {
      step: "訂位",
      detail: "客人用電話或 LINE 訂位，我記幾位、幾點到，沒訂的現場進來也收。",
      href: "/workspace/chat",
    },
    {
      step: "客人到",
      detail: "人到了先對訂位的名字和人數，再帶去位子。",
      href: "/workspace/crm",
    },
    {
      step: "問內用",
      detail: "點餐前我先問這餐要內用還是外帶。",
      href: "/workspace/erp/sales",
    },
    {
      step: "點餐",
      detail: "內用在位子上點，外帶在櫃檯點，我照客人講的寫進單裡。",
      href: "/workspace/erp/sales",
    },
    {
      step: "出餐",
      detail: "廚房做好就送上桌，食材用完的那道我先停賣。",
      href: "/workspace/erp/stock",
    },
    {
      step: "加點",
      detail: "吃到一半還要加菜或加一杯，我就補在原來那張單上。",
      href: "/workspace/erp/sales",
    },
    {
      step: "結帳",
      detail: "內用把帳單送到桌上收，外帶就在櫃檯算完付錢。",
      href: "/workspace/erp/finance",
    },
    {
      step: "開發票",
      detail: "客人要三聯我就問統編，不然開二聯式給個人。",
      href: "/workspace/erp/finance",
    },
    {
      step: "收桌",
      detail: "客人走了就把桌子收乾淨，位子讓給下一組。",
      href: "/workspace/crm",
    },
    {
      step: "約下次",
      detail: "收桌時問他們下次要不要還坐同一桌，之後用 LINE 再跟一聲。",
      href: "/workspace/chat",
    },
  ],
};
