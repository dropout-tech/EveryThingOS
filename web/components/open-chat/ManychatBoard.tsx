import { CHANNELS } from "@/lib/open-chat/channels";

export function ManychatBoard() {
  return (
    <section className="glass p-4" aria-label="這套取代哪些對話軟體">
      <h2 className="text-lg font-medium">一個收件匣，不必再開這些</h2>
      <ul className="mt-3 space-y-2">
        {CHANNELS.map((channel) => (
          <li key={channel.id} className="glass-chip p-3 text-sm">
            <p className="font-medium">{channel.label}</p>
            <p className="mt-1 text-cream-dim">代替{channel.replaces}</p>
            <p className="mt-1 text-xs text-cream-dim">{channel.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-cream-dim">
        ManyChat 那件工作只留留言關鍵字轉私訊。流程畫布、自動廣播、點數不做。
      </p>
    </section>
  );
}
