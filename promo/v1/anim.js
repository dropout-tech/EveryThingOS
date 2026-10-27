import * as THREE from "/node_modules/three/build/three.module.js";

const W = 1920, H = 1080;
const C = { cream: 0xfffbef, navy: 0x123f59, teal: 0x1cb3bb, yellow: 0xf5c82f, dog: 0x4c91af };
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.setClearColor(C.cream);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
camera.position.set(0, 0, 20);
scene.add(new THREE.AmbientLight(0xffffff, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 6, 10);
scene.add(sun);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const back = (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
const lerp = (a, b, x) => a + (b - a) * x;
const $ = (id) => document.getElementById(id);
let seed = 23;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- brand shapes (the yellow flowers, navy leaves, teal squiggles from the 米特 deck) ----------
function flowerShape(r = 1) {
  const s = new THREE.Shape();
  const petals = 5;
  for (let i = 0; i <= 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const rr = r * (0.62 + 0.38 * Math.abs(Math.cos((petals / 2) * a)));
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}
function leafShape(r = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.bezierCurveTo(r * 0.9, -r * 0.4, r * 0.7, r * 0.7, 0, r * 1.1);
  s.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.9, -r * 0.4, 0, -r);
  return s;
}
function sparkleShape(r = 1) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * 0.28 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  return s;
}
const ext = (shape, depth = 0.35) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 24 });
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
function squiggleGeo(len = 4, amp = 0.5) {
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(new THREE.Vector3((i / 40 - 0.5) * len, Math.sin((i / 40) * Math.PI * 3) * amp, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.22, 16, false);
}

const geos = {
  flower: ext(flowerShape(1.1)),
  leaf: ext(leafShape(1.1), 0.25),
  sparkle: ext(sparkleShape(0.8), 0.2),
  squiggle: squiggleGeo(),
  dot: new THREE.SphereGeometry(0.42, 32, 20),
};
const KINDS = [
  ["flower", C.yellow], ["leaf", C.navy], ["squiggle", C.teal], ["sparkle", C.yellow], ["dot", C.navy], ["flower", C.teal], ["leaf", C.dog], ["sparkle", C.teal],
];
const decor = [];
const free = (px, py) => (px > 4 && py > 5.4) || (px > 11.6 && py > -5.2) || (px < -12.4 && py > -5.2 && py < 4.6) || py > 7.4 || py < -7.9;
for (let i = 0; i < 20; i++) {
  let x, y, z, px, py;
  do {
    z = -4 + rnd() * 2;
    px = (rnd() * 2 - 1) * 14.5;
    py = (rnd() * 2 - 1) * 8.6;
  } while (!free(px, py));
  x = (px * (20 - z)) / 20;
  y = (py * (20 - z)) / 20;
  const [kind, color] = KINDS[i % KINDS.length];
  const m = new THREE.Mesh(geos[kind], mat(color));
  const s = 0.8 + rnd() * 0.6;
  m.scale.setScalar(s);
  scene.add(m);
  decor.push({ m, x, y, z, rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6, sp: 0.2 + rnd() * 0.5, ph: rnd() * 6 });
}

const burstGeo = [geos.sparkle, geos.flower, geos.dot];
const BLOCKS = [4.5, 23, 41.5], CLOSE = 60;
const bursts = BLOCKS.map((b) => b + 8.1).map((t0) => {
  const parts = [];
  for (let i = 0; i < 44; i++) {
    const m = new THREE.Mesh(burstGeo[i % 3], mat([C.yellow, C.teal, C.navy, C.dog][i % 4]));
    m.scale.setScalar(0.25 + rnd() * 0.25);
    m.visible = false;
    scene.add(m);
    const a = rnd() * Math.PI * 2, v = 6 + rnd() * 8;
    parts.push({ m, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 + 5, vz: (rnd() - 0.5) * 6, spin: rnd() * 8 });
  }
  return { t0, parts };
});

// ---------- DOM pieces ----------
const STEPS = [["報名", "CRM"], ["鎖材料包", "OMS"], ["上課耗用", "WMS"], ["教學損耗", "WMS"], ["跨店調撥", "20 店"]];
const flow = $("flow");
const NODE_W = 250, GAP = (1680 - 5 * NODE_W) / 4;
const nodes = [], links = [], breaks = [];
STEPS.forEach(([label, tag], i) => {
  const n = document.createElement("div");
  n.className = "node";
  n.innerHTML = `<small>${tag}</small>${label}`;
  n.style.left = `${i * (NODE_W + GAP)}px`;
  flow.appendChild(n);
  nodes.push(n);
  if (i < 4) {
    const l = document.createElement("div");
    l.className = "link";
    l.style.left = `${i * (NODE_W + GAP) + NODE_W}px`;
    l.style.width = `${GAP}px`;
    flow.appendChild(l);
    links.push(l);
    const b = document.createElement("div");
    b.className = "break";
    b.textContent = "?";
    b.style.left = `${i * (NODE_W + GAP) + NODE_W + GAP / 2 - 35}px`;
    flow.appendChild(b);
    breaks.push(b);
  }
});
const runner = document.createElement("div");
runner.className = "dot";
flow.appendChild(runner);

const CARDS = [["專長標籤", "節慶 DIY・美術"], ["適教年齡", "3–6・7–12 歲"], ["請假", "事假・特休"], ["工時上限", "每週 40 小時"], ["支援分店", "北・中・南"], ["課表", "20 店排課"]];
const cardEls = CARDS.map(([k, v], i) => {
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `<small>${k}</small>${v}`;
  $("cards").appendChild(c);
  return { c, x: [140, 520, 980, 1380, 300, 1180][i], y: [400, 500, 405, 515, 590, 600][i], r: [-9, 6, -4, 10, 7, -7][i] };
});
const BUBBLES = [
  ["LINE", "週六還有位嗎？"], ["電話", "幫我記一位"], ["門市", "紙本登記"],
  ["官網", "表單報名"], ["IG", "可以改期嗎？"], ["退課", "材料費退不退？"],
];
const bubbleEls = BUBBLES.map(([k, v], i) => {
  const c = document.createElement("div");
  c.className = `bubble${i % 2 ? " r" : ""}`;
  c.innerHTML = `<small><i></i>${k}</small>${v}`;
  $("bubbles").appendChild(c);
  return { c, x: [130, 560, 1010, 1420, 330, 1200][i], y: [430, 505, 425, 515, 610, 615][i], r: [-6, 5, -3, 7, 4, -5][i] };
});
const facts0 = [...$("facts0").children], facts1 = [...$("facts1").children], facts2 = [...$("facts2").children];
const bulletsOf = (id) => [...document.querySelectorAll(`#${id} .bullet`)];

// Each window is a real practice-mode page: a viewport shot (rail + top bar) with the full-height page scrolled under it.
// A step can switch to another page; the window dips out and back in on the switch.
const S0 = 970 / 1100, VW = 970, VH = 608, SW = 1100, SH = 690;
function makeShot(id, steps) {
  const el = $(id);
  const view = el.querySelector(".view");
  const screens = {};
  for (const page of new Set(steps.map((s) => s.page))) {
    const sc = document.createElement("div");
    sc.className = "screen";
    sc.innerHTML = `<img class="frame" /><div class="clip"><img class="tall" /><div class="ring"></div></div>`;
    view.appendChild(sc);
    screens[page] = { el: sc, frame: sc.querySelector(".frame"), tall: sc.querySelector(".tall"), ring: sc.querySelector(".ring"), meta: null };
  }
  return { el, steps, screens, title: el.querySelector("em") };
}
const shots = [
  makeShot("shot0", [
    { t: 11, page: "chat", key: "a", title: "對話｜LINE、IG、FB 同一個收件匣" },
    { t: 13.7, page: "chat", key: "b", title: "預約｜四個管道，同一個預約頁" },
    { t: 15.9, page: "stock", key: "r", title: "退改課｜學費與材料費自動拆算" },
  ]),
  makeShot("shot1", [
    { t: 11, page: "stock", key: "a", title: "倉庫｜報名即鎖定材料包" },
    { t: 13.7, page: "stock", key: "b", title: "倉庫｜耗用與損耗都有紀錄" },
    { t: 15.9, page: "stock", key: "c", title: "倉庫｜AI 跨店調撥建議" },
  ]),
  makeShot("shot2", [
    { t: 11, page: "hr", key: "a", title: "人事｜AI 師資媒合" },
    { t: 13.7, page: "hr", key: "b", title: "人事｜請假自動找代課" },
    { t: 15.9, page: "hr", key: "c", title: "人事｜主管覆核全程留痕" },
  ]),
];
const OVERVIEW = { scroll: 0, z: 1, fx: SW / 2, fy: SH / 2 };
function focusState(screen, step) {
  const r = screen.meta.rects[step.key];
  const fit = { w: Math.min(r.w, 780), h: Math.min(r.h, 420) };
  const scroll = clamp(r.y - 56 - 28, 0, screen.meta.height - SH);
  const z = clamp(Math.min(SW / (fit.w + 40), SH / (fit.h + 40)), 1, 1.85);
  return { scroll, z, fx: r.x + fit.w / 2, fy: r.y - scroll + fit.h / 2 };
}
function camAt(shot, L) {
  let state = OVERVIEW, active = -1, page = shot.steps[0].page, fade = 1;
  shot.steps.forEach((step, i) => {
    if (step.page !== page && L >= step.t - 0.3) {
      fade = Math.min(fade, Math.abs(L - step.t) / 0.3);
      if (L < step.t) return;
      page = step.page;
      state = OVERVIEW;
    }
    const k = easeInOut(span(L, step.t, step.t + 0.95));
    if (k <= 0) return;
    const next = focusState(shot.screens[page], step);
    state = { scroll: lerp(state.scroll, next.scroll, k), z: lerp(state.z, next.z, k), fx: lerp(state.fx, next.fx, k), fy: lerp(state.fy, next.fy, k) };
    active = i;
  });
  return { state, active, page, fade: clamp(fade) };
}
function drawShot(shot, L) {
  const { state, active, page, fade } = camAt(shot, L);
  for (const [name, sc] of Object.entries(shot.screens)) sc.el.style.display = name === page ? "block" : "none";
  const screen = shot.screens[page];
  const sc = S0 * state.z;
  const tx = clamp(VW / 2 - sc * state.fx, VW - sc * SW, 0);
  const ty = clamp(VH / 2 - sc * state.fy, VH - sc * SH, 0);
  screen.el.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
  screen.el.style.opacity = fade;
  screen.tall.style.top = `${-56 - state.scroll}px`;
  shot.title.textContent = active < 0 ? "EveryThingOS　練習帳實機畫面" : shot.steps[active].title;
  if (active < 0) {
    screen.ring.style.opacity = 0;
  } else {
    const step = shot.steps[active];
    const r = screen.meta.rects[step.key];
    screen.ring.style.left = `${r.x - 240 - 6}px`;
    screen.ring.style.top = `${r.y - state.scroll - 56 - 6}px`;
    screen.ring.style.width = `${r.w + 12}px`;
    screen.ring.style.height = `${Math.min(r.h, SH) + 12}px`;
    screen.ring.style.opacity = easeOut(span(L, step.t + 0.7, step.t + 1.1));
  }
}
function drawBullets(list, shot, L) {
  const active = camAt(shot, L).active;
  list.forEach((b, i) => {
    const t0 = shot.steps[i].t - 0.1;
    show(b, easeOut(span(L, t0, t0 + 0.6)), (1 - easeOut(span(L, t0, t0 + 0.6))) * 30);
    b.classList.toggle("dim", active >= 0 && i !== active && L > t0 + 0.6);
  });
}

function show(el, o, dy = 0, sc = 1) {
  el.style.opacity = o;
  el.style.transform = `translateY(${dy}px) scale(${sc})`;
}

window.ready = (async () => {
  await document.fonts.load('40px "jf open 粉圓 2.1"');
  const meta = await (await fetch("/promo/v3/meta.json")).json();
  for (const shot of shots) {
    for (const [name, sc] of Object.entries(shot.screens)) {
      sc.meta = meta[name];
      sc.frame.src = `/promo/v3/${name}-frame.png`;
      sc.tall.src = `/promo/v3/${name}-tall.png`;
    }
  }
  await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => (i.onload = r)))));
  await document.fonts.ready;
  return true;
})();

