// 2B yükselti haritası: Dünya (NOAA ETOPO 2022: kara + deniz tabanı) ve Ay (LOLA). Renk basamaklı yükselti + kabartma gölgelendirmesi,
// fareyle okunan enlem/boylam/yükseklik, yakınlaştırma ve kaydırma; Güneş altı noktası, gözlemci, seçili uydu ve Apollo 11 işaretleri.
import * as E from './engine.js';
import { SITE_LAT, SITE_LON } from './mission.js';

const D = Math.PI / 180;
// yükselti (m) -> renk basamakları
const RAMPS = {
  earth: [[-10500, [8, 28, 84]], [-6000, [16, 60, 130]], [-3000, [30, 100, 170]], [-1000, [70, 150, 205]], [-200, [128, 190, 225]], [-0.5, [168, 214, 236]],
    [0.5, [64, 126, 60]], [300, [118, 163, 74]], [800, [190, 196, 100]], [1500, [221, 192, 120]], [2500, [186, 140, 92]], [4000, [148, 108, 84]], [5500, [200, 190, 184]], [7500, [250, 250, 250]]],
  moon: [[-9500, [56, 30, 120]], [-6000, [40, 70, 170]], [-3500, [40, 140, 190]], [-1500, [70, 175, 150]], [0, [140, 190, 110]], [1500, [214, 205, 100]], [3500, [226, 150, 70]], [6000, [205, 80, 70]], [9000, [235, 190, 200]], [11000, [255, 255, 255]]],
};
const BODY = {
  earth: { name: 'Dünya', R: 6371, ex: 7, exSea: 2, src: 'NOAA NCEI ETOPO 2022 (kara yüzeyi ve deniz tabanı; 0,125° ≈ 14 km)' },
  moon: { name: 'Ay', R: 1737.4, ex: 6, exSea: 6, src: 'NASA LRO/LOLA (Ay Kiti, 0,125° ≈ 3,8 km)' },
};
function colorAt(ramp, h) {
  if (h <= ramp[0][0]) return ramp[0][1];
  for (let i = 1; i < ramp.length; i++) if (h <= ramp[i][0]) {
    const [h0, c0] = ramp[i - 1], [h1, c1] = ramp[i], t = (h - h0) / (h1 - h0);
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  }
  return ramp[ramp.length - 1][1];
}
const fmtM = (m) => (Math.abs(m) >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'K' : 'G'}`, fmtLon = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'D' : 'B'}`;

