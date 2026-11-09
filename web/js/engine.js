// LS19 fizik motoru — rocsim_mission_engine.py'nin JavaScript karşılığı (N-cisim çerçevesi ve değişken kütleli itki eklendi)
// Birimler: km, s, kg. Zaman: TDB saniye (JD0 = 2026-10-01 00:00 TDB'den). Çerçeve: ICRF.
// Kuvvetler: merkez cisim (Dünya/Ay) + Dünya J2 (presesyonlu kutup) + Ay çekim alanı (GRAIL GRGM1200A, varsayılan 60. derece; PA çerçevesi; moongrav.js)
//            + Ay/Dünya/Güneş (ve canlı efemeriste gezegenler) üçüncü cisim çekimi (DE440 konumları) + sonlu itki.
// Çerçeve ('central'):
//   'E' Dünya merkezli, 'M' Ay merkezli (Ay'ın etki küresine girince/çıkınca durum kesin dönüşümle değişir) — iki merkez cisimli (patched) çerçeve.
//   'N' N-cisim: tek eylemsiz çerçeve (Dünya merkezli, ICRF eksenli), etki küresi geçişi YOK. Dünya, Ay, Güneş (+gezegenler) araca her an birlikte
//       çeker; Dünya J2 her yerde, Ay figürü (küresel harmonikler) Ay'ın MOON_FIG_RANGE yakınında uygulanır. Üçüncü cisimler dolaylı terimiyle (Dünya'nın ivmesi) alınır,
//       yani uzay aracının barisentrik hareket denklemiyle eşdeğerdir (bağımsız barisentrik entegrasyonla ≤ 1 m uyum: test/test_nbody.js).
// Sonlu itki: itki ivmesi her DOPRI aşamasında o aşamanın kütlesiyle (m₀ − ṁ·Δt) hesaplanır; böylece uygulanan Δv roket denklemine uyar.
// Entegratör: Dormand–Prince 5(4), uyarlamalı adım.
// Yönelim (isteğe bağlı): Propagator'a bir Attitude (attitude.js, kinematik: hız sınırlı) ya da Dyn6 (attctl.js, 6-DOF: rijit cisim + RCS/TVC) verilirse itki komuta doğru dönen GERÇEK itki ekseni boyunca
// uygulanır; yoksa itki yönü komutla birebir (eski davranış). Dyn6'da dönme Euler denklemleriyle, her denetim periyodunda (itkili ya da dönerken ≤ 0,05–0,1 s) ilerler; ötelemeyi bu dosyanın DOPRI5'i taşır.
import { attStep, D2R } from './attitude.js';
import { massProps } from './rigidbody.js';
import { moonGravity } from './moongrav.js';

export const MU_E = 398600.435507, MU_M = 4902.800118, MU_S = 132712440041.279;
export const R_E = 6378.1363, J2_E = 1.0826267e-3;
export const R_M_REF = 1738.0, R_M = 1737.4, J2_M = 2.03213e-4, C22_M = 2.2382e-5;
export const G0 = 9.80665e-3, SOI_M = 66100.0;
const TT_UTC = 69.184, DAY = 86400.0;
// N-cisim çerçevesinde Ay figür (J2/C22) terimi bu uzaklığın içinde uygulanır (km; sınırdaki ivme ~1e-14 km/s²)
const MOON_FIG_RANGE = 150000.0;
// motor seçenekleri: exactMass=false eski davranış (itki ivmesi adım başı kütleyle sabit; TLI'da Δv'yi ~%0,14 eksik uygular)
// moonGravDeg: Ay çekim alanının derecesi (GRAIL GRGM1200A, en çok 100). 0 → yalnız J2/C22 (eski model). 60. derece 100 km'de
//   2–100. derece ivmesinin %98'ini verir (rms fark 0,013 mm/s²); yüzeye yakın kesme hatası ~0,4 mm/s² (güdüm kapalı döngüde karşılar).
//   30 km altında moongrav.js ızgaradan aradeğerler (hata ≤ 0,002 mm/s²).
export const OPTS = { exactMass: true, moonGravDeg: 60 };
// görüntü/arayüz için 'Ay çevresi' yarıçapı (fizikteki merkez cisim geçişinden bağımsız): halo görevlerinde halo'yu kapsar
export let MOON_ZONE = SOI_M;
export function setMoonZone(r) { MOON_ZONE = r; }

// ------------------------------------------------------------------ küçük vektör/matris yardımcıları
import { add, sub, scale, dot, cross, norm, unit, mv, mtv, mm, mT } from './vec3.js';
import { DP_A, DP_C, DP_B5, DP_B4 } from './dopri.js';
export { add, sub, scale, dot, cross, norm, unit, mv, mtv, mm, mT };
const R1 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
const R2 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
const R3 = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };

// ------------------------------------------------------------------ efemeris
let EPH = null;

function chebder(c) {             // numpy.polynomial.chebyshev.chebder karşılığı
  const n = c.length, d = new Array(n - 1).fill(0);
  const cc = c.slice();
  for (let j = n - 1; j > 2; j--) { d[j - 1] = 2 * j * cc[j]; cc[j - 2] += (j * cc[j]) / (j - 2); }
  if (n - 1 > 1) d[1] = 4 * cc[2];
  d[0] = cc[1];
  return d;
}

export function loadEphemeris(data) {
  const me = data.me_from_pa_arcsec_313.map((a) => (a / 3600) * Math.PI / 180);
  EPH = {
    JD0: data.JD0, ndays: data.ndays,
    moon: data.moon, sun: data.sun, pa: data.pa,
    moon_d: data.moon.map((seg) => seg.map(chebder)),
    ME: mm(mm(R1(-me[2]), R2(-me[1])), R3(-me[0])),                 // PA -> ME (bkz. meMatrix)
  };
  PROV = tableProvider();
  return EPH;
}

