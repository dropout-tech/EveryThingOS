import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/workspace",
    name: "DropOut OS",
    short_name: "DropOut",
    description: "打開就做下一件事：客人、生意、收錢、報表在同一個地方。",
    lang: "zh-TW",
    dir: "ltr",
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#07080c",
    theme_color: "#07080c",
    categories: ["business", "productivity"],
    icons: [
      { src: "/brand/dropout-app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "今天", url: "/workspace" },
      { name: "報表", url: "/workspace/reports" },
    ],
  };
}
