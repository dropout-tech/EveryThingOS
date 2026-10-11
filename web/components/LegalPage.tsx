import Link from "next/link";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { LEGAL_LINKS, LEGAL_VERSION, type LegalDoc } from "@/lib/legal";

/** Placeholders the business owner still has to fill in stay visibly marked. */
function Text({ value }: { value: string }) {
  return value.split(/(【待填：[^】]+】)/).map((part, i) =>
    part.startsWith("【待填") ? (
      <span key={i} className="text-orange">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="display text-xs tracking-[0.22em] text-teal uppercase">{doc.kicker}</p>
        <h1 className="scene-type mt-3 text-4xl font-medium">{doc.title}</h1>
        <p className="mt-4 text-cream-dim">{doc.summary}</p>
        <aside className="glass mt-8 space-y-1 p-5 text-sm" role="note">
          <p className="text-orange">草稿，簽約前請由律師審閱。</p>
          <p className="text-cream-dim">
            版本日期 {LEGAL_VERSION}。標示「待填」的地方要換成實際資料。
          </p>
        </aside>
        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-xl">{section.heading}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="text-cream-dim">
                  <Text value={p} />
                </p>
              ))}
              {section.table ? (
                <div className="glass overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="bg-ink-2 text-cream-dim">
                      <tr>
                        {section.table.head.map((h) => (
                          <th key={h} className="px-4 py-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row.join("|")} className="border-t border-[var(--line)] align-top">
                          {row.map((cell, i) => (
                            <td key={i} className={i === 0 ? "px-4 py-3" : "px-4 py-3 text-cream-dim"}>
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
        </div>
        <nav className="mt-14 flex flex-wrap gap-4 text-sm text-cream-dim">
          {LEGAL_LINKS.filter((l) => l.href !== `/${doc.slug}`).map((l) => (
            <Link key={l.href} href={l.href} className="text-teal hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
