import type { SceneScript } from "./types";

export const eduScript: SceneScript = {
  id: "edu",
  label: "教課／教室",
  beats: [
    {
      step: "詢問",
      detail: "家長在 LINE 問這期怎麼上、什麼時候可以帶小孩來試聽。",
      href: "/workspace/chat",
    },
    {
      step: "約試聽",
      detail: "我跟家長約好哪一天、幾點，帶小孩來坐一堂。",
      href: "/workspace/crm",
    },
    {
      step: "上試聽",
      detail: "試聽那天小孩坐完一堂，我看他跟得上哪裡。",
      href: "/workspace/crm",
    },
    {
      step: "報名",
      detail: "家長決定報這期，我依報價單上寫的學費開一張報名。",
      href: "/workspace/erp/sales",
    },
    {
      step: "收學費",
      detail: "學費照報價單上我們自己定的金額收，收到這期才算成立。",
      href: "/workspace/erp/finance",
    },
    {
      step: "排課",
      detail: "錢收了，我把這位學生排進這期固定的上課時段。",
      href: "/workspace/erp/sales",
    },
    {
      step: "上課",
      detail: "這堂課照排好的時間上完。",
      href: "/workspace/erp/sales",
    },
    {
      step: "點名",
      detail: "這堂誰到、誰沒到，老師自己點名記下來。",
      href: "/workspace/erp/sales",
    },
    {
      step: "課後跟家長說",
      detail: "下課我用 LINE 跟家長說今天上了什麼、回家要練哪裡。",
      href: "/workspace/chat",
    },
    {
      step: "續報下期",
      detail: "下期要繼續上，家長重新報名，我再開一張新的報名。",
      href: "/workspace/erp/sales",
    },
  ],
};

export const careScript: SceneScript = {
  id: "care",
  label: "診所／美容",
  beats: [
    {
      step: "線上預約",
      detail: "客人在 LINE 約好哪一天來、想做哪一項。",
      href: "/workspace/chat",
    },
    {
      step: "到店",
      detail: "客人依約到了，我先對一下是哪一位、約的是什麼。",
      href: "/workspace/crm",
    },
    {
      step: "問要做什麼",
      detail: "坐下先問清楚今天要做哪一項，做之前雙方講定。",
      href: "/workspace/crm",
    },
    {
      step: "做服務",
      detail: "照剛剛講好的項目，這一趟做完。",
      href: "/workspace/erp/sales",
    },
    {
      step: "寫下做了什麼",
      detail: "做完我在店裡自己寫下這次做了什麼。",
      href: "/workspace/crm",
    },
    {
      step: "自費結帳",
      detail: "這一趟是自費，照報價收錢，我們不申報健保。",
      href: "/workspace/erp/finance",
    },
    {
      step: "約下次",
      detail: "結完帳，我跟客人約好下一次哪一天再來。",
      href: "/workspace/crm",
    },
    {
      step: "提醒",
      detail: "下次已經約好了，我用 LINE 提醒客人那天要來。",
      href: "/workspace/chat",
    },
    {
      step: "回訪",
      detail: "做完過幾天我問客人狀況怎麼樣，記在這位客人身上。",
      href: "/workspace/crm",
    },
    {
      step: "再約",
      detail: "客人還要再做，就另外約一趟，這一趟也是自費。",
      href: "/workspace/erp/sales",
    },
  ],
};