function cheb(tab, t, span) {
  const d = t / DAY;
  let s = Math.floor(d / span);
  s = Math.min(Math.max(s, 0), tab.length - 1);
  const x = (2.0 * (d - s * span)) / span - 1.0;
  const seg = tab[s], n = seg[0].length;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {             // Clenshaw
    const c = seg[k]; let b1 = 0, b2 = 0;
    for (let j = n - 1; j >= 1; j--) { const b0 = 2 * x * b1 - b2 + c[j]; b2 = b1; b1 = b0; }
    out[k] = x * b1 - b2 + c[0];
  }
  return out;
}

// ------------------------------------------------------------------ efemeris sağlayıcısı
// 'table': Ekim–Aralık 2026 için önceden uydurulmuş DE440 tabloları (eski, doğrulama için)
// 'live' : canlı N-cisim efemerisi (ephem.js) + IAU 2006/2000A Dünya yönelimi (earth.js)
let PROV = null;
// PA -> ME sabit dönüşümü (NAIF moon_de440_*.tf, TKFRAME AXES 3,2,1, ANGLES 67,8526″ 78,6944″ 0,2785″). SPICE TKFRAME açıları TK çerçevesinden (ME)
// göreli çerçeveye (PA) dönüşümü tanımlar; PA -> ME bunun tersidir: ME = R1(−0,2785″)·R2(−78,6944″)·R3(−67,8526″)·PA (Rᵢ: çerçeve döndürmesi).
// Doğrulama: açısal fark 0,02886° ≈ Ay yüzeyinde 875 m (NAIF'in verdiği değer); Skyfield aynı yönle Ay yüzeyindeki noktayı HORIZONS'a 101 m içinde uydurur.
// (Eski sürüm açıları ters işaretle uyguluyordu: ME çerçevesi doğrusundan 0,0577° ≈ 1,75 km sapıyordu; test/test_moonframe.js)
const ME_DEFAULT_ARCSEC = [67.8526, 78.6944, 0.2785];
export const meMatrix = (as) => { const me = as.map((a) => (a / 3600) * Math.PI / 180); return mm(mm(R1(-me[2]), R2(-me[1])), R3(-me[0])); };
const tableProvider = () => ({
  kind: 'table',
  moonPos: (t) => cheb(EPH.moon, t, 1.0), moonVel: (t) => scale(cheb(EPH.moon_d, t, 1.0), 2.0 / DAY), sunPos: (t) => cheb(EPH.sun, t, 8.0),
  planets: () => [],
  moonIcrfToPa: (t) => { const [phi, theta, psi] = cheb(EPH.pa, t, 1.0); return mm(mm(R3(psi), R1(theta)), R3(phi)); },
  pole: (t) => precessionIAU76(t)[2], npb: (t) => precessionIAU76(t),
  earthIcrfToItrf: (t) => mm(R3(gmst82(t)), precessionIAU76(t)),
  ttMinusUtc: () => TT_UTC,
});
export function setProvider(p) { PROV = p; }
export function getProvider() { return PROV; }
export const provider = () => PROV;

// canlı sağlayıcı: LiveEphemeris (SSB) + earth.js
export function liveProvider(L, EO, IDX) {
  const et = (t) => t + (JD0_ENGINE - 2451545.0) * DAY;
  let cT = NaN, cE = null, cM = null, cS = null;
  const upd = (t) => {
    if (t === cT) return;
    const e = et(t); cE = L.body(IDX.IE, e); cM = L.body(IDX.IM, e); cS = L.body(IDX.IS, e); cT = t;
  };
  const planetIdx = [1, 2, 5, 6, 7, 8, 9, 10].filter((i) => i !== IDX.IE && i !== IDX.IM && i !== IDX.IS);
  return {
    kind: 'live', L, EO,
    moonPos: (t) => { upd(t); return sub(cM[0], cE[0]); },
    moonVel: (t) => { upd(t); return sub(cM[1], cE[1]); },
    sunPos: (t) => { upd(t); return sub(cS[0], cE[0]); },
    earthSSB: (t) => { upd(t); return cE; },
    planets: (t) => { upd(t); const e = et(t); return planetIdx.map((i) => [IDX.GM[i], sub(L.body(i, e)[0], cE[0])]); },
    moonIcrfToPa: (t) => { const { q } = L.moonAttitude(et(t)); const [w, x, y, z] = q;
      return [[1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)], [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]]; },
    pole: (t) => EO.truePoleFast(jdTdb(t)), npb: (t) => EO.npbFast(jdTdb(t)).R,
    earthIcrfToItrf: (t) => EO.icrfToItrfFast(jdTdb(t)),
    ttMinusUtc: (jd) => EO.ttMinusUtc(jd),
  };
}

const JD0_ENGINE = 2461314.5;                  // motor zaman orijini: 2026-10-01 00:00 TDB (t = 0)
export const moonPos = (t) => PROV.moonPos(t);
export const moonVel = (t) => PROV.moonVel(t);
export const sunPos = (t) => PROV.sunPos(t);
export const moonIcrfToPa = (t) => PROV.moonIcrfToPa(t);
let ME = meMatrix(ME_DEFAULT_ARCSEC);
export const moonIcrfToMe = (t) => mm(ME, moonIcrfToPa(t));
export const jdTdb = (t) => JD0_ENGINE + t / DAY;
export const tFromJdTdb = (jd) => (jd - JD0_ENGINE) * DAY;
export const precession = (t) => PROV.npb(t);            // satır 2: tarihin (gerçek) kutbu
export const earthIcrfToItrf = (t) => PROV.earthIcrfToItrf(t);

function precessionIAU76(t) {
  const T = (jdTdb(t) - 2451545.0) / 36525.0, as2r = Math.PI / 180 / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as2r;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as2r;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as2r;
  return mm(mm(R3(-z), R2(th)), R3(-zeta));
}
function gmst82(t) {
  const jd = jdTdb(t) - TT_UTC / DAY, D = jd - 2451545.0, T = D / 36525.0;
  const g = 280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - T ** 3 / 38710000.0;
  return (((g % 360) + 360) % 360) * Math.PI / 180;
}

