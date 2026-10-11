import Link from "next/link";
import { PrintButton } from "./PrintButton";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { LEGAL_LINKS, LEGAL_VERSION, type LegalDoc } from "@/lib/legal";

/** Placeholders the business owner still has to fill in stay visibly marked. */
function Text({ value }: { value: string }) {
  return value.split(/(【待填：[^】]+】)/).map((part, i) =>
    part.startsWith("【待填") ? (
      <mark key={i} className="site-todo text-cream">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const anchor = (i: number) => `s${i + 1}`;

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const todos = JSON.stringify(doc.sections).match(/【待填/g)?.length ?? 0;

  return (
    <>
      <SiteHeader />
      <main id="main" className="site-scope site-print mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <header className="site-sheet p-6 sm:p-10">
          <p className="display text-xs tracking-[0.22em] text-cream-dim uppercase">{doc.kicker}</p>
          <h1 className="mt-3 text-3xl font-medium sm:text-4xl">{doc.title}</h1>
          <p className="mt-4 max-w-3xl text-cream-dim">{doc.summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <span className="site-chip" data-tone="warn">
              草稿，簽約前由律師審閱
            </span>
            <span className="text-cream-dim">版本日期 {LEGAL_VERSION}</span>
            {todos ? <span className="text-cream-dim">還有 {todos} 處標示「待填」</span> : null}
            <span className="ml-auto">
              <PrintButton />
            </span>
          </div>
        </header>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="目錄" className="site-noprint lg:sticky lg:top-24 lg:self-start">
            <details className="site-sheet p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium">目錄（{doc.sections.length} 節）</summary>
              <ol className="mt-3 space-y-2 text-sm text-cream-dim">
                {doc.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${anchor(i)}`} className="hover:text-cream">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
            <div className="site-sheet hidden max-h-[calc(100vh-8rem)] overflow-y-auto p-5 lg:block">
              <p className="text-xs tracking-[0.18em] text-cream-dim">目錄</p>
              <ol className="mt-3 space-y-2 text-sm text-cream-dim">
                {doc.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#${anchor(i)}`} className="block hover:text-cream">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
          <article className="site-sheet space-y-10 p-6 leading-relaxed sm:p-10">
            {doc.sections.map((section, i) => (
              <section key={section.heading} id={anchor(i)} aria-labelledby={`${anchor(i)}-h`} className="scroll-mt-24 space-y-3">
                <h2 id={`${anchor(i)}-h`} className="group flex items-baseline gap-2 text-xl font-medium">
                  {section.heading}
                  <a href={`#${anchor(i)}`} className="site-noprint text-sm text-cream-dim opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`連到「${section.heading}」`}>
                    #
                  </a>
                </h2>
                {section.paragraphs?.map((p) => (
                  <p key={p} className="text-cream-dim">
                    <Text value={p} />
                  </p>
                ))}
                {section.table ? (
                  <div className="overflow-x-auto rounded-2xl border border-[var(--line)]">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="text-cream-dim">
                        <tr>
                          {section.table.head.map((h) => (
                            <th key={h} scope="col" className="px-4 py-3 font-normal">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row) => (
                          <tr key={row.join("|")} className="border-t border-[var(--line)] align-top">
                            {row.map((cell, j) => (
                              <td key={j} className={j === 0 ? "px-4 py-3" : "px-4 py-3 text-cream-dim"}>
                                <Text value={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {section.items ? (
                  <ul className="list-disc space-y-2 pl-5 text-cream-dim">
                    {section.items.map((item) => (
                      <li key={item}>
                        <Text value={item} />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
            <p className="site-noprint border-t border-[var(--line)] pt-6 text-sm">
              <a href="#main" className="text-cream-dim hover:text-cream">
                回到頂端 ↑
              </a>
            </p>
          </article>
        </div>
        <nav aria-label="其他文件" className="site-noprint mt-8 flex flex-wrap gap-3 text-sm">
          {LEGAL_LINKS.filter((l) => l.href !== `/${doc.slug}`).map((l) => (
            <Link key={l.href} href={l.href} className="glass-pill px-4 py-2">
              {l.label}
            </Link>
          ))}
          <Link href="/status" className="glass-pill px-4 py-2">
            系統狀態
          </Link>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
