import { buildPains, HIT } from "./pains.js";

const W = 1920, H = 1080;
const NAVY = "#0f2340", TEAL = "#1f8f88", TEAL2 = "#3ca59e", ORANGE = "#e08a3c", TSOFT = "#e6f4f2", OSOFT = "#fbe7d4";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeIn = (x) => x ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const back = (x) => { const c = 1.8; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const lerp = (a, b, x) => a + (b - a) * x;
const $ = (id) => document.getElementById(id);
let seed = 5;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- Postmodern layer: the two 琢奧 rings cut into pieces, plus Memphis-style stickers ----------
// While the pains play the pieces are scattered like the store's tools; at the reveal they snap back into whole rings.
const deco = $("deco"), conf = $("confetti");
const piece = (parent, w, h, inner, ox = w / 2, oy = h / 2) => {
  const el = document.createElement("div");
  el.className = "piece";
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.transformOrigin = `${ox}px ${oy}px`;
  el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">${inner}</svg>`;
  parent.appendChild(el);
  return { el, ox, oy };
};
const place = (p, x, y, r, s, o = 1) => {
  p.el.style.transform = `translate(${x - p.ox}px, ${y - p.oy}px) rotate(${r}deg) scale(${Math.max(s, 0)})`;
  p.el.style.opacity = o;
};
const stripes = (id, a, b, w = 14) =>
  `<defs><pattern id="${id}" width="${w * 2}" height="${w * 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${w * 2}" height="${w * 2}" fill="${a}"/><rect width="${w}" height="${w * 2}" fill="${b}"/></pattern></defs>`;

// One ring = N annular sectors drawn in the ring's own box, each anchored at its centroid.
function ring(R, r, n, fill, defs = "", phase = 0) {
  const c = R + 4, pts = (rad, a) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
  return Array.from({ length: n }, (_, k) => {
    const a0 = phase + (k / n) * Math.PI * 2, a1 = phase + ((k + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const big = a1 - a0 > Math.PI ? 1 : 0, rm = (R + r) / 2;
    const d = `M${pts(R, a0)} A${R} ${R} 0 ${big} 1 ${pts(R, a1)} L${pts(r, a1)} A${r} ${r} 0 ${big} 0 ${pts(r, a0)} Z`;
    const ox = c + rm * Math.cos(am), oy = c + rm * Math.sin(am);
    const p = piece(deco, 2 * c, 2 * c, `${k === 0 ? defs : ""}<path d="${d}" fill="${fill}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>`, ox, oy);
    p.cx = ox - c; p.cy = oy - c;
    return p;
  });
}
const orangeRing = ring(260, 180, 4, ORANGE, "", -Math.PI / 4);
const tealRing = ring(120, 72, 2, "url(#tstripe)", stripes("tstripe", TEAL2, "#ffffff", 9), Math.PI / 6);

const wave = (w, h, periods) => {
  let d = "";
  for (let i = 0; i <= 60; i++) { const u = i / 60; d += `${i ? "L" : "M"}${(u * w).toFixed(1)},${(h / 2 + Math.sin(u * Math.PI * 2 * periods) * (h / 2 - 8)).toFixed(1)}`; }
  return d;
};
const STICKERS = {
  squiggle: piece(deco, 260, 60, `<path d="${wave(260, 60, 2.5)}" fill="none" stroke="${TEAL}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>`),
  zigzag: piece(deco, 200, 50, `<polyline points="6,44 38,6 70,44 102,6 134,44 166,6 194,44" fill="none" stroke="${ORANGE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`),
  dots: piece(deco, 110, 88, Array.from({ length: 20 }, (_, i) => `<circle cx="${11 + (i % 5) * 22}" cy="${11 + Math.floor(i / 5) * 22}" r="5" fill="${NAVY}"/>`).join("")),
  triangle: piece(deco, 100, 90, `<polygon points="50,6 94,84 6,84" fill="${TEAL}" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>`),
  semi: piece(deco, 200, 104, `${stripes("ostripe", OSOFT, "#ffffff", 8)}<path d="M4,100 A96 96 0 0 1 196,100 Z" fill="url(#ostripe)" stroke="${NAVY}" stroke-width="4" stroke-linejoin="round"/>`),
};
// [x, y, rotation, scale] for: scattered (pains), reveal card, answers, end card
const POSE = {
  squiggle: [[1790, 600, 80, 1], [720, 860, 0, 1], [227, 640, 0, 0.9], [960, 935, 0, 1]],
  zigzag: [[170, 770, 18, 1], [1250, 850, -6, 1], [1690, 150, 0, 0.9], [1480, 250, 10, 1]],
  dots: [[1830, 780, 0, 1], [1380, 250, 0, 1], [690, 905, 0, 1], [1650, 360, 0, 1]],
  triangle: [[930, 130, 12, 1], [470, 330, -15, 1], [790, 175, 20, 0.8], [1560, 520, 15, 1]],
  semi: [[640, 1000, 0, 1], [760, 255, 0, 1], [58, 560, 90, 0.8], [330, 830, 0, 1]],
};
const RING_POSE = {
  orange: { pieces: [[1780, 380, 25], [180, 500, -40], [120, 990, 60], [1830, 980, -20]], settled: [[1560, 470, 1], [1800, 935, 0.9], [1600, 800, 1]] },
  teal: { pieces: [[1700, 300, 30], [330, 260, -25]], settled: [[360, 740, 1.2], [230, 130, 0.7], [330, 290, 1.1]] },
};
const sweep = piece(deco, W, H, `<path d="M-60,760 C320,520 520,980 900,700 S1500,300 1980,420" pathLength="1" fill="none" stroke="${TEAL2}" stroke-width="22" stroke-linecap="round" stroke-dasharray="1 1"/>`, 0, 0);
const sweepPath = sweep.el.querySelector("path");

// hook and reveal title, pain line, answer copy, pain counter
const TEXT_ZONES = [[280, 300, 1640, 760], [360, 720, 1560, 950], [90, 230, 800, 840], [60, 30, 440, 140]];
const CONF_C = [NAVY, TEAL, ORANGE, TEAL2];
const confetti = Array.from({ length: 42 }, (_, i) => {
  const c = CONF_C[i % 4], k = i % 4;
  const inner = k === 0 ? `<rect x="2" y="10" width="40" height="9" rx="4.5" fill="${c}"/>`
    : k === 1 ? `<circle cx="22" cy="15" r="8" fill="none" stroke="${c}" stroke-width="4"/>`
    : k === 2 ? `<polygon points="22,4 38,27 6,27" fill="${c}"/>`
    : `<path d="M4,15 Q13,3 22,15 T40,15" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
  const p = piece(conf, 44, 30, inner);
  let x, y;
  do { x = 60 + rnd() * 1800; y = 40 + rnd() * 1000; } while (TEXT_ZONES.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1));
  Object.assign(p, { x, y, r: rnd() * 360, sp: 0.4 + rnd(), ph: rnd() * 6, tp: 0.3 + rnd() * 2.4 });
  return p;
});

// ---------- DOM ----------
const WINS = [
  ["LINE 官方帳號", "未讀 23", 80, 70],
  ["IG 私訊", "未讀 8", 470, 120],
  ["FB 粉專", "未回 5", 1120, 70],
  ["庫存.xlsx", "最後更新：上週", 1510, 130],
  ["材料清單.xlsx", "誰改的？", 60, 560],
  ["老師通訊錄", "專長寫在哪？", 1530, 560],
  ["排班表_v4_最終", "又改了", 330, 820],
  ["預約表單", "重複劃位 2 筆", 1270, 830],
];
const wins = WINS.map(([title, sub, x, y], i) => {
  const el = document.createElement("div");
  el.className = `win w${i % 4}`;
  el.innerHTML = `<div class="tb"><i></i><i></i><i></i></div><div class="bd">${title}<small>${sub}</small></div>`;
  $("wins").appendChild(el);
  return { el, x, y, r: [-4, 3, -2, 5, 3, -4, 2, -3][i] };
});

const PAINS = [
  { who: "每一家店", t: "LINE、IG、FB 各回各的，<b class='o'>漏回一則就少一個客人</b>", hl: [0, 1, 2] },
  { who: "零售／門市", t: "庫存記在 Excel，<b class='o'>賣完才知道沒貨</b>", hl: [3] },
  { who: "才藝／手作教室", t: "課都開了，<b class='o'>才發現材料包不夠</b>", hl: [4, 3] },
  { who: "補習班／教室", t: "哪位老師會教、排了幾小時，<b class='o'>全靠記憶</b>", hl: [5] },
  { who: "店長", t: "排班表改一次，<b class='o'>群組就炸一次</b>", hl: [6, 5] },
  { who: "老闆", t: "預約、庫存、老師兜不起來，<b class='o'>重複劃位</b>", hl: [7, 3, 5] },
];
const P0 = 3.2, PD = 3, R = P0 + 6 * PD;
const painScenes = buildPains($("stage"));

const ANS = [
  { x: "LINE、IG、FB 各回各的", t: "LINE、IG、FB、官網<br><b class='t'>同一個收件匣</b>", s: "誰等最久排最前面，回覆記在客人的時間軸。<br>需連結店家自己的 LINE 官方帳號與粉專。", A: "chat", url: "/workspace/chat" },
  { x: "庫存記在 Excel，賣完才知道", t: "低於安全量<br><b class='t'>自動標「不夠」</b>", s: "點「請購」直接進貨，不用再記兩張單。", A: "stock", url: "/workspace/erp/stock" },
  { x: "課開了才發現材料不夠", t: "課程 BOM<br><b class='t'>報名就鎖材料包</b>", s: "每堂課用哪些材料、還能收幾位、<br>卡在哪一項，一眼看到。", A: "bom", url: "/workspace/erp/stock" },
  { x: "老師資料全靠記憶", t: "專長、適教年齡、工時<br><b class='t'>一頁看完</b>", s: "每位老師的專長與適教年齡都在師資主檔；<br>接近工時上限會先提醒。", A: "teachers", url: "/workspace/hr" },
  { x: "排班表改一次炸一次", t: "AI 排班建議<br><b class='t'>主管一鍵確認</b>", s: "自動避開請假與超時的老師；<br>換人也會留下紀錄。", A: "schedule", url: "/workspace/hr" },
  { x: "預約跟庫存兜不起來", t: "LINE、IG 都能預約<br><b class='t'>有料才收單</b>", s: "材料夠就開單鎖料；不夠自動候補，<br>並標出缺哪一項。", A: "book", B: "booked", url: "/book?from=line" },
];
const A0 = R + 2.4, AD = 3.5, E = A0 + 6 * AD, DUR = E + 4.4;
const VW = 1000;
let meta, S0, VH;
const dots = [...document.querySelectorAll("#dots span")];

// Each capture is a full 1280×760 window; the camera starts on the whole window and pushes in on the recorded card.
function focusOf(r) {
  const z = clamp(Math.min(VW / ((r.w + 48) * S0), VH / ((r.h + 48) * S0)), 1, 1.75);
  const cx = (r.x + r.w / 2) * S0, cy = (r.y + r.h / 2) * S0;
  return { z, tx: clamp(VW / 2 - cx * z, VW - VW * z, 0), ty: clamp(VH / 2 - cy * z, VH - VH * z, 0) };
}
function camera2d(name, k) {
  const f = focusOf(meta[name]);
  const z = lerp(1, f.z, k), tx = lerp(0, f.tx, k), ty = lerp(0, f.ty, k);
  $("imgA").style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
  const r = meta[name], ring = $("ringA");
  ring.style.left = `${tx + (r.x - 6) * S0 * z}px`;
  ring.style.top = `${ty + (r.y - 6) * S0 * z}px`;
  ring.style.width = `${(r.w + 12) * S0 * z}px`;
  ring.style.height = `${(r.h + 12) * S0 * z}px`;
}

window.ready = (async () => {
  await document.fonts.load('700 60px "Noto Sans CJK TC"');
  await document.fonts.load('900 60px "Noto Sans CJK TC"');
  meta = await (await fetch("/promo/v4/meta.json")).json();
  S0 = VW / meta.W;
  VH = Math.round(meta.H * S0);
  $("shotA").querySelector(".view").style.height = `${VH}px`;
  $("imgA").style.width = `${VW}px`;
  $("shotA").style.top = `${540 - (VH + 40) / 2}px`;
  $("plate").style.top = `${540 - (VH + 40) / 2 + 46}px`;
  $("plate").style.height = `${VH + 40}px`;
  const files = new Set(ANS.flatMap((a) => [a.A, a.B]).filter(Boolean));
  await Promise.all([...files].map((f) => new Promise((r) => { const i = new Image(); i.onload = r; i.src = `/promo/v4/${f}.png`; })));
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r)))));
  await document.fonts.ready;
  return true;
})();

let lastAns = -1;
window.renderAt = (t) => {
  const tension = Math.max(span(t, 3, 3.6) * (1 - span(t, (R - 0.4), (R + 0.1))), 0);
  const pIdx = t < P0 ? 0 : Math.min(PAINS.length - 1, Math.floor((t - P0) / PD));
  const beat = t < P0 ? 0 : pIdx + back(span(t - (P0 + pIdx * PD), 0, 0.35));
  const endK = easeInOut(span(t, E, E + 1.6));
  const ansK = easeInOut(span(t, (R + 2), (R + 3))) * (1 - endK);
  const wSet = [1 - ansK - endK, ansK, endK];
  const settle = (poses) => poses.reduce((acc, p, i) => acc.map((v, j) => v + p[j] * wSet[i]), poses[0].map(() => 0));
  const pop = (k) => back(span(t, 0.35 + k * 0.17, 0.75 + k * 0.17));
  const join = (k) => back(span(t, (R + 0.05) + k * 0.05, (R + 0.9) + k * 0.05));

  let k = 0;
  for (const [name, rp] of Object.entries(RING_POSE)) {
    const pieces = name === "orange" ? orangeRing : tealRing;
    const [cx, cy, S] = settle(rp.settled);
    const spin = name === "orange" ? t * 3 : -t * 5;
    const pulse = 1 + 0.06 * Math.exp(-((t - (R + 1.05)) ** 2) * 18);
    pieces.forEach((p, i) => {
      const [px, py, pr] = rp.pieces[i];
      const sgn = (i + k) % 2 ? 1 : -1;
      const ax = px + Math.sin(t * 0.5 + i + k) * 14 + tension * Math.sin(t * 31 + i) * 3;
      const ay = py + Math.cos(t * 0.4 + i * 2 + k) * 12;
      const ar = pr + Math.sin(t * 0.6 + i) * 6 + sgn * 22 * beat;
      const a = (spin * Math.PI) / 180;
      const bx = cx + S * pulse * (p.cx * Math.cos(a) - p.cy * Math.sin(a));
      const by = cy + S * pulse * (p.cx * Math.sin(a) + p.cy * Math.cos(a));
      const j = join(k);
      place(p, lerp(ax, bx, j), lerp(ay, by, j), lerp(ar, spin, j), pop(k) * lerp(1, S * pulse, j));
      k++;
    });
  }
  for (const [name, p] of Object.entries(STICKERS)) {
    const P = POSE[name], [x0, y0, r0, s0] = P[0], [x1, y1, r1, s1] = settle(P.slice(1));
    const j = join(k), wob = Math.sin(t * 0.7 + k) * 5;
    const ax = x0 + Math.sin(t * 0.45 + k) * 16 + tension * Math.sin(t * 29 + k) * 3;
    const ay = y0 + Math.cos(t * 0.5 + k) * 12;
    place(p, lerp(ax, x1, j), lerp(ay, y1 + Math.sin(t * 0.8 + k) * 6 * j, j), lerp(r0 + wob + (k % 2 ? 15 : -15) * beat, r1 + wob * 0.5, j), pop(k) * lerp(s0, s1, j));
    k++;
  }

  deco.style.opacity = lerp(1, 0.55, span(t, P0, P0 + 0.3) * (1 - span(t, R - 0.4, R)));

  const sw = easeInOut(span(t, (R - 0.3), (R + 0.9)));
  sweepPath.style.strokeDashoffset = 1 - sw;
  sweep.el.style.opacity = sw > 0 ? 1 - span(t, (R + 1.3), (R + 2.1)) : 0;
  place(sweep, 0, 0, 0, 1, sweep.el.style.opacity);

  const burst = Math.exp(-Math.max(0, t - (R + 0.8)) * 2.2) * (t > (R + 0.8) ? 1 : 0);
  confetti.forEach((c, i) => {
    const dx = c.x - 960, dy = c.y - 540, d = Math.hypot(dx, dy) || 1;
    const x = c.x + Math.sin(t * 0.3 * c.sp + c.ph) * 30 + (dx / d) * 160 * burst + tension * Math.sin(t * 27 + i) * 2;
    const y = c.y + ((t * 14 * c.sp) % 60) - 30 + (dy / d) * 160 * burst;
    const o = span(t, c.tp, c.tp + 0.2) * lerp(0.9, 0.35, ansK) * (1 - span(t, DUR - 0.6, DUR));
    place(c, x, y, c.r + t * 40 * c.sp + beat * 30, back(span(t, c.tp, c.tp + 0.4)) * (1 + 0.4 * burst), o);
  });

  // ---- hook 0–3.2 ----
  const hk = easeOut(span(t, 0.1, 0.7)) * (1 - span(t, 3.0, 3.3));
  $("hook").style.opacity = hk;
  $("hookT").style.transform = `translateY(${(1 - easeOut(span(t, 0.1, 0.7))) * 40}px)`;
  const opened = Math.min(8, Math.floor(span(t, 0.7, 2.5) * 8.999));
  $("count").textContent = opened;
  $("count").style.transform = `scale(${1 + 0.18 * Math.exp(-(((t - 0.7) * 4.5) % 1) * 6) * (t > 0.7 && t < 2.6 ? 1 : 0)})`;

  // ---- windows: open during the hook, fade back while the pain scenes play, get pulled into one at the reveal ----
  const pi = t >= P0 && t < R ? Math.floor((t - P0) / PD) : -1;
  const pull = easeIn(span(t, (R - 0.2), (R + 0.7)));
  const back8 = easeOut(span(t, P0 - 0.1, P0 + 0.3));
  wins.forEach((w, i) => {
    const open = back(span(t, 0.7 + i * 0.22, 1.1 + i * 0.22));
    const lit = pi >= 0 && PAINS[pi].hl.includes(i);
    const dim = lerp(1, lit ? 0.32 : 0.12, back8);
    let x = w.x, y = w.y, sc = open * lerp(1, 0.86, back8);
    const jig = lit ? Math.sin(t * 38 + i) * 3 : 0;
    x = lerp(x, 795, pull); y = lerp(y, 420, pull); sc *= 1 - pull;
    w.el.style.opacity = span(t, 0.7 + i * 0.22, 0.9 + i * 0.22) * dim * (1 - span(t, (R + 0.4), (R + 0.7)));
    w.el.style.transform = `translate(${x + jig}px, ${y}px) rotate(${w.r * (1 - pull)}deg) scale(${sc})`;
    w.el.classList.toggle("lit", lit);
  });

  // ---- pains P0–R: one animated scene each, the punchline lands with the hit ----
  $("pain").style.opacity = span(t, P0, P0 + 0.2) * (1 - span(t, (R - 0.2), R));
  $("pnum").style.opacity = $("pain").style.opacity;
  painScenes.forEach((sc, i) => {
    const local = t - (P0 + i * PD);
    const on = i === pi;
    sc.scene.style.opacity = on ? span(local, 0, 0.12) * (1 - span(local, PD - 0.22, PD)) : 0;
    if (on) sc.update(local);
  });
  if (pi >= 0) {
    const p = PAINS[pi];
    const local = t - (P0 + pi * PD);
    if ($("painT").dataset.i !== String(pi)) {
      $("who").textContent = p.who;
      $("painT").innerHTML = p.t;
      $("painT").dataset.i = pi;
      $("pnum").textContent = `痛點 ${pi + 1} / 6`;
    }
    const k = easeOut(span(local, 0.1, 0.4));
    $("painT").style.transform = `translateY(${(1 - k) * 36}px)`;
    $("painT").style.opacity = k * (1 - span(local, PD - 0.2, PD));
    const punch = $("painT").querySelector("b");
    const pk = back(span(local, HIT, HIT + 0.25));
    punch.style.opacity = span(local, HIT, HIT + 0.05);
    punch.style.display = "inline-block";
    punch.style.transform = `scale(${lerp(1.6, 1, pk)})`;
  }

  // ---- reveal R–A0 ----
  const rvk = easeOut(span(t, (R + 0.7), (R + 1.3)));
  $("reveal").style.opacity = rvk * (1 - span(t, (R + 2.1), (R + 2.5)));
  $("reveal").querySelector("h1").style.transform = `scale(${0.85 + 0.15 * back(span(t, (R + 0.7), (R + 1.4)))})`;

  // ---- answers A0–E ----
  const ai = t >= A0 && t < A0 + ANS.length * AD ? Math.floor((t - A0) / AD) : -1;
  $("ans").style.opacity = span(t, A0, A0 + 0.25) * (1 - span(t, E - 0.3, E));
  if (ai >= 0) {
    const a = ANS[ai];
    const local = t - (A0 + ai * AD);
    if (ai !== lastAns) {
      $("aNum").textContent = `對應痛點 ${ai + 1}`;
      $("aX").textContent = a.x;
      $("aT").innerHTML = a.t;
      $("aS").innerHTML = a.s;
      $("aUrl").textContent = `dropout.tw${a.url}`;
      $("imgA").src = `/promo/v4/${a.A}.png`;
      if (a.B) {
        const r = meta[a.B], pad = 24, bw = 640, s = bw / ((r.w + pad * 2) * S0) ;
        const img = $("imgB");
        img.src = `/promo/v4/${a.B}.png`;
        img.style.width = `${VW * s}px`;
        img.style.transform = `translate(${-(r.x - pad) * S0 * s}px, ${-(r.y - pad) * S0 * s}px)`;
        $("shotB").querySelector(".view").style.height = `${(r.h + pad * 2) * S0 * s}px`;
        $("bUrl").textContent = "預約完成";
      }
      lastAns = ai;
    }
    const zk = easeInOut(span(local, 0.75, 1.65));
    camera2d(a.A, zk);
    $("ringA").style.opacity = easeOut(span(local, 1.5, 1.9));
    const inK = easeOut(span(local, 0, 0.45)), outK = span(local, AD - 0.2, AD);
    $("aX").style.opacity = easeOut(span(local, 0.05, 0.35)) * (1 - outK);
    $("aT").style.opacity = inK * (1 - outK);
    $("aT").style.transform = `translateY(${(1 - inK) * 34}px)`;
    $("aS").style.opacity = easeOut(span(local, 0.4, 0.8)) * (1 - outK);
    $("aNum").style.opacity = inK * (1 - outK);
    const sk = easeOut(span(local, 0.1, 0.6));
    $("shotA").style.opacity = sk * (1 - outK);
    $("plate").style.opacity = easeOut(span(local, 0.25, 0.75)) * (1 - outK);
    $("plate").style.transform = `translate(${(1 - easeOut(span(local, 0.25, 0.75))) * -60}px, ${(1 - easeOut(span(local, 0.25, 0.75))) * 40}px)`;
    $("shotA").style.transform = `translateX(${(1 - sk) * 160}px) perspective(1600px) rotateY(${(1 - sk) * -14 - 3}deg) translateY(${Math.sin(t * 1.2) * 6}px)`;
    const bk = a.B ? easeOut(span(local, 1.9, 2.4)) : 0;
    $("shotB").style.opacity = bk * (1 - outK);
    $("shotB").style.left = "1150px";
    $("shotB").style.top = "700px";
    $("shotB").style.transform = `translateY(${(1 - bk) * 80}px) scale(${0.9 + 0.1 * bk})`;
    dots.forEach((d, i) => (d.style.background = i === ai ? "#e08a3c" : i < ai ? "#3ca59e" : "rgba(15,35,64,0.12)"));
  }

  // ---- end E–DUR ----
  const ek = easeOut(span(t, E + 0.4, E + 1.2));
  $("end").style.opacity = ek * (1 - span(t, DUR - 0.6, DUR));
  $("end").querySelector("h2").style.transform = `translateY(${(1 - ek) * 30}px)`;
  const lk = easeOut(span(t, E + 1.0, E + 1.8));
  $("end").querySelector("img").style.opacity = lk;
  $("end").querySelector("img").style.transform = `scale(${0.9 + 0.1 * lk})`;
  $("end").querySelector(".url").style.opacity = easeOut(span(t, E + 1.7, E + 2.4));
};
