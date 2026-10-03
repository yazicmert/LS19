// LS19 uçuş telemetrisi: aracın anlık durumundan (konum, hız, kütle, itki) türetilen fiziksel büyüklükler.
// DOM'suz, saf fonksiyonlar: kontrol paneli (controlpanel.js) yalnız biçimlendirir; hesap burada yapılır ve test/test_telemetry.js'te
// analitik vakalarla ve motorun kendi entegrasyonuyla sınanır.
// Birimler: km, s, kg, kN (= kg·km/s²); açılar radyan. Çerçeve: ICRF eksenli, merkez cisme göre (eylemsiz); dönen cisme göre değerler ayrıca belirtilir.
//
// Tanımlar
//   Baskın cisim  Ay'ın gösterim bölgesindeyse (E.MOON_ZONE; varsayılan etki küresi 66.100 km) Ay, değilse Dünya.
//   Yüzeye göre   v_göreli = v − ω×r; ω cismin dönme vektörü (Dünya: IERS dönme hızı × gerçek kutup, Ay: yönelim matrisinin türevi).
//   Yörünge       o anki konum ve hızdan, yalnız merkez cismin çekimiyle osküle konik (J2, üçüncü cisimler ve itki dışarıda; Yörünge sekmesiyle aynı tanım).
//   Δv            ideal roket denklemi (Tsiolkovsky); kademeler sırayla yanar, biten kademenin kuru kütlesi atılır. Motorun saydığı Δv
//                 (Propagator.dvUsed) ile aynı büyüklüktür: roket denklemiyle tutarlı olduğu test/test_nbody.js'te sınanır.
//   İtki/ağırlık  azami itki ÷ (kütle × baskın cismin o yarıçaptaki μ/r²).
//   Özgül kuvvet  itki ÷ kütle (yerçekimi dışı ivme): mürettebatın hissedeceği ivme; birimi g₀ = 9,80665 m/s².
import * as E from './engine.js';
import { dvKeys } from './dvbudget.js';
import { massProps, stageSpec } from './rigidbody.js';
import { CTL } from './attctl.js';

const { add, sub, scale, dot, cross, norm, unit } = E;
export const C_LIGHT = 299792.458;                 // ışık hızı, km/s
export const OMEGA_EARTH = 7.2921150e-5;           // Dünya'nın yıldız dönme hızı, rad/s (IERS 1996)
export const F_EARTH = 1 / 298.257223563;          // WGS-84 basıklığı
export const R_SUN = 695700.0;                     // Güneş yarıçapı, km (IAU 2015)
export const TWO_PI = 2 * Math.PI;
export const LIMITS = { vz: 3.0, vh: 1.5 };        // temas sınırları, m/s (görev başarı ölçütü: mission.js touchdown)
export const LANDING_PHASES = new Set(['PDI', 'YAKLASMA', 'SON_INIS', 'INDI']);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mod = (x, m) => ((x % m) + m) % m;

// ------------------------------------------------------------------ yer ölçüleri
// Merkez cisme göre konumdan jeodezik enlem ve elipsoid üstü yükseklik (km). pole: dönme ekseni (birim), a: ekvator yarıçapı, f: basıklık.
// Sabit nokta yinelemesi (Bowring); kutupta ve kutuptan uzakta (Ay mesafesi dahil) yakınsar.
export function geodetic(r, pole, a = E.R_E, f = F_EARTH) {
  const z = dot(r, pole), p = norm(sub(r, scale(pole, z))), e2 = f * (2 - f);
  let lat = Math.atan2(z, p * (1 - e2)), h = 0;
  for (let i = 0; i < 16; i++) {
    const s = Math.sin(lat), c = Math.cos(lat), N = a / Math.sqrt(1 - e2 * s * s);
    h = Math.abs(c) > 0.7071 ? p / c - N : Math.abs(z) / Math.abs(s) - N * (1 - e2);
    const nl = Math.atan2(z, p * (1 - e2 * N / (N + h))), done = Math.abs(nl - lat) < 1e-15;
    lat = nl; if (done) break;
  }
  return { lat, h };
}

// Cismin gövdeye bağlı eksenleri (satırlar, ICRF bileşenleri; x,y,z) ve dönme vektörü ω (rad/s, ICRF).
// Dünya: ITRS (Greenwich), Ay: ortalama yer/dönme ekseni (ME). Ay'ın ω'sı yönelim matrisinin türevidir (serbest dönme + libration).
export function bodyAxes(isMoon, t) {
  if (isMoon) { const M = E.moonIcrfToMe(t); return { x: M[0], y: M[1], z: M[2], omega: E.omegaMoon(t) }; }
  const M = E.earthIcrfToItrf(t); return { x: M[0], y: M[1], z: M[2], omega: scale(M[2], OMEGA_EARTH) };
}

