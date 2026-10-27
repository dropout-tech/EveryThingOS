import fs from "node:fs";
import puppeteer from "/tmp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

// node render2.mjs <name> all <seconds>   → /tmp/promo/<name>/frames
// node render2.mjs <name> 1 5.5 12        → /tmp/promo/<name>/test
const [name, mode, ...rest] = process.argv.slice(2);
const all = mode === "all";
const times = all ? Array.from({ length: Math.round(Number(rest[0]) * 30) }, (_, i) => i / 30) : [mode, ...rest].map(Number);
const dir = `/tmp/promo/${name}/${all ? "frames" : "test"}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const b = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await p.setViewport({ width: 1920, height: 1080 });
await p.setCacheEnabled(false);
await p.goto(`http://127.0.0.1:8765/promo/${name}/anim.html`, { waitUntil: "networkidle0" });
await p.evaluate(() => window.ready);
let i = 0;
for (const t of times) {
  await p.evaluate((t) => window.renderAt(t), t);
  await p.screenshot({ path: `${dir}/f${String(i++).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  if (i % 150 === 0) console.log(i);
}
await b.close();
console.log("done", i);
