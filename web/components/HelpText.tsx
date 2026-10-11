import Link from "next/link";
import type { HelpBlock } from "@/lib/help";

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function HelpInline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, href] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (href.startsWith("/") && !href.startsWith("//")) {
      parts.push(
        <Link key={at} href={href} className="text-teal underline underline-offset-4">
          {label}
        </Link>,
      );
    } else if (href.startsWith("https://")) {
      parts.push(
        <a key={at} href={href} target="_blank" rel="noreferrer" className="text-teal underline underline-offset-4">
          {label}
        </a>,
      );
    } else {
      parts.push(label);
    }
    last = at + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-4 leading-relaxed">
      {blocks.map((block, i) => {
        if ("h" in block) {
          return (
            <h2 key={i} id={block.id} className="scroll-mt-24 pt-4 text-xl font-medium text-cream">
              {block.h}
            </h2>
          );
        }
        if ("p" in block) {
          return (
            <p key={i} className="text-cream-dim">
              <HelpInline text={block.p} />
            </p>
          );
        }
        if ("list" in block) {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`space-y-1.5 pl-5 text-cream-dim ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.list.map((item) => (
                <li key={item}>
                  <HelpInline text={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if ("table" in block) {
          return (
            <div key={i} className="glass-well overflow-x-auto rounded-2xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {block.table.head.map((cell) => (
                      <th key={cell} scope="col" className="px-4 py-2.5 font-medium text-teal">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.table.rows.map((row) => (
                    <tr key={row.join("|")} className="border-t border-white/10">
                      {row.map((cell, c) => (
                        <td key={c} className="px-4 py-2.5 align-top text-cream-dim">
                          <HelpInline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <pre key={i} className="glass-well overflow-x-auto rounded-2xl px-4 py-3 text-sm text-cream">
            <code>{block.code}</code>
          </pre>
        );
      })}
    </div>
  );
}
