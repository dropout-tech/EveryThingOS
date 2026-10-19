import type { SceneScript } from "./types";

export const serviceScript: SceneScript = {
  id: "service",
  label: "接案／專業",
  beats: [
    {
      step: "詢問",
      detail: "有人來問能不能接，先把這個人記在客人上。",
      href: "/workspace/crm",
    },
    {
      step: "聽需求",
      detail: "先聽他要做什麼、什麼時候要，範圍沒聽完不要報價。",
      href: "/workspace/crm",
    },
    {
      step: "估工時",
      detail: "這案子實際要幾個小時，先算進報價的工項再往外報。",
      href: "/workspace/erp/sales",
    },
    {
      step: "報價",
      detail: "照估好的工時開一張報價，訂金就是這張報價上寫的金額。",
      href: "/workspace/erp/sales",
    },
    {
      step: "收訂金",
      detail: "先收這張報價寫的訂金，錢進來才開工。",
      href: "/workspace/erp/finance",
    },
    {
      step: "開工",
      detail: "訂金入帳就開工，只做這張報價答應的範圍。",
      href: "/workspace/erp/sales",
    },
    {
      step: "給草稿",
      detail: "草稿先給客人看，請他把要改的一次講完。",
      href: "/workspace/crm",
    },
    {
      step: "改一輪",
      detail: "這張合約寫可以改一輪，再多就要另外開報價。",
      href: "/workspace/erp/sales",
    },
    {
      step: "交付",
      detail: "這一輪改完就交付，交出去才請剩下的錢。",
      href: "/workspace/erp/sales",
    },
    {
      step: "請尾款",
      detail: "交付之後開尾款，請這張報價還沒收到的金額。",
      href: "/workspace/erp/finance",
    },
  ],
};

export const buildScript: SceneScript = {
  id: "build",
  label: "工地／裝潢",
  beats: [
    {
      step: "看現場",
      detail: "先到現場看過，這戶人家和現場狀況記在客人上。",
      href: "/workspace/crm",
    },
    {
      step: "量尺寸",
      detail: "尺寸在現場量完，量到的數字才拿來回報價。",
      href: "/workspace/crm",
    },
    {
      step: "估價",
      detail: "照現場量的尺寸開報價，訂金金額寫在這張報價上。",
      href: "/workspace/erp/sales",
    },
    {
      step: "收訂金",
      detail: "先收報價上寫的那筆訂金，沒入帳不備料。",
      href: "/workspace/erp/finance",
    },
    {
      step: "備料",
      detail: "料不夠就開一張採購單跟廠商訂。",
      href: "/workspace/erp/purchase",
    },
    {
      step: "施工",
      detail: "料到了就照原報價的範圍施工。",
      href: "/workspace/erp/sales",
    },
    {
      step: "驗收",
      detail: "跟客人到現場走一趟，他點頭的才算驗收過。",
      href: "/workspace/crm",
    },
    {
      step: "追加另報",
      detail: "多做的項目另開一張報價，客人答應了才做，不併進原價。",
      href: "/workspace/erp/sales",
    },
    {
      step: "完工",
      detail: "原範圍做完，答應過的追加也做完，才算完工。",
      href: "/workspace/erp/sales",
    },
    {
      step: "請尾款",
      detail: "完工後請尾款，收這張報價還沒收到的金額。",
      href: "/workspace/erp/finance",
    },
  ],
};
