// Canlı asteroitler: JPL Small-Body Database (Dünya'ya yakın tüm asteroitler + büyük ana kuşak ve Jüpiter Truvalıları).
// Konumlar ayrı iş parçacığında (astwork.js) Kepler çözümüyle hesaplanır, GPU'da kısa süre ileri taşınır.
// Tıklanan asteroidin ayrıntıları (fiziksel özellikler, keşif, Dünya yakın geçişleri, Sentry çarpma riski) istek üzerine alınır.
import * as THREE from 'three';
import * as E from './engine.js';
import { keplerHelio, etFromJd, AU, helioElements } from './deflect.js';

export const AST_GROUPS = [
  { name: 'Sentry risk listesi', color: 0xff4fd8, size: 2.0 },
  { name: 'Potansiyel tehlikeli (PHA)', color: 0xff6a3d, size: 2.4 },
  { name: "Dünya'ya yakın (NEO)", color: 0xffd24a, size: 1.7 },
  { name: 'Jüpiter Truvalıları', color: 0x8be37a, size: 1.8 },
  { name: 'Ana kuşak (büyük)', color: 0x9fb4d9, size: 1.8 },
];
export const CLASS_TR = { APO: 'Apollo (Dünya yörüngesini keser)', AMO: "Amor (Dünya'ya yaklaşır, kesmez)", ATE: 'Aten (Dünya yörüngesini keser)',
  IEO: 'Atira (Dünya yörüngesinin içinde)', MBA: 'Ana kuşak', IMB: 'İç ana kuşak', OMB: 'Dış ana kuşak', MCA: 'Mars kesen', TJN: 'Jüpiter Truvalısı',
  CEN: 'Kentaur', TNO: 'Neptün ötesi', AST: 'Asteroit' };
const GM_SUN = 132712440041.279419;
const etOfT = (t) => t + (E.jdTdb(0) - 2451545.0) * 86400;

