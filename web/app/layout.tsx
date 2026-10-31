import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { COMMERCIAL } from "@/lib/commercial";
import { currentTheme } from "@/lib/theme-server";
import "./globals.css";

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
    default: "EveryThingOS｜琢奧科技",
    template: "%s｜EveryThingOS",
  },
  description: "給台灣中小企業的作業系統：CRM、進銷存、財務、人事薪資、報表、對話、電子報一個登入。不用 AI 免費。AI 版一年含稅 NT$69,000。現在用量不限，以後會限量並先說。",
  metadataBase: new URL(COMMERCIAL.siteUrl),
  applicationName: COMMERCIAL.product,
  openGraph: {
    title: "EveryThingOS｜客人、進銷存、帳、薪資，一個登入做完",
    description: "給台灣中小企業的作業系統。不用 AI 免費。AI 版一年含稅 NT$69,000。現在用量不限，以後會限量並先說。",
    siteName: COMMERCIAL.product,
    locale: "zh_TW",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await currentTheme();

  return (
    <html lang="zh-TW" data-theme={theme} className={`${noto.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full antialiased">
        <div className="page-shell">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