async function gunzip(buf) {
  const u = new Uint8Array(buf, 0, 2);
  if (u[0] !== 0x1f || u[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
async function loadEarth() {
  const meta = await (await fetch('textures/earth_height.json')).json();
  const buf = await gunzip(await (await fetch('textures/earth_height.bin.gz')).arrayBuffer());
  const n = meta.w * meta.h, b = new Uint8Array(buf), out = new Int16Array(n);
  for (let r = 0; r < meta.h; r++) { let v = 0; for (let c = 0; c < meta.w; c++) { const i = r * meta.w + c; v = (v + (((b[i] << 8) | b[n + i]) << 16 >> 16)) << 16 >> 16; out[i] = v; } }
  return { w: meta.w, h: meta.h, z: out, min: meta.min, max: meta.max };
}
async function loadMoon() {
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'textures/moon_height.png'; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data, z = new Int16Array(c.width * c.height); let mn = 1e9, mx = -1e9;
  for (let i = 0; i < z.length; i++) { const m = Math.round(((d[4 * i] * 256 + d[4 * i + 1]) / 65535 * 21 - 10) * 1000); z[i] = m; if (m < mn) mn = m; if (m > mx) mx = m; }
  return { w: c.width, h: c.height, z, min: mn, max: mx };
}

export class ElevMap {
  // host: { getT: () => t, sats, tracker }
  constructor(host) {
    this.host = host; this.body = 'earth'; this.data = {}; this.base = {}; this.view = null; this.open_ = false; this.mouse = null; this.timer = null;
    const el = this.el = document.createElement('section');
    el.id = 'elevmap'; el.className = 'card'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Yükselti haritası (2B)');
    el.innerHTML = `<header><b>Yükselti haritası</b>
      <div class="seg" role="tablist"><button role="tab" data-b="earth" class="on">Dünya</button><button role="tab" data-b="moon">Ay</button></div>
      <label class="chk"><input type="checkbox" id="emShade" checked> Kabartma gölgesi</label>
      <button class="icon" id="emClose" aria-label="Kapat" title="Kapat (Esc)">✕</button></header>
      <div class="em-stage"><canvas id="emCanvas"></canvas><div id="emTip" class="em-tip" hidden></div><div id="emMsg" class="em-msg">Yükleniyor…</div></div>
      <footer><div id="emLegend" class="em-legend"></div><div id="emInfo" class="em-info"></div></footer>`;
    document.body.appendChild(el);
    this.cv = el.querySelector('#emCanvas'); this.ctx = this.cv.getContext('2d'); this.tip = el.querySelector('#emTip'); this.msg = el.querySelector('#emMsg');
    el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.b)));
    el.querySelector('#emClose').addEventListener('click', () => this.close());
    el.querySelector('#emShade').addEventListener('change', () => { this.base = {}; this.render(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open_) this.close(); });
    window.addEventListener('resize', () => { if (this.open_) this.resize(); });
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    let drag = null;
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('pointermove', (e) => {
      this.mouse = [e.offsetX, e.offsetY];
      if (drag) { this.view.cx = drag.cx - (e.clientX - drag.x) / this.view.s; this.view.cy = drag.cy - (e.clientY - drag.y) / this.view.s; this.clamp(); }
      this.render();
    });
    cv.addEventListener('pointerleave', () => { this.mouse = null; this.tip.hidden = true; this.render(); });
    cv.addEventListener('dblclick', () => { this.fit(); this.render(); });
  }
  toggle() { this.open_ ? this.close() : this.show(this.body); }
  async show(b) {
    this.body = b; this.open_ = true; this.el.hidden = false;
    this.el.querySelectorAll('[data-b]').forEach((x) => x.classList.toggle('on', x.dataset.b === b));
    this.legend();
    if (!this.data[b]) {
      this.msg.hidden = false; this.msg.textContent = 'Yükselti verisi yükleniyor…';
      try { this.data[b] = await (b === 'earth' ? loadEarth() : loadMoon()); } catch (e) { this.msg.textContent = 'Yükselti verisi yüklenemedi.'; return; }
    }
    if (this.body !== b) return;
    this.msg.hidden = true; this.resize(); this.info();
    clearInterval(this.timer); this.timer = setInterval(() => this.render(), 1000);
  }
  close() { this.open_ = false; this.el.hidden = true; clearInterval(this.timer); }
  resize() {
    const st = this.el.querySelector('.em-stage'), r = st.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.max(200, Math.round(r.width * dpr)); this.cv.height = Math.max(120, Math.round(r.height * dpr)); this.dpr = dpr;
    this.fit(); this.render();
  }
  fit() { const d = this.data[this.body]; if (!d) return; const s = Math.min(this.cv.width / d.w, this.cv.height / d.h); this.view = { s, cx: d.w / 2, cy: d.h / 2, s0: s }; }
  clamp() {
    const d = this.data[this.body], v = this.view, vw = this.cv.width / v.s, vh = this.cv.height / v.s;
    v.cx = vw >= d.w ? d.w / 2 : Math.min(d.w - vw / 2, Math.max(vw / 2, v.cx)); v.cy = vh >= d.h ? d.h / 2 : Math.min(d.h - vh / 2, Math.max(vh / 2, v.cy));
  }
  zoomAt(px, py, f) {
    const v = this.view, d = this.data[this.body]; if (!v || !d) return;
    px *= this.dpr; py *= this.dpr;
    const mx = v.cx + (px - this.cv.width / 2) / v.s, my = v.cy + (py - this.cv.height / 2) / v.s;
    v.s = Math.min(v.s0 * 40, Math.max(v.s0, v.s * f));
    v.cx = mx - (px - this.cv.width / 2) / v.s; v.cy = my - (py - this.cv.height / 2) / v.s; this.clamp(); this.render();
  }
  toMap(px, py) { const v = this.view; return [v.cx + (px * this.dpr - this.cv.width / 2) / v.s, v.cy + (py * this.dpr - this.cv.height / 2) / v.s]; }
  toScreen(lat, lon) {
    const d = this.data[this.body], v = this.view, mx = (lon + 180) / 360 * d.w, my = (90 - lat) / 180 * d.h;
    return [this.cv.width / 2 + (mx - v.cx) * v.s, this.cv.height / 2 + (my - v.cy) * v.s];
  }
  sample(mx, my) { const d = this.data[this.body]; const x = Math.min(d.w - 1, Math.max(0, Math.floor(mx))), y = Math.min(d.h - 1, Math.max(0, Math.floor(my))); return d.z[y * d.w + x]; }

  // renkli yükselti + gölgelendirme (bir kez üretilir)
  baseImage() {
    const key = this.body; if (this.base[key]) return this.base[key];
    const d = this.data[key], B = BODY[key], ramp = RAMPS[key], shade = this.el.querySelector('#emShade').checked;
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h; const g = c.getContext('2d'), im = g.createImageData(d.w, d.h), px = im.data;
    const L = (() => { const x = -0.55, y = -0.55, z = 0.65, n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; })();
    const dy = B.R * 1000 * Math.PI / d.h;
    for (let y = 0; y < d.h; y++) {
      const lat = (90 - (y + 0.5) / d.h * 180) * D, dx = Math.max(0.03, Math.cos(lat)) * B.R * 1000 * 2 * Math.PI / d.w;
      for (let x = 0; x < d.w; x++) {
        const i = y * d.w + x, h = d.z[i], col = colorAt(ramp, h);
        let k = 1;
        if (shade) {
          const xe = d.z[y * d.w + (x + 1) % d.w], xw = d.z[y * d.w + (x + d.w - 1) % d.w], ys = d.z[Math.min(d.h - 1, y + 1) * d.w + x], yn = d.z[Math.max(0, y - 1) * d.w + x];
          const ex = h < 0 ? B.exSea : B.ex, gx = ex * (xe - xw) / (2 * dx), gy = ex * (ys - yn) / (2 * dy), n = Math.hypot(gx, gy, 1);
          k = 0.55 + 0.75 * Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) / n);                     // y aşağı (güney) yönünde artar
        }
        px[4 * i] = Math.min(255, col[0] * k); px[4 * i + 1] = Math.min(255, col[1] * k); px[4 * i + 2] = Math.min(255, col[2] * k); px[4 * i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0); this.base[key] = c; return c;
  }
  legend() {
    const ramp = RAMPS[this.body], lo = ramp[0][0], hi = ramp[ramp.length - 1][0];
    const stops = ramp.map(([h, c]) => `rgb(${c.map(Math.round).join(',')}) ${((h - lo) / (hi - lo) * 100).toFixed(1)}%`).join(',');
    const z = ((0 - lo) / (hi - lo) * 100).toFixed(1);
    this.el.querySelector('#emLegend').innerHTML = `<div class="em-bar" style="background:linear-gradient(90deg,${stops})"></div><div class="em-ticks"><span>${fmtM(lo)}</span><span style="left:${z}%">0</span><span>${fmtM(hi)}</span></div>`;
  }
  info() {
    const d = this.data[this.body], B = BODY[this.body];
    this.el.querySelector('#emInfo').textContent = `${B.name}: en alçak ${fmtM(d.min)}, en yüksek ${fmtM(d.max)} (örneklenmiş ızgara) · ${B.src} · fare: ölç · tekerlek: yakınlaştır · sürükle: kaydır · çift tık: sıfırla`;
  }

  // yön -> (enlem, boylam) derece
  markers(t) {
    const out = [], ll = (v) => [Math.asin(Math.max(-1, Math.min(1, v[2]))) / D, Math.atan2(v[1], v[0]) / D];
    try {
      if (this.body === 'earth') {
        const M = E.earthIcrfToItrf(t), sun = E.mv(M, E.unit(E.sunPos(t))), moon = E.mv(M, E.unit(E.moonPos(t)));
        out.push({ ll: ll(sun), label: 'Güneş altı', c: '#ffd166', k: 'sun' }, { ll: ll(moon), label: 'Ay altı', c: '#d6dde8', k: 'moon' });
        const o = this.host.tracker && this.host.tracker.observer; if (o) out.push({ ll: [o.lat, o.lon], label: o.name || 'Gözlemci', c: '#5ee7ff', k: 'pin' });
        const s = this.host.sats; if (s && s.sel >= 0) { const dd = s.satDetails(s.sel, t); if (dd && dd.lat != null) out.push({ ll: [dd.lat, dd.lon], label: dd.name, c: '#ff6b9a', k: 'sat' }); }
      } else {
        const M = E.moonIcrfToMe(t), rm = E.moonPos(t), sun = E.mv(M, E.unit(E.sub(E.sunPos(t), rm))), earth = E.mv(M, E.unit(E.scale(rm, -1)));
        out.push({ ll: ll(sun), label: 'Güneş altı', c: '#ffd166', k: 'sun' }, { ll: ll(earth), label: 'Dünya altı', c: '#7fb3ff', k: 'earth' },
          { ll: [SITE_LAT / D, SITE_LON / D], label: 'Apollo 11 iniş yeri', c: '#5ee7ff', k: 'pin' });
      }
    } catch (e) { /* efemeris hazır değilse işaretsiz */ }
    return out;
  }
  render() {
    if (!this.open_ || !this.data[this.body] || !this.view) return;
    const g = this.ctx, v = this.view, d = this.data[this.body], W = this.cv.width, H = this.cv.height, dpr = this.dpr;
    g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = v.s < 3; g.imageSmoothingQuality = 'high';
    g.drawImage(this.baseImage(), W / 2 - v.cx * v.s, H / 2 - v.cy * v.s, d.w * v.s, d.h * v.s);
    // koordinat ızgarası
    g.lineWidth = dpr; g.strokeStyle = 'rgba(255,255,255,.16)'; g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `${10 * dpr}px "Roboto Mono", monospace`;
    const step = v.s / v.s0 > 6 ? 5 : v.s / v.s0 > 2.5 ? 15 : 30;
    for (let lon = -180; lon <= 180; lon += step) { const [x] = this.toScreen(0, lon); if (x < 0 || x > W) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); if (lon % (step * 2) === 0 || step <= 5) g.fillText(`${lon}°`, x + 3 * dpr, H - 4 * dpr); }
    for (let lat = -90 + step; lat < 90; lat += step) { const [, y] = this.toScreen(lat, 0); if (y < 0 || y > H) continue; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillText(`${lat}°`, 4 * dpr, y - 3 * dpr); }
    // işaretler
    const t = this.host.getT();
    for (const m of this.markers(t)) {
      const [x, y] = this.toScreen(m.ll[0], m.ll[1]); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      g.beginPath(); g.arc(x, y, 5 * dpr, 0, 7); g.fillStyle = m.c; g.fill(); g.lineWidth = 1.5 * dpr; g.strokeStyle = '#0b0e14'; g.stroke();
      if (m.k === 'sun') { g.strokeStyle = m.c; g.beginPath(); g.arc(x, y, 9 * dpr, 0, 7); g.stroke(); }
      g.font = `600 ${11 * dpr}px "Exo", sans-serif`; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3 * dpr; g.strokeText(m.label, x + 9 * dpr, y + 4 * dpr); g.fillText(m.label, x + 9 * dpr, y + 4 * dpr);
    }
    // fare okuması
    if (this.mouse) {
      const [mx, my] = this.toMap(this.mouse[0], this.mouse[1]);
      if (mx >= 0 && mx < d.w && my >= 0 && my < d.h) {
        const lon = mx / d.w * 360 - 180, lat = 90 - my / d.h * 180, h = this.sample(mx, my);
        this.tip.hidden = false; this.tip.innerHTML = `<b>${fmtM(h)}</b><span>${h < 0 && this.body === 'earth' ? 'deniz seviyesinin altı' : 'yükseklik'}</span><span>${fmtLat(lat)} ${fmtLon(lon)}</span>`;
        const r = this.cv.getBoundingClientRect(); this.tip.style.left = Math.min(this.mouse[0] + 14, r.width - 160) + 'px'; this.tip.style.top = Math.min(this.mouse[1] + 14, r.height - 70) + 'px';
      } else this.tip.hidden = true;
    }
  }
}
