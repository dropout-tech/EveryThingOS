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
const bursts = [12.6, 31.4].map((t0) => {
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
const facts1 = [...$("facts1").children], facts2 = [...$("facts2").children];
const b1 = [...document.querySelectorAll("#s1 .bullet")], b2 = [...document.querySelectorAll("#s2 .bullet")];

// Each window is a real practice-mode page: a viewport shot (rail + top bar) with the full-height page scrolled under it.
const S0 = 970 / 1100, VW = 970, VH = 608, SW = 1100, SH = 690;
function makeShot(id, name, steps) {
  const el = $(id);
  return { el, name, steps, frame: el.querySelector(".frame"), tall: el.querySelector(".tall"), ring: el.querySelector(".ring"), screen: el.querySelector(".screen"), title: el.querySelector("em"), meta: null };
}
const shots = [
  makeShot("shot1", "stock", [
    { t: 15.5, key: "a", title: "倉庫｜報名即鎖定材料包", fit: { w: 560, h: 380 } },
    { t: 18.2, key: "b", title: "倉庫｜耗用與損耗都有紀錄", fit: { w: 780, h: 330 } },
    { t: 20.4, key: "c", title: "倉庫｜AI 跨店調撥建議", fit: { w: 780, h: 420 } },
  ]),
  makeShot("shot2", "hr", [
    { t: 33.8, key: "a", title: "人事｜AI 師資媒合", fit: { w: 780, h: 340 } },
    { t: 36.2, key: "b", title: "人事｜請假自動找代課", fit: { w: 780, h: 220 } },
    { t: 38.4, key: "c", title: "人事｜主管覆核全程留痕", fit: { w: 780, h: 320 } },
  ]),
];
const OVERVIEW = { scroll: 0, z: 1, fx: SW / 2, fy: SH / 2 };
function focusState(shot, step) {
  const r = shot.meta.rects[step.key];
  const scroll = clamp(r.y - 56 - 28, 0, shot.meta.height - SH);
  const z = clamp(Math.min(SW / (step.fit.w + 40), SH / (step.fit.h + 40)), 1, 1.85);
  return { scroll, z, fx: r.x + step.fit.w / 2, fy: r.y - scroll + step.fit.h / 2 };
}
function camAt(shot, t) {
  let state = OVERVIEW, active = -1;
  shot.steps.forEach((step, i) => {
    const k = easeInOut(span(t, step.t, step.t + 0.95));
    if (k <= 0) return;
    const next = focusState(shot, step);
    state = { scroll: lerp(state.scroll, next.scroll, k), z: lerp(state.z, next.z, k), fx: lerp(state.fx, next.fx, k), fy: lerp(state.fy, next.fy, k) };
    active = i;
  });
  return { state, active };
}
function drawShot(shot, t) {
  const { state, active } = camAt(shot, t);
  const sc = S0 * state.z;
  const tx = clamp(VW / 2 - sc * state.fx, VW - sc * SW, 0);
  const ty = clamp(VH / 2 - sc * state.fy, VH - sc * SH, 0);
  shot.screen.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
  shot.tall.style.top = `${-56 - state.scroll}px`;
  shot.title.textContent = active < 0 ? "EveryThingOS　練習帳實機畫面" : shot.steps[active].title;
  if (active < 0) {
    shot.ring.style.opacity = 0;
  } else {
    const step = shot.steps[active];
    const r = shot.meta.rects[step.key];
    shot.ring.style.left = `${r.x - 240 - 6}px`;
    shot.ring.style.top = `${r.y - state.scroll - 56 - 6}px`;
    shot.ring.style.width = `${r.w + 12}px`;
    shot.ring.style.height = `${r.h + 12}px`;
    shot.ring.style.opacity = easeOut(span(t, step.t + 0.7, step.t + 1.1));
  }
  return active;
}
function drawBullets(list, shot, t) {
  const active = camAt(shot, t).active;
  list.forEach((b, i) => {
    const t0 = shot.steps[i].t - 0.1;
    show(b, easeOut(span(t, t0, t0 + 0.6)), (1 - easeOut(span(t, t0, t0 + 0.6))) * 30);
    b.classList.toggle("dim", active >= 0 && i !== active && t > t0 + 0.6);
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
    shot.meta = meta[shot.name];
    shot.frame.src = `/promo/v3/${shot.name}-frame.png`;
    shot.tall.src = `/promo/v3/${shot.name}-tall.png`;
  }
  await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => (i.onload = r)))));
  await document.fonts.ready;
  return true;
})();