// ------------------------------------------------------------------ kuvvet modeli
// Ay'ın figür ivmesi (merkez terim hariç): r Ay'a göre konum (ICRF), M ICRF -> PA dönüşü; sonuç ICRF'de.
// OPTS.moonGravDeg ≥ 2 ise GRAIL küresel harmonikleri (moongrav.js), 0 ise yalnız J2/C22 (kapalı biçim).
// fine: kısa adım (yakış, iniş): alçak yörüngede de ızgaradan aradeğerlenir (moongrav.js); büyük adımlı süzülmede doğrudan toplam.
function moonFigure(M, r, rn2, rn, fine = false) {
  if (OPTS.moonGravDeg >= 2) return mtv(M, moonGravity(mv(M, r), MU_M, OPTS.moonGravDeg, fine));
  const [x, y, zz] = mv(M, r);
  const Rr = R_M_REF * R_M_REF, r5 = rn2 * rn2 * rn, r7 = r5 * rn2;
  const kJ = (-1.5 * J2_M * MU_M * Rr) / r5, q = (5 * zz * zz) / rn2;
  const kC = 3 * MU_M * Rr * C22_M, w = x * x - y * y;
  const loc = [kJ * x * (1 - q) + kC * (2 * x / r5 - 5 * w * x / r7),
               kJ * y * (1 - q) + kC * (-2 * y / r5 - 5 * w * y / r7),
               kJ * zz * (3 - q) + kC * (-5 * w * zz / r7)];
  return mtv(M, loc);
}
// 'E' ve 'N': Dünya merkezli (eylemsiz) çerçeve. 'N' ek olarak Ay figürünü Ay'ın yakınında uygular; etki küresi geçişi yoktur.
export function accel(t, r, central, thr, pole, Mpa, fine = false) {
  const rm = moonPos(t), rs = sunPos(t);
  const rn2 = dot(r, r), rn = Math.sqrt(rn2);
  let ax, ay, az;
  if (central !== 'M') {
    const k0 = -MU_E / (rn2 * rn);
    ax = k0 * r[0]; ay = k0 * r[1]; az = k0 * r[2];
    const p = pole || PROV.pole(t);
    const z = dot(r, p), k = (1.5 * J2_E * MU_E * R_E * R_E) / (rn2 * rn2 * rn), f = 5 * z * z / rn2 - 1;
    ax += k * (f * r[0] - 2 * z * p[0]); ay += k * (f * r[1] - 2 * z * p[1]); az += k * (f * r[2] - 2 * z * p[2]);
    // Ay (3. cisim)
    let d = sub(rm, r), dn = norm(d), rmn = norm(rm), q1 = MU_M / (dn * dn * dn), q2 = MU_M / (rmn * rmn * rmn);
    ax += q1 * d[0] - q2 * rm[0]; ay += q1 * d[1] - q2 * rm[1]; az += q1 * d[2] - q2 * rm[2];
    d = sub(rs, r); dn = norm(d); const rsn = norm(rs); q1 = MU_S / (dn * dn * dn); q2 = MU_S / (rsn * rsn * rsn);
    ax += q1 * d[0] - q2 * rs[0]; ay += q1 * d[1] - q2 * rs[1]; az += q1 * d[2] - q2 * rs[2];
    for (const [gm, rp] of PROV.planets(t)) {               // gezegenler (canlı efemeriste)
      const dp = sub(rp, r), dpn = norm(dp), rpn = norm(rp), p1 = gm / (dpn * dpn * dpn), p2 = gm / (rpn * rpn * rpn);
      ax += p1 * dp[0] - p2 * rp[0]; ay += p1 * dp[1] - p2 * rp[1]; az += p1 * dp[2] - p2 * rp[2];
    }
    if (central === 'N') {                                   // N-cisim: Ay'ın figürü (yalnız yakınında anlamlı)
      const s = sub(r, rm), sn2 = dot(s, s);
      if (sn2 < MOON_FIG_RANGE * MOON_FIG_RANGE) {
        const g = moonFigure(Mpa || moonIcrfToPa(t), s, sn2, Math.sqrt(sn2), fine);
        ax += g[0]; ay += g[1]; az += g[2];
      }
    }
  } else {
    const k0 = -MU_M / (rn2 * rn);
    ax = k0 * r[0]; ay = k0 * r[1]; az = k0 * r[2];
    const g = moonFigure(Mpa || moonIcrfToPa(t), r, rn2, rn, fine);
    ax += g[0]; ay += g[1]; az += g[2];
    const re = [-rm[0], -rm[1], -rm[2]];
    let d = sub(re, r), dn = norm(d), ren = norm(re), q1 = MU_E / (dn * dn * dn), q2 = MU_E / (ren * ren * ren);
    ax += q1 * d[0] - q2 * re[0]; ay += q1 * d[1] - q2 * re[1]; az += q1 * d[2] - q2 * re[2];
    const rsm = sub(rs, rm);
    d = sub(rsm, r); dn = norm(d); const rsmn = norm(rsm); q1 = MU_S / (dn * dn * dn); q2 = MU_S / (rsmn * rsmn * rsmn);
    ax += q1 * d[0] - q2 * rsm[0]; ay += q1 * d[1] - q2 * rsm[1]; az += q1 * d[2] - q2 * rsm[2];
    for (const [gm, rp0] of PROV.planets(t)) {               // gezegenler, Ay'a göre
      const rp = sub(rp0, rm), dp = sub(rp, r), dpn = norm(dp), rpn = norm(rp), p1 = gm / (dpn * dpn * dpn), p2 = gm / (rpn * rpn * rpn);
      ax += p1 * dp[0] - p2 * rp[0]; ay += p1 * dp[1] - p2 * rp[1]; az += p1 * dp[2] - p2 * rp[2];
    }
  }
  if (thr) { ax += thr[0]; ay += thr[1]; az += thr[2]; }
  return [ax, ay, az];
}

