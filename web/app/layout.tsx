import type { Metadata } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
import { QuoteToast } from "@/components/QuoteToast";
import { currentScene } from "@/lib/scene-server";
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
    default: "DropOut OS｜琢奧科技",
    template: "%s｜DropOut OS",
  },
  description:
    "中小企業作業系統。CRM、ERP、魅力圈、清庫、短網址同一套皮。一百個產業包，每年 NT$100,000，免費顧問導入。",
  metadataBase: new URL("https://os.dropout.tw"),
  openGraph: {
    title: "DropOut OS｜一套系統解決企業 SaaS 問題",
    description: "一百個產業情境、免費顧問導入、每年十萬。",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, scene] = await Promise.all([currentTheme(), currentScene()]);

  return (
    <html lang="zh-TW" data-theme={theme} data-scene={scene} className={`${noto.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full grid-skin antialiased">
        <div className="scene-layer" aria-hidden="true" />
        <div className="liquid-stage" aria-hidden="true" />
        <div className="page-shell">{children}</div>
        <QuoteToast />
      </body>
    </html>
  );
}