// Üçüncü cisimlerin merkez cisim çerçevesindeki bozucu ivmesi (km/s²): Σ μ_B (d_B/|d_B|³ − dc_B/|dc_B|³); d_B araçtan, dc_B merkez cisimden cisme.
// Osküle koniğin ne kadar güvenilir olduğunu gösterir: bozucu/merkezi çekim oranı küçükse (< 10⁻³) konik gelecek hareketi iyi tarif eder.
export function thirdBodyPerturbation(rv, rC, bodies) {
  let a = [0, 0, 0];
  for (const [gm, rB] of bodies) {
    const d = sub(rB, rv), dc = sub(rB, rC);
    a = add(a, sub(scale(d, gm / norm(d) ** 3), scale(dc, gm / norm(dc) ** 3)));
  }
  return a;
}

// ------------------------------------------------------------------ yörünge
// xref/yref: eylemsiz ekvator düzleminde başvuru eksenleri (Dünya için tarihin gerçek ekinoksu); yoksa RAAN verilmez.
export function orbitInfo(r, v, mu, pole, xref = null, yref = null) {
  const el = E.elements(r, v, mu), hn = norm(el.h), hh = scale(el.h, 1 / hn), rh = unit(r);
  const inc = Math.acos(clamp(dot(hh, pole), -1, 1));
  const nv = cross(pole, hh), nn = norm(nv), nodeOk = nn > 1e-12, nhat = nodeOk ? scale(nv, 1 / nn) : (xref || [1, 0, 0]);
  const raan = nodeOk && xref ? mod(Math.atan2(dot(nhat, yref), dot(nhat, xref)), TWO_PI) : null;
  let argp = null, nu;
  if (el.e > 1e-9) {
    const eh = scale(el.evec, 1 / el.e);
    nu = Math.atan2(dot(cross(eh, rh), hh), dot(eh, rh));                       // gerçek anomali, (−π, π]
    argp = nodeOk ? mod(Math.atan2(dot(cross(nhat, eh), hh), dot(nhat, eh)), TWO_PI) : null;
  } else nu = Math.atan2(dot(cross(nhat, rh), hh), dot(nhat, rh));              // dairesel: enlem argümanı
  const rn = norm(r), vn = norm(v);
  return { ...el, hn, hh, inc, raan, argp, nu, vCirc: Math.sqrt(mu / rn), vEsc: Math.sqrt(2 * mu / rn), vInf: el.energy > 0 ? Math.sqrt(2 * el.energy) : null,
           period: el.e < 1 ? TWO_PI * Math.sqrt(el.a ** 3 / mu) : Infinity, vis: vn * vn - mu * (2 / rn - 1 / el.a) };
}

// Periapsisten geçen süre (s), gerçek anomaliden: elips için M/n, hiperbol için M_h/n_h. ν ∈ (−π, π]; periapsisten önce negatiftir.
export function timeSincePeriapsis(nu, e, a, mu) {
  if (e < 1) {
    const Ea = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return (Ea - e * Math.sin(Ea)) / Math.sqrt(mu / (a * a * a));
  }
  const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
  return (e * Math.sinh(F) - F) / Math.sqrt(mu / Math.abs(a) ** 3);
}
// Sonraki periapsis ve apoapsise kalan süre (s). Hiperbolde periapsis geçtiyse negatif, apoapsis yoktur.
export function apsisTimes(el, nu, mu) {
  const tau = timeSincePeriapsis(nu, el.e, el.a, mu);
  if (el.e >= 1) return { tPeri: -tau, tApo: null };
  const T = TWO_PI * Math.sqrt(el.a ** 3 / mu);
  return { tPeri: mod(-tau, T), tApo: mod(T / 2 - tau, T) };
}
// Motor kesilirse (yalnız merkez cisim çekimiyle) rg yarıçaplı küreye (yüzey) ulaşmaya kalan süre (s); ulaşılmıyorsa null.
// Yaklaşan dalda r = p/(1+e·cosν) = rg çözülür; elipste gelecek geçiş, hiperbolde geçilmediyse.
export function timeToRadius(el, nu, r, rg, mu) {
  if (r <= rg) return 0;
  if (!(el.rp < rg)) return null;
  const c = (el.p / rg - 1) / el.e;
  if (!(Math.abs(c) <= 1)) return null;
  const dt = timeSincePeriapsis(-Math.acos(c), el.e, el.a, mu) - timeSincePeriapsis(nu, el.e, el.a, mu);
  if (el.e < 1) return mod(dt, TWO_PI * Math.sqrt(el.a ** 3 / mu));
  return dt >= 0 ? dt : null;
}