// Kuvvet dökümü (arayüz ve inceleme için): araca etkiyen ivmelerin büyüklükleri, m/s².
// r: durumun merkez cismine göre konum (central: 'E' | 'M' | 'N'). Her cisim için iki değer:
//   direct: o cismin aracı tek başına çekmesi (μ/d²)
//   eff   : baskın cismin çerçevesinde hareketi gerçekten etkileyen kısım. Baskın cisim kendisi için direct'tir; diğerleri için
//           bozucu (gelgit) etkidir: cismin araca çekimi − baskın cisme çekimi (ortak ivme düşer, örn. Güneş: 6e-3 → ~1e-7 m/s²).
// frame: baskın cisim, araç Ay'ın etki küresinin içindeyse 'M', değilse 'E'.
export function accelBreakdown(t, r, central = 'N') {
  const K = 1000.0, rm = moonPos(t), rg = central === 'M' ? add(r, rm) : r, rn = norm(rg);
  const sMoon = sub(rg, rm), sn = norm(sMoon), frame = sn < SOI_M ? 'M' : 'E';
  const rc = frame === 'M' ? rm : [0, 0, 0];                              // baskın cismin (çerçeve merkezinin) geosentrik konumu
  const out = { frame, earthDist: rn, moonDist: sn };
  const body = (gm, rb) => {                                              // [doğrudan, etkin, bozucu vektör]
    const d = sub(rb, rg), dn = norm(d), dc = sub(rb, rc), dcn = norm(dc), direct = (K * gm) / (dn * dn);
    if (dcn < 1e-9) return [direct, direct, null];                        // baskın cismin kendisi
    const a = sub(scale(d, gm / dn ** 3), scale(dc, gm / dcn ** 3));
    return [direct, K * norm(a), a];
  };
  [out.earth, out.earthEff] = body(MU_E, [0, 0, 0]);
  [out.moon, out.moonEff] = body(MU_M, rm);
  [out.sun, out.sunEff] = body(MU_S, sunPos(t));
  let pl = [0, 0, 0];
  for (const [gm, rp] of PROV.planets(t)) pl = add(pl, body(gm, rp)[2]);
  out.planets = K * norm(pl);
  const p = PROV.pole(t), z = dot(rg, p), kk = (1.5 * J2_E * MU_E * R_E * R_E) / rn ** 5, f = 5 * z * z / (rn * rn) - 1;
  out.earthJ2 = K * norm([kk * (f * rg[0] - 2 * z * p[0]), kk * (f * rg[1] - 2 * z * p[1]), kk * (f * rg[2] - 2 * z * p[2])]);
  out.moonFig = sn < MOON_FIG_RANGE ? K * norm(moonFigure(moonIcrfToPa(t), sMoon, sn * sn, sn)) : 0;
  return out;
}

// ------------------------------------------------------------------ araç
// Yönelim ayarları: azami açısal hız (°/s) kademede 'slew' olarak verilebilir; verilmezse büyük itkılı (≥ 50 kN) üst kademe yavaş, iniş aracı sınıfı hızlı döner.
// tau: komuta yaklaşırken üstel yavaşlama (s); snap: bu açı içindeki komut tam izlenir (°); fine: bundan büyük bir dönme sürerken adım H_SLEW ile sınırlanır (kare kare örnekleme)
const ATT = { RATE_HEAVY: 2.0, RATE_LIGHT: 15.0, TAU: 0.8, SNAP_DEG: 0.5, FINE_DEG: 10.0, H_SLEW: 1.0 };
export const attParams = (st) => ({ rate: (st.slew != null ? st.slew : st.T >= 50 ? ATT.RATE_HEAVY : ATT.RATE_LIGHT) * D2R, tau: ATT.TAU, snap: ATT.SNAP_DEG * D2R });
export class Vehicle {
  constructor(stages) { this.stages = stages.map((s) => ({ ...s, prop0: s.prop0 != null ? s.prop0 : s.prop, dry0: s.dry0 != null ? s.dry0 : s.dry })); this.k = 0; }       // prop0/dry0: başlangıç yakıtı (tank doluluğu) ve kuru kütlesi (RCS yakıtı kuru kütleden düşer)
  get active() { return this.stages[this.k]; }
  mass() { let m = 0; for (let i = this.k; i < this.stages.length; i++) m += this.stages[i].dry + this.stages[i].prop; return m; }
  separate() { this.k += 1; }
  clone() { const v = new Vehicle(this.stages); v.k = this.k; return v; }
}
export const dummyVehicle = () => new Vehicle([{ name: 'x', dry: 1, prop: 0, T: 0, isp: 1 }]);

// ------------------------------------------------------------------ durum
export class State {
  constructor(t, r, v, central = 'E') { this.t = t; this.r = r.slice(); this.v = v.slice(); this.central = central; }
  copy() { return new State(this.t, this.r, this.v, this.central); }
  // geosentrik (yer merkezli eylemsiz) durum: 'E' ve 'N' zaten öyledir
  geo() { return this.central === 'M' ? [add(this.r, moonPos(this.t)), add(this.v, moonVel(this.t))] : [this.r, this.v]; }
  seleno() { return this.central === 'M' ? [this.r, this.v] : [sub(this.r, moonPos(this.t)), sub(this.v, moonVel(this.t))]; }
  // durumu başka çerçeveye kesin dönüştür ('E' | 'M' | 'N'); aynı çerçeveyse kopya
  toFrame(central) {
    if (central === this.central) return this.copy();
    if (central === 'M') { const [rs, vs] = this.seleno(); return new State(this.t, rs, vs, 'M'); }
    const [g, gv] = this.geo(); return new State(this.t, g, gv, central);
  }
  // Ay çerçevesindeki ('M') durumun eşdeğeri: N-cisim çerçevesinde araç Ay'ın etki küresinin içindeyse doğru (etki küresi modunda central === 'M')
  inMoonFrame() { return this.central === 'M' || (this.central === 'N' && norm(sub(this.r, moonPos(this.t))) < SOI_M); }
  switchIfNeeded() {
    if (this.central === 'N') return false;                  // N-cisim: tek çerçeve, geçiş yok
    const [rs, vs] = this.seleno(), d = norm(rs);
    if (this.central === 'E' && d < SOI_M * 0.98) { this.r = rs; this.v = vs; this.central = 'M'; return true; }
    if (this.central === 'M' && d > SOI_M * 1.02) { const [g, gv] = this.geo(); this.r = g; this.v = gv; this.central = 'E'; return true; }
    return false;
  }
}

