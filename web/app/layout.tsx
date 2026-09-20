import type { Metadata } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
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
    images: ["/brand/og-brand-260713.png"],
  },
  icons: { icon: "/brand/favicon.ico" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-TW" className={`${noto.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full grid-skin antialiased">{children}</body>
    </html>
  );
}