// ------------------------------------------------------------------ görüş hattı, Güneş ışığı
// P→Q doğru parçasını c merkezli R yarıçaplı küre engelliyor mu? P küre içinde olsa da (yüzeydeki araç) dışa bakan hat engellenmez.
export function sphereBlocksSegment(P, Q, c, R) {
  const d = sub(Q, P), L2 = dot(d, d);
  if (L2 === 0) return false;
  const tc = dot(sub(c, P), d) / L2;
  if (tc <= 0 || tc >= 1) return false;
  return norm(sub(add(P, scale(d, tc)), c)) < R;
}
// Güneş diskinin (açısal yarıçap as) örten diskle (ab; merkezler th kadar ayrık) örtülen oranı: iki daire kesişim alanı
// (Montenbruck & Gill, §3.4.2). th ≥ as+ab: örtme yok; küçük disk büyüğün içinde: tam/halkalı.
export function discOverlapFraction(as, ab, th) {
  if (th >= as + ab) return 0;
  if (th <= Math.abs(ab - as)) return ab >= as ? 1 : (ab * ab) / (as * as);
  const c1 = clamp((th * th + as * as - ab * ab) / (2 * th * as), -1, 1), c2 = clamp((th * th + ab * ab - as * as) / (2 * th * ab), -1, 1);
  const A = as * as * Math.acos(c1) + ab * ab * Math.acos(c2) - 0.5 * Math.sqrt(Math.max(0, (-th + as + ab) * (th + as - ab) * (th - as + ab) * (th + as + ab)));
  return A / (Math.PI * as * as);
}
// Araçtan görülen Güneş diskinin açık kalan oranı (0 tam gölge … 1 tam ışık); bodies: [[merkez (geosentrik), yarıçap], …].
// Araç cismin içinde ya da yüzeyindeyse örten disk yarım küre (açısal yarıçap 90°) alınır: Güneş ufkun altındaysa gölgededir.
export function sunlightFraction(rv, rSun, bodies) {
  const ds = sub(rSun, rv), dsn = norm(ds), as = Math.asin(Math.min(1, R_SUN / dsn));
  let covered = 0;
  for (const [c, R] of bodies) {
    const db = sub(c, rv), dbn = norm(db);
    const ab = dbn <= R ? Math.PI / 2 : Math.asin(R / dbn), th = Math.acos(clamp(dot(ds, db) / (dsn * dbn), -1, 1));
    covered += discOverlapFraction(as, ab, th);
  }
  return Math.max(0, 1 - covered);
}

// ------------------------------------------------------------------ yakıt ve Δv
// Kademe başına kalan Δv (km/s): etkin kademe şimdiki kütle ve yakıtla, sonrakiler tam yakıtla (arkalarındaki kademeler yük).
// Atılmış kademe (j < k) için null. stages: [{dry, prop, T, isp}], k: etkin kademe, mNow/propNow: etkin kademenin şimdiki toplam kütlesi/yakıtı.
export function stageDvs(stages, k, mNow, propNow) {
  return stages.map((st, j) => {
    if (j < k) return null;
    let payload = 0; for (let i = j + 1; i < stages.length; i++) payload += stages[i].dry + stages[i].prop;
    const prop = j === k ? propNow : st.prop, m0 = j === k ? mNow : st.dry + st.prop + payload, c = st.isp * E.G0;
    return { dv: prop > 0 ? c * Math.log(m0 / (m0 - prop)) : 0, prop, m0, c };
  });
}