// ------------------------------------------------------------------ DOPRI5
const A = DP_A, Cc = DP_C, B5 = DP_B5, B4 = DP_B4;              // Dormand–Prince 5(4) tablosu (dopri.js)
const TOL = { ATOL_R: 1e-5, ATOL_V: 1e-8, RTOL: 1e-12 };
// bu adımdan kısa DOPRI adımlarında Ay çekimi alçak yörüngede (≤ 200 km) ızgaradan aradeğerlenir (moongrav.js: yakışlar 0,05 s adımla)
const FINE_H = 2.0;

// thrust: null | [ax, ay, az] (sabit itki ivmesi, km/s²) | { u, T, m, mdot } (birim yön, itki kN, adım başı kütle kg, kütle akışı kg/s):
// ikincisinde itki ivmesi her aşamada o aşamanın kütlesiyle (m − ṁ·Cᵢ·h) hesaplanır
export function dopriStep(st, h, thrust) {
  const t = st.t, r = st.r, v = st.v, c = st.central;
  const pole = c !== 'M' ? PROV.pole(t) : null;
  let Mpa = null;
  if (c === 'M') Mpa = moonIcrfToPa(t + h / 2);
  else if (c === 'N') { const s = sub(r, moonPos(t)); if (dot(s, s) < MOON_FIG_RANGE * MOON_FIG_RANGE) Mpa = moonIcrfToPa(t + h / 2); }
  const thrAt = !thrust ? () => null : Array.isArray(thrust) ? () => thrust
    : (i) => { const k = thrust.T / (thrust.m - thrust.mdot * Cc[i] * h); return [thrust.u[0] * k, thrust.u[1] * k, thrust.u[2] * k]; };
  const kr = [], kv = [], fine = h < FINE_H;
  for (let i = 0; i < 7; i++) {
    let ri = r, vi = v;
    const Ai = A[i];
    if (Ai.length) {
      ri = r.slice(); vi = v.slice();
      for (let j = 0; j < Ai.length; j++) {
        const a = Ai[j]; if (!a) continue;
        const ha = h * a, krj = kr[j], kvj = kv[j];
        ri[0] += ha * krj[0]; ri[1] += ha * krj[1]; ri[2] += ha * krj[2];
        vi[0] += ha * kvj[0]; vi[1] += ha * kvj[1]; vi[2] += ha * kvj[2];
      }
    }
    kr.push(vi);
    kv.push(accel(t + Cc[i] * h, ri, c, thrAt(i), pole, Mpa, fine));
  }
  const r5 = r.slice(), v5 = v.slice(), r4 = r.slice(), v4 = v.slice();
  for (let i = 0; i < 7; i++) {
    const b5 = h * B5[i], b4 = h * B4[i];
    for (let k = 0; k < 3; k++) { r5[k] += b5 * kr[i][k]; v5[k] += b5 * kv[i][k]; r4[k] += b4 * kr[i][k]; v4[k] += b4 * kv[i][k]; }
  }
  const mabs = (a) => Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]));
  const scR = TOL.ATOL_R + TOL.RTOL * Math.max(mabs(r), mabs(r5));
  const scV = TOL.ATOL_V + TOL.RTOL * Math.max(mabs(v), mabs(v5));
  const err = Math.max(mabs(sub(r5, r4)) / scR, mabs(sub(v5, v4)) / scV);
  return [r5, v5, err];
}

