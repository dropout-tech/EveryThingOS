import type { FeatureId, ShopProfile } from "./shop";

/** Step ids match `dropout_core.onboarding.checklist`. */
export type ChecklistId =
  | "company"
  | "team"
  | "customers"
  | "items"
  | "first_quotation"
  | "first_payment"
  | "channels"
  | "newsletter"
  | "employees"
  | "einvoice";

export type ChecklistStep = {
  id: ChecklistId;
  label: string;
  why: string;
  cta: string;
  /** Shell path, or `desk:` + an ERPNext path. */
  place: string;
  help: string;
  /** Only shown when one of these modules is on. Empty: always. */
  modules: FeatureId[];
};

export const CHECKLIST: ChecklistStep[] = [
  { id: "company", label: "公司資料與統編", why: "報價單、發票、電子發票都會印上公司名稱和統編，先填對，後面就不用一張張改。", cta: "填公司資料", place: "desk:/app/company", help: "start", modules: [] },
  { id: "team", label: "邀請同事", why: "每個人用自己的帳號登入，系統才知道誰做了什麼，也只給他看該看的。", cta: "去邀請", place: "/workspace/team", help: "roles", modules: [] },
  { id: "customers", label: "匯入客人", why: "客人進來了，報價、對話、電子報才找得到同一個人。", cta: "匯入客人", place: "desk:/app/data-import/new?reference_doctype=Customer", help: "import-data", modules: [] },
  { id: "items", label: "匯入商品與價格", why: "商品有售價，開報價時選一下就帶出金額和稅。", cta: "匯入商品", place: "desk:/app/data-import/new?reference_doctype=Item", help: "import-data", modules: ["sales", "stock", "purchase", "website"] },
  { id: "first_quotation", label: "開第一張報價", why: "從報價開始，後面的訂單、出貨、發票、收款都是同一張單往下走。", cta: "去開報價", place: "/workspace/erp/sales", help: "module-sales", modules: ["sales"] },
  { id: "first_payment", label: "收到第一筆錢", why: "收款記進去，誰還欠錢、這個月賺多少才算得準。", cta: "去收款", place: "/workspace/erp/sales", help: "module-sales", modules: ["sales", "finance"] },
  { id: "channels", label: "接上 LINE 和對話", why: "LINE、IG、FB、官網的訊息進同一個收件匣，自動對到客人。", cta: "看對話", place: "/workspace/chat", help: "module-chat", modules: ["chat"] },
  { id: "newsletter", label: "寫第一封電子報", why: "只寄給說好的人；退訂一次，所有行銷通道一起關。", cta: "去寫一封", place: "/workspace/letter", help: "module-letter", modules: ["letter"] },
  { id: "employees", label: "建立員工資料", why: "員工資料連到登入帳號，才能打卡、請假、算薪水。", cta: "建員工資料", place: "desk:/app/employee/new", help: "module-hr", modules: ["hr"] },
  { id: "einvoice", label: "開出第一張電子發票", why: "發票開立後交給加值中心上傳，客人收得到、營業稅也對得上。", cta: "看發票", place: "/workspace/erp/finance", help: "module-finance", modules: ["finance", "sales"] },
];

export function checklistFor(shop: ShopProfile | null): ChecklistStep[] {
  const modules = new Set(shop?.modules ?? []);
  return CHECKLIST.filter((step) => {
    if (step.id === "team" && shop?.size === "solo") return false;
    return !step.modules.length || step.modules.some((id) => modules.has(id));
  });
}

export type ChecklistItem = Pick<ChecklistStep, "id" | "label" | "why" | "cta" | "help"> & { href: string; external: boolean; done: boolean | null };

/**
 * Turns the step list and what ERPNext reported into links. Without a live site
 * (`deskBase` missing) ERPNext places fall back to the help article, and `done`
 * is null so the practice checklist can fill it from the practice books.
 */