function kicker(layer, fixed, before, after) {
  const k = $(layer).querySelector(".kicker");
  k.textContent = fixed ? after : before;
  k.className = fixed ? "kicker teal" : "kicker";
}

// Solution layer for block b (local time L from the block start): window slides in, three zooms.
function solution(i, L) {
  const o = span(L, 9.4, 9.9) * (1 - span(L, 18.1, 18.6));
  $(`s${i}`).style.opacity = o;
  drawBullets(bulletsOf(`s${i}`), shots[i], L);
  const sh = easeOut(span(L, 9.9, 10.8));
  $(`shot${i}`).style.transform = `translateX(${(1 - sh) * 220}px) rotate(${(1 - sh) * 3}deg)`;
  $(`shot${i}`).style.opacity = sh;
  if (o > 0) drawShot(shots[i], L);
}

// Scattered pieces that wobble during the pain and line up at the fix (bubbles for 預約, cards for 師資).
function scatter(items, L, rowY) {
  const tidy = easeInOut(span(L, 8, 9));
  items.forEach((c, i) => {
    const inn = back(span(L, 0.6 + i * 0.2, 1.2 + i * 0.2));
    const chaos = (1 - tidy) * (0.4 + span(L, 2, 3) * 0.6);
    const x = lerp(c.x + Math.sin(L * 1.7 + i) * 26 * chaos, 120 + i * 285, tidy);
    const y = lerp(c.y + Math.cos(L * 1.3 + i * 2) * 22 * chaos, rowY, tidy);
    const r = lerp(c.r + Math.sin(L * 2.1 + i) * 4 * chaos, 0, tidy);
    c.c.style.opacity = span(L, 0.6 + i * 0.2, 0.9 + i * 0.2);
    c.c.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${inn * lerp(1, 0.86, tidy)})`;
    c.c.style.borderColor = tidy > 0.5 ? "#1cb3bb" : "#123f59";
  });
}
const factsIn = (list, L) => list.forEach((f, i) => show(f, easeOut(span(L, 3.4 + i * 0.7, 4 + i * 0.7)) * (1 - span(L, 7.6, 8)), (1 - easeOut(span(L, 3.4 + i * 0.7, 4 + i * 0.7))) * 40));

window.renderAt = (t) => {
  // background shapes: restless during each pain, settled during the answers
  const pain = Math.max(...BLOCKS.map((b) => span(t - b, 0, 1) * (1 - span(t - b, 7.5, 8.5))));
  for (const d of decor) {
    const wob = Math.sin(t * d.sp * 2 + d.ph);
    const jit = pain * Math.sin(t * 13 + d.ph * 3) * 0.12;
    d.m.position.set(d.x + Math.sin(t * d.sp + d.ph) * 0.4 + jit, d.y + wob * 0.35 + jit, d.z);
    d.m.rotation.set(d.rx + t * 0.15 * d.sp, d.ry + t * 0.25 * d.sp, d.rz + t * 0.2 * d.sp + pain * Math.sin(t * 9 + d.ph) * 0.15);
  }
  for (const b of bursts) {
    const dt = t - b.t0;
    for (const p of b.parts) {
      p.m.visible = dt > 0 && dt < 2.4;
      if (!p.m.visible) continue;
      p.m.position.set(p.vx * dt * 1.3, p.vy * dt - 7 * dt * dt - 1, p.vz * dt - 2);
      p.m.rotation.set(p.spin * dt, p.spin * dt * 0.7, p.spin * dt * 0.5);
    }
  }
  camera.position.set(Math.sin(t * 0.18) * 0.8, Math.cos(t * 0.14) * 0.4, 20 - span(t, 0, CLOSE + 4) * 1.2);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);

  // title 0–4.5
  const ti = easeOut(span(t, 0.2, 1.2)), to = span(t, 4, 4.6);
  $("title").style.opacity = ti * (1 - to);
  $("title").querySelector("img").style.transform = `scale(${0.6 + 0.4 * back(span(t, 0.2, 1.1))})`;
  $("title").querySelector("h1").style.transform = `translateY(${(1 - easeOut(span(t, 0.8, 1.7))) * 40}px)`;
  $("title").querySelector("h1").style.opacity = easeOut(span(t, 0.8, 1.7));
  $("title").querySelector("p").style.opacity = easeOut(span(t, 1.6, 2.4));
  $("footer").style.opacity = span(t, 4.5, 5.2) * (1 - span(t, CLOSE - 0.4, CLOSE + 0.2));

  // block 1: 預約與退改課
  {
    const L = t - BLOCKS[0];
    $("p0").style.opacity = span(L, 0, 0.5) * (1 - span(L, 9.1, 9.6));
    $("p0").querySelector("h2").style.opacity = easeOut(span(L, 0.3, 1.1));
    kicker("p0", L >= 7.9, "卡關點 1｜預約與退改課", "接起來｜同一個預約入口");
    scatter(bubbleEls, L, 520);
    factsIn(facts0, L);
    solution(0, L);
  }

  // block 2: 材料履約 (five broken links that heal)
  {
    const L = t - BLOCKS[1];
    $("p1").style.opacity = span(L, 0, 0.5) * (1 - span(L, 9.1, 9.6));
    $("p1").querySelector("h2").style.opacity = easeOut(span(L, 0.3, 1.1));
    const fixed = L >= 7.7;
    kicker("p1", fixed, "卡關點 2｜材料履約", "接起來｜同一張課程 BOM");
    nodes.forEach((n, i) => {
      const x = back(span(L, 0.7 + i * 0.25, 1.3 + i * 0.25));
      n.style.opacity = span(L, 0.7 + i * 0.25, 1 + i * 0.25);
      n.style.transform = `scale(${0.4 + 0.6 * x})`;
      n.style.borderColor = fixed ? "#1cb3bb" : "#123f59";
    });
    links.forEach((l, i) => {
      const heal = easeInOut(span(L, 7.8 + i * 0.22, 8.1 + i * 0.22));
      l.style.background = heal > 0 ? `linear-gradient(90deg, #1cb3bb ${heal * 100}%, transparent ${heal * 100}%), repeating-linear-gradient(90deg, rgba(18,63,89,0.35) 0 14px, transparent 14px 26px)` : "repeating-linear-gradient(90deg, rgba(18,63,89,0.35) 0 14px, transparent 14px 26px)";
      l.style.opacity = span(L, 1.9, 2.3);
    });
    breaks.forEach((b, i) => {
      const pop = back(span(L, 2.1 + i * 0.15, 2.6 + i * 0.15));
      const gone = span(L, 7.6 + i * 0.22, 7.9 + i * 0.22);
      b.style.opacity = span(L, 2.1 + i * 0.15, 2.3 + i * 0.15) * (1 - gone);
      b.style.transform = `scale(${pop * (1 + gone * 0.8)}) rotate(${Math.sin(t * 6 + i) * 10}deg)`;
    });
    const run = span(L, 8.1, 9.1);
    runner.style.opacity = run > 0 && run < 1 ? 1 : 0;
    runner.style.left = `${lerp(110, 1680 - 140, easeInOut(run))}px`;
    factsIn(facts1, L);
    solution(1, L);
  }

  // block 3: 師資排班
  {
    const L = t - BLOCKS[2];
    $("p2").style.opacity = span(L, 0, 0.5) * (1 - span(L, 9.1, 9.6));
    $("p2").querySelector("h2").style.opacity = easeOut(span(L, 0.3, 1.1));
    kicker("p2", L >= 7.9, "卡關點 3｜師資排班", "整理好｜同一份師資檔案");
    scatter(cardEls, L, 500);
    factsIn(facts2, L);
    solution(2, L);
  }

  // close
  const cl = easeOut(span(t, CLOSE, CLOSE + 0.8));
  $("close").style.opacity = cl * (1 - span(t, CLOSE + 3.4, CLOSE + 4));
  $("close").querySelector("h2").style.transform = `translateY(${(1 - cl) * 40}px)`;
  $("close").querySelector("img").style.transform = `scale(${0.7 + 0.3 * back(span(t, CLOSE + 0.6, CLOSE + 1.4))})`;
  $("close").querySelector("img").style.opacity = span(t, CLOSE + 0.6, CLOSE + 1);
  $("close").querySelectorAll("p").forEach((p, i) => (p.style.opacity = easeOut(span(t, CLOSE + 1.3 + i * 0.3, CLOSE + 1.8 + i * 0.3))));
};