const FAST_PHASES = new Set(['PDI', 'YAKLASMA', 'SON_INIS', 'INDI']);          // motorlu iniş: yönelim çevik
// Motor geçici rejimi (isteğe bağlı; kademede st.eng, upperstage.js engineTransient): ateşlemede (MES) itki rampası, kesmede (MECO) sönüm (kuyruk itkisi).
// Profiller parça parça doğrusal [[τ (s), itki oranı], ...]: ramp son noktadan sonra 1, tail son noktadan sonra 0. Adıma o aralıktaki ORTALAMA itki uygulanır
// (profilin tam integrali): itki darbesi adım boyundan bağımsız kesindir. Kütle akışı itkiyle orantılıdır (sabit Isp). st.eng yoksa itki eskisi gibi basamaktır.
export const ENG_DT = 0.2;                                                      // geçici rejimde azami adım (s)
const profAt = (pr, x, tail) => {
  if (x <= pr[0][0]) return pr[0][1];
  for (let i = 1; i < pr.length; i++) if (x <= pr[i][0]) { const [a, fa] = pr[i - 1], [b, fb] = pr[i]; return fa + (fb - fa) * (x - a) / (b - a); }
  return tail ? 0 : 1;
};
// ∫ f dτ, profilin ilk noktasından x'e (doğrusal parçalarda tam)
function profInt(pr, x, tail) {
  let s = 0;
  for (let i = 1; i < pr.length; i++) {
    const [a, fa] = pr[i - 1], [b, fb] = pr[i];
    if (x <= a) return s;
    const xe = Math.min(x, b), fe = fa + (fb - fa) * (xe - a) / (b - a);
    s += 0.5 * (xe - a) * (fa + fe);
    if (x <= b) return s;
  }
  return s + (tail ? 0 : x - pr[pr.length - 1][0]);
}
// [a, b] aralığında profilin ortalaması
export const profMean = (pr, a, b, tail = false) => (b - a < 1e-12 ? profAt(pr, a, tail) : (profInt(pr, b, tail) - profInt(pr, a, tail)) / (b - a));
// tail: kesmeden sonraki ∫ f dτ (s; kuyruk itkisi = T · bu); ramp: tam itkiye göre eksik ∫ (1 − f) dτ (s)
export const profImpulse = (pr, tail = true) => { const e = pr[pr.length - 1][0]; return tail ? profInt(pr, e, true) : e - profInt(pr, e, false); };
export class Propagator {
  // opts.nbody: durumu N-cisim çerçevesine ('N') alır; etki küresi geçişi yapılmaz
  constructor(state, vehicle, hMaxCoast = 900.0, hMaxBurn = 1.0, opts = {}) {
    this.nbody = !!opts.nbody;
    this.s = this.nbody ? state.toFrame('N') : state; this.veh = vehicle; this.h = 10.0;
    this.hMaxCoast = hMaxCoast; this.hMaxBurn = hMaxBurn;
    this.phase = ''; this.dvUsed = 0.0;
    this.tLimit = Infinity;          // canlı modda ekran saatinin ötesine geçme
    this.lastThr = 0; this.lastU = [0, 0, 0];
    this.onStep = null;              // (P, h, thr, u) geri çağrısı (kayıt için)
    this.att = null;                 // Attitude (attitude.js) ya da null: yoksa itki yönü komutla birebir
    this.attCmd = null;              // (P) -> birim yön | null: itkisiz süzülürken yönelim komutu (itkili adımda komut kumandanın yönüdür)
    this.lastQ = null;               // son adımdan sonraki yönelim kuaterniyonu [x, y, z, w] (gövde → ICRF)
    this.lastCmd = null; this.lastTheta = 0;
    this.attAim = false;             // true: yakış öncesi hizalama (itki vektörü hedefe baksın: kırpma gimbali ve itki sapması hesaba katılır)
    this.attFast = false;            // true: yönelim denetleyicisi çevik (azami dönme hızı wMax; elle uçuş); false: seyir dönme hızı sınırı (hizalama)
    this.eng = { on: false, t: 0, thr: 0, fCut: 1, u: null };   // motor geçici rejimi (st.eng varsa): on ateşlemede, t MES ya da MECO anı, kuyrukta gaz/yön/kesmedeki oran
    this.aux = null;                 // yardımcı itki (hidrazin yerleştirme / CCAM iticileri): { T (kN), isp (s) } gövde +z ekseni boyunca; yakıtı kademenin kuru kütlesinden (RCS gibi)
  }
  // ana motor itkisinin bu adımdaki planı (durumu değiştirmez): thr gaz (kuyrukta kesmedeki gaz), mean(h) adım ortalaması oranı, hMax, tail
  engPlan(thrCmd, st, t0) {
    const E = this.eng, pr = st.eng;
    if (!pr) return { thr: thrCmd, mean: () => 1, hMax: Infinity, start: false, cut: false, tail: false };
    if (thrCmd > 0) {
      const start = !E.on, tm = start ? t0 : E.t, tau = t0 - tm, pend = pr.ramp[pr.ramp.length - 1][0];
      return { thr: thrCmd, start, cut: false, tail: false, tMes: tm, mean: (h) => profMean(pr.ramp, tau, tau + h), hMax: tau < pend ? ENG_DT : Infinity };
    }
    if (E.on || (E.thr > 0 && t0 - E.t < pr.tail[pr.tail.length - 1][0])) {
      const cut = E.on, tc = cut ? t0 : E.t, f0 = cut ? profAt(pr.ramp, t0 - E.t, false) : E.fCut, tau = t0 - tc;
      return { thr: E.thr, cut, tail: true, tCut: tc, fCut: f0, u: E.u, mean: (h) => f0 * profMean(pr.tail, tau, tau + h, true), hMax: ENG_DT };
    }
    return { thr: 0, mean: () => 0, hMax: Infinity, start: false, cut: false, tail: false };
  }
  engCommit(eg, u) {
    const E = this.eng;
    if (eg.tail) { if (eg.cut) { E.on = false; E.t = eg.tCut; E.fCut = eg.fCut; } return; }
    if (eg.thr > 0) { if (eg.start) { E.on = true; E.t = eg.tMes; } E.thr = eg.thr; E.u = u; }
  }
  // yardımcı itki ekseni (gövde +z; yönelim yoksa son itki yönü ya da hız yönü)
  auxAxis() { return this.att ? this.att.axis() : unit(norm(this.lastU) > 0 ? this.lastU : this.s.v); }
  // control(P) -> [throttle, u] ya da null. u (birim yön) itki YÖNÜ KOMUTUdur; yönelim varsa gerçek itki ekseni komuta hız sınırlı döner.
  // throttle = 0 ile verilen [0, u] itkisiz yönelim komutudur.
  step(hReq, control = null) {
    let thr = 0, u = [0, 0, 0], cmd = null, src = null;
    if (control) { const c = control(this); if (c) { thr = c[0]; u = c[1]; cmd = c[1]; src = 'ctl'; } }
    const att = this.att;
    if (att && !cmd && this.attCmd) { cmd = this.attCmd(this); src = 'att'; }
    const st = this.veh.active;
    // geçici rejim (st.eng): kuyrukta itki, kesmedeki gaz ve (yönelimsizse) son yön ile sürer
    const eg = st.eng ? this.engPlan(thr, st, this.s.t) : null;
    if (eg && eg.tail) { thr = eg.thr; if (!att && eg.u) u = eg.u; }
    const T = thr > 0 && st.prop > 0 ? thr * st.T : 0.0;                 // tam itki (geçici rejimde adım ortalamasıyla çarpılır)
    const m = this.veh.mass();
    const mdot = T > 0 ? T / (st.isp * G0) : 0.0;
    if (att && att.dynamic && hReq > 0) return this.stepDyn(hReq, control, thr, u, cmd, src, T, m, mdot, eg);
    const ax = this.aux && this.aux.T > 0 ? this.aux : null;
    let hmax = T > 0 || ax ? this.hMaxBurn : this.hMaxCoast;
    if (eg) hmax = Math.min(hmax, eg.hMax);
    const ap = att && cmd ? attParams(st) : null;
    if (ap && att.angleTo(cmd) > ATT.FINE_DEG * D2R) hmax = Math.min(hmax, ATT.H_SLEW);     // büyük bir dönme sürerken kare kare örnekle
    let h = Math.sign(hReq) * Math.min(Math.abs(hReq), hmax, Math.abs(this.h));
    if (T > 0 && mdot * Math.abs(h) > st.prop) h = Math.sign(h) * (st.prop / mdot);   // yakıt bitişinde adım biter (itki o anda kesilir)
    let r5, v5, err, A = null, ux = u, Te = T, mde = mdot;
    const ua = ax ? this.auxAxis() : null, Ta = ax ? ax.T : 0, mda = ax ? ax.T / (ax.isp * G0) : 0;
    for (;;) {
      if (ap) { A = attStep(att.q, cmd, Math.abs(h), ap); ux = A.mid; }                   // bu adımdaki gerçek itki ekseni (adım küçülürse yeniden)
      if (eg && T > 0) { Te = T * eg.mean(Math.abs(h)); mde = Te / (st.isp * G0); }
      let thrust = Te <= 0 ? null : OPTS.exactMass ? { u: ux, T: Te, m, mdot: mde } : scale(ux, Te / m);
      if (ax) thrust = this.auxThrust(thrust, Te > 0 ? ux : null, Te, mde, ua, Ta, mda, m);
      [r5, v5, err] = dopriStep(this.s, h, thrust);
      if (err <= 1.0) break;
      h *= Math.max(0.2, 0.9 * err ** -0.2);
    }
    if (A) att.q = A.q;
    if (att) this.lastQ = att.q;
    this.lastCmd = cmd; this.lastTheta = A ? A.theta : 0;           // komut ve adım başındaki yönelim hatası (rad; yönelim yoksa 0)
    this.s.r = r5; this.s.v = v5; this.s.t += h;
    if (Te > 0) {
      const dm = Math.min(mde * Math.abs(h), st.prop);
      this.dvUsed += st.isp * G0 * Math.log(m / (m - dm));
      st.prop -= dm; if (st.prop < 1e-9) st.prop = 0;       // yuvarlama artığı kalmasın (bitiş adımı yakıtı tam tüketir)
    }
    if (ax) this.auxCommit(st, ax, mda * Math.abs(h), m - (Te > 0 ? mde * Math.abs(h) : 0));
    if (eg) this.engCommit(eg, ux);
    const fac = err < 1e-10 ? 5.0 : Math.min(5.0, 0.9 * err ** -0.2);
    this.h = Math.min(Math.abs(h) * fac, this.hMaxCoast);
    this.lastThr = Te > 0 ? thr : 0; this.lastU = Te > 0 ? ux : u;                     // itkili adımda GERÇEK itki ekseni
    this.s.switchIfNeeded();
    if (this.onStep) this.onStep(this, h, this.lastThr, u);
    return h;
  }
  // ana motor + yardımcı itki (ayrı eksenler): toplam kuvvet vektörü, toplam kütle akışı
  auxThrust(main, um, T, mdot, ua, Ta, mda, m) {
    const F = um ? [T * um[0] + Ta * ua[0], T * um[1] + Ta * ua[1], T * um[2] + Ta * ua[2]] : scale(ua, Ta), Fn = norm(F);
    if (!(Fn > 0)) return main;
    return OPTS.exactMass ? { u: scale(F, 1 / Fn), T: Fn, m, mdot: mdot + mda } : scale(F, 1 / m);
  }
  // yardımcı itki yakıtı (hidrazin) kademenin kuru kütlesinden düşer; Δv sayacına eklenir
  auxCommit(st, ax, dm, m) {
    const d = Math.min(dm, Math.max(0, st.dry - 1));
    if (!(d > 0)) return;
    this.dvUsed += ax.isp * G0 * Math.log(m / (m - d));
    st.dry -= d; st.auxUsed = (st.auxUsed || 0) + d; ax.used = (ax.used || 0) + d;
  }
  // 6-DOF adımı (att = Dyn6): denetleyici planı → (dönen yönelim için) aktüatör + RK4 dönme integrasyonu → itki gerçek (gimbal sapmalı) eksen boyunca DOPRI5 → kabul.
  // İtkili ya da yönelim hatalıyken adım ≤ denetim periyodu (kademe: 0,05–0,1 s), itkisiz ve komuta oturmuşken yarı-durağan tutma: adım serbest (günlerce süzülme).
  stepDyn(hReq, control, thr, u, cmd, src, T, m, mdot, eg = null) {
    const D = this.att, veh = this.veh, st = veh.active, t0 = this.s.t;
    if (!cmd) cmd = D.axis();                                           // komut yoksa mevcut yönelim korunur
    const mp = massProps(veh.stages, veh.k), sp = mp.sp, rcsLeft = Math.max(0, sp.rcs.prop - (st.rcsUsed || 0));
    const Tp = eg && T > 0 ? T * eg.mean(Math.min(sp.ctl.dt, hReq)) : T;   // denetleyicinin gördüğü itki (geçici rejimde ilk denetim periyodunun ortalaması)
    const P = D.plan({ cmd, t: t0, T: Tp, Tmax: st.T, mp, rcsLeft, fast: this.attFast || FAST_PHASES.has(this.phase), aim: this.attAim });
    const ax = this.aux && this.aux.T > 0 ? this.aux : null;
    let hmax = T > 0 || ax ? this.hMaxBurn : this.hMaxCoast;
    if (eg) hmax = Math.min(hmax, eg.hMax);
    if (!P.hold) hmax = Math.min(hmax, P.free ? 10.0 : sp.ctl.dt);
    let h = Math.min(hReq, hmax, this.h);
    if (T > 0 && mdot * h > st.prop) h = st.prop / mdot;                // yakıt bitişinde adım biter
    const ctx = {};
    if (!P.hold) {                                                      // gravite gradyanı: baskın cisme göre konum
      const rg = this.s.geo()[0], rr = sub(rg, moonPos(t0)), near = norm(rr) < MOON_ZONE, rv = near ? rr : rg, rn = norm(rv);
      ctx.gg = { rhat: [rv[0] / rn, rv[1] / rn, rv[2] / rn], k3: 3 * (near ? MU_M : MU_E) / (rn * rn * rn) };
    }
    let r5, v5, err, R = null, Te = T, mde = mdot;
    const ua = ax ? D.axis() : null, Ta = ax ? ax.T : 0, mda = ax ? ax.T / (ax.isp * G0) : 0;
    for (;;) {
      if (!P.hold) R = D.integrate(P, h, ctx);                          // saf: adım küçülürse yeniden
      if (eg && T > 0) { Te = T * eg.mean(h); mde = Te / (st.isp * G0); }
      const um = Te > 0 ? (R ? R.u : D.axis()) : null;
      let thrust = Te <= 0 ? null : OPTS.exactMass ? { u: um, T: Te, m, mdot: mde } : scale(um, Te / m);
      if (ax) thrust = this.auxThrust(thrust, um, Te, mde, ua, Ta, mda, m);
      [r5, v5, err] = dopriStep(this.s, h, thrust);
      if (err <= 1.0) break;
      h *= Math.max(0.2, 0.9 * err ** -0.2);
    }
    this.s.r = r5; this.s.v = v5; this.s.t += h;
    if (Te > 0) {
      const dm = Math.min(mde * h, st.prop);
      this.dvUsed += st.isp * G0 * Math.log(m / (m - dm));
      st.prop -= dm; if (st.prop < 1e-9) st.prop = 0;
    }
    if (ax) this.auxCommit(st, ax, mda * h, m - (Te > 0 ? mde * h : 0));
    if (P.hold) {                                                       // adım sonundaki komut (yeni durumla): yarı-durağan tutma ona oturur
      let cmdEnd = cmd;
      if (src === 'ctl') { const c = control ? control(this) : null; if (c) cmdEnd = c[1]; }
      else if (this.attCmd) cmdEnd = this.attCmd(this);
      D.holdCommit(P, cmdEnd, h, this.s.t);
    } else D.commit(R, P, st, h, t0);
    if (eg) this.engCommit(eg, Te > 0 && R ? R.u : u);
    const fac = err < 1e-10 ? 5.0 : Math.min(5.0, 0.9 * err ** -0.2);
    this.h = Math.min(h * fac, this.hMaxCoast);
    this.lastQ = D.q; this.lastCmd = cmd; this.lastTheta = P.th;
    this.lastThr = Te > 0 ? thr : 0; this.lastU = Te > 0 && R ? R.u : u;
    this.s.switchIfNeeded();
    if (this.onStep) this.onStep(this, h, this.lastThr, u);
    return h;
  }
  runUntil(tEnd, control = null, stop = null) {          // canlı olmayan (hesap) kullanım
    const sign = tEnd >= this.s.t ? 1 : -1;
    while (sign * (tEnd - this.s.t) > 1e-9) {
      if (stop && stop(this)) return true;
      this.step(sign * Math.min(Math.abs(tEnd - this.s.t), 1e9), control);
    }
    return false;
  }
}

