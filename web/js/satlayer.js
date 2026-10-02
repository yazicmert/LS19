// Canlı uydular: Dünya çevresi (CelesTrak aktif uydular, SGP4, ayrı iş parçacığı) ve Ay çevresi (JPL Horizons vektörleri).
// Veriler yerel sunucunun (sunucu.py) ya da bulut işlevlerinin (api/, Vercel) vekilinden gelir; tarayıcı CelesTrak/Horizons'a doğrudan erişemez (CORS).
import * as THREE from 'three';
import * as E from './engine.js';
import * as S from '../lib/satellite.esm.js';
import { DATA_RAW, SUP_FILES } from './config.js';
import { SatModels, modelFor, MOON_MODELS, MODELS, showDist } from './satmodels.js';
import { SatInstancer } from './satinstancer.js';
import { familyOf, FAMILIES } from './satfamilies.js';
import { assessSat } from './impact.js';

export const SAT_GROUPS = [
  { name: 'Uzay istasyonları', color: 0xff5a5a, size: 5.0 },
  { name: 'Starlink', color: 0xcfe3ff, size: 1.6 },
  { name: 'OneWeb', color: 0x7fd6c2, size: 1.8 },
  { name: 'Seyrüsefer (GPS, GLONASS, Galileo, BeiDou)', color: 0xffc94d, size: 2.6 },
  { name: 'Yer sabit (GEO)', color: 0x8dff7a, size: 2.4 },
  { name: 'Diğer', color: 0x7fb3ff, size: 1.9 },
];
export const MOON_SATS = [
  { cmd: '-85', name: 'LRO' }, { cmd: '-155', name: 'Danuri (KPLO)' }, { cmd: '-152', name: 'Chandrayaan-2' },
  { cmd: 'THEMIS-B', name: 'ARTEMIS P1' }, { cmd: 'THEMIS-C', name: 'ARTEMIS P2' }, { cmd: '-1176', name: 'CAPSTONE (NRHO)' },
];
const VALID_DAYS = 30;                              // GP verisinin geçerli sayılacağı süre (± gün)