// Planlı manevraların durumu: her kalem için nominal Δv, şimdiye kadar yapılan, bitti mi, kalan (m/s) ve kademe (0: TLI kademesi, 1: iniş aracı ya da Ay yörünge kademesi, 2: iniş kademesi).
// nominal: bozulmasız uçuşun manevra Δv'leri (dvFromEvents biçimi); yoksa tasarımın tahmini. events: görev olayları (key, dv km/s, dvm m/s).
const BURN_PAIRS = { TLI: ['TLI', 'TLI_CUT'], LOI: ['LOI', 'LOI_END'], LLOI: ['LOI', 'LOI_END'], NRI: ['NRI', 'NRI_END'], DOI: ['DOI', 'DOI_END'], PDI: ['PDI', 'INDI'] };
export function dvProgress(design, nominal, events, dvNow) {
  const ev = (k) => events.find((e) => e.key === k);
  // başlangıç olayı planlı Δv'yi (dvm) taşıyan kısa yakışlar (MCC, SK, DEP): olaydan beri uygulanan Δv, planlıyı geçmez
  const burned = (e) => Math.min(e.dvm || 0, Math.max(0, (dvNow - e.dv) * 1000));
  const nomOf = (k) => (nominal && nominal[k] != null ? nominal[k] : design && design.DV && design.DV[k] != null ? design.DV[k] : 0);
  const nSt = design && design.STAGES ? design.STAGES.length : 2;                // 3 kademeli araçta (iki kademeli iniş) PDI son kademededir
  return dvKeys(design).map((key) => {
    let done = false, used = 0;
    if (BURN_PAIRS[key]) {
      const [a, b] = BURN_PAIRS[key], ea = ev(a), eb = ev(b);
      if (ea && eb) { done = true; used = (eb.dv - ea.dv) * 1000; } else if (ea) used = Math.max(0, (dvNow - ea.dv) * 1000);
    } else if (/^MCC-\d$/.test(key)) {
      const e = ev(key); if (e) { used = burned(e); done = used >= (e.dvm || 0) - 1e-6; } else if (ev(key + '_SKIP')) done = true;
    } else if (key === 'RAISE') {
      const n = design && design.RAISE ? design.RAISE.n : 0, cuts = events.filter((e) => /^RAISE-\d+_CUT$/.test(e.key));
      for (const st of events.filter((e) => /^RAISE-\d+$/.test(e.key))) { const c = cuts.find((x) => x.key === st.key + '_CUT'); used += c ? (c.dv - st.dv) * 1000 : Math.max(0, (dvNow - st.dv) * 1000); }
      done = n > 0 && cuts.length >= n;
    } else if (key === 'SK') {
      used = events.filter((e) => /^SK-\d+$/.test(e.key)).reduce((a, e) => a + burned(e), 0); done = !!(ev('DEP') || ev('DEP_SKIP'));
    } else if (key === 'DEP') { const e = ev('DEP'); if (e) { used = burned(e); done = used >= (e.dvm || 0) - 1e-6; } }
    const nom = nomOf(key);
    return { key, stage: key === 'RAISE' || key === 'TLI' ? 0 : key === 'PDI' && nSt > 2 ? 2 : 1, nom, used, done, rem: done ? 0 : Math.max(0, nom - used) };
  });
}
// Tasarım payı (m/s), kademe başına: dolu kademenin roket denklemi Δv'si − o kademenin planlı manevralarının toplamı. Görev başında pay budur.
export function dvBaseline(design, nominal, stages) {
  const prog = dvProgress(design, nominal, [], 0), full = stageDvs(stages, 0, stages.reduce((a, s) => a + s.dry + s.prop, 0), stages[0].prop);
  return full.map((s, j) => (s ? s.dv * 1000 - prog.filter((p) => p.stage === j).reduce((a, p) => a + p.nom, 0) : null));
}
// Kademe başına Δv payı (m/s): kalan Δv (roket denklemi) − o kademenin yapacağı planlı manevraların kalanı. Bozulmasız uçuşta sabit kalır
// (harcanan Δv hem kalandan hem gereksinimden düşer); plan dışı harcama (bozulma, elle yakış) payı azaltır. unplanned = tasarım payı − şimdiki pay.
export function dvMargins(progress, sd, base = null) {
  const rows = [];
  sd.forEach((s, j) => {
    if (!s) return;
    const req = progress.filter((p) => p.stage === j).reduce((a, p) => a + p.rem, 0), avail = s.dv * 1000, margin = avail - req;
    rows.push({ stage: j, avail, req, margin, base: base ? base[j] : null, unplanned: base && base[j] != null ? base[j] - margin : null });
  });
  return rows;
}
// Görev Δv bütçesi: planlı manevra durumları ve kademe payları (UI ve testler için tek giriş)
export function dvBudget(design, nominal, events, s, stages) {
  const progress = dvProgress(design, nominal, events, s.dv);
  return { progress, rows: dvMargins(progress, stageDvs(stages, s.k, s.m, s.prop), dvBaseline(design, nominal, stages)) };
}


