export const metadata = { title: "沒有網路", robots: { index: false } };

/** Cached by public/sw.js and shown when a page cannot load. Inline styles because the stylesheet may not be cached. */
export default function OfflinePage() {
  return (
    <main
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.75rem", maxWidth: "28rem", margin: "0 auto", padding: "1.5rem", background: "#07080c", color: "#f7f8fc", fontFamily: "system-ui, sans-serif" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={48} height={48} />
      <h1 style={{ fontSize: "1.25rem", fontWeight: 500 }}>現在沒有網路</h1>
      <p style={{ color: "rgba(247, 248, 252, 0.72)", lineHeight: 1.6 }}>連上網路後再打開一次。這台手機不會存客人或帳的資料；沒送出的單也不會自己送，連上後請再確認一次。</p>
      <a href="/workspace" style={{ alignSelf: "flex-start", marginTop: "0.5rem", padding: "0.6rem 1.25rem", borderRadius: "9999px", background: "#f7f8fc", color: "#07080c", textDecoration: "none" }}>
        再試一次
      </a>
    </main>
  );
}