const VS = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 vel; attribute float grp;
  uniform vec3 eye, sunDir; uniform float dt, mu, px, obsView, nearHide, mask[6]; uniform float sizes[6]; uniform vec3 colors[6];
  varying vec3 vCol; varying float vOn; varying float vLit;
  void main() {
    int g = int(grp + 0.5);
    float on = 0.0; vec3 col = vec3(1.0); float sz = 2.0;
    for (int i = 0; i < 6; i++) if (i == g) { on = mask[i]; col = colors[i]; sz = sizes[i]; }
    vec3 p = position; float r = length(p);
    p += vel * dt - p * (mu / (r * r * r)) * (0.5 * dt * dt);
    vec4 mv = modelViewMatrix * vec4(p - eye, 1.0);
    gl_Position = projectionMatrix * mv;
    // yakındaki uydular daha büyük: uzaktan kabuk gibi, yakından tek tek seçilebilir noktalar
    float d = length(mv.xyz);
    // yerden bakışta yıldız gibi sabit boy; Dünya'nın gölgesindekiler soluk (gözle görülmez)
    gl_PointSize = obsView > 0.5 ? max(1.6, sz * 0.75) * px : sz * px * clamp(pow(18000.0 / max(d, 1.0), 0.65), 1.0, 7.0);
    float a = dot(p, sunDir); vLit = (a < 0.0 && length(p - a * sunDir) < 6378.0) ? 0.22 : 1.0; if (obsView < 0.5) vLit = 1.0;
    vCol = col; vOn = (on > 0.5 && r == r && d > nearHide) ? 1.0 : 0.0;   // 3B modeli çizilen uydunun (ve ona kenetli araçların) noktası gizli
    if (vOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
  }`;
const FS = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vCol; varying float vOn; varying float vLit;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25 || vOn < 0.5) discard;
    gl_FragColor = vec4(vCol * (1.25 - 1.6 * d) * vLit, (1.0 - smoothstep(0.14, 0.25, d)) * (0.35 + 0.65 * vLit));
  }`;

// CelesTrak'tan doğrudan (kullanıcının tarayıcısından). CelesTrak kuralı: aynı veri 2 saatten sık indirilmez ->
// yanıt tarayıcının Cache Storage'ında 2 saat saklanır; ağ hatasında eski kopya kullanılır.
const GP_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json';
async function fetchOmm(url, kaynak = null) {
  const r = await fetch(url);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).hata || ('HTTP ' + r.status));
  const omm = await r.json();
  if (!Array.isArray(omm) || !omm.length) throw new Error('boş yanıt');
  return { omm, kaynak: kaynak || decodeURIComponent(r.headers.get('X-LS19-Kaynak') || 'CelesTrak'), yas: +(r.headers.get('X-LS19-Yas') || 0) };
}
async function celestrakDirect() {
  let cache = null, hit = null;
  try { cache = await caches.open('ls19-celestrak'); hit = await cache.match(GP_URL); } catch (e) { cache = null; }
  const tHit = hit ? +hit.headers.get('X-LS19-T') : 0;
  if (hit && Date.now() - tHit < 2 * 3600e3) return { omm: await hit.json(), kaynak: 'CelesTrak (tarayıcı önbelleği)', yas: (Date.now() - tHit) / 1000 };
  try {
    const r = await fetch(GP_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text(), omm = JSON.parse(txt);
    if (!Array.isArray(omm) || !omm.length) throw new Error('beklenmeyen yanıt');
    if (cache) try { await cache.put(GP_URL, new Response(txt, { headers: { 'Content-Type': 'application/json', 'X-LS19-T': String(Date.now()) } })); } catch (e) { /* önbellek isteğe bağlı */ }
    return { omm, kaynak: 'CelesTrak (doğrudan)', yas: 0 };
  } catch (e) {
    if (hit) return { omm: await hit.json(), kaynak: 'CelesTrak (eski tarayıcı önbelleği)', yas: (Date.now() - tHit) / 1000 };
    throw e;
  }
}

export class SatLayer {
  constructor(scene, labelsEl, eoData) {
    this.scene = scene; this.labelsEl = labelsEl; this.eo = eoData;
    this.n = 0; this.tProp = null; this.pending = false; this.lastReq = 0; this.reqId = 0; this.enabled = true; this.moonEnabled = true;
    this.mask = [1, 1, 1, 1, 1, 1]; this.info = { status: 'bekleniyor' }; this.moonSats = []; this.sel = -1;
    this.worker = new Worker(new URL('./sats.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onMsg(e.data);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { eye: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, obsView: { value: 0 }, nearHide: { value: 0 }, dt: { value: 0 }, mu: { value: E.MU_E }, px: { value: window.devicePixelRatio || 1 },
        mask: { value: this.mask.slice() }, sizes: { value: SAT_GROUPS.map((g) => g.size) }, colors: { value: SAT_GROUPS.map((g) => new THREE.Color(g.color)) } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.geo = new THREE.BufferGeometry();
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4; this.points.visible = false;
    scene.add(this.points);
    // seçili uydu: işaret + etiket + yörünge çizgisi
    this.selLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(362 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, toneMapped: false }));
    this.selLine.frustumCulled = false; this.selLine.visible = false; scene.add(this.selLine);
    this.selLabel = this.mkLabel('lbl lbl-sat');
    this.selRing = this.mkSprite(0xffe08a); this.selRing.scale.set(0.02, 0.02, 1); this.selRing.visible = false;
    this.inst = new SatInstancer(scene); this.realIdx = new Map();
    this.models = new SatModels(scene); this.modelEntries = []; this.moonModelEntries = [];
    this.onChange = null;
  }
  mkLabel(cls) { const d = document.createElement('div'); d.className = cls; d.style.display = 'none'; this.labelsEl.appendChild(d); return d; }

  // ---------------------------------------------------------------- Dünya uyduları
  async load(v) {
    if (!this.n) { this.info = { status: 'CelesTrak verisi alınıyor…' }; this.changed(); }
    const errs = [];
    let d = null;
    // 1) sunucu vekili (yerel sunucu.py ya da bulut api/) · 2) GitHub kopyası · 3) tarayıcıdan doğrudan CelesTrak
    try { d = await fetchOmm('api/gp?group=active' + (v != null ? '&v=' + v : '')); } catch (e) { errs.push('vekil: ' + e.message); }
    if (!d) try { d = await fetchOmm(DATA_RAW + 'gp_active.json?v=' + (v ?? ''), 'CelesTrak (GitHub kopyası)'); } catch (e) { errs.push('kopya: ' + e.message); }
    if (!d) try { d = await celestrakDirect(); } catch (e) { errs.push('doğrudan: ' + e.message); }
    if (!d) { this.info = { status: 'Uydu verisi alınamadı (' + errs.join(' · ') + ')' }; this.changed(); return; }
    this.src = { kaynak: d.kaynak, yas: d.yas, t: Date.now() };
    this.gp = d.omm; this.gpMap = null; this.sup = null;
    this.apply(this.gp);
    this.loadSup(v);                                              // operatör verisi arkadan gelir
  }
  // CelesTrak Supplemental GP: operatörlerin kendi yörünge çözümleri (ISS, Starlink, OneWeb, GPS…), GP'den daha doğru
  async loadSup(v) {
    const got = {}, stats = {};
    await Promise.all(SUP_FILES.map(async (f) => {
      let d = null;
      try { d = await fetchOmm(`api/supgp?file=${f}` + (v != null ? '&v=' + v : '')); } catch (e) { /* kopyaya düş */ }
      if (!d) try { d = await fetchOmm(`${DATA_RAW}sup_${f}.json?v=${v ?? ''}`, 'SupGP (GitHub kopyası)'); } catch (e) { stats[f] = 0; return; }
      got[f] = d.omm; stats[f] = d.omm.length;
    }));
    if (!Object.keys(got).length) { this.supInfo = { n: 0, files: stats }; this.changed(); return; }
    // her NORAD için şimdiye en yakın (tercihen geçmişteki) çağlı kayıt
    const now = Date.now(), best = new Map();
    for (const [f, arr] of Object.entries(got)) for (const o of arr) {
      const id = +o.NORAD_CAT_ID, ep = Date.parse(o.EPOCH + 'Z'); if (!id || !Number.isFinite(ep)) continue;
      const score = ep <= now + 3600e3 ? now - ep : 1e15 + ep - now, cur = best.get(id);
      if (!cur || score < cur.score) best.set(id, { o, f, score });
    }
    let n = 0;
    const merged = this.gp.map((o) => {
      const b = best.get(+o.NORAD_CAT_ID); if (!b) return o;
      n++; return { ...b.o, OBJECT_NAME: o.OBJECT_NAME, OBJECT_ID: o.OBJECT_ID || b.o.OBJECT_ID, _sup: { file: b.f, src: b.o.DATA_SOURCE || '', rms: b.o.RMS != null ? +b.o.RMS : null } };
    });
    this.sup = got; this.supInfo = { n, files: stats };
    const sel = this.sel >= 0 ? this.ids[this.sel] : null;
    this.apply(merged, sel);
  }
  apply(omm, keepId = null) {
    this.omm = omm; this.byId = new Map(omm.map((o) => [+o.NORAD_CAT_ID, o])); this.recCache = new Map();
    this.pendingSel = keepId; if (this.sel >= 0 && keepId == null) this.select(-1);
    this.worker.postMessage({ cmd: 'load', omm, eo: this.eo });
    if (this.onData) this.onData();
  }
  // NORAD -> satrec (önbellekli, ana iş parçacığında: takip, geçiş tahmini, yer izi)
  satrec(id) {
    id = +id; if (!this.byId) return null;
    let r = this.recCache.get(id); if (r !== undefined) return r;
    const o = this.byId.get(id); r = null;
    try { r = o ? S.json2satrec(o) : null; if (r && r.error) r = null; } catch (e) { r = null; }
    this.recCache.set(id, r); return r;
  }
  familySizeM(id) { const i = this.indexOf(id); return i >= 0 && this.famKeys ? this.inst.sizeOf(this.famKeys[i]) : 0; }
  modelOf(id) { const o = this.recordOf(id); return modelFor(id, o ? o.OBJECT_NAME : ''); }
  // model yerleşimi için konum: Dünya uyduları SGP4 (selPos ile aynı dönüşüm), Ay uyduları Horizons + Ay konumu
  modelPos(e, t) {
    if (e.m) { const r = this.moonEnabled ? this.moonState(e.m, t) : null; if (!r) return null; const rm = E.moonPos(t); return [rm[0] + r[0], rm[1] + r[1], rm[2] + r[2]]; }
    const rec = this.satrec(e.id); if (!rec) return null;
    let pv = null; try { pv = S.propagate(rec, new Date(E.utcMsFromT(t))); } catch (err) { return null; }
    if (!pv || !pv.position || !Number.isFinite(pv.position.x)) return null;
    return E.mtv(E.precession(t), [pv.position.x, pv.position.y, pv.position.z]);
  }
  // sürüklenme (B*) için standart GP kaydı: operatör (SupGP) çözümleri yörünge konumu için daha iyi ama B* değerleri bozunma için güvenilir değil (ör. ISS ~10×)
  gpRecord(id) { if (!this.gp) return this.recordOf(id); if (!this.gpMap) this.gpMap = new Map(this.gp.map((o) => [+o.NORAD_CAT_ID, o])); return this.gpMap.get(+id) || this.recordOf(id); }
  recordOf(id) { return this.byId ? this.byId.get(+id) || null : null; }
  indexOf(id) { if (!this.ids) return -1; if (!this.idIndex || this.idIndex.n !== this.n) { this.idIndex = new Map(this.ids.map((x, i) => [+x, i])); this.idIndex.n = this.n; } const i = this.idIndex.get(+id); return i == null ? -1 : i; }
  onMsg(d) {
    if (d.type === 'loaded') {
      this.n = d.n; this.groups = d.groups; this.names = d.names; this.ids = d.ids; this.epochMs = d.epochMs;
      this.counts = SAT_GROUPS.map((_, i) => d.groups.reduce((s, g) => s + (g === i), 0));
      this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
      this.geo.setAttribute('vel', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
      this.geo.setAttribute('grp', new THREE.BufferAttribute(Float32Array.from(d.groups), 1));
      this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);     // NaN (çökmüş) kayıtlar sıralamayı bozmasın
      this.info = { status: 'hazır' }; this.tProp = null; this.changed();
      this.satrecs = null; this.idIndex = null;
      // gerçek 3B modeli olan uydular (yakınlaşınca çizilir)
      this.modelEntries = [];
      for (let i = 0; i < this.n; i++) { const m = modelFor(this.ids[i], this.names[i]); if (m) this.modelEntries.push({ uid: 'e' + this.ids[i], id: +this.ids[i], key: m.key, name: this.names[i] }); }
      this.models.setEntries([...this.modelEntries, ...this.moonModelEntries]);
      // tüm uydular için model ailesi (gerçek modeli olanlar yakında SatModels'e bırakılır)
      this.famKeys = new Array(this.n); this.realIdx = new Map();
      const entryById = new Map(this.modelEntries.map((e) => [e.id, e]));
      for (let i = 0; i < this.n; i++) {
        const o = this.recordOf(this.ids[i]); this.famKeys[i] = o ? familyOf(o) : 'bus';
        const e = entryById.get(+this.ids[i]); if (e) this.realIdx.set(i, { entry: e, show: showDist(e.key) });
      }
      this.inst.setFamilies(this.famKeys);
      if (this.pendingSel != null) { const i = this.indexOf(this.pendingSel); this.pendingSel = null; if (i >= 0) this.select(i); }
      if (this.onData) this.onData();
    } else if (d.type === 'pos' && d.id === this.reqId) {
      this.geo.attributes.position.array.set(d.pos); this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.vel.array.set(d.vel); this.geo.attributes.vel.needsUpdate = true;
      this.tProp = d.t; this.pending = false;
    }
  }
  changed() { if (this.onChange) this.onChange(); }
  validAt(t) { return this.n > 0 && Math.abs(E.utcMsFromT(t) - this.epochMs) < VALID_DAYS * 86400000; }
  setMask(i, on) { this.mask[i] = on ? 1 : 0; this.mat.uniforms.mask.value = this.mask.slice(); }

  // ---------------------------------------------------------------- Ay uyduları (Horizons)
  async loadMoon(t0, t1) {
    const iso = (t) => new Date(E.utcMsFromT(t)).toISOString().slice(0, 16).replace('T', ' ');
    const span = t1 - t0, step = span > 20 * 86400 ? '20m' : '10m';
    this.moonKey = `${Math.round(t0)}|${Math.round(t1)}`;
    const key = this.moonKey;
    for (const m of this.moonSats) { if (m.label) m.label.remove(); if (m.sprite) this.scene.remove(m.sprite); if (m.trail) this.scene.remove(m.trail); }
    this.moonSats = MOON_SATS.map((s) => ({ ...s, status: 'alınıyor…', rows: null }));
    this.moonModelEntries = []; this.models.setEntries(this.modelEntries);
    this.changed();
    for (const m of this.moonSats) await (async () => {
      try {
        const q = new URLSearchParams({ cmd: m.cmd, start: iso(t0), stop: iso(t1), step });
        const r = await fetch('api/horizons?' + q.toString()), d = await r.json();
        if (key !== this.moonKey) return;
        if (!r.ok) { m.status = 'veri alınamadı (bağlantı)'; return; }
        if (d.hata || !d.satirlar || d.satirlar.length < 2) { m.status = 'bu tarihlerde veri yok'; return; }
        m.rows = d.satirlar.map((row) => ({ t: E.tFromJdTdb(row[0]), r: row.slice(1, 4), v: row.slice(4, 7) }));
        m.status = 'hazır';
        m.sprite = this.mkSprite(0xff9ee8); m.label = this.mkLabel('lbl lbl-msat'); m.label.textContent = m.name;
        m.trail = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3)),
          new THREE.LineBasicMaterial({ color: 0xff9ee8, transparent: true, opacity: 0.55, toneMapped: false }));
        m.trail.frustumCulled = false; this.scene.add(m.trail);
        if (MOON_MODELS[m.name]) { this.moonModelEntries.push({ uid: 'm' + m.name, m, key: MOON_MODELS[m.name], name: m.name, center: (tt) => E.moonPos(tt) }); this.models.setEntries([...this.modelEntries, ...this.moonModelEntries]); }
      } catch (err) { m.status = 'veri alınamadı'; }
      this.changed();
    })();
  }
  mkSprite(color) {
    if (!this.ringTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke(); this.ringTex = new THREE.CanvasTexture(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringTex, color, sizeAttenuation: false, depthTest: false, toneMapped: false }));
    s.scale.set(0.013, 0.013, 1); s.renderOrder = 11; this.scene.add(s); return s;
  }
  moonState(m, t) {                                  // Hermite ara değer (Ay merkezli)
    const R = m.rows; if (!R || t < R[0].t || t > R[R.length - 1].t) return null;
    let lo = 0, hi = R.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (R[mid].t <= t) lo = mid; else hi = mid; }
    const a = R[lo], b = R[hi], h = b.t - a.t, s = (t - a.t) / h;
    const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
    return [0, 1, 2].map((k) => h00 * a.r[k] + h10 * h * a.v[k] + h01 * b.r[k] + h11 * h * b.v[k]);
  }

  // ---------------------------------------------------------------- seçim ve arama
  search(q) {
    if (!this.names || !q) return [];
    const s = q.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I'), out = [];
    for (let i = 0; i < this.n && out.length < 12; i++) if (this.names[i].toUpperCase().includes(s) || String(this.ids[i]) === q.trim()) out.push(i);
    return out;
  }
  select(i) {
    this.sel = i; this.selLine.visible = false;
    if (i < 0 || !this.omm) { this.selLabel.style.display = 'none'; this.changed(); return; }
    const o = this.recordOf(this.ids[i]);
    this.selRec = this.satrec(this.ids[i]); this.selOmm = o; this.selOrbitT = null;
    this.selLabel.textContent = this.names[i]; this.changed();
  }
  selInfo(t) {
    if (this.sel < 0 || !this.selRec) return null;
    const pv = S.propagate(this.selRec, new Date(E.utcMsFromT(t))); if (!pv || !pv.position) return null;
    const p = pv.position, v = pv.velocity, r = Math.hypot(p.x, p.y, p.z);
    const o = this.selOmm, per = 1440 / o.MEAN_MOTION;
    return { name: this.names[this.sel], id: this.ids[this.sel], alt: r - E.R_E, v: Math.hypot(v.x, v.y, v.z), periodMin: per, inc: +o.INCLINATION, ecc: +o.ECCENTRICITY, epoch: o.EPOCH };
  }
  selPos(t) {                                         // ICRF (TEME≈ICRF, çizim için yeterli)
    const pv = S.propagate(this.selRec, new Date(E.utcMsFromT(t))); if (!pv || !pv.position) return null;
    const M = E.precession(t);                         // TEME -> ICRF yaklaşık: NPBᵀ (ekinoks denklemi ihmal)
    const p = [pv.position.x, pv.position.y, pv.position.z];
    return E.mtv(M, p);
  }

  // ---------------------------------------------------------------- fareyle tıklama: ekranda en yakın (Dünya'nın arkasında kalmayan) uydu
  pick(mx, my, camera, eye, canvas, t, radiusPx = 11) {
    const out = [];
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const M = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), e = M.elements;
    const scr = (rx, ry, rz) => { const cw = e[3] * rx + e[7] * ry + e[11] * rz + e[15]; if (cw <= 0) return null;
      return [((e[0] * rx + e[4] * ry + e[8] * rz + e[12]) / cw + 1) / 2 * w, (1 - (e[1] * rx + e[5] * ry + e[9] * rz + e[13]) / cw) / 2 * h]; };
    const C = [-eye[0], -eye[1], -eye[2]], C2 = C[0] * C[0] + C[1] * C[1] + C[2] * C[2], R2 = (E.R_E + 30) ** 2;
    const hidden = (rx, ry, rz) => {                    // kameradan uyduya giden doğru Dünya'yı kesiyor mu
      const L = Math.hypot(rx, ry, rz), s0 = (C[0] * rx + C[1] * ry + C[2] * rz) / L, d2 = C2 - s0 * s0;
      return s0 > 0 && d2 < R2 && s0 - Math.sqrt(R2 - d2) < L;
    };
    if (this.points.visible && this.tProp !== null) {
      const P = this.geo.attributes.position.array, V = this.geo.attributes.vel.array, G = this.groups, dt = t - this.tProp;
      for (let i = 0; i < this.n; i++) {
        if (!this.mask[G[i]]) continue;
        let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (x !== x) continue;
        const r = Math.hypot(x, y, z), k = -E.MU_E / (r * r * r) * 0.5 * dt * dt;
        x += V[3 * i] * dt + x * k - eye[0]; y += V[3 * i + 1] * dt + y * k - eye[1]; z += V[3 * i + 2] * dt + z * k - eye[2];
        const q = scr(x, y, z); if (!q) continue;
        const d2 = (q[0] - mx) ** 2 + (q[1] - my) ** 2; if (d2 > radiusPx * radiusPx) continue;
        if (hidden(x, y, z)) continue;
        out.push({ kind: 'sat', i, d2, dist: Math.hypot(x, y, z) });
      }
    }
    for (const m of this.moonSats) {
      if (!m.sprite || !m.sprite.visible || !m.geo) continue;
      const q = scr(m.geo[0] - eye[0], m.geo[1] - eye[1], m.geo[2] - eye[2]); if (!q) continue;
      const d2 = (q[0] - mx) ** 2 + (q[1] - my) ** 2; if (d2 <= 196) out.push({ kind: 'msat', m, d2, dist: 0 });
    }
    out.sort((a, b) => a.d2 - b.d2 || a.dist - b.dist);
    return out[0] || null;
  }
  // tıklanan uydunun ayrıntıları (SGP4, o anki durum + ortalama öğeler)
  satDetails(i, t) {
    const o = this.recordOf(this.ids[i]); if (!o) return null;
    const sr = this.satrec(this.ids[i]); if (!sr) return null;
    const pv = S.propagate(sr, new Date(E.utcMsFromT(t)));
    const n = (+o.MEAN_MOTION) * 2 * Math.PI / 86400, a = Math.cbrt(E.MU_E / (n * n)), ecc = +o.ECCENTRICITY;
    const out = { name: o.OBJECT_NAME, norad: o.NORAD_CAT_ID, cospar: o.OBJECT_ID, group: SAT_GROUPS[this.groups[i]].name,
      periodMin: 1440 / o.MEAN_MOTION, inc: +o.INCLINATION, ecc, perigee: a * (1 - ecc) - E.R_E, apogee: a * (1 + ecc) - E.R_E,
      epochAgeDays: (E.utcMsFromT(t) - Date.parse(o.EPOCH + 'Z')) / 86400000, launchYear: (o.OBJECT_ID || '').slice(0, 4),
      decay: assessSat(this.gpRecord(this.ids[i]) || o, Date.now(), false), model: modelFor(o.NORAD_CAT_ID, o.OBJECT_NAME), family: FAMILIES[this.famKeys && this.famKeys[i]] || null,
      source: o._sup ? `CelesTrak SupGP (${o._sup.src || o._sup.file}${o._sup.rms != null ? `, RMS ${o._sup.rms} km` : ''})` : 'CelesTrak GP' };
    if (pv && pv.position) {
      const M = E.precession(t), p = E.mtv(M, [pv.position.x, pv.position.y, pv.position.z]);
      const r = Math.hypot(...p), itrf = E.mv(E.earthIcrfToItrf(t), p);
      out.alt = r - E.R_E; out.speed = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
      out.lat = Math.asin(itrf[2] / r) * 180 / Math.PI; out.lon = Math.atan2(itrf[1], itrf[0]) * 180 / Math.PI;
      // Dünya'nın gölgesinde mi (silindirik gölge)
      const sd = E.unit(E.sunPos(t)), along = E.dot(p, sd), perp = Math.hypot(...E.sub(p, E.scale(sd, along)));
      out.sunlit = !(along < 0 && perp < E.R_E);
      out.pos = p;
    }
    out.orbitType = out.perigee > 30000 ? (Math.abs(out.periodMin - 1436) < 30 ? 'yer eşzamanlı (GEO)' : 'yüksek') : ecc > 0.25 ? 'yüksek eliptik (HEO)' : a - E.R_E > 2000 ? 'orta (MEO)' : 'alçak (LEO)';
    return out;
  }
  moonSatDetails(m, t) {
    const r = this.moonState(m, t), r2 = this.moonState(m, t + 1); if (!r || !r2) return null;
    const v = Math.hypot(r2[0] - r[0], r2[1] - r[1], r2[2] - r[2]), rn = Math.hypot(...r), a = 1 / (2 / rn - v * v / E.MU_M);
    return { name: m.name, model: MOON_MODELS[m.name] ? MODELS[MOON_MODELS[m.name]] : null, alt: rn - E.R_M, speed: v, periodMin: a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / E.MU_M) / 60 : NaN, rows: m.rows.length };
  }

  // ---------------------------------------------------------------- her kare
  update(t, eye, camera, canvas, showSats, showMoon) {
    const vis = this.enabled && showSats && this.n > 0 && this.validAt(t);
    this.points.visible = vis;
    if (vis) {
      const now = performance.now();
      if (!this.pending && (this.tProp === null || (Math.abs(t - this.tProp) > 1.0 && now - this.lastReq > 120) || Math.abs(t - this.tProp) > 600)) {
        this.pending = true; this.lastReq = now; this.reqId++;
        this.worker.postMessage({ cmd: 'prop', id: this.reqId, t, utcMs: E.utcMsFromT(t), jdTT: E.jdTdb(t) });
      }
      if (this.tProp !== null) { this.mat.uniforms.dt.value = t - this.tProp; this.mat.uniforms.eye.value.set(eye[0], eye[1], eye[2]);
        const sd = E.unit(E.sunPos(t)); this.mat.uniforms.sunDir.value.set(sd[0], sd[1], sd[2]); this.mat.uniforms.obsView.value = this.obsView ? 1 : 0; }
      else this.points.visible = false;
    }
    // seçili uydu
    const place = (d, p, dy = 12) => {
      const v = new THREE.Vector3(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.style.display = 'none'; return; }
      d.style.display = 'block'; d.style.transform = `translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight - dy}px) translate(-50%, -100%)`;
    };
    if (this.sel >= 0 && this.selRec && vis) {
      const p = this.selPos(t);
      if (p) {
        if (this.suppressLabel && this.suppressLabel(+this.ids[this.sel])) this.selLabel.style.display = 'none'; else place(this.selLabel, p);
        if (this.selOrbitT === null || Math.abs(t - this.selOrbitT) > 60) {
          this.selOrbitT = t; const per = 1440 / this.selOmm.MEAN_MOTION * 60, a = this.selLine.geometry.attributes.position.array;
          this.selOrbitPts = []; for (let k = 0; k <= 360; k++) { const q = this.selPos(t + (k / 360 - 0.5) * per); if (q) this.selOrbitPts.push(q); }
        }
        const a = this.selLine.geometry.attributes.position.array, P = this.selOrbitPts;
        for (let k = 0; k < P.length; k++) { a[k * 3] = P[k][0] - eye[0]; a[k * 3 + 1] = P[k][1] - eye[1]; a[k * 3 + 2] = P[k][2] - eye[2]; }
        this.selLine.geometry.setDrawRange(0, P.length); this.selLine.geometry.attributes.position.needsUpdate = true; this.selLine.visible = true;
        this.selRing.visible = true; this.selRing.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
        this.selRing.visible = !this.models.active('e' + this.ids[this.sel]);
      } else { this.selLabel.style.display = 'none'; this.selLine.visible = false; this.selRing.visible = false; }
    } else { this.selLabel.style.display = 'none'; this.selLine.visible = false; this.selRing.visible = false; }
    // her uydunun ailesinin modeli (InstancedMesh): yakın ~1500 uydu model, ötesi nokta · yerden bakışta kapalı
    const instOn = vis && !this.obsView && this.tProp !== null;
    const ga = this.geo.attributes;
    this.inst.update(ga.position ? ga.position.array : null, ga.vel ? ga.vel.array : null, t - this.tProp, eye, camera, canvas.clientHeight, this.mask, this.groups, E.MU_E,
      instOn, this.realIdx, (uid) => this.models.active(uid), (i) => this.modelPos({ id: +this.ids[i] }, t));
    // gerçek 3B modeller: yalnız kamera bir modelli uyduya yaklaşınca yüklenir/çizilir (aileler hazır değilse tüm liste)
    this.models.setEntries([...(this.inst.ready ? this.inst.realNear : this.modelEntries), ...this.moonModelEntries]);
    if (vis || (showMoon && this.moonEnabled)) this.models.update(t, eye, (e, tt) => (e.m ? (showMoon ? this.modelPos(e, tt) : null) : (vis ? this.modelPos(e, tt) : null)), E.unit(E.sunPos(t)));
    else this.models.hideAll();
    this.mat.uniforms.nearHide.value = Math.max(this.models.hideRadius || 0, instOn ? this.inst.hideRadius : 0);
    // Ay uyduları
    const rm = E.moonPos(t);
    for (const m of this.moonSats) {
      if (!m.sprite) continue;
      const rs = showMoon && this.moonEnabled ? this.moonState(m, t) : null;
      m.sprite.visible = m.trail.visible = !!rs; m.cur = rs;
      if (!rs) { m.label.style.display = 'none'; continue; }
      const p = [rm[0] + rs[0], rm[1] + rs[1], rm[2] + rs[2]];
      m.sprite.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      m.geo = p;
      place(m.label, p, 10);
      const dm = Math.hypot(rm[0] - eye[0], rm[1] - eye[1], rm[2] - eye[2]);
      if (Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) < 40 || dm > 60000) m.label.style.display = 'none';   // uzaktan etiketler üst üste biner
      // son ~2 saatlik iz (Ay'a göre)
      const a = m.trail.geometry.attributes.position.array; let k = 0;
      for (let j = 0; j < 200; j++) { const q = this.moonState(m, t - (199 - j) * 45); if (!q) continue; a[k * 3] = rm[0] + q[0] - eye[0]; a[k * 3 + 1] = rm[1] + q[1] - eye[1]; a[k * 3 + 2] = rm[2] + q[2] - eye[2]; k++; }
      m.trail.geometry.setDrawRange(0, k); m.trail.geometry.attributes.position.needsUpdate = true;
    }
  }
}