// ------------------------------------------------------------------ yönelim ve kontrol (6-DOF)
// s: durum (worker): { q, w (gövde açısal hızı, rad/s), att: Dyn6.diag() (err, mode, g, tq, tqRcs, tqTvc, duty, sat), rcsUsed (kg, etkin kademe), k, prop, thr }; stages: tasarım kademeleri.
// Kütle özellikleri (rigidbody.massProps) o anki yakıt ve RCS tüketimiyle yeniden kurulur; yetkiler kademenin RCS/TVC değerlerinden: RCS tork yetkisi 2·n·F·kol (N·m),
// gimbal torku azami T·ℓ·tan(δmaks) (ℓ: kütle merkezi–gimbal kolu), açısal ivme yetkisi = tork / eylemsizlik.
export function attitudeInfo(s, stages) {
  const a = s.att, k = s.k, st = stages && stages[k];
  if (!a || !st) return null;
  const sp = stageSpec(st), sim = stages.map((x, j) => ({ ...x, prop0: x.prop, prop: j === k ? s.prop : x.prop, dry: j === k ? x.dry - (s.rcsUsed || 0) : x.dry })), mp = massProps(sim, k);
  const rcsMax = [0, 1, 2].map((i) => 2 * sp.rcs.n[i] * sp.rcs.F * 1000 * sp.rcs.arm[i]);
  const T = s.prop > 0 ? (s.thr || 0) * st.T : 0, tvcOn = T > 0 && mp.ell > CTL.ELL_MIN, gMax = Math.tan(sp.tvc.max * Math.PI / 180);
  const tvcMax = tvcOn ? T * 1000 * mp.ell * gMax : 0, rcsLeft = Math.max(0, sp.rcs.prop - (s.rcsUsed || 0)), w = s.w || a.w;
  const wMag = norm(w), gMag = Math.hypot(a.g[0], a.g[1]);
  return { mode: a.mode, err: a.err, errT: a.errT || 0, w, wMag, tq: a.tq, tqRcs: a.tqRcs, tqTvc: a.tqTvc, duty: a.duty, g: a.g, gMag, gMax, sat: a.sat, I: mp.I, ell: mp.ell, zCg: mp.zCg, m: mp.m,
    rcsMax, tvcMax, alphaRcs: [0, 1, 2].map((i) => rcsMax[i] / mp.I[i]), alphaTvc: tvcMax / mp.I[0], rcsUsed: s.rcsUsed || 0, rcsCap: sp.rcs.prop, rcsLeft, rcsFrac: sp.rcs.prop > 0 ? rcsLeft / sp.rcs.prop : null,
    wLimit: sp.ctl.wMax * Math.PI / 180, tvcOn, role: sp.role };
}