// s0'dan en yakın perijeye süre (s; geçtiyse negatif): r·v = 0 kökü, tam kuvvet modeliyle Newton (s0 perijeye ~ çeyrek turdan yakın olmalı)
export function timeToPerigee(s0, hMax = 60.0) {
  const Q = new Propagator(s0.copy(), dummyVehicle(), hMax), t0 = Q.s.t;
  for (let i = 0; i < 40; i++) {
    const r = Q.s.r, v = Q.s.v, a = accel(Q.s.t, r, Q.s.central), rv = dot(r, v);
    const dt = Math.max(-600, Math.min(600, -rv / (dot(v, v) + dot(r, a))));
    if (Math.abs(dt) < 1e-6) break;
    Q.runUntil(Q.s.t + dt);
  }
  return Q.s.t - t0;
}

// ------------------------------------------------------------------ yardımcılar
export function elements(r, v, mu) {
  const rn = norm(r), vn = norm(v), h = cross(r, v), hn = norm(h);
  const En = 0.5 * vn * vn - mu / rn;
  const a = Math.abs(En) > 1e-14 ? -mu / (2 * En) : Infinity;
  const rv = dot(r, v);
  const ev = scale(sub(scale(r, vn * vn - mu / rn), scale(v, rv)), 1 / mu);
  const e = norm(ev), p = (hn * hn) / mu;
  return { a, e, h, evec: ev, p, rp: p / (1 + e), ra: e < 1 ? p / (1 - e) : Infinity, energy: En,
           inc: Math.acos(Math.max(-1, Math.min(1, h[2] / hn))) };
}

