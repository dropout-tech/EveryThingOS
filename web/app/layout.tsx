import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
import { GlassPointer } from "@/components/GlassPointer";
import { OceanColumn } from "@/components/OceanColumn";
import { ServiceWorker } from "@/components/ServiceWorker";
import { COMMERCIAL } from "@/lib/commercial";
import { currentScene } from "@/lib/scene-server";
import { currentStyle } from "@/lib/style-server";
import { currentTheme } from "@/lib/theme-server";
import "./globals.css";
import "./styles/minimal.css";
import "./styles/fluid.css";
import "./styles/social.css";

const noto = Noto_Sans_TC({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "DropOut OS｜琢奧科技",
    template: "%s｜DropOut OS",
  },
  description: "給台灣中小企業的作業系統：CRM、進銷存、財務、人事薪資、報表、對話、電子報一個登入。每年 NT$100,000 未稅，不限帳號，含顧問到現場導入。",
  metadataBase: new URL(COMMERCIAL.siteUrl),
  applicationName: COMMERCIAL.product,
  openGraph: {
    title: "DropOut OS｜客人、進銷存、帳、薪資，一個登入做完",
    description: "給台灣中小企業的作業系統。每年 NT$100,000 未稅，不限帳號，含顧問到現場導入。",
    siteName: COMMERCIAL.product,
    locale: "zh_TW",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#07080c" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, scene, style] = await Promise.all([currentTheme(), currentScene(), currentStyle()]);

  return (
    <html lang="zh-TW" data-theme={theme} data-scene={scene} data-style={style} className={`${noto.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full antialiased">
        <div className="scene-layer" aria-hidden="true" />
        {style === "fluid" ? (
          <>
            <GlassPointer />
            <OceanColumn />
          </>
        ) : null}
        <div className="page-shell">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
