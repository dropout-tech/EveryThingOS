import Link from "next/link";
import { Avatar } from "./ui/Avatar";
import { Badge, type BadgeTone } from "./ui/Badge";
import { buttonClass } from "./ui/Button";
import { Money } from "./ui/Money";
import type { Books } from "@/lib/erp";
import { formatTwd, formatTwdShort } from "@/lib/format";

type Tone = Books["today"][number]["tone"];

const PRIORITY: Record<Tone, { label: string; badge: BadgeTone; rank: number }> = {
  urgent: { label: "要先做", badge: "danger", rank: 0 },
  warn: { label: "今天內", badge: "warn", rank: 1 },
  ok: { label: "接著做", badge: "neutral", rank: 2 },
};

type Waiting = { title: string; detail?: string; href: string; tone: Tone; who?: string; amount?: number };

const MAX_WAITING = 6;

function canOpen(allowed: string[], href: string) {
  const path = href.split("#")[0];
  return allowed.some((item) => path === item || (item !== "/workspace" && path.startsWith(`${item}/`)));
}

/** The books already say who is waiting; turn that into a short list instead of making people dig. */
function waitingFrom(books: Books, allowed: string[]): Waiting[] {
  const people = [...new Set([...books.sales.map((doc) => doc.party), ...books.arAging.map((row) => row.party)])];
  const whoIn = (text: string) => people.find((name) => text.includes(name));
  const fromToday: Waiting[] = books.today.slice(1).map((job) => ({ ...job, who: whoIn(job.title) }));
  const derived: Waiting[] = [
    ...books.sales
      .filter((doc) => doc.step === "invoice" && doc.overdueDays)
      .map((doc) => ({ title: `${doc.party} 的帳逾期 ${doc.overdueDays} 天`, detail: doc.invoiceNo ? `發票 ${doc.invoiceNo}` : doc.no, href: "/workspace/erp/finance", tone: "warn" as const, who: doc.party, amount: doc.amount + doc.tax })),
    ...books.stock
      .filter((row) => row.safety > 0 && row.onHand < row.safety)
      .map((row) => ({ title: `${row.name} 剩 ${row.onHand}`, detail: `安全量 ${row.safety}，先補貨`, href: "/workspace/erp/stock", tone: "warn" as const })),
    ...books.sales
      .filter((doc) => doc.step === "quote")
      .map((doc) => ({ title: `${doc.party} 的報價等回覆`, detail: doc.no, href: "/workspace/erp/sales", tone: "ok" as const, who: doc.party, amount: doc.amount + doc.tax })),
    ...books.purchases
      .filter((doc) => doc.status.includes("待付款"))
      .map((doc) => ({ title: `付 ${doc.vendor} 的貨款`, detail: doc.no, href: "/workspace/erp/purchase", tone: "ok" as const, amount: doc.amount })),
  ];
  const seen = new Set(fromToday.map((item) => `${item.href}|${item.who ?? item.title}`));
  const extra = derived.filter((item) => {
    const key = `${item.href}|${item.who ?? item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...fromToday, ...extra]
    .filter((item) => canOpen(allowed, item.href))
    .sort((a, b) => PRIORITY[a.tone].rank - PRIORITY[b.tone].rank)
    .slice(0, MAX_WAITING);
}

function today() {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "short" }).format(new Date());
}

export function TodayList({ books, allowed }: { books: Books; allowed: string[] }) {
  const [primary] = books.today;
  const waiting = waitingFrom(books, allowed);
  const priority = PRIORITY[primary.tone];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="page-title scene-type">今天</h1>
        <p className="text-sm text-cream-dim scene-type">
          {today()} · {waiting.length + 1} 件等你
        </p>
      </header>

      <section className="next-action" aria-labelledby="next-title">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="kicker">現在這件</span>
            <Badge tone={priority.badge}>{priority.label}</Badge>
          </p>
          <h2 id="next-title" className="next-action-title mt-3">
            {primary.title}
          </h2>
          <p className="mt-2 text-cream-dim">{primary.detail}</p>
        </div>
        <Link href={primary.href} className={buttonClass({ variant: "primary", className: "w-full px-8 md:w-auto" })} aria-describedby="next-title">
          去做
        </Link>
      </section>

      {waiting.length ? (
        <section aria-labelledby="waiting-title">
          <div className="section-head">
            <h2 id="waiting-title" className="section-title scene-type">
              等你處理
            </h2>
            <p className="text-xs text-cream-dim scene-type">照急的排</p>
          </div>
          <ul className="queue">
            {waiting.map((item) => (
              <li key={`${item.href}-${item.title}`}>
                <Link href={item.href} className="queue-item">
                  <Avatar name={item.who} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.title}</span>
                    {item.detail ? <span className="block truncate text-xs text-cream-dim">{item.detail}</span> : null}
                  </span>
                  {item.amount ? <Money amount={item.amount} className="hidden text-sm sm:inline" /> : null}
                  <Badge tone={PRIORITY[item.tone].badge} className="shrink-0">
                    {PRIORITY[item.tone].label}
                  </Badge>
                  <span aria-hidden="true" className="text-cream-dim">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Numbers books={books} allowed={allowed} />
    </div>
  );
}

function Numbers({ books, allowed }: { books: Books; allowed: string[] }) {
  const sees = (href: string) => canOpen(allowed, href) || canOpen(allowed, "/workspace/reports");
  const tiles = [
    sees("/workspace/erp/sales") && { label: "本月銷貨（未稅）", value: books.monthSales, href: canOpen(allowed, "/workspace/reports") ? "/workspace/reports" : "/workspace/erp/sales", note: `成本 ${formatTwdShort(books.monthCost)}` },
    sees("/workspace/erp/finance") && {
      label: "還沒收的錢",
      value: books.ar,
      href: "/workspace/erp/finance",
      note: books.overdueAr ? `逾期 ${formatTwdShort(books.overdueAr)}` : "沒有逾期",
      tone: books.overdueAr ? ("warn" as const) : undefined,
    },
    sees("/workspace/erp/finance") && { label: "帳上現金", value: books.cash, href: "/workspace/erp/finance", note: `要付廠商 ${formatTwdShort(books.ap)}` },
    books.inventoryValue > 0 && sees("/workspace/erp/stock")
      ? { label: "庫存貨值", value: books.inventoryValue, href: "/workspace/erp/stock", note: `${books.stock.filter((row) => row.onHand < row.safety).length} 項快不夠` }
      : sees("/workspace/erp/finance") && { label: "本期營業稅", value: books.vatPayable, href: "/workspace/erp/finance", note: "銷項減進項，約略" },
  ].filter((tile): tile is { label: string; value: number; href: string; note: string; tone?: "warn" } => Boolean(tile));

  if (!tiles.length) return null;

  return (
    <section aria-labelledby="numbers-title">
      <div className="section-head">
        <h2 id="numbers-title" className="section-title scene-type">
          數字
        </h2>
      </div>
      <ul className="kpi-grid">
        {tiles.map((tile) => (
          <li key={tile.label} className="min-w-0">
            <Link href={tile.href} className="kpi h-full">
              <span className="kpi-label">{tile.label}</span>
              <span className="kpi-value" title={formatTwd(tile.value)}>
                {formatTwdShort(tile.value)}
              </span>
              <span className="kpi-note" data-tone={tile.tone}>
                {tile.note}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
