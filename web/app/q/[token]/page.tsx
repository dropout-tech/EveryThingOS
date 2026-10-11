import type { Metadata } from "next";
import { headers } from "next/headers";
import { PortalDocument, PortalFrame } from "@/components/portal/PortalDocument";
import { KIND_LABEL, KIND_OF, type PortalDoc } from "@/lib/portal";
import { demoDoc, isPreviewBot, openLink, portalMode, PortalError, requestIp, verifyToken } from "@/lib/portal-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "客戶入口" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
  openGraph: null,
  twitter: null,
};

function Notice({ title, detail, company, demo = false }: { title: string; detail: string; company?: PortalDoc["company"] | null; demo?: boolean }) {
  return (
    <PortalFrame company={company} demo={demo}>
      <section className="glass glass-hero space-y-2 p-6 md:p-8" role="status">
        <h1 className="page-title">{title}</h1>
        <p className="text-sm text-cream-dim">{detail}</p>
      </section>
    </PortalFrame>
  );
}

export default async function PortalPage({ params }: PageProps<"/q/[token]">) {
  const { token } = await params;
  const mode = await portalMode();
  const company = mode.mode === "live" && mode.config.tenant?.company ? { name: mode.config.tenant.company } : null;
  if (mode.mode === "unconfigured") return <Notice title="這個頁面暫時打不開" detail="請直接聯絡傳連結給你的業務。" />;

  const check = await verifyToken(token, { live: mode.mode === "live", site: mode.mode === "live" ? mode.site : undefined });
  if (check.mode === "invalid") return <Notice title="這個連結打不開" detail="網址可能不完整（LINE 有時會把長網址截斷），或已經不能用了。請跟傳給你的業務再要一次。" company={company} />;
  if (check.mode === "expired") return <Notice title={`這張${KIND_LABEL[KIND_OF[check.doctype]]}的連結已經過期`} detail="為了保護你的資料，分享連結有使用期限。請跟業務要一個新的連結。" company={company} />;

  // Link previews get a plain card: no document, no view counted.
  if (isPreviewBot((await headers()).get("user-agent"))) {
    return <Notice title={`${company?.name ?? "廠商"}傳給你的${KIND_LABEL[KIND_OF[check.doctype]]}`} detail="請點開連結查看內容。" company={company} demo={check.mode === "demo"} />;
  }

  if (check.mode === "demo") {
    return <PortalDocument doc={demoDoc(check)} token={token} demo linkId={check.linkId} pdfHref={null} />;
  }
  if (mode.mode !== "live") return <Notice title="這個連結打不開" detail="請跟傳給你的業務再要一次。" />;

  let opened: Awaited<ReturnType<typeof openLink>> | null = null;
  let failure: unknown = null;
  try {
    opened = await openLink(mode.config, check.linkId, await requestIp());
  } catch (error) {
    failure = error;
  }
  if (opened) return <PortalDocument doc={opened.doc} token={token} demo={false} linkId={check.linkId} pdfHref={`/q/${token}/pdf`} />;
  if (failure instanceof PortalError && failure.status === 410) {
    return failure.state === "revoked" ? (
      <Notice title="這個連結已經收回" detail="業務已經收回這個連結，內容可能有更新。請跟業務要新的連結。" company={company} />
    ) : (
      <Notice title="這個連結已經過期" detail="為了保護你的資料，分享連結有使用期限。請跟業務要一個新的連結。" company={company} />
    );
  }
  if (failure instanceof PortalError && failure.status === 422) return <Notice title="這份文件已經不能看了" detail="可能已經取消或改過。請跟業務確認，請他重新傳一次。" company={company} />;
  if (failure instanceof PortalError && failure.status === 404) return <Notice title="找不到這份文件" detail="這張單可能已經被刪除或取消。請跟業務確認。" company={company} />;
  return <Notice title="現在打不開，請稍後再試" detail="廠商的系統暫時沒有回應，資料都還在。過幾分鐘再開一次，或直接聯絡業務。" company={company} />;
}