export function resolveChecklist(steps: ChecklistStep[], live: { id: string; done: boolean; applies: boolean }[] | null, deskBase?: string): ChecklistItem[] {
  const byId = new Map((live ?? []).map((s) => [s.id, s]));
  return steps
    .filter((step) => !live || byId.get(step.id)?.applies !== false)
    .map((step) => {
      const desk = step.place.startsWith("desk:");
      const href = desk ? (deskBase ? `${deskBase}${step.place.slice(5)}` : `/help/${step.help}`) : step.place;
      return {
        id: step.id,
        label: step.label,
        why: step.why,
        cta: step.cta,
        help: step.help,
        href,
        external: desk && Boolean(deskBase),
        done: live ? Boolean(byId.get(step.id)?.done) : null,
      };
    });
}

export const ROLES = ["老闆", "主管", "業務", "倉管", "採購", "會計", "客服", "行銷", "人資"] as const;
export type RoleName = (typeof ROLES)[number];

export type RoleGuide = { role: RoleName; who: string; three: { title: string; detail: string; href: string }[] };

/** Matches the job profiles in `dropout_core.team.PROFILES` and 人資 from `dropout_hr_tw`. */
export const ROLE_GUIDES: Record<RoleName, RoleGuide> = {
  老闆: {
    role: "老闆",
    who: "全部都能看、能做，也能管人和安全設定",
    three: [
      { title: "打開「今天」看卡住的事", detail: "誰逾期沒付、什麼貨快不夠、哪張報價在等，最急的排第一。", href: "/workspace" },
      { title: "看「報表」", detail: "本月營收、毛利、誰欠錢、前十大客人，手機也能看。", href: "/workspace/reports" },
      { title: "管「團隊」", detail: "邀請同事、換職務、停用離職的人，停用馬上登出。", href: "/workspace/team" },
    ],
  },
  主管: {
    role: "主管",
    who: "全部都能看、能做，但不能管人和安全設定",
    three: [
      { title: "推「生意」裡卡住的單", detail: "每張單只有一個下一步按鈕：轉訂單、出貨、開發票、收款。", href: "/workspace/erp/sales" },
      { title: "看「報表」", detail: "成交漏斗、帳齡、快不夠的貨，一頁看完。", href: "/workspace/reports" },
      { title: "核准假單", detail: "有開人事的公司，等你核准的假單在「人事」。", href: "/workspace/hr" },
    ],
  },
  業務: {
    role: "業務",
    who: "客人、報價、訂單",
    three: [
      { title: "在「客人」記下新認識的人", detail: "同一個 Email 或電話會對到原本那位，不會重複建。", href: "/workspace/crm" },
      { title: "在「生意」開報價", detail: "選客人、選商品，稅 5% 自動加；客人答應就按「轉成訂單」。", href: "/workspace/erp/sales" },
      { title: "回「對話」裡的訊息", detail: "LINE、IG、FB、官網的訊息都在同一個收件匣。", href: "/workspace/chat" },
    ],
  },
  倉管: {
    role: "倉管",
    who: "庫存、出貨、收貨",
    three: [
      { title: "看「倉庫」裡快不夠的貨", detail: "低於安全量會變橘色。", href: "/workspace/erp/stock" },
      { title: "缺貨就按「請購」", detail: "同一頁點過去開請購，採購接著下單。", href: "/workspace/erp/stock" },
      { title: "出貨、收貨照單做", detail: "出貨單、收貨單在 ERPNext；怎麼做看說明。", href: "/help/module-stock" },
    ],
  },
  採購: {
    role: "採購",
    who: "請購、採購單、廠商",
    three: [
      { title: "看「進貨」每張單的下一步", detail: "已下單待到貨、已到貨待請款、待付款，一行一個按鈕。", href: "/workspace/erp/purchase" },
      { title: "到貨就按「到貨入庫」", detail: "入庫和應付在同一條，不必另開一張進貨單。", href: "/workspace/erp/purchase" },
      { title: "廠商資料在 ERPNext", detail: "新增廠商、改付款條件，看說明怎麼做。", href: "/help/module-purchase" },
    ],
  },
  會計: {
    role: "會計",
    who: "發票、收付款、帳務",
    three: [
      { title: "看「收錢」的帳齡", detail: "誰欠多久一眼看完，逾期的排前面。", href: "/workspace/erp/finance" },
      { title: "在「生意」開發票、記收款", detail: "同一張單按「開立發票」「記入已收」，開單就入帳。", href: "/workspace/erp/sales" },
      { title: "對「報表」的營收和毛利", detail: "數字直接用 ERPNext 原生報表，要明細就點「在 ERPNext 打開」。", href: "/workspace/reports" },
    ],
  },
  客服: {
    role: "客服",
    who: "對話、客人資料",
    three: [
      { title: "打開「對話」收件匣", detail: "每則新對話會自動找到或建立客人。", href: "/workspace/chat" },
      { title: "在「客人」查這個人", detail: "之前問過什麼、買過什麼，都在同一張客人卡片。", href: "/workspace/crm" },
      { title: "新朋友記下來", detail: "電話打來的、現場來的，在「客人」按新增。", href: "/workspace/crm" },
    ],
  },
  行銷: {
    role: "行銷",
    who: "電子報、名單、官網",
    three: [
      { title: "在「電子報」寫一封", detail: "挑名單、寫內容、寄出；退訂連結會自動加。", href: "/workspace/letter" },
      { title: "看「客人」裡新進的名單", detail: "官網表單、對話進來的人都會出現在這裡。", href: "/workspace/crm" },
      { title: "看「官網」的表單名單", detail: "上架商品、網路訂單、近 30 天表單名單。", href: "/workspace/website" },
    ],
  },
  人資: {
    role: "人資",
    who: "員工資料、請假核准、打卡、薪資",
    three: [
      { title: "看「人事」今天誰請假", detail: "打卡、核准假單在同一頁做完。", href: "/workspace/hr" },
      { title: "月底跑薪資", detail: "在 ERPNext 開「薪資發放」，系統替每個人產生薪資單。", href: "/help/module-hr" },
      { title: "每年核對費率", detail: "勞健保、勞退、扣繳每年會變，第一次發薪前一定要核對。", href: "/help/module-hr" },
    ],
  },
};

