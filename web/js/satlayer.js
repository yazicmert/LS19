// Canlı uydular: Dünya çevresi (CelesTrak aktif uydular, SGP4, ayrı iş parçacığı) ve Ay çevresi (JPL Horizons vektörleri).
// Veriler yerel sunucunun (sunucu.py) ya da bulut işlevlerinin (api/, Vercel) vekilinden gelir; tarayıcı CelesTrak/Horizons'a doğrudan erişemez (CORS).
import * as THREE from 'three';
import * as E from './engine.js';
import * as S from '../lib/satellite.esm.js';

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
  uniform vec3 eye; uniform float dt, mu, px, mask[6]; uniform float sizes[6]; uniform vec3 colors[6];
  varying vec3 vCol; varying float vOn;
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
    gl_PointSize = sz * px * clamp(pow(18000.0 / max(d, 1.0), 0.65), 1.0, 7.0);
    vCol = col; vOn = (on > 0.5 && r == r) ? 1.0 : 0.0;
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
    gl_FragColor = vec4(vCol * (1.25 - 1.6 * d), 1.0 - smoothstep(0.14, 0.25, d));
  }`;

export class SatLayer {
  constructor(scene, labelsEl, eoData) {
    this.scene = scene; this.labelsEl = labelsEl; this.eo = eoData;
    this.n = 0; this.tProp = null; this.pending = false; this.lastReq = 0; this.reqId = 0; this.enabled = true; this.moonEnabled = true;
    this.mask = [1, 1, 1, 1, 1, 1]; this.info = { status: 'bekleniyor' }; this.moonSats = []; this.sel = -1;
    this.worker = new Worker(new URL('./sats.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.onMsg(e.data);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { eye: { value: new THREE.Vector3() }, dt: { value: 0 }, mu: { value: E.MU_E }, px: { value: window.devicePixelRatio || 1 },
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
    this.model = satModel(); this.model.visible = false; scene.add(this.model);
    this.onChange = null;
  }
  mkLabel(cls) { const d = document.createElement('div'); d.className = cls; d.style.display = 'none'; this.labelsEl.appendChild(d); return d; }

  // ---------------------------------------------------------------- Dünya uyduları
  async load(v) {
    if (!this.n) { this.info = { status: 'CelesTrak verisi alınıyor…' }; this.changed(); }
    try {
      const r = await fetch('api/gp?group=active' + (v != null ? '&v=' + v : ''));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).hata || ('HTTP ' + r.status));
      const omm = await r.json();
      this.src = { kaynak: decodeURIComponent(r.headers.get('X-LS19-Kaynak') || ''), yas: +(r.headers.get('X-LS19-Yas') || 0), t: Date.now() };
      if (this.sel >= 0) this.select(-1);
      this.omm = omm;
      this.worker.postMessage({ cmd: 'load', omm, eo: this.eo });
    } catch (err) {
      this.info = { status: 'Uydu verisi alınamadı: ' + err.message + ' — siteyi baslat.command (sunucu.py) ile ya da bulutta (Vercel) açın.' }; this.changed();
    }
  }
  onMsg(d) {
    if (d.type === 'loaded') {
      this.n = d.n; this.groups = d.groups; this.names = d.names; this.ids = d.ids; this.epochMs = d.epochMs;
      this.counts = SAT_GROUPS.map((_, i) => d.groups.reduce((s, g) => s + (g === i), 0));
      this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
      this.geo.setAttribute('vel', new THREE.BufferAttribute(new Float32Array(3 * this.n), 3));
      this.geo.setAttribute('grp', new THREE.BufferAttribute(Float32Array.from(d.groups), 1));
      this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);     // NaN (çökmüş) kayıtlar sıralamayı bozmasın
      this.info = { status: 'hazır' }; this.tProp = null; this.changed();
      this.satrecs = null;                                        // seçim için ana iş parçacığında tembel kurulur
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
    const o = this.omm.find((x) => x.NORAD_CAT_ID === this.ids[i]);
    this.selRec = o ? S.json2satrec(o) : null; this.selOmm = o; this.selOrbitT = null;
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
    const o = this.omm && this.omm.find((x) => x.NORAD_CAT_ID === this.ids[i]); if (!o) return null;
    const sr = S.json2satrec(o), pv = S.propagate(sr, new Date(E.utcMsFromT(t)));
    const n = (+o.MEAN_MOTION) * 2 * Math.PI / 86400, a = Math.cbrt(E.MU_E / (n * n)), ecc = +o.ECCENTRICITY;
    const out = { name: o.OBJECT_NAME, norad: o.NORAD_CAT_ID, cospar: o.OBJECT_ID, group: SAT_GROUPS[this.groups[i]].name,
      periodMin: 1440 / o.MEAN_MOTION, inc: +o.INCLINATION, ecc, perigee: a * (1 - ecc) - E.R_E, apogee: a * (1 + ecc) - E.R_E,
      epochAgeDays: (E.utcMsFromT(t) - Date.parse(o.EPOCH + 'Z')) / 86400000, launchYear: (o.OBJECT_ID || '').slice(0, 4) };
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
    return { name: m.name, alt: rn - E.R_M, speed: v, periodMin: a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / E.MU_M) / 60 : NaN, rows: m.rows.length };
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
      if (this.tProp !== null) { this.mat.uniforms.dt.value = t - this.tProp; this.mat.uniforms.eye.value.set(eye[0], eye[1], eye[2]); }
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
        place(this.selLabel, p);
        if (this.selOrbitT === null || Math.abs(t - this.selOrbitT) > 60) {
          this.selOrbitT = t; const per = 1440 / this.selOmm.MEAN_MOTION * 60, a = this.selLine.geometry.attributes.position.array;
          this.selOrbitPts = []; for (let k = 0; k <= 360; k++) { const q = this.selPos(t + (k / 360 - 0.5) * per); if (q) this.selOrbitPts.push(q); }
        }
        const a = this.selLine.geometry.attributes.position.array, P = this.selOrbitPts;
        for (let k = 0; k < P.length; k++) { a[k * 3] = P[k][0] - eye[0]; a[k * 3 + 1] = P[k][1] - eye[1]; a[k * 3 + 2] = P[k][2] - eye[2]; }
        this.selLine.geometry.setDrawRange(0, P.length); this.selLine.geometry.attributes.position.needsUpdate = true; this.selLine.visible = true;
        this.selRing.visible = true; this.selRing.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
        // yakından temsili uydu modeli (gövde + güneş panelleri), paneller Güneş'e dönük
        const dCam = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
        this.model.visible = dCam < 3;
        if (this.model.visible) {
          this.model.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
          const sun = E.sunPos(t), sd = new THREE.Vector3(sun[0] - p[0], sun[1] - p[1], sun[2] - p[2]).normalize(), nad = new THREE.Vector3(-p[0], -p[1], -p[2]).normalize();
          const yAx = new THREE.Vector3().crossVectors(nad, sd).normalize(), xAx = new THREE.Vector3().crossVectors(yAx, nad);
          this.model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx, nad));
          this.model.children[1].rotation.y = this.model.children[2].rotation.y = Math.atan2(-sd.dot(nad), sd.dot(xAx));   // panel yüzü Güneş'e
        }
        this.selRing.visible = !this.model.visible;
      } else { this.selLabel.style.display = 'none'; this.selLine.visible = false; this.selRing.visible = false; this.model.visible = false; }
    } else { this.selLabel.style.display = 'none'; this.selLine.visible = false; this.selRing.visible = false; this.model.visible = false; }
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

// temsili uydu modeli (m cinsinden, km sahnesi için 0.001 ölçekli): altın folyolu gövde + iki güneş paneli
function satModel() {
  const g = new THREE.Group(), KM = 0.001;
  // hafif öz ışıma: gölgede (Dünya'nın gölgesinde) de seçilebilsin
  const bus = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.1), new THREE.MeshStandardMaterial({ color: 0xc9983a, metalness: 0.8, roughness: 0.35, emissive: 0x3a2a10 }));
  const pm = new THREE.MeshStandardMaterial({ color: 0x1b2a55, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x0b1430 });
  const mkPanel = (sgn) => { const q = new THREE.Group(); const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 4.5, 1.6), pm); pnl.position.y = sgn * 3.0; q.add(pnl);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x9b9ea3, metalness: 1, roughness: 0.4 })); arm.position.y = sgn * 0.6; q.add(arm); return q; };
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6, side: THREE.DoubleSide }));
  dish.rotation.x = Math.PI; dish.position.z = 0.75;
  g.add(bus, mkPanel(1), mkPanel(-1), dish);
  g.scale.setScalar(KM);
  return g;
}