// ------------------------------------------------------------------ ana hesap
// s: { t, r, v (geosentrik ICRF), m, prop, k, thr, u, phase, dv, local? }; o: { stages, siteIcrf(t), rSite, tLaunch }
export function computeTelemetry(s, o) {
  const t = s.t, rg = s.r, vg = s.v, rm = E.moonPos(t), vm = E.moonVel(t), sunG = E.sunPos(t);
  const rM = sub(rg, rm), vM = sub(vg, vm), dM = norm(rM), dE = norm(rg);
  const isMoon = dM < E.MOON_ZONE, mu = isMoon ? E.MU_M : E.MU_E;
  const rb = isMoon ? rM : rg, vb = isMoon ? vM : vg, r = norm(rb), vIn = norm(vb), up = scale(rb, 1 / r);
  const ax = bodyAxes(isMoon, t), eq = isMoon ? null : E.precession(t);
  const tel = { t, phase: s.phase, isMoon, body: isMoon ? 'Ay' : 'Dünya', mu, R: isMoon ? E.R_M : E.R_E, r };

  // konum: Dünya'da jeodezik (WGS-84 türü elipsoid), Ay'da ortalama küre (R_M) ve iniş yeri yüzeyi (R_SITE)
  tel.lon = Math.atan2(dot(rb, ax.y), dot(rb, ax.x));
  if (isMoon) { tel.alt = r - E.R_M; tel.lat = Math.asin(clamp(dot(up, ax.z), -1, 1)); tel.altSite = o.rSite ? r - o.rSite : null; }
  else { const g = geodetic(rb, ax.z); tel.alt = g.h; tel.lat = g.lat; tel.altSite = null; }

  // hız: eylemsiz (merkez cisme göre) ve dönen yüzeye göre. Dikey hız radyal bileşendir; (ω×r)·r = 0 olduğundan ikisinde aynıdır.
  const vr = dot(vb, up), vRelV = sub(vb, cross(ax.omega, rb)), vRel = norm(vRelV);
  const east = cross(ax.z, up), eastN = norm(east), eastU = eastN > 1e-9 ? scale(east, 1 / eastN) : null, northU = eastU ? cross(up, eastU) : null;
  const vRelH = Math.sqrt(Math.max(0, vRel * vRel - vr * vr));
  Object.assign(tel, { v: vIn, vr, vt: Math.sqrt(Math.max(0, vIn * vIn - vr * vr)), gamma: Math.atan2(vr, Math.sqrt(Math.max(0, vIn * vIn - vr * vr))),
    vRel, vRelH, gammaRel: Math.atan2(vr, vRelH), azRel: eastU && vRelH > 1e-9 ? mod(Math.atan2(dot(vRelV, eastU), dot(vRelV, northU)), TWO_PI) : null });

  // yörünge (osküle konik) ve apsis süreleri, motor kesilirse yüzeye çarpma
  const orb = orbitInfo(rb, vb, mu, ax.z, eq ? eq[0] : null, eq ? eq[1] : null);
  tel.orbit = { a: orb.a, e: orb.e, inc: orb.inc, raan: orb.raan, argp: orb.argp, nu: orb.nu, rp: orb.rp, ra: orb.ra, period: orb.period, energy: orb.energy,
    vCirc: orb.vCirc, vEsc: orb.vEsc, vInf: orb.vInf, hn: orb.hn, bound: orb.e < 1, evec: orb.evec, hh: orb.hh, p: orb.p };
  tel.orbit.altPeri = orb.rp - tel.R; tel.orbit.altApo = orb.e < 1 ? orb.ra - tel.R : null;
  if (orb.e > 1e-4) Object.assign(tel.orbit, apsisTimes(orb, orb.nu, mu));
  tel.tImpact = isMoon && o.rSite ? timeToRadius(orb, orb.nu, r, o.rSite, mu) : null;
  // koniğin geçerliliği: üçüncü cisimlerin bozucu ivmesi / merkezi çekim (Dünya merkezliyken Ay + Güneş, Ay merkezliyken Dünya + Güneş)
  const pert = thirdBodyPerturbation(rg, isMoon ? rm : [0, 0, 0], isMoon ? [[E.MU_E, [0, 0, 0]], [E.MU_S, sunG]] : [[E.MU_M, rm], [E.MU_S, sunG]]);
  tel.pertRatio = norm(pert) / (mu / (r * r));
  // yakınlık bayrakları: yüzeye göre hız yalnız gövdeye yakınken anlamlı (uzakta ω×r dönen çerçevenin sanal hızıdır), itki/ağırlık da öyle
  tel.near = { surf: tel.alt < tel.R, grav: tel.alt < 2 * tel.R };

  // itki, kütle akışı, ivme, Δv (aktif kademe: x.k)
  const st = o.stages[s.k] || null, c = st ? st.isp * E.G0 : 0;
  const F = st && s.prop > 0 ? (s.thr || 0) * st.T : 0, mdot = F > 0 && c > 0 ? F / c : 0, aT = s.m > 0 ? F / s.m : 0, g = mu / (r * r);
  const sd = stageDvs(o.stages, s.k, s.m, s.prop);
  Object.assign(tel, { stage: st ? { k: s.k, name: st.name, T: st.T, isp: st.isp, c, thrMin: st.thr_min, cap: st.prop, dry: st.dry } : null,
    thr: F > 0 ? s.thr : 0, F, mdot, aT, gLoad: aT / E.G0, m: s.m, prop: s.prop, propFrac: st && st.prop > 0 ? s.prop / st.prop : null,
    tBurn: mdot > 0 ? s.prop / mdot : null, tBurnFull: st && st.T > 0 ? s.prop / (st.T / c) : null,
    g, aMax: st && st.T > 0 ? st.T / s.m : 0, twrMax: st && st.T > 0 ? st.T / s.m / g : null, twr: F > 0 ? aT / g : 0,
    hoverThr: st && st.T > 0 ? s.m * g / st.T : null, dvUsed: s.dv, stageDv: sd, dvStage: sd[s.k] ? sd[s.k].dv : 0, dvTotal: sd.reduce((a, q) => a + (q ? q.dv : 0), 0) });
  // itki yönü: hıza ve yerel ufka göre
  if (F > 0 && s.u && norm(s.u) > 0) {
    const u = unit(s.u);
    tel.thrustDir = { vsVel: Math.acos(clamp(dot(u, unit(vb)), -1, 1)), pitch: Math.asin(clamp(dot(u, up), -1, 1)), az: eastU ? mod(Math.atan2(dot(u, eastU), dot(u, northU)), TWO_PI) : null };
  } else tel.thrustDir = null;
  tel.att = attitudeInfo(s, o.stages);

  // ortam: uzaklıklar, ışık süresi, Dünya ile görüş hattı, Güneş ışığı
  const dS = norm(sub(sunG, rg)), earthBlocked = sphereBlocksSegment(rg, [0, 0, 0], rm, E.R_M);
  const frac = sunlightFraction(rg, sunG, [[[0, 0, 0], E.R_E], [rm, E.R_M]]);
  const fE = 1 - sunlightFraction(rg, sunG, [[[0, 0, 0], E.R_E]]), fM = 1 - sunlightFraction(rg, sunG, [[rm, E.R_M]]);
  Object.assign(tel, { dEarth: dE, dMoon: dM, dSun: dS, lightTime: dE / C_LIGHT, rangeRateMoon: dot(rM, vM) / dM, rangeRateEarth: dot(rg, vg) / dE,
    earthVisible: !earthBlocked, earthElev: isMoon ? Math.asin(clamp(dot(up, unit(scale(rg, -1))), -1, 1)) : null,
    sunFrac: frac, eclipseBy: frac < 0.999 ? (fE >= fM ? 'Dünya' : 'Ay') : null });

  // iniş göstergeleri (Ay'ın yakınında): ufuk yüksekliği, menzil, durma yüksekliği (azami itkıyla dikey), hız sıfırlama alt sınırı
  tel.land = null;
  if (isMoon && o.rSite && tel.alt < 200) {
    const siteV = o.siteIcrf ? o.siteIcrf(t) : null, sh = siteV ? unit(siteV) : null, h = r - o.rSite;
    const aNet = tel.aMax - g, stopH = vr < 0 && aNet > 0 ? vr * vr / (2 * aNet) : vr < 0 ? Infinity : 0;
    tel.land = { h, vz: vr, vh: vRelH, vRel, aNet, stopH, stopMargin: h - stopH, tImpact: tel.tImpact,
      groundRange: sh ? o.rSite * Math.atan2(norm(cross(up, sh)), dot(up, sh)) : null,
      down: s.local ? s.local.p[0] : null, cross: s.local ? s.local.p[1] : null,
      sunElev: sh ? Math.asin(clamp(dot(sh, unit(sub(sunG, add(rm, siteV)))), -1, 1)) : null,
      hoverOk: tel.hoverThr != null && st ? tel.hoverThr >= st.thr_min && tel.hoverThr <= 1 : null };
  }
  tel.met = o.tLaunch != null ? t - o.tLaunch : null;
  return tel;
}