/** Best guess from ERPNext roles when the person has no job profile (custom roles). */
export function roleFor(profile: string | undefined | null, roles: string[] | null): RoleName {
  if (profile && (ROLES as readonly string[]).includes(profile)) return profile as RoleName;
  if (!roles || roles.includes("System Manager")) return "老闆";
  const has = (role: string) => roles.includes(role);
  if (has("Accounts Manager") && has("Sales Manager")) return "主管";
  if (has("Accounts User") || has("Accounts Manager")) return "會計";
  if (has("Newsletter Manager") || has("DropOut Marketing")) return "行銷";
  if (has("Purchase User") || has("Purchase Manager")) return "採購";
  if (has("Stock User") || has("Stock Manager")) return "倉管";
  if (has("Support Team")) return "客服";
  return "業務";
}

/** Small page hints. Ids are part of the remembered key; renaming one shows it again. */
export const HINTS = {
  today: { title: "從最上面那件開始", body: "「今天」只放卡住的事，最急的排第一。生意、客人、倉庫、收錢也是最上面一件。" },
  sales: { title: "一張單一個按鈕", body: "最上面是現在這件，逾期的先做。下面每張卡片還是只有下一步。" },
  crm: { title: "一步一步跟到答應", body: "最上面是跟得最遠的那位。這個現場有十步，一次只做下一步。最後一步才轉成一筆生意。" },
  finance: { title: "先看橘色", body: "最上面是逾期最久的那位。帳齡超過 60 天才算逾期；電子發票開好後交給加值中心上傳。" },
  team: { title: "職務決定看得到什麼", body: "換職務立刻生效；停用的人馬上登出。公司至少要留一位老闆。" },
  letter: { title: "只寄給說好的人", body: "最上面是還沒寄出的草稿；沒有草稿，就是還沒點確認信的人。退訂一次，所有行銷通道一起關。" },
  hr: { title: "上下班各按一次", body: "有假單在等，最上面就是那一張。沒有假單，最上面是下一筆打卡。員工資料、排班、薪資結構在 ERPNext 人事後台。" },
} as const;

export type HintId = keyof typeof HINTS;

export const PRACTICE_PATH = "/workspace/practice";

/** Remembered tips are keyed by a hash of the login, not the email itself. */
export function guideScope(user: string | null | undefined) {
  if (!user) return "practice";
  let value = 2166136261;
  for (let i = 0; i < user.length; i += 1) {
    value ^= user.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return `u${(value >>> 0).toString(36)}`;
}
