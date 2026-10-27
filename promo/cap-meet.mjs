import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import fs from "node:fs";

// Real practice-mode pages, dressed in the 米特 palette and 粉圓 font for the subsidy video.
const out = "/tmp/promo/v3";
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:3456";
const W = 1100, H = 690, DPR = 2;
const shop = JSON.stringify({ scene: "edu", size: "mid", modules: ["crm", "sales", "stock", "finance", "chat", "hr"] });
const SKIN = `
html[data-theme="white"] {
  --canvas: #fffbef; --surface: #ffffff; --surface-2: #fdf5e1; --surface-3: #f6ead0;
  --border: #ecdfc2; --border-strong: #dccca6;
  --text: #123f59; --text-2: #24526d; --muted: #5a7686;
  --accent: #1597a0; --accent-hover: #0f7f87; --accent-soft: rgba(28, 179, 187, 0.12); --accent-ring: rgba(28, 179, 187, 0.3);
  --warn: #a35f00;
  --shadow-sm: 0 1px 0 rgba(18, 63, 89, 0.06);
}
body, .display, .kicker { font-family: "jf open 粉圓 2.1", "Noto Sans CJK TC", sans-serif !important; }
.os-rail { background: #fffdf6; }
.brand-glyph { background: #123f59; color: #fffbef; }
nextjs-portal { display: none !important; }
* { transition: none !important; animation: none !important; }
`;

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie(
  { name: "dropout_theme", value: "white", url: base },
  { name: "dropout_shop", value: shop, url: base },
  { name: "dropout_industry", value: "cram-school", url: base },
);

async function prep(path, open) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: SKIN });
  await page.evaluate((open) => {
    for (const b of document.querySelectorAll("button")) if (b.textContent?.includes("知道了")) b.click();
    const company = document.querySelector(".os-top p span.truncate");
    if (company) company.textContent = "米特才藝中心";
    const initial = document.querySelector(".os-top p span[aria-hidden]");
    if (initial) initial.textContent = "米";
    for (const d of document.querySelectorAll("main details")) {
      const s = d.querySelector("summary")?.textContent ?? "";
      d.open = open.some((k) => s.includes(k));
    }
  }, open);
  await document_fonts();
}
async function document_fonts() {
  await page.evaluate(async () => {
    await document.fonts.load('16px "jf open 粉圓 2.1"');
    await document.fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 400));
}

async function capture(name, path, open, focus) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
  await prep(path, open);
  await page.screenshot({ path: `${out}/${name}-frame.png` });
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewport({ width: W, height: full, deviceScaleFactor: DPR });
  await new Promise((r) => setTimeout(r, 400));
  const rects = await page.evaluate((focus) => {
    const out = {};
    for (const [key, { sel, text, up = 0 }] of Object.entries(focus)) {
      const area = (e) => e.getBoundingClientRect().width * e.getBoundingClientRect().height;
      const el = [...document.querySelectorAll(sel)].filter((e) => e.textContent.includes(text)).sort((a, b) => area(a) - area(b))[0];
      if (!el) { out[key] = null; continue; }
      let box = el;
      for (let i = 0; i < up; i++) box = box.parentElement;
      const r = box.getBoundingClientRect();
      out[key] = { x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  }, focus);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: `${out}/${name}-tall.png` });
  console.log(name, height, JSON.stringify(rects));
  return { height, rects };
}

const meta = {};
meta.stock = await capture("stock", "/workspace/erp/stock", ["課程 BOM 與報名材料包", "耗用／損耗登記"], JSON.parse(process.env.STOCK_FOCUS ?? "{}"));
meta.hr = await capture("hr", "/workspace/hr", ["主管覆核與異常留痕", "師資技能標籤"], JSON.parse(process.env.HR_FOCUS ?? "{}"));
fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 2));
await browser.close();
