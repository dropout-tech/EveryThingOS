import { LetterComposer, SendDraftButton } from "@/components/LiveLetter";
import { ModuleFrame } from "@/components/ModuleFrame";
import { SourceFailure, SourceNote } from "@/components/SourceNote";
import { getLetter } from "@/lib/sources";
import type { LetterOverview } from "@/lib/sources/types";

export const metadata = { title: "電子報" };

const DEMO: LetterOverview = {
  groups: [
    { name: "新朋友", title: "新朋友", subscribers: 128 },
    { name: "老客人", title: "老客人", subscribers: 342 },
  ],
  consent: { granted: 470, pending: 23, withdrawn: 11 },
  newsletters: [
    { name: "demo-1", subject: "十月新品與試用", sent: true, scheduled: null, recipients: 452, views: 187 },
    { name: "demo-2", subject: "年底回饋活動", sent: false, scheduled: "2026-11-01 09:00", recipients: 0, views: 0 },
  ],
  last30Days: { letter_opened: 187, letter_clicked: 41, email_bounced: 3, unsubscribed: 2, subscribed: 19 },
};

const ACTIVITY: [keyof LetterOverview["last30Days"], string][] = [
  ["subscribed", "新訂閱"],
  ["letter_opened", "開信"],
  ["letter_clicked", "點連結"],
  ["unsubscribed", "退訂"],
  ["email_bounced", "退信"],
];

export default async function LetterPage() {
  const source = await getLetter();
  if (source.origin === "error") return <SourceFailure source={source} next="/workspace/letter" />;
  const data = source.data ?? DEMO;
  const desk = source.origin === "live" ? source.deskUrl : undefined;

  return (
    <ModuleFrame kicker="電子報" title="只寄給說好的人" hint="勾同意並點確認信的人才會進名單；退訂一次，所有行銷通道一起關。">
      <div className="grid gap-3 md:grid-cols-2">
        {data.groups.map((group) => (
          <a key={group.name} href={group.href} className="glass block p-5">
            <p className="text-sm text-cream-dim">{group.title}</p>
            <p className="display mt-2 text-3xl">{group.subscribers}</p>
          </a>
        ))}
      </div>

      <div className="glass-well grid grid-cols-3 gap-3 p-4 text-center text-sm">
        <div>
          <p className="display text-2xl">{data.consent.granted}</p>
          <p className="text-cream-dim">已同意</p>
        </div>
        <div>
          <p className="display text-2xl">{data.consent.pending}</p>
          <p className="text-cream-dim">等確認信</p>
        </div>
        <div>
          <p className="display text-2xl">{data.consent.withdrawn}</p>
          <p className="text-cream-dim">已退訂</p>
        </div>
      </div>

      {desk ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">寫一封</h2>
          <LetterComposer groups={data.groups} />
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">最近的信</h2>
          {desk ? (
            <a href={`${desk}/app/newsletter/new`} className="text-sm text-cream-dim hover:text-cream" target="_blank" rel="noreferrer">
              用 ERPNext 排版
            </a>
          ) : null}
        </div>
        <ul className="space-y-2">
          {data.newsletters.length ? (
            data.newsletters.map((letter) => (
              <li key={letter.name} className="glass-chip flex flex-wrap items-baseline justify-between gap-2 p-3">
                <a href={letter.href} target={desk ? "_blank" : undefined} rel="noreferrer">
                  {letter.subject}
                </a>
                <span className="flex items-baseline gap-3 text-xs text-cream-dim">
                  {letter.sent ? `寄給 ${letter.recipients} 人 · ${letter.views} 人開信` : letter.scheduled ? `排定 ${letter.scheduled}` : "草稿"}
                  {desk && !letter.sent && !letter.scheduled ? <SendDraftButton name={letter.name} subject={letter.subject} /> : null}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-cream-dim">還沒寄過電子報。</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-medium">近 30 天</h2>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {ACTIVITY.map(([key, label]) => (
            <div key={key} className="flex gap-2">
              <dt className="text-cream-dim">{label}</dt>
              <dd>{data.last30Days[key] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SourceNote source={source} demoText="示範資料。接上 ERPNext 後換成你們的名單與寄信紀錄。" />
    </ModuleFrame>
  );
}
