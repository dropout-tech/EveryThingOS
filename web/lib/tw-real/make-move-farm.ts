import type { SceneScript } from "./types";

export const makeScript: SceneScript = {
  id: "make",
  label: "製造／加工",
  beats: [
    { step: "詢價", detail: "有人來問這批能不能做，我先把人記下來再回。", href: "/workspace/crm" },
    { step: "看圖", detail: "圖在對話裡，我照這次給的圖和規格看，不用舊的。", href: "/workspace/chat" },
    { step: "估料", detail: "照圖算這張單要多少料，倉庫不夠的先列出來，先不買。", href: "/workspace/erp/stock" },
    { step: "報交期", detail: "交期寫在這張報價上，出貨就照這一天。", href: "/workspace/erp/sales" },
    { step: "收訂金", detail: "這張報價的訂金進帳了，我才往下買料。", href: "/workspace/erp/finance" },
    { step: "備料", detail: "料要等這張單的訂金進了，才向廠商叫。", href: "/workspace/erp/purchase" },
    { step: "生產", detail: "料到了照這張單的數量做。", href: "/workspace/erp/stock" },
    { step: "品檢", detail: "沒過的留在倉庫，記成不良品，不出這張單。", href: "/workspace/erp/stock" },
    { step: "出貨", detail: "良品照報價上寫的那天出。", href: "/workspace/erp/sales" },
    { step: "請款", detail: "貨出了請這張單的尾款，數字照單上的。", href: "/workspace/erp/finance" },
  ],
};

export const moveScript: SceneScript = {
  id: "move",
  label: "運送／倉儲",
  beats: [
    { step: "問路線", detail: "客人問從哪到哪、幾件、何時要到，我在對話裡問完。", href: "/workspace/chat" },
    { step: "估運費", detail: "路線和件數定了，運費報在這張單上。", href: "/workspace/erp/sales" },
    { step: "接單", detail: "客人答應這張運費我才接，公司戶多半月結，不是貨到收現。", href: "/workspace/erp/sales" },
    { step: "派車", detail: "單接了才派車，我跟司機講這張單的地址和時間。", href: "/workspace/chat" },
    { step: "取貨", detail: "取貨照單點件數，少一件先記在這張單。", href: "/workspace/erp/stock" },
    { step: "在途", detail: "貨還在路上，我先記在途，這時候不算送到。", href: "/workspace/erp/stock" },
    { step: "送達", detail: "車到了單上寫的地址，我把這張單記成送到。", href: "/workspace/erp/sales" },
    { step: "簽收", detail: "要有簽名或一張收到的照片，這才算對方收下。", href: "/workspace/chat" },
    { step: "月結對帳", detail: "月結的客戶月底對這個月跑過的單，不是每趟當場收錢。", href: "/workspace/erp/finance" },
    { step: "請款", detail: "對完帳再請這個月的款，一張單一筆。", href: "/workspace/erp/finance" },
  ],
};

export const farmScript: SceneScript = {
  id: "farm",
  label: "產銷／農漁",
  beats: [
    { step: "問數量", detail: "盤商或餐廳問這週要多少，我先在對話裡把數量問定。", href: "/workspace/chat" },
    { step: "看產季", detail: "我看現在產季實際有什麼，沒有的不報。", href: "/workspace/erp/stock" },
    { step: "報價", detail: "價錢照這季和這批的 A、B 級，寫在這張單上。", href: "/workspace/erp/sales" },
    { step: "接單", detail: "對方答應這張單我才接，等級和數量以單上為準。", href: "/workspace/erp/sales" },
    { step: "採收", detail: "照單上的量去收，收回來先入庫。", href: "/workspace/erp/stock" },
    { step: "分級", detail: "這批我分成 A 級和 B 級，等級記在庫存，也寫在這張單。", href: "/workspace/erp/stock" },
    { step: "包裝", detail: "依單上的等級和數量包，A 和 B 不混箱。", href: "/workspace/erp/stock" },
    { step: "出貨", detail: "出這張單寫的等級和數量，價錢照單上的。", href: "/workspace/erp/sales" },
    { step: "月結對帳", detail: "盤商多半月結，月底對這個月出的單和等級。", href: "/workspace/erp/finance" },
    { step: "請款", detail: "對完再請這個月的款，金額照每張單的等級和價錢。", href: "/workspace/erp/finance" },
  ],
};
