import type { Metadata } from "next";
import { Noto_Sans_TC, Outfit } from "next/font/google";
import { GlassPointer } from "@/components/GlassPointer";
import { OceanColumn } from "@/components/OceanColumn";
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
  description: "打開就做下一件事。每年 NT$100,000，顧問到現場。",
  metadataBase: new URL("https://os.dropout.tw"),
  openGraph: {
    title: "DropOut OS｜打開就知道下一步",
    description: "打開就做下一件事。每年十萬，顧問到現場。",
    images: [{ url: "/brand/og-dropout-os.png", width: 1200, height: 630, alt: "DropOut OS" }],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, scene] = await Promise.all([currentTheme(), currentScene()]);

  return (
    <html lang="zh-TW" data-theme={theme} data-scene={scene} className={`${noto.variable} ${outfit.variable} h-full`}>
      <body className="min-h-full antialiased">
        <div className="scene-layer" aria-hidden="true" />
        <GlassPointer />
        <OceanColumn />
        <div className="page-shell">{children}</div>
      </body>
    </html>
  );
}
