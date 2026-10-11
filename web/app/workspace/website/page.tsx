import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { formatTwd } from "@/lib/erp";
import { getWebsite } from "@/lib/sources";
import { liveConfig } from "@/lib/sources/config";
import { currentIndustry } from "@/lib/workspace";

export const metadata = { title: "官網" };

export default async function WebsitePage() {
  const pack = await currentIndustry();
  const source = await getWebsite();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/website" />;
  const glue = (await liveConfig()).glue;
  const formAction = glue ? `${glue.url}/forms/${encodeURIComponent(glue.site)}` : null;

  if (source.origin === "demo" || !source.data) {
    return (
      <ModuleFrame kicker="官網" title={`${pack.nameZh} 官方網站`} hint="商品目錄與結帳用 ERPNext Webshop；留資料的表單送到系統同步，先確認信箱再進客人。">
        <div className="glass glass-hero max-w-xl p-8">
          <p className="display text-xs tracking-[0.2em] text-cream-dim uppercase">官方網站</p>
          <h3 className="mt-3 text-3xl">{pack.nameZh}</h3>
          <p className="mt-3 max-w-lg text-cream-dim">{pack.tagline}</p>
          <button type="button" className="glass-cta mt-6 rounded-full px-5 py-2">
            留下資料（練習）
          </button>
          <p className="mt-4 text-xs text-cream-dim">接上 ERPNext 後，這裡會顯示上架的商品、網路訂單與表單名單。</p>
        </div>
        <SourceNote source={source} />
      </ModuleFrame>
    );
  }

  const site = source.data;
  const embed = formAction
    ? `<form method="post" action="${formAction}">
  <input name="name" placeholder="怎麼稱呼">
  <input name="email" type="email" required placeholder="Email">
  <input name="phone" placeholder="手機">
  <textarea name="message" placeholder="想問什麼"></textarea>
  <label><input type="checkbox" name="consent" value="1"> 我願意收到電子報（會先寄確認信）</label>
  <input name="website" tabindex="-1" autocomplete="off" style="display:none">
  <input type="hidden" name="wording_version" value="v1">
  <button type="submit">送出</button>
</form>`
    : null;

  return (
    <ModuleFrame kicker="官網" title="客人看得到的這一面" hint="商品在 ERPNext 上架就出現在官網；網路訂單直接變成生意裡的一張單。">
      <div className="grid gap-3 md:grid-cols-3">
        <a href={site.shopUrl} target="_blank" rel="noreferrer" className="glass block p-5">
          <p className="text-sm text-cream-dim">上架商品</p>
          <p className="display mt-2 text-3xl">{site.published}</p>
          <p className="mt-1 text-xs text-teal">打開官網商品頁</p>
        </a>
        <div className="glass p-5">
          <p className="text-sm text-cream-dim">近 30 天網路訂單</p>
          <p className="display mt-2 text-3xl">{site.orders.length}</p>
          <p className="mt-1 text-xs text-cream-dim">{formatTwd(site.orders.reduce((n, o) => n + o.amount, 0))}</p>
        </div>
        <div className="glass p-5">
          <p className="text-sm text-cream-dim">近 30 天表單名單</p>
          <p className="display mt-2 text-3xl">{site.formLeads}</p>
          <p className="mt-1 text-xs text-cream-dim">已進「客人」</p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm">網路訂單</h3>
        {site.orders.length ? (
          <ul className="space-y-2">
            {site.orders.map((o) => (
              <li key={o.no}>
                <a href={o.href} target="_blank" rel="noreferrer" className="glass-chip flex flex-wrap justify-between gap-2 p-3 text-sm">
                  <span>
                    {o.no} · {o.party}
                  </span>
                  <span className="text-cream-dim">
                    {o.date} · {formatTwd(o.amount)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">近 30 天沒有網路訂單。</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm">上架中</h3>
        {site.items.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {site.items.map((i) => (
              <li key={i.code} className="glass-chip flex justify-between gap-2 p-3 text-sm">
                <span>{i.name}</span>
                <span className="flex gap-3 text-xs">
                  {i.route ? (
                    <a href={i.route} target="_blank" rel="noreferrer" className="text-teal">
                      看頁面
                    </a>
                  ) : null}
                  <a href={i.href} target="_blank" rel="noreferrer" className="text-cream-dim">
                    編輯
                  </a>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cream-dim">還沒有上架的商品。導入工具的 provision 會把商品上架，也可以在 ERPNext 的 Website Item 勾「發布」。</p>
        )}
      </section>

      {embed ? (
        <section className="space-y-2">
          <h3 className="text-sm">放在任何網站上的留資料表單</h3>
          <p className="text-xs text-cream-dim">貼進現有官網（WordPress、Wix、自己寫的都可以）。送出後進客人；勾同意的人會收到確認信，點了才進電子報名單。</p>
          <pre className="glass-well overflow-x-auto p-4 text-xs">{embed}</pre>
        </section>
      ) : null}

      <SourceNote source={source} />
    </ModuleFrame>
  );
}