// ------------------------------------------------------------------ uyarılar
// Fiziksel eşiklere dayalı uyarılar (seviye: bad kırmızı, warn sarı, info mavi). margins: dvMargins çıktısı.
// Sert temas riski: temasa 10 m kala dikey ya da yatay hız sınırı aşıyorsa. Nominal iniş profili burada dikey ≲ 0,7 m/s'dir (vz_ref = −0,001 − 0,07·h km/s),
// bu yüzden daha yüksekteki hızlar uyarı sayılmaz; yüksekte sorun, durma yüksekliği uyarısıyla (stopMargin) yakalanır.
export function touchRisk(tel, lim = LIMITS) {
  const L = tel.land;
  return !!L && tel.phase !== 'INDI' && L.h * 1000 < 10 && (Math.abs(L.vz) * 1000 > lim.vz || L.vh * 1000 > lim.vh);
}
const f0 = (x) => Math.round(x).toLocaleString('tr-TR'), f1 = (x) => x.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export function alerts(tel, margins = [], o = {}) {
  const out = [], push = (id, level, text) => out.push({ id, level, text }), lim = o.limits || LIMITS, landing = LANDING_PHASES.has(tel.phase);
  const names = o.stages || [];
  for (const q of margins) {
    if (!(q.req > 0)) continue;
    const nm = names[q.stage] ? names[q.stage].name : 'Kademe ' + q.stage;
    if (q.margin < 0) push('dv' + q.stage, 'bad', `${nm}: Δv yetersiz — kalan plan ${f0(q.req)} m/s, roket denklemiyle kalan ${f0(q.avail)} m/s (eksik ${f0(-q.margin)} m/s)`);
    else if (q.base > 0 && q.unplanned > Math.max(5, 0.5 * q.base)) push('dv' + q.stage, 'warn', `${nm}: plan dışı ${f0(q.unplanned)} m/s harcandı; tasarım payının (${f0(q.base)} m/s) yarısından fazlası gitti`);
  }
  const st = tel.stage;
  if (st && st.k >= 1 && tel.prop <= 0 && tel.phase !== 'INDI') push('burnout', 'bad', `${st.name}: yakıt bitti, itki yok`);
  const o_ = tel.orbit;
  // Osküle konik yalnız merkez cismin çekimini bilir. Uyarı, çarpmaya kalan sürede üçüncü cisimlerin yaratacağı konum hatası (½·a_bozucu·t²) delme derinliğinin
  // (iniş yeri yarıçapı − periselen) yarısından küçükse verilir; halo yörüngelerinde ve uzak transferde koniğin periseleni yanıltıcıdır, uyarı verilmez.
  const errPert = tel.tImpact != null ? 0.5 * tel.pertRatio * tel.g * tel.tImpact * tel.tImpact : Infinity, depth = o.rSite ? o.rSite - o_.rp : 0;
  if (tel.isMoon && o.rSite && o_.rp < o.rSite && !landing && tel.tImpact != null && errPert < 0.5 * depth) push('surf', 'bad', `Yörünge Ay yüzeyini kesiyor: periselen irtifası ${f1(o_.rp - o.rSite)} km, motor kesilirse ${f0(tel.tImpact)} s sonra çarpma`);
  // Dünya'ya yakın, Dünya'nın baskın olduğu bağlı yörüngeler (apoje < 100.000 km: Ay gelgiti perijeyi ~10⁻³ oranında oynatır); görev motoru 80 km'de görevi sonlandırır
  if (!tel.isMoon && o_.bound && o_.ra < 100000 && o_.altPeri < 80) push('reentry', 'bad', `Dünya atmosferine giriş yörüngesi: perije irtifası ${f1(o_.altPeri)} km`);
  const L = tel.land, descending = landing && tel.phase !== 'INDI';           // temas sonrası iniş uyarıları anlamsız (sonuç ayrıca bildirilir)
  if (L && descending) {
    if (tel.twrMax != null && st && st.k >= 1 && tel.twrMax < 1) push('twr', 'bad', `İtki/ağırlık ${tel.twrMax.toFixed(2).replace('.', ',')} < 1: azami itkıyla bile askıda kalınamaz`);
    else if (L.hoverOk === false && L.h < 1) push('hover', 'warn', 'En düşük itki ağırlıktan büyük (ya da azami itki yetmiyor): askıda kalınamaz');
    if (L.h > 0 && L.stopMargin < 0 && L.vz < 0 && L.h < 20) push('stop', 'bad', `Durma yüksekliğinin altında: ${f0(L.h * 1000)} m irtifada ${f1(-L.vz * 1000)} m/s alçalışı azami itkı ${f0(L.stopH * 1000)} m'de durdurabilir`);
    if (touchRisk(tel, lim)) push('touch', 'warn', `Temas hızı sınırın üstünde: dikey ${f1(Math.abs(L.vz) * 1000)} m/s (sınır ${f1(lim.vz)}), yatay ${f1(L.vh * 1000)} m/s (sınır ${f1(lim.vh)})`);
  }
  const A = tel.att;
  if (A) {
    if (A.mode === 'free') push('attfree', 'bad', 'Yönelim denetimsiz: RCS yakıtı bitti, gimbal yok — araç torksuz serbest dönüyor');
    else if (A.rcsFrac != null && A.rcsFrac < 0.2 && A.rcsLeft > 0) push('rcslow', 'warn', `RCS yakıtı azaldı: ${f1(A.rcsLeft)} kg kaldı (bütçe ${f0(A.rcsCap)} kg)`);
    if (tel.F > 0 && A.errT >= 8 && tel.phase !== 'INDI') push('atterr', 'warn', `İtki ekseni komuttan ${f1(A.err * 180 / Math.PI)}° saptı ve ${f0(A.errT)} s'dir düzelmiyor (itki gerçek eksen boyunca uygulanıyor)`);
  }
  if (!tel.earthVisible) push('los', 'info', 'Dünya ile görüş hattı yok: Ay engelliyor (haberleşme kesik)');
  if (tel.eclipseBy) push('ecl', 'info', `${tel.eclipseBy === 'Ay' ? "Ay'ın" : tel.eclipseBy === 'Dünya' ? "Dünya'nın" : tel.eclipseBy} gölgesinde: Güneş ışığı %${f0(100 * tel.sunFrac)}`);
  return out;
}