const VS = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec3 vel; attribute float grp; attribute float sz;
  uniform vec3 off, sunGeo; uniform float dt, mu, px, nearLim, mask[5]; uniform float sizes[5]; uniform vec3 colors[5];
  varying vec3 vCol; varying float vOn;
  void main() {
    int g = int(grp + 0.5);
    float on = 0.0; vec3 col = vec3(1.0); float s = 2.0;
    for (int i = 0; i < 5; i++) if (i == g) { on = mask[i]; col = colors[i]; s = sizes[i]; }
    vec3 p = position; float r = length(p);
    p += vel * dt - p * (mu / (r * r * r)) * (0.5 * dt * dt);
    vec3 geo = sunGeo + p;
    vec4 mv = modelViewMatrix * vec4(off + p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = length(mv.xyz);
    gl_PointSize = s * sz * px * clamp(pow(3.0e7 / max(d, 1.0), 0.45), 1.0, 6.0);
    vCol = col; vOn = (on > 0.5 && r == r && length(geo) < nearLim) ? 1.0 : 0.0;
    if (vOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #include <logdepthbuf_vertex>
  }`;
const FS = `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vCol; varying float vOn;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
    if (d > 0.25 || vOn < 0.5) discard;
    gl_FragColor = vec4(vCol * (1.2 - 1.4 * d), 1.0 - smoothstep(0.12, 0.25, d));
  }`;
// yakın plan kaya modeli (birim yarıçap; ölçek = yarıçap km)
const VS_ROCK = `#include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN;
  void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
  }`;
const FS_ROCK = `#include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 color, sunDir; varying vec3 vN;
  void main() {
    #include <logdepthbuf_fragment>
    float l = max(dot(normalize(vN), sunDir), 0.0);
    gl_FragColor = vec4(color * (0.07 + 1.1 * pow(l, 0.9)), 1.0);
  }`;

export class AsteroidLayer {
  constructor(scene, labelsEl) {
    this.scene = scene; this.labelsEl = labelsEl;
    this.sets = {}; this.src = {}; this.n = 0; this.sentry = new Map(); this.enabled = true; this.mask = [1, 1, 1, 1, 1];
    this.info = { status: 'bekleniyor' }; this.sel = -1; this.detail = new Map(); this.etProp = null; this.pending = false; this.reqId = 0; this.lastReq = 0;
    this.worker = new Worker(new URL('./astwork.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onMsg(e.data);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { off: { value: new THREE.Vector3() }, sunGeo: { value: new THREE.Vector3() }, dt: { value: 0 }, mu: { value: GM_SUN },
        px: { value: window.devicePixelRatio || 1 }, nearLim: { value: 1e12 }, mask: { value: this.mask.slice() },
        sizes: { value: AST_GROUPS.map((g) => g.size) }, colors: { value: AST_GROUPS.map((g) => new THREE.Color(g.color)) } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.geo = new THREE.BufferGeometry();
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 3; this.points.visible = false;
    scene.add(this.points);
    this.selLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(1025 * 3), 3)),
      new THREE.LineBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.85, toneMapped: false }));
    this.selLine.frustumCulled = false; this.selLine.visible = false; scene.add(this.selLine);
    this.selLabel = document.createElement('div'); this.selLabel.className = 'lbl lbl-ast'; this.selLabel.style.display = 'none'; labelsEl.appendChild(this.selLabel);
    this.bigLabels = [];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 22, 0, 7); g.stroke();
    this.selRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xffb36b, sizeAttenuation: false, depthTest: false, toneMapped: false }));
    this.selRing.scale.set(0.02, 0.02, 1); this.selRing.renderOrder = 11; this.selRing.visible = false; scene.add(this.selRing);
    this.rock = new THREE.Mesh(rockGeometry(), new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0x8d8478) }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: VS_ROCK, fragmentShader: FS_ROCK }));
    this.rock.visible = false; scene.add(this.rock);
    this.onChange = null;
  }
  changed() { if (this.onChange) this.onChange(); }

  // ---------------------------------------------------------------- veri
  async load(set, v) {
    this.info = { status: 'JPL SBDB verisi alınıyor…' }; this.changed();
    try {
      const r = await fetch(`api/asteroids?set=${set}${v != null ? '&v=' + v : ''}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.cols) throw new Error(d.hata || ('HTTP ' + r.status));
      this.sets[set] = d; this.src[set] = { kaynak: d.kaynak || 'JPL SBDB', t: d.t };
      this.combine();
    } catch (err) {
      this.info = { status: 'Asteroit verisi alınamadı: ' + err.message }; this.changed();
    }
  }
  async loadSentry(v) {
    try {
      const r = await fetch('api/sentry' + (v != null ? '?v=' + v : '')), d = await r.json();
      if (!r.ok || !d.data) return;
      this.sentry = new Map(d.data.map((s) => [s.des, s])); this.sentryT = d.t;
      if (this.n) this.regroup();
      this.changed();
    } catch (err) { /* risk listesi isteğe bağlı */ }
  }
  combine() {
    const order = ['neo', 'mb'].filter((k) => this.sets[k]);
    const keys = ['des', 'name', 'cls', 'pha', 'H', 'D', 'alb', 'ep', 'a', 'e', 'i', 'om', 'w', 'ma', 'moid', 'rot', 'spec', 'cc', 'arc', 'gm'];
    const C = {}; for (const k of keys) C[k] = [];
    for (const s of order) { const c = this.sets[s].cols; for (const k of keys) C[k].push(...(c[k] || new Array(c.a.length).fill(null))); }
    this.C = C; this.n = C.a.length; this.sel = -1; this.etProp = null;
    this.index = new Map(); for (let i = 0; i < this.n; i++) this.index.set(C.des[i], i);
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
    this.geo.setAttribute('vel', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
    this.geo.setAttribute('grp', new THREE.BufferAttribute(new Float32Array(this.n), 1));
    this.geo.setAttribute('sz', new THREE.BufferAttribute(new Float32Array(this.n), 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    const sz = this.geo.attributes.sz.array;
    for (let i = 0; i < this.n; i++) { const D = this.diam(i); sz[i] = D >= 300 ? 2.2 : D >= 100 ? 1.6 : D >= 10 ? 1.15 : 1.0; }
    this.regroup();
    this.worker.postMessage({ cmd: 'load', cols: { a: C.a, e: C.e, i: C.i, om: C.om, w: C.w, ma: C.ma, ep: C.ep } });
    this.info = { status: 'Konumlar hesaplanıyor…' }; this.changed();
    // büyükler için kalıcı etiket (Güneş sistemi görünümünde)
    for (const b of this.bigLabels) b.el.remove();
    this.bigLabels = [];
    for (let i = 0; i < this.n; i++) if (this.diam(i) >= 400) {
      const el = document.createElement('div'); el.className = 'lbl lbl-astbig'; el.textContent = this.C.name[i] || this.C.des[i]; el.style.display = 'none';
      this.labelsEl.appendChild(el); this.bigLabels.push({ i, el });
    }
  }
  groupOf(i) {
    const C = this.C;
    if (this.sentry.has(C.des[i])) return 0;
    if (C.pha[i]) return 1;
    if (['APO', 'AMO', 'ATE', 'IEO'].includes(C.cls[i])) return 2;
    if (C.cls[i] === 'TJN') return 3;
    return 4;
  }
  regroup() {
    const g = this.geo.attributes.grp; if (!g) return;
    this.counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < this.n; i++) { const k = this.groupOf(i); g.array[i] = k; this.counts[k]++; }
    g.needsUpdate = true;
  }
  onMsg(d) {
    if (d.type === 'loaded') { this.info = { status: 'hazır' }; this.changed(); }
    else if (d.type === 'pos' && d.id === this.reqId) {
      this.geo.attributes.position.array.set(d.pos); this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.vel.array.set(d.vel); this.geo.attributes.vel.needsUpdate = true;
      this.etProp = d.et; this.pending = false;
    }
  }
  setMask(i, on) { this.mask[i] = on ? 1 : 0; this.mat.uniforms.mask.value = this.mask.slice(); }
  diam(i) { const C = this.C; return C.D[i] > 0 ? C.D[i] : 1329 / Math.sqrt(C.alb[i] > 0 ? C.alb[i] : 0.14) * Math.pow(10, -C.H[i] / 5); }
  label(i) { const C = this.C; return C.name[i] ? `${C.des[i]} ${C.name[i]}` : C.des[i]; }
  elementsOf(i) { const C = this.C; return { a: C.a[i], e: C.e[i], i: C.i[i], om: C.om[i], w: C.w[i], ma: C.ma[i], epoch: C.ep[i] }; }
  helio(i, t) { return keplerHelio(this.elementsOf(i), etOfT(t)); }
  geoPos(i, t) { const [r] = this.helio(i, t), s = E.sunPos(t); return [s[0] + r[0], s[1] + r[1], s[2] + r[2]]; }
  selPos(t) { return this.sel >= 0 ? this.geoPos(this.sel, t) : null; }

  // ---------------------------------------------------------------- arama, seçim
  search(q) {
    if (!this.C || !q) return [];
    const s = q.trim().toLocaleLowerCase('tr-TR'), out = [];
    const exact = this.index.get(q.trim()); if (exact != null) out.push(exact);
    for (let i = 0; i < this.n && out.length < 12; i++) {
      if (i === exact) continue;
      const nm = (this.C.name[i] || '').toLocaleLowerCase('tr-TR'), ds = String(this.C.des[i]).toLowerCase();
      if (nm.startsWith(s) || ds === s || ds.startsWith(s + ' ') || (s.length > 2 && (nm.includes(s) || ds.includes(s)))) out.push(i);
    }
    return out;
  }
  select(i) {
    this.sel = i; this.selOrbit = null;
    if (i >= 0) { this.selLabel.textContent = this.label(i); this.fetchDetail(i); }
    else this.selLabel.style.display = 'none';
    this.changed();
  }
  async fetchDetail(i) {
    const des = this.C.des[i];
    if (this.detail.has(des)) return this.detail.get(des);
    const p = fetch('api/sbdb?des=' + encodeURIComponent(des)).then((r) => r.json()).then((d) => (d && d.object ? d : { hata: d.hata || 'yanıt yok' }))
      .catch((e) => ({ hata: e.message }));
    this.detail.set(des, p);
    const d = await p; this.detail.set(des, d); this.changed(); return d;
  }
  // tıklanan asteroidin kartı
  details(i, t) {
    const C = this.C; if (!C || i < 0) return null;
    const [r, v] = this.helio(i, t), s = E.sunPos(t), geo = [s[0] + r[0], s[1] + r[1], s[2] + r[2]];
    const el = helioElements(r, v), D = this.diam(i), sen = this.sentry.get(C.des[i]);
    const det = this.detail.get(C.des[i]);
    const out = { name: this.label(i), des: C.des[i], cls: CLASS_TR[C.cls[i]] || C.cls[i], pha: !!C.pha[i], H: C.H[i], D, Dmeas: C.D[i] > 0, alb: C.alb[i],
      rot: C.rot[i], spec: C.spec[i], a: C.a[i], e: C.e[i], inc: C.i[i], q: C.a[i] * (1 - C.e[i]), Q: C.a[i] * (1 + C.e[i]),
      P: Math.pow(C.a[i], 1.5), moid: C.moid[i], cc: C.cc[i], arc: C.arc[i], dSun: Math.hypot(...r) / AU, dEarth: Math.hypot(...geo), v: Math.hypot(...v),
      epochAgeDays: (E.jdTdb(t) - C.ep[i]), sentry: sen || null, group: AST_GROUPS[this.groupOf(i)].name, oscA: el.a / AU };
    if (det && det.object) {
      const now = E.jdTdb(t);
      const ca = (det.ca_data || []).map((c) => ({ ...c, jd: +c.jd || null })).filter((c) => c.body === 'Earth');
      const nxt = ca.find((c) => cadJd(c) > now);
      if (nxt) out.nextCa = { cd: nxt.cd, dist: +nxt.dist * AU, v: +nxt.v_rel };
      const disc = det.discovery; if (disc) out.discovery = (disc.date ? disc.date + ' · ' : '') + (disc.location || disc.site || '') + (disc.who ? ' · ' + disc.who : '');
      out.kind = det.object.kind; out.fullname = det.object.fullname;
      const pp = det.phys_par || []; const pv = (n) => { const x = pp.find((q) => q.name === n); return x ? x.value : null; };
      if (pv('diameter')) { out.D = +pv('diameter'); out.Dmeas = true; }
      if (pv('density')) out.rho = +pv('density') * 1000;
      if (pv('GM')) out.GM = +pv('GM');
      if (pv('extent')) out.extent = pv('extent');
      if (det.vi_data && det.vi_data.length) out.vi = det.vi_data.length;
      out.detailOk = true;
    } else if (det && det.hata) out.detailErr = det.hata;
    else out.detailLoading = true;
    return out;
  }

  // ---------------------------------------------------------------- fareyle seçim
  pick(mx, my, camera, eye, canvas, t, radiusPx = 10) {
    if (!this.points.visible || this.etProp === null) return null;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const M = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), e = M.elements;
    const s = E.sunPos(t), P = this.geo.attributes.position.array, V = this.geo.attributes.vel.array, G = this.geo.attributes.grp.array;
    const dt = etOfT(t) - this.etProp, lim = this.mat.uniforms.nearLim.value;
    let best = null;
    for (let i = 0; i < this.n; i++) {
      if (!this.mask[G[i]]) continue;
      let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (x !== x) continue;
      const r = Math.hypot(x, y, z), k = -GM_SUN / (r * r * r) * 0.5 * dt * dt;
      x += V[3 * i] * dt + x * k + s[0]; y += V[3 * i + 1] * dt + y * k + s[1]; z += V[3 * i + 2] * dt + z * k + s[2];
      if (Math.hypot(x, y, z) > lim) continue;
      const rx = x - eye[0], ry = y - eye[1], rz = z - eye[2];
      const cw = e[3] * rx + e[7] * ry + e[11] * rz + e[15]; if (cw <= 0) continue;
      const sx = ((e[0] * rx + e[4] * ry + e[8] * rz + e[12]) / cw + 1) / 2 * w, sy = (1 - (e[1] * rx + e[5] * ry + e[9] * rz + e[13]) / cw) / 2 * h;
      const d2 = (sx - mx) ** 2 + (sy - my) ** 2; if (d2 > radiusPx * radiusPx) continue;
      const pri = G[i] <= 1 ? 0.6 : 1;                                       // üst üste binmede riskli olanlar öne
      if (!best || d2 * pri < best.d2 * best.pri) best = { kind: 'ast', i, d2, pri, dist: Math.hypot(rx, ry, rz) };
    }
    return best;
  }

  // ---------------------------------------------------------------- her kare
  // full: Güneş sistemi görünümü (hepsi); değilse yalnız Dünya'nın 0,05 AB yakınındakiler
  update(t, eye, camera, canvas, full) {
    const vis = this.enabled && this.n > 0;
    this.points.visible = vis && this.etProp !== null;
    const et = etOfT(t), s = E.sunPos(t);
    if (vis) {
      const now = performance.now();
      if (!this.pending && (this.etProp === null || (Math.abs(et - this.etProp) > 30 && now - this.lastReq > 150) || Math.abs(et - this.etProp) > 86400)) {
        this.pending = true; this.lastReq = now; this.reqId++;
        this.worker.postMessage({ cmd: 'prop', id: this.reqId, et });
      }
      this.mat.uniforms.dt.value = this.etProp === null ? 0 : et - this.etProp;
      this.mat.uniforms.off.value.set(s[0] - eye[0], s[1] - eye[1], s[2] - eye[2]);
      this.mat.uniforms.sunGeo.value.set(s[0], s[1], s[2]);
      this.mat.uniforms.nearLim.value = full ? 1e13 : 0.05 * AU;
    }
    const place = (d, p, dy = 12) => {
      const v = new THREE.Vector3(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.style.display = 'none'; return; }
      d.style.display = 'block'; d.style.transform = `translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight - dy}px) translate(-50%, -100%)`;
    };
    for (const b of this.bigLabels) { if (vis && full && this.mask[this.groupOf(b.i)]) place(b.el, this.geoPos(b.i, t), 8); else b.el.style.display = 'none'; }
    if (vis && this.sel >= 0) {
      const [r] = this.helio(this.sel, t), p = [s[0] + r[0], s[1] + r[1], s[2] + r[2]];
      const nearOk = full || Math.hypot(...p) < 0.05 * AU;
      if (!this.selOrbit) {                                                   // bir tam yörünge (Güneş merkezli)
        const el = this.elementsOf(this.sel), Pd = 365.25 * Math.pow(el.a, 1.5), pts = [];
        for (let k = 0; k <= 1024; k++) pts.push(keplerHelio(el, et + (k / 1024) * Pd * 86400)[0]);
        this.selOrbit = pts;
      }
      const a = this.selLine.geometry.attributes.position.array;
      this.selOrbit.forEach((q, k) => { a[k * 3] = s[0] + q[0] - eye[0]; a[k * 3 + 1] = s[1] + q[1] - eye[1]; a[k * 3 + 2] = s[2] + q[2] - eye[2]; });
      this.selLine.geometry.attributes.position.needsUpdate = true; this.selLine.geometry.setDrawRange(0, 1025);
      this.selLine.visible = full;
      if (nearOk) place(this.selLabel, p); else this.selLabel.style.display = 'none';
      const R = this.diam(this.sel) / 2, dCam = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      this.rock.visible = dCam < 600 * R;
      this.selRing.visible = nearOk && !this.rock.visible;
      this.selRing.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      if (this.rock.visible) {
        this.rock.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]); this.rock.scale.setScalar(R);
        this.rock.rotation.set(0.4, (et / 3600 / ((this.C.rot[this.sel] || 6))) * 2 * Math.PI % (2 * Math.PI), 0.2);
        const sd = [-r[0], -r[1], -r[2]], n = Math.hypot(...sd); this.rock.material.uniforms.sunDir.value.set(sd[0] / n, sd[1] / n, sd[2] / n);
      }
    } else { this.selLine.visible = false; this.selLabel.style.display = 'none'; this.selRing.visible = false; this.rock.visible = false; }
  }
}
// CAD kaydının JD'si (sbdb.api ca_data'da "jd" alanı yok: "cd" tarih metninden)
function cadJd(c) {
  if (c.jd) return +c.jd;
  const ms = Date.parse(c.cd.replace(/-(\w{3})-/, ' $1 ') + ' UTC');
  return ms / 86400000 + 2440587.5;
}
// patatesimsi kaya: gürültülü ikosahedron (tohum sabit)
function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 5), p = g.attributes.position, v = new THREE.Vector3();
  const lumps = []; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 28; k++) { const u = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(); lumps.push([u, 0.25 + rnd() * 0.5, (rnd() - 0.45) * 0.28]); }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 1;
    for (const [u, w, amp] of lumps) { const d = v.distanceTo(u); if (d < w) h += amp * 0.5 * (1 + Math.cos(Math.PI * d / w)); }
    // kraterler
    h -= 0.03 * Math.max(0, Math.sin(v.x * 9.1) * Math.sin(v.y * 8.3) * Math.sin(v.z * 7.7));
    p.setXYZ(i, v.x * h * 1.25, v.y * h * 0.95, v.z * h * 0.85);
  }
  g.computeVertexNormals();
  return g;
}