window.renderAt = (t) => {
  // background shapes: restless during the two pains, settled during the answers
  const pain = Math.max(span(t, 4.5, 5.5) * (1 - span(t, 12, 13)), span(t, 23, 24) * (1 - span(t, 31, 32)));
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
  camera.position.set(Math.sin(t * 0.18) * 0.8, Math.cos(t * 0.14) * 0.4, 20 - span(t, 0, 45) * 1.2);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);

  // title 0–4.5
  const ti = easeOut(span(t, 0.2, 1.2)), to = span(t, 4, 4.6);
  $("title").style.opacity = ti * (1 - to);
  $("title").querySelector("img").style.transform = `scale(${0.6 + 0.4 * back(span(t, 0.2, 1.1))})`;
  $("title").querySelector("h1").style.transform = `translateY(${(1 - easeOut(span(t, 0.8, 1.7))) * 40}px)`;
  $("title").querySelector("h1").style.opacity = easeOut(span(t, 0.8, 1.7));
  $("title").querySelector("p").style.opacity = easeOut(span(t, 1.6, 2.4));
  $("footer").style.opacity = span(t, 4.5, 5.2) * (1 - span(t, 40.6, 41.2));

  // pain 1: 4.5–12, reconnect 12–14
  const p1 = span(t, 4.5, 5.0) * (1 - span(t, 13.6, 14.1));
  $("p1").style.opacity = p1;
  const k1 = $("p1").querySelector(".kicker");
  const fixed = t >= 12.2;
  k1.textContent = fixed ? "接起來｜同一張課程 BOM" : "卡關點 1｜材料履約";
  k1.className = fixed ? "kicker teal" : "kicker";
  $("p1").querySelector("h2").style.opacity = easeOut(span(t, 4.8, 5.6));
  nodes.forEach((n, i) => {
    const x = back(span(t, 5.2 + i * 0.25, 5.8 + i * 0.25));
    n.style.opacity = span(t, 5.2 + i * 0.25, 5.5 + i * 0.25);
    n.style.transform = `scale(${0.4 + 0.6 * x})`;
    n.style.borderColor = fixed ? "#1cb3bb" : "#123f59";
  });
  links.forEach((l, i) => {
    const heal = easeInOut(span(t, 12.3 + i * 0.22, 12.6 + i * 0.22));
    l.style.background = heal > 0 ? `linear-gradient(90deg, #1cb3bb ${heal * 100}%, transparent ${heal * 100}%), repeating-linear-gradient(90deg, rgba(18,63,89,0.35) 0 14px, transparent 14px 26px)` : "repeating-linear-gradient(90deg, rgba(18,63,89,0.35) 0 14px, transparent 14px 26px)";
    l.style.opacity = span(t, 6.4, 6.8);
  });
  breaks.forEach((b, i) => {
    const pop = back(span(t, 6.6 + i * 0.15, 7.1 + i * 0.15));
    const gone = span(t, 12.1 + i * 0.22, 12.4 + i * 0.22);
    b.style.opacity = span(t, 6.6 + i * 0.15, 6.8 + i * 0.15) * (1 - gone);
    b.style.transform = `scale(${pop * (1 + gone * 0.8)}) rotate(${Math.sin(t * 6 + i) * 10}deg)`;
  });
  const run = span(t, 12.6, 13.6);
  runner.style.opacity = run > 0 && run < 1 ? 1 : 0;
  runner.style.left = `${lerp(110, 1680 - 140, easeInOut(run))}px`;
  facts1.forEach((f, i) => show(f, easeOut(span(t, 8 + i * 0.7, 8.6 + i * 0.7)) * (1 - span(t, 11.8, 12.2)), (1 - easeOut(span(t, 8 + i * 0.7, 8.6 + i * 0.7))) * 40));

  // solution 1: 14–23
  const s1 = span(t, 13.9, 14.4) * (1 - span(t, 22.6, 23.1));
  $("s1").style.opacity = s1;
  drawBullets(b1, shots[0], t);
  const sh1 = easeOut(span(t, 14.4, 15.3));
  $("shot1").style.transform = `translateX(${(1 - sh1) * 220}px) rotate(${(1 - sh1) * 3}deg)`;
  $("shot1").style.opacity = sh1;
  if (s1 > 0) drawShot(shots[0], t);

  // pain 2: 23–31, organise 31–32.5
  const p2 = span(t, 23, 23.5) * (1 - span(t, 32.3, 32.8));
  $("p2").style.opacity = p2;
  $("p2").querySelector("h2").style.opacity = easeOut(span(t, 23.3, 24.1));
  const k2 = $("p2").querySelector(".kicker");
  const tidy = easeInOut(span(t, 31, 32));
  k2.textContent = t >= 31 ? "整理好｜同一份師資檔案" : "卡關點 2｜師資排班";
  k2.className = t >= 31 ? "kicker teal" : "kicker";
  cardEls.forEach((c, i) => {
    const inn = back(span(t, 23.6 + i * 0.2, 24.2 + i * 0.2));
    const chaos = (1 - tidy) * (0.4 + span(t, 25, 26) * 0.6);
    const x = lerp(c.x + Math.sin(t * 1.7 + i) * 26 * chaos, 120 + i * 285, tidy);
    const y = lerp(c.y + Math.cos(t * 1.3 + i * 2) * 22 * chaos, 500, tidy);
    const r = lerp(c.r + Math.sin(t * 2.1 + i) * 4 * chaos, 0, tidy);
    c.c.style.opacity = span(t, 23.6 + i * 0.2, 23.9 + i * 0.2);
    c.c.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${inn * lerp(1, 0.86, tidy)})`;
    c.c.style.borderColor = tidy > 0.5 ? "#1cb3bb" : "#123f59";
  });
  facts2.forEach((f, i) => show(f, easeOut(span(t, 26.4 + i * 0.7, 27 + i * 0.7)) * (1 - span(t, 30.6, 31)), (1 - easeOut(span(t, 26.4 + i * 0.7, 27 + i * 0.7))) * 40));

  // solution 2: 32.5–41
  const s2 = span(t, 32.4, 32.9) * (1 - span(t, 40.6, 41.1));
  $("s2").style.opacity = s2;
  drawBullets(b2, shots[1], t);
  const sh2 = easeOut(span(t, 32.7, 33.6));
  $("shot2").style.transform = `translateX(${(1 - sh2) * 220}px) rotate(${(1 - sh2) * 3}deg)`;
  $("shot2").style.opacity = sh2;
  if (s2 > 0) drawShot(shots[1], t);

  // close: 41–45
  const cl = easeOut(span(t, 41, 41.8));
  $("close").style.opacity = cl * (1 - span(t, 44.4, 45));
  $("close").querySelector("h2").style.transform = `translateY(${(1 - cl) * 40}px)`;
  $("close").querySelector("img").style.transform = `scale(${0.7 + 0.3 * back(span(t, 41.6, 42.4))})`;
  $("close").querySelector("img").style.opacity = span(t, 41.6, 42);
  $("close").querySelectorAll("p").forEach((p, i) => (p.style.opacity = easeOut(span(t, 42.3 + i * 0.3, 42.8 + i * 0.3))));
};