function utcParts(t) {
  const jdT = jdTdb(t), jd = jdT - PROV.ttMinusUtc(jdT) / DAY + 0.5;
  const Z = Math.floor(jd), F = jd - Z;
  const alpha = Math.floor((Z - 1867216.25) / 36524.25), A_ = Z + 1 + alpha - Math.floor(alpha / 4);
  const B = A_ + 1524, C_ = Math.floor((B - 122.1) / 365.25), D_ = Math.floor(365.25 * C_), E_ = Math.floor((B - D_) / 30.6001);
  const day = B - D_ - Math.floor(30.6001 * E_) + F;
  const month = E_ < 14 ? E_ - 1 : E_ - 13, year = month > 2 ? C_ - 4716 : C_ - 4715;
  const d = Math.floor(day); const s = (day - d) * 86400.0;
  return { year, month, day: d, hh: Math.floor(s / 3600), mm: Math.floor((s % 3600) / 60), ss: s % 60 };
}
// UTC (Date ya da ms) -> motor zamanı t (TDB s)
export function tFromUtcMs(ms) {
  const jdU = ms / 86400000 + 2440587.5;
  let jdT = jdU + PROV.ttMinusUtc(jdU + 69 / DAY) / DAY;
  return (jdT - JD0_ENGINE) * DAY;
}
export function utcMsFromT(t) { const jdT = jdTdb(t), jdU = jdT - PROV.ttMinusUtc(jdT) / DAY; return (jdU - 2440587.5) * 86400000; }
export function utcString(t) {
  const p = utcParts(t), z = (x, n = 2) => String(x).padStart(n, '0');
  return `${z(p.year, 4)}-${z(p.month)}-${z(p.day)} ${z(p.hh)}:${z(p.mm)}:${p.ss.toFixed(1).padStart(4, '0')} UTC`;
}

// Ay'ın ICRF açısal hız vektörü (sayısal türev)
export function omegaMoon(t) {
  const M0 = moonIcrfToMe(t - 5), M1 = moonIcrfToMe(t + 5), M = moonIcrfToMe(t);
  const dM = M0.map((row, i) => row.map((x, j) => (M1[i][j] - x) / 10.0));
  const W = mm(mT(M), dM);
  const Wa = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) Wa[i][j] = 0.5 * (W[i][j] - W[j][i]);
  return [-Wa[2][1], -Wa[0][2], -Wa[1][0]];
}
