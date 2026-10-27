import fs from "node:fs";

export function synth(DUR, SR = 44100) {
  const N = SR * DUR;
  const L = new Float32Array(N), R = new Float32Array(N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  function add(t0, len, fn, gain = 1, pan = 0) {
    const s0 = Math.floor(t0 * SR), s1 = Math.min(N, Math.floor((t0 + len) * SR));
    const gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
    for (let i = Math.max(0, s0); i < s1; i++) {
      const v = fn((i - s0) / SR);
      L[i] += v * gl; R[i] += v * gr;
    }
  }
  const s = {
    hz, rnd, add,
    kick(t, g = 0.9) { let ph = 0; add(t, 0.45, (x) => { const f = 45 + 110 * Math.exp(-x * 30); ph += (2 * Math.PI * f) / SR; return Math.sin(ph) * Math.exp(-x * 7); }, g); },
    softKick(t, g = 0.6) { let ph = 0; add(t, 0.3, (x) => { const f = 55 + 70 * Math.exp(-x * 40); ph += (2 * Math.PI * f) / SR; return Math.sin(ph) * Math.exp(-x * 11); }, g); },
    hat(t, g = 0.12, pan = 0) { let prev = 0; add(t, 0.06, (x) => { const n = rnd(); const h = n - prev; prev = n; return h * Math.exp(-x * 70); }, g, pan); },
    shaker(t, g = 0.05, pan = 0) { let prev = 0; add(t, 0.09, (x) => { const n = rnd(); const h = n - prev; prev = n; return h * Math.sin(Math.PI * x / 0.09); }, g, pan); },
    clap(t, g = 0.25) { let lp = 0; add(t, 0.25, (x) => { const n = rnd(); lp += 0.35 * (n - lp); const e = Math.exp(-x * 18) * (x < 0.02 ? 1 : 0.8); return (n - lp) * e; }, g); },
    snap(t, g = 0.12, pan = 0) { let lp = 0; add(t, 0.08, (x) => { const n = rnd(); lp += 0.6 * (n - lp); return (n - lp) * Math.exp(-x * 60); }, g, pan); },
    bass(t, m, len, g = 0.32, cut = 0.08) { let ph = 0, lp = 0; const f = hz(m); add(t, len, (x) => { ph = (ph + f / SR) % 1; const saw = ph * 2 - 1; lp += cut * (saw - lp); const e = Math.min(1, x * 200) * Math.exp(-x * 3); return lp * e; }, g); },
    sub(t, m, len, g = 0.3) { let ph = 0; const f = hz(m); add(t, len, (x) => { ph += (2 * Math.PI * f) / SR; return Math.sin(ph) * Math.min(1, x * 80) * Math.min(1, (len - x) * 20); }, g); },
    pad(t, notes, len, g = 0.06, attack = 0.4, release = 0.6) {
      notes.forEach((m) => {
        [-0.08, 0.08].forEach((det, j) => {
          let ph = rnd() * 0.5 + 0.5, lp = 0;
          const f = hz(m) * 2 ** (det / 12);
          add(t, len + release, (x) => { ph = (ph + f / SR) % 1; lp += 0.04 * (ph * 2 - 1 - lp); const e = Math.min(1, x / attack) * (x > len ? Math.max(0, 1 - (x - len) / release) : 1); return lp * e; }, g, j ? 0.35 : -0.35);
        });
      });
    },
    pluck(t, m, g = 0.09, pan = 0, decay = 14) { let ph = 0; const f = hz(m); add(t, 0.5, (x) => { ph = (ph + f / SR) % 1; const tri = 1 - 4 * Math.abs(ph - 0.5); return tri * Math.exp(-x * decay); }, g, pan); },
    // Karplus–Strong string, ukulele-ish
    string(t, m, g = 0.18, pan = 0, len = 0.9) {
      const f = hz(m), P = Math.max(2, Math.round(SR / f));
      const buf = new Float32Array(P).map(() => rnd());
      let k = 0;
      add(t, len, (x) => { const i = k % P, j = (k + 1) % P; const v = buf[i]; buf[i] = 0.497 * (buf[i] + buf[j]); k++; return v * Math.min(1, (len - x) * 8); }, g, pan);
    },
    bell(t, m, g = 0.08, pan = 0) { const f = hz(m); add(t, 1.4, (x) => (Math.sin(2 * Math.PI * f * x) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 6)) * Math.exp(-x * 3.2), g, pan); },
    boom(t, g = 0.8) { let ph = 0, lp = 0; add(t, 2.2, (x) => { ph += (2 * Math.PI * (38 + 40 * Math.exp(-x * 6))) / SR; return Math.sin(ph) * Math.exp(-x * 2.2); }, g); add(t, 1.6, (x) => { const n = rnd(); lp += 0.5 * (n - lp); return (n - lp * 0.5) * Math.exp(-x * 3.2); }, 0.22); },
    riser(t, len, g = 0.18) { let lp = 0, ph = 0; add(t, len, (x) => { const p = x / len, n = rnd(); lp += (0.02 + 0.5 * p) * (n - lp); ph += (2 * Math.PI * (180 + 900 * p * p)) / SR; return (lp * 0.8 + Math.sin(ph) * 0.25) * p * p; }, g); },
    whoosh(t, len = 0.45, g = 0.16) { let lp = 0; add(t, len, (x) => { const p = x / len, n = rnd(); lp += (0.03 + 0.4 * p) * (n - lp); return lp * Math.sin(Math.PI * p); }, g); },
    blip(t, f = 1200, g = 0.08, pan = 0) { add(t, 0.09, (x) => Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 45), g, pan); },
    tick(t, g = 0.18) { add(t, 0.04, (x) => Math.sin(2 * Math.PI * 2400 * x) * Math.exp(-x * 120), g); },
    pop(t, g = 0.14, f0 = 500) { add(t, 0.12, (x) => Math.sin(2 * Math.PI * (f0 + 900 * x / 0.12) * x) * Math.exp(-x * 30), g); },
    write(path, fadeOut = 1.5) {
      let peak = 0;
      for (let i = 0; i < N; i++) {
        const t = i / SR;
        const fade = (t > DUR - fadeOut ? Math.max(0, (DUR - t) / fadeOut) : 1) * Math.min(1, t / 0.02);
        L[i] = Math.tanh(L[i] * 1.2) * fade; R[i] = Math.tanh(R[i] * 1.2) * fade;
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      }
      const gain = 0.89 / peak;
      const buf = Buffer.alloc(44 + N * 4);
      buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVEfmt ", 8);
      buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
      buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
      for (let i = 0; i < N; i++) {
        buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4);
        buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4);
      }
      fs.writeFileSync(path, buf);
      console.log(path, DUR, "s");
    },
  };
  return s;
}
