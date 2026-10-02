// Uçuş telemetrisi doğrulaması (Node 20+): cd web && node test/test_telemetry.js
//  1) yer ölçüleri: jeodezik enlem/yükseklik (gidiş-dönüş ve motordan bağımsız en yakın-nokta aramasıyla)
//  2) yörünge: elemanlar gidiş-dönüş, periapsise zaman ve yüzeye çarpma süresi bağımsız iki-cisim RK4 yayınımıyla, vis-viva
//  3) Güneş ışığı ve görüş hattı: disk örtülmesi kaba kuvvetle, gölge/terminatör vakaları
//  4) dönen cisme göre hız ve yön: yüzeyde duran nokta (Dünya, Ay), doğu/kuzey hareketi
//  5) canlı görev uçuşu: park yörüngesi, ölçülen özgül kuvvet, Δv korunumu, temas verisi, çarpma süresi, görüş hattı/gölge (ışın atmayla)
//  6) Δv bütçesi: bozulmasız uçuşta pay sabit, plan dışı harcama tam Δv kadar
//  7) uyarılar: nominal uçuşta yanlış alarm yok; bozulmuş durumlarda doğru alarm; uzak transferde/halo'da yanıltıcı konik uyarısı yok
//  8) tüm görev profilleri (Apollo, NRHO, L1, L2, yörünge yükseltmeli): istisnasız, NaN'sız, sabit Δv payı
import fs from 'fs';
import * as E from '../js/engine.js';
import * as EO from '../js/earth.js';
import { makeLive } from '../js/live.js';
import { Mission, R_SITE, SITE_LAT, SITE_LON, siteIcrf } from '../js/mission.js';
import * as T from '../js/telemetry.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const { add, sub, scale, dot, cross, norm, unit } = E;
const D2R = Math.PI / 180, wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// Güneş diskinde ışın atma: Güneş diskini düzgün örnekleyip her ışının küreleri (merkez, yarıçap) kesip kesmediğine bakar; açık kalan oran (0..1).
// Telemetrideki disk-örtülmesi formülünden bağımsız ve kürede kesindir.
function rayLit(rv, sunPos, bodies, K = 60) {
  const ds = sub(sunPos, rv), dsn = norm(ds), sh = scale(ds, 1 / dsn), as = Math.asin(T.R_SUN / dsn);
  const a1 = unit(cross(sh, Math.abs(sh[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), a2 = cross(sh, a1);
  let lit = 0, N = 0;
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const x = 2 * (i + 0.5) / K - 1, y = 2 * (j + 0.5) / K - 1; if (x * x + y * y > 1) continue; N++;
    const dir = unit(add(sh, add(scale(a1, x * as), scale(a2, y * as)))); let hit = false;
    for (const [c, R] of bodies) { const oc = sub(rv, c), b = dot(oc, dir), cc = dot(oc, oc) - R * R, disc = b * b - cc; if (disc > 0 && -b - Math.sqrt(disc) > 0) { hit = true; break; } }
    if (!hit) lit++;
  }
  return lit / N;
}

// ---------------------------------------------------------------- 1) yer ölçüleri (ephemeris gerekmez)
{
  const a = E.R_E, f = T.F_EARTH, e2 = f * (2 - f);
  const fromGeo = (lat, h, lon = 0.7) => { const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); return [(N + h) * Math.cos(lat) * Math.cos(lon), (N + h) * Math.cos(lat) * Math.sin(lon), (N * (1 - e2) + h) * Math.sin(lat)]; };
  let wl = 0, wh = 0, n = 0;
  for (const lat of [0, 0.3, 0.785398, -0.5236, 1.2, 1.5, -1.55, Math.PI / 2, -Math.PI / 2]) for (const h of [-5, 0, 188, 1000, 35786, 384400]) {
    const g = T.geodetic(fromGeo(lat, h), [0, 0, 1]); wl = Math.max(wl, Math.abs(g.lat - lat)); wh = Math.max(wh, Math.abs(g.h - h)); n++;
  }
  check('jeodezik: enlem/yükseklik gidiş-dönüş (kutuplar, Ay mesafesi dahil)', wl < 1e-12 && wh < 1e-8, `${n} nokta, en kötü Δenlem ${wl.toExponential(1)} rad, Δh ${(wh * 1e6).toExponential(1)} mm`);
  // dönmüş kutup: aynı nokta kümesini keyfi bir eksene çevir
  const Rm = (ax, an) => { const [x, y, z] = unit(ax), c = Math.cos(an), s = Math.sin(an), C = 1 - c; return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]]; };
  const Q = Rm([0.3, -0.5, 0.8], 1.1), pole = E.mv(Q, [0, 0, 1]), g2 = T.geodetic(E.mv(Q, fromGeo(0.9, 640)), pole);
  check('jeodezik: keyfi dönme ekseni', Math.abs(g2.lat - 0.9) < 1e-12 && Math.abs(g2.h - 640) < 1e-8);
}

// ---------------------------------------------------------------- 2) yörünge (iki-cisim, ephemeris gerekmez)
const MU = E.MU_E;
function fromElements(a, e, inc, Om, w, nu, mu = MU) {
  const p = a * (1 - e * e), r = p / (1 + e * Math.cos(nu)), c = Math.cos, s = Math.sin;
  const P = [c(Om) * c(w) - s(Om) * s(w) * c(inc), s(Om) * c(w) + c(Om) * s(w) * c(inc), s(w) * s(inc)];
  const Q = [-c(Om) * s(w) - s(Om) * c(w) * c(inc), -s(Om) * s(w) + c(Om) * c(w) * c(inc), c(w) * s(inc)];
  const k = Math.sqrt(mu / p);
  return [add(scale(P, r * c(nu)), scale(Q, r * s(nu))), add(scale(P, -k * s(nu)), scale(Q, k * (e + c(nu))))];
}
function rk4(r, v, mu, h, stop = null, maxSteps = 4e6) {              // motordan bağımsız iki-cisim yayını (RK4); stop(r,v,t) true olunca durur
  const acc = (x) => scale(x, -mu / norm(x) ** 3);
  let t = 0;
  for (let i = 0; i < maxSteps; i++) {
    if (stop && stop(r, v, t)) break;
    const k1r = v, k1v = acc(r), r2 = add(r, scale(k1r, h / 2)), v2 = add(v, scale(k1v, h / 2)), k2r = v2, k2v = acc(r2);
    const r3 = add(r, scale(k2r, h / 2)), v3 = add(v, scale(k2v, h / 2)), k3r = v3, k3v = acc(r3), r4 = add(r, scale(k3r, h)), v4 = add(v, scale(k3v, h)), k4r = v4, k4v = acc(r4);
    r = add(r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6)); v = add(v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6)); t += h;
  }
  return { r, v, t };
}
{
  const pole = [0, 0, 1], X = [1, 0, 0], Y = [0, 1, 0];
  const cases = [['dairesele yakın LEO', 6563, 0.0005, 28.6, 44.5, 185.8, -82.6], ['GTO benzeri elips', 24400, 0.73, 27.0, 200, 5, 130], ['retrograd eğik elips', 9000, 0.3, 123.0, 300, 250, -40],
    ['hiperbol (Ay yaklaşması)', -6800, 1.27, 169.0, 237, 80, -50], ['yüksek enlemli hiperbol', -3000, 2.4, 95.0, 10, 330, 60]];
  let worst = 0, worstVis = 0;
  for (const [nm, a, e, i, Om, w, nu] of cases) {
    const [r, v] = fromElements(a, e, i * D2R, Om * D2R, w * D2R, nu * D2R), o = T.orbitInfo(r, v, MU, pole, X, Y);
    const err = Math.max(Math.abs(o.a / a - 1), Math.abs(o.e - e), Math.abs(o.inc - i * D2R), Math.abs(wrap(o.raan - Om * D2R)), Math.abs(wrap(o.argp - w * D2R)), Math.abs(wrap(o.nu - nu * D2R)));
    worst = Math.max(worst, err); worstVis = Math.max(worstVis, Math.abs(o.vis) / dot(v, v));
    if (err > 1e-9) check(`yörünge elemanları gidiş-dönüş: ${nm}`, false, `hata ${err.toExponential(2)}`);
  }
  check('yörünge: a, e, i, Ω, ω, ν gidiş-dönüş (elips, retrograd, hiperbol)', worst < 1e-9, `${cases.length} yörünge, en kötü ${worst.toExponential(1)}`);
  check('yörünge: vis-viva özdeşliği v² = μ(2/r − 1/a)', worstVis < 1e-12, worstVis.toExponential(1));
  const o = T.orbitInfo(...fromElements(7000, 0, 51.6 * D2R, 0, 0, 1.0), MU, pole, X, Y);
  check('yörünge: dairesel hız √(μ/r), kaçış hızı √2·√(μ/r), dönem 2π√(a³/μ)', Math.abs(o.vCirc - Math.sqrt(MU / 7000)) < 1e-12 && Math.abs(o.vEsc / o.vCirc - Math.SQRT2) < 1e-12 && Math.abs(o.period - 2 * Math.PI * Math.sqrt(7000 ** 3 / MU)) < 1e-6);
  check('yörünge: eğim ekvator kutbuna göre (51,6°)', Math.abs(o.inc - 51.6 * D2R) < 1e-12);
}
{ // periapsise zaman: periapsisten bağımsız RK4 ile τ kadar yayınla, ölçülen ν'den zamanı geri bul
  const pole = [0, 0, 1];
  let worst = 0, n = 0;
  for (const [a, e, mu] of [[6563, 0.02, E.MU_E], [24400, 0.73, E.MU_E], [-6800, 1.27, E.MU_M], [-2500, 3.0, E.MU_M]]) {
    const [r0, v0] = fromElements(a, e, 0.4, 0.3, 0.2, 0, mu), n_ = Math.sqrt(mu / Math.abs(a) ** 3);
    for (const tau of [-0.9, -0.3, 0.2, 0.7, 1.4, 2.4].map((x) => x / n_)) {           // ortalama anomali ≈ −0,9 … 2,4 rad
      if (e >= 1 && Math.abs(tau) * n_ > 1.6) continue;
      const hh = Math.sign(tau) * 0.25, P = rk4(r0, v0, mu, hh, (r, v, t) => Math.abs(t) >= Math.abs(tau) - 1e-9);
      const rem = tau - P.t, Q = rem ? rk4(P.r, P.v, mu, Math.sign(rem) * Math.abs(rem), (r, v, t) => Math.abs(t) > 0.5 * Math.abs(rem)) : P; // kalan kesir için tek adım
      const el = T.orbitInfo(Q.r, Q.v, mu, pole), got = T.timeSincePeriapsis(el.nu, el.e, el.a, mu);
      worst = Math.max(worst, Math.abs(got - tau) / Math.abs(tau)); n++;
    }
  }
  check('Kepler: periapsisten geçen süre, bağımsız RK4 yayınımıyla (elips ve hiperbol)', worst < 2e-6, `${n} vaka, en kötü bağıl hata ${worst.toExponential(1)}`);
  // apsis süreleri: tPeri + (periapsisten geçen) = dönem, apoapsis yarım dönem sonra
  const o = T.orbitInfo(...fromElements(24400, 0.73, 0.5, 1, 2, 2.2), E.MU_E, pole), ap = T.apsisTimes(o, o.nu, E.MU_E), tau = T.timeSincePeriapsis(o.nu, o.e, o.a, E.MU_E);
  check('apsis süreleri: sonraki periapsis = T − τ, apoapsis = T/2 − τ', Math.abs(ap.tPeri - (o.period - tau)) < 1e-6 && Math.abs(ap.tApo - mod(o.period / 2 - tau, o.period)) < 1e-6 && ap.tPeri >= 0 && ap.tApo >= 0);
  function mod(x, m) { return ((x % m) + m) % m; }
}
{ // motor kesilirse yüzeye çarpma süresi: Ay (μ_M), rg = iniş yeri yarıçapı
  const rg = R_SITE, mu = E.MU_M, pole = [0, 0, 1];
  const trial = (a, e, nuDeg) => {
    const [r, v] = fromElements(a, e, 0.2, 0.4, 1.0, nuDeg * D2R, mu), o = T.orbitInfo(r, v, mu, pole);
    const want = rk4(r, v, mu, 0.02, (rr) => norm(rr) <= rg, 2e6).t, got = T.timeToRadius(o, o.nu, norm(r), rg, mu);
    return { want, got, rp: o.rp };
  };
  for (const [nm, a, e, nu] of [['yaklaşan dal, alçak periselen', 1775, 0.0423, -100], ['yaklaşan dal, çok eliptik (periselen 1200 km)', 3000, 0.6, -100], ['hiperbol, yaklaşırken (periselen 1610 km)', -2300, 1.7, -70]]) {
    const q = trial(a, e, nu);
    check(`çarpma süresi: ${nm}`, q.rp < rg && q.got != null && Math.abs(q.got - q.want) < 0.02 + 1e-5 * q.want, `Kepler ${q.got == null ? 'yok' : q.got.toFixed(3)} s, RK4 ${q.want.toFixed(3)} s`);
  }
  { // çıkan dalda (ν > 0): bir sonraki turda yaklaşırken çarpar
    const [r, v] = fromElements(1775, 0.0423, 0.2, 0.4, 1.0, 100 * D2R, mu), o = T.orbitInfo(r, v, mu, pole);
    let seenOut = false; const want = rk4(r, v, mu, 0.02, (rr, vv) => { if (norm(rr) > rg + 1) seenOut = true; return seenOut && norm(rr) <= rg; }, 2e7).t;
    const got = T.timeToRadius(o, o.nu, norm(r), rg, mu);
    check('çarpma süresi: çıkan dalda gelecek turun yaklaşması', Math.abs(got - want) < 0.05, `Kepler ${got.toFixed(2)} s, RK4 ${want.toFixed(2)} s`);
  }
  const o2 = T.orbitInfo(...fromElements(1850, 0.01, 0.2, 0.4, 1.0, 0.5, mu), mu, pole);
  check('çarpma süresi: periselen yüzeyin üstündeyse çarpma yok; yüzeyde 0', T.timeToRadius(o2, o2.nu, 1850, rg, mu) === null && T.timeToRadius(o2, o2.nu, rg - 0.01, rg, mu) === 0);
}

// ---------------------------------------------------------------- 3) Güneş ışığı, görüş hattı (ephemeris gerekmez)
{
  // disk örtülmesi: kaba kuvvet (Güneş diski üzerinde düzgün ızgara)
  const brute = (as, ab, th) => { const N = 600; let inS = 0, cov = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = (2 * (i + 0.5) / N - 1) * as, y = (2 * (j + 0.5) / N - 1) * as; if (x * x + y * y > as * as) continue; inS++; if ((x - th) ** 2 + y * y <= ab * ab) cov++; } return cov / inS; };
  let worst = 0, n = 0;
  for (const [as, ab, th] of [[1, 3, 3.5], [1, 3, 2.2], [1, 3, 0], [1, 0.4, 0], [1, 0.4, 0.5], [1, 0.4, 1.2], [1, 1, 0.7], [1, 2, 4], [1, 0.4, 1.5], [1, 5, 5.9]]) {
    worst = Math.max(worst, Math.abs(T.discOverlapFraction(as, ab, th) - brute(as, ab, th))); n++;
  }
  check('Güneş örtülmesi: iki disk kesişimi kaba kuvvet ızgarasıyla (tam, halkalı, kısmi, yok)', worst < 2e-3, `${n} vaka, en kötü fark ${worst.toExponential(1)}`);
  const AU = 149597870.7, sun = [AU, 0, 0], Rm = E.R_M, rm = [384400, 0, 0];
  const f = (rv, bodies) => T.sunlightFraction(rv, sun, bodies), earth = [[[0, 0, 0], E.R_E]];
  check('Güneş ışığı: Dünya\'nın Güneş\'e bakan tarafında 1, gece tarafında 0 (LEO 400 km)', f([E.R_E + 400, 0, 0], earth) === 1 && f([-(E.R_E + 400), 0, 0], earth) === 0);
  const rr = E.R_E + 400, term = [-Math.sqrt(rr * rr - E.R_E ** 2), E.R_E, 0];
  const exactTerm = rayLit(term, sun, earth, 120);
  check('Güneş ışığı: gölge sınırında (Güneş merkezi Dünya kenarında) ≈ yarı ışık; küresel kesin değerle ≤ 8·10⁻³ (düzlemsel disk yaklaşımı, 70° yarıçaplı Dünya diski)', Math.abs(f(term, earth) - 0.5) < 8e-3 && Math.abs(f(term, earth) - exactTerm) < 8e-3, `formül ${f(term, earth).toFixed(4)}, ışın atma ${exactTerm.toFixed(4)}`);
  const el = (deg) => { const n = [Math.cos(deg * D2R), Math.sin(deg * D2R), 0]; return add(rm, scale(n, Rm)); };       // Ay yüzeyinde Güneş yüksekliği: Güneş +x, yüzey normali x ekseninden `deg` döndü
  const moon = [[rm, Rm]];
  check('Güneş ışığı: Ay yüzeyinde Güneş ufkun üstünde 1, altında 0, ufukta ~yarı', f(el(80), moon) === 1 && f(el(100 + 0.4), moon) === 0 && Math.abs(f(el(90), moon) - 0.5) < 2e-2, `ufukta ${f(el(90), moon).toFixed(3)}`);
  check('görüş hattı: küre doğrultuyu keser/kesmez, içeriden dışa bakan hat engellenmez',
    T.sphereBlocksSegment([-10, 0, 0], [10, 0, 0], [0, 0, 0], 1) && !T.sphereBlocksSegment([-10, 0, 0], [10, 0, 0], [0, 2, 0], 1) && !T.sphereBlocksSegment([-10, 0, 0], [-5, 0, 0], [0, 0, 0], 1)
    && !T.sphereBlocksSegment([0, 0.99, 0], [0, 10, 0], [0, 0, 0], 1) && T.sphereBlocksSegment([0, 0.99, 0], [0, -10, 0], [0, 0, 0], 1));
}

// ---------------------------------------------------------------- canlı efemeris kurulumu
const ab = (f) => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SPK = ab(new URL('../data/de440s.bsp', import.meta.url)), PCK = ab(new URL('../data/moon_pa_de440_200625.bpc', import.meta.url));
const eo = JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))); EO.loadEarthOrientation(eo);
const DEF = JSON.parse(fs.readFileSync(new URL('../data/design_default.json', import.meta.url))), D = DEF.design;
const live = () => makeLive(SPK, PCK, eo, DEF.tStart);
const O = { stages: D.STAGES, siteIcrf, rSite: R_SITE, tLaunch: D.LAUNCH.t_launch };
const mkState = (t, r, v, over = {}) => ({ t, r, v, m: 3000, prop: 1500, k: 1, thr: 0, u: [0, 0, 0], phase: 'AY_YORUNGESI', dv: 4, ...over });

// ---------------------------------------------------------------- 4) dönen cisme göre hız ve yön
{
  live();
  const t = 1100000;
  // Dünya: KSC'de yüzeyde duran nokta (yerküre ile birlikte döner)
  const lat = 28.5729 * D2R, lon = -80.6490 * D2R, a = E.R_E, e2 = T.F_EARTH * (2 - T.F_EARTH), N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const ecef = [N * Math.cos(lat) * Math.cos(lon), N * Math.cos(lat) * Math.sin(lon), N * (1 - e2) * Math.sin(lat)];
  const Mi = E.earthIcrfToItrf(t), r = E.mtv(Mi, ecef), om = scale(Mi[2], T.OMEGA_EARTH), v = cross(om, r);
  const tel = T.computeTelemetry(mkState(t, r, v, { k: 0, prop: 6200, m: 12100 }), O);
  check('Dünya: yüzeyde duran nokta — yüzeye göre hız 0, irtifa 0, enlem/boylam girdi', tel.vRel < 1e-12 && Math.abs(tel.alt) < 1e-9 && Math.abs(tel.lat - lat) < 1e-12 && Math.abs(wrap(tel.lon - lon)) < 1e-12 && Math.abs(tel.vr) < 1e-9,
    `vRel ${tel.vRel.toExponential(1)} km/s, alt ${(tel.alt * 1e6).toExponential(1)} mm, eylemsiz hız ${tel.v.toFixed(4)} km/s`);
  check('Dünya: eylemsiz hız ω·R·cos(enlem) ≈ 0,41 km/s', Math.abs(tel.v - T.OMEGA_EARTH * Math.hypot(ecef[0], ecef[1])) < 1e-12);
  // doğuya 1 km/s yüzeye göre hareket: yön 90°, kuzeye: 0°
  const up = unit(r), east = unit(cross(Mi[2], up)), north = cross(up, east);
  const tE = T.computeTelemetry(mkState(t, add(r, scale(up, 100)), add(add(v, scale(cross(om, scale(up, 100)), 1)), scale(east, 1))), O);
  const tN = T.computeTelemetry(mkState(t, add(r, scale(up, 100)), add(add(v, scale(cross(om, scale(up, 100)), 1)), scale(north, 1))), O);
  check('Dünya: doğuya hareket → yön 90°, kuzeye → 0° (kuzeyden saat yönünde)', Math.abs(tE.azRel - Math.PI / 2) < 1e-9 && (Math.abs(wrap(tN.azRel)) < 1e-9) && Math.abs(tE.vRelH - 1) < 1e-9, `${(tE.azRel / D2R).toFixed(6)}°, ${(wrap(tN.azRel) / D2R).toFixed(6)}°`);
  // Ay: iniş yerinde yüzeyde duran nokta (selenografik enlem/boylam)
  const rm = E.moonPos(t), vm = E.moonVel(t), rs = siteIcrf(t), omM = E.omegaMoon(t);
  const telM = T.computeTelemetry(mkState(t, add(rm, rs), add(vm, cross(omM, rs))), O);
  check('Ay: iniş yerinde duran nokta — yüzeye göre hız 0, irtifa (iniş yeri) 0, enlem/boylam = SITE_LAT/LON',
    telM.vRel < 1e-12 && Math.abs(telM.altSite) < 1e-9 && Math.abs(telM.lat - SITE_LAT) < 1e-12 && Math.abs(wrap(telM.lon - SITE_LON)) < 1e-12 && telM.isMoon,
    `vRel ${telM.vRel.toExponential(1)} km/s, eylemsiz ${(telM.v * 1000).toFixed(3)} m/s, enlem ${(telM.lat / D2R).toFixed(5)}°, boylam ${(telM.lon / D2R).toFixed(5)}°`);
  check('Ay: ortalama küreye göre irtifa = R_SITE − R_M = −1,93 km', Math.abs(telM.alt - (R_SITE - E.R_M)) < 1e-9, telM.alt.toFixed(4));
}
{ // jeodezik yükseklik/boylam için bağımsız referans: elipsoide dik-nokta koşulu z·cosφ − p·sinφ + N·e²·sinφ·cosφ = 0'ın kökü (ikiye bölme)
  var geodRef = (P) => {
    const a = E.R_E, f = T.F_EARTH, e2 = f * (2 - f), p = Math.hypot(P[0], P[1]), z = P[2];
    const g = (phi) => { const s_ = Math.sin(phi), c_ = Math.cos(phi), N = a / Math.sqrt(1 - e2 * s_ * s_); return z * c_ - p * s_ + N * e2 * s_ * c_; };
    let lo = -Math.PI / 2, hi = Math.PI / 2;                       // g(−π/2) = p ≥ 0, g(π/2) = −p ≤ 0
    for (let i = 0; i < 200; i++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
    const phi = 0.5 * (lo + hi), s_ = Math.sin(phi);
    return { lat: phi, h: p * Math.cos(phi) + z * s_ - a * Math.sqrt(1 - e2 * s_ * s_), lon: Math.atan2(P[1], P[0]) };
  };
}

// ---------------------------------------------------------------- 5) canlı görev uçuşu
live();
const M = new Mission({ design: D }); M.P.tLimit = Infinity; M.attachHistory();
const samples = [], tliSteps = [];                                  // samples: { h, nev } (olay sayısı); tliSteps: TLI yakışının tüm fizik adımları
{
  let last = -1e9, n = 0;
  for (;;) {
    if (M.gen.next().done) break;
    const h = M.hist[M.hist.length - 1];
    if (h.phase === 'TLI' && h.thr > 0 && (!tliSteps.length || h.t > tliSteps[tliSteps.length - 1].t)) tliSteps.push({ ...h });
    if (h.t - last > (h.thr > 0 ? 20 : h.phase === 'SUZULME' ? 3000 : 600)) { last = h.t; samples.push({ h: { ...h }, nev: M.events.length }); }
    if (++n > 6e6) break;
  }
  const h = M.hist[M.hist.length - 1]; samples.push({ h: { ...h }, nev: M.events.length });
}
const evUpTo = (nev) => M.events.slice(0, nev);
const telOf = (smp, extra = {}) => T.computeTelemetry({ ...smp.h, ...extra }, O);
{
  const first = samples[0], tel = telOf(first);
  check('park yörüngesi: Dünya baskın, e < 2e-3 (J2), eğim = tasarım eğimi, vis-viva sağlanır', !tel.isMoon && tel.orbit.e < 2e-3 && Math.abs(tel.orbit.inc / D2R - D.inc) < 0.1,
    `alt ${tel.alt.toFixed(1)} km, e ${tel.orbit.e.toExponential(2)}, i ${(tel.orbit.inc / D2R).toFixed(2)}°, dönem ${(tel.orbit.period / 60).toFixed(2)} dk`);
  const o = T.orbitInfo(first.h.r, first.h.v, E.MU_E, E.precession(first.h.t)[2]);
  check('park yörüngesi: osküle dönem 2π√(a³/μ), dairesel hız ≈ hız', Math.abs(tel.orbit.period - 2 * Math.PI * Math.sqrt(o.a ** 3 / E.MU_E)) < 1e-6 && Math.abs(tel.v - tel.orbit.vCirc) < 0.01);
  // jeodezik yükseklik, boylam: motordan bağımsız en yakın-nokta aramasıyla (park, transfer, Ay mesafesi)
  let wh = 0, wl = 0, wo = 0, n = 0;
  for (const smp of samples.filter((_, i) => i % 17 === 0)) {
    const tl = telOf(smp); if (tl.isMoon) continue;
    const P = E.mv(E.earthIcrfToItrf(smp.h.t), smp.h.r), g = geodRef(P);
    wh = Math.max(wh, Math.abs(g.h - tl.alt)); wl = Math.max(wl, Math.abs(g.lat - tl.lat)); wo = Math.max(wo, Math.abs(wrap(g.lon - tl.lon))); n++;
  }
  check('Dünya konumu: jeodezik yükseklik, enlem ve boylam bağımsız en yakın-nokta aramasıyla', wh < 1e-6 && wl < 1e-9 && wo < 1e-12, `${n} durum, Δh ${(wh * 1e6).toFixed(2)} mm, Δenlem ${wl.toExponential(1)} rad, Δboylam ${wo.toExponential(1)} rad`);
}
{ // TLI yakışı: ölçülen özgül kuvvet, Δv korunumu
  const burn = []; for (let i = 1; i < tliSteps.length; i++) burn.push([tliSteps[i - 1], tliSteps[i]]);
  const ex = D.STAGES[0];
  let worstA = 0, worstDir = 0, nA = 0;
  for (const [a, b] of burn) {
    const dt = b.t - a.t; if (dt < 0.05) continue;
    const rmid = scale(add(a.r, b.r), 0.5), tmid = (a.t + b.t) / 2, gacc = E.accel(tmid, rmid, 'N', null);
    const th = sub(scale(sub(b.v, a.v), 1 / dt), gacc);                                   // ölçülen itki ivmesi (km/s²)
    const tel = T.computeTelemetry({ ...b, m: (a.m + b.m) / 2, prop: (a.prop + b.prop) / 2 }, O);
    worstA = Math.max(worstA, Math.abs(norm(th) / tel.aT - 1)); worstDir = Math.max(worstDir, Math.acos(Math.min(1, dot(unit(th), unit(b.u)))) / D2R); nA++;
  }
  check('itki: ölçülen özgül kuvvet (dv/dt − yerçekimi) = F/m, yön = itki yönü', nA > 100 && worstA < 2e-3 && worstDir < 0.05, `${nA} adım, en kötü bağıl fark ${worstA.toExponential(1)}, yön ${worstDir.toFixed(4)}°`);
  const tel0 = T.computeTelemetry(burn[10][1], O);
  check('itki: kütle akışı ṁ = F/(Isp·g₀), g-yükü = (F/m)/g₀', Math.abs(tel0.mdot - ex.T / (ex.isp * E.G0)) < 1e-9 && Math.abs(tel0.gLoad - (ex.T / tel0.m) / E.G0) < 1e-12 && Math.abs(tel0.F - ex.T) < 1e-12, `ṁ ${tel0.mdot.toFixed(3)} kg/s, ${tel0.gLoad.toFixed(3)} g`);
  // Δv korunumu: kullanılan + kalan (TLI kademesi) sabit
  let lo = Infinity, hi = -Infinity; for (const smp of samples) { if (smp.h.k !== 0) continue; const tl = telOf(smp), c = tl.dvStage + smp.h.dv; lo = Math.min(lo, c); hi = Math.max(hi, c); }
  const cap = ex.isp * E.G0 * Math.log((D.STAGES.reduce((q, s) => q + s.dry + s.prop, 0)) / (D.STAGES.reduce((q, s) => q + s.dry + s.prop, 0) - ex.prop));
  check('Δv korunumu: kullanılan (motor) + kalan (Tsiolkovsky) = kademenin dolu kapasitesi', (hi - lo) * 1000 < 1e-6 && Math.abs(hi - cap) * 1000 < 1e-6, `kapasite ${(cap * 1000).toFixed(3)} m/s, yayılım ${((hi - lo) * 1e6).toExponential(1)} mm/s`);
}
{ // iniş: temas anında telemetri, motorun sonuç kaydıyla uyuşur
  const last = samples[samples.length - 1], tel = telOf(last), R_ = M.result;
  check('temas: dikey/yatay hız ve konum hatası görev sonucuyla aynı', M.done && R_.ok && Math.abs(tel.land.vz * 1000 - R_.v_mps[2]) < 1e-6 && Math.abs(tel.land.vh * 1000 - Math.hypot(R_.v_mps[0], R_.v_mps[1])) < 1e-6
    && Math.abs(tel.land.groundRange * 1000 - Math.hypot(...R_.posErr_m)) < 0.02, `dikey ${(tel.land.vz * 1000).toFixed(4)} m/s (sonuç ${R_.v_mps[2].toFixed(4)}), menzil ${(tel.land.groundRange * 1000).toFixed(4)} m`);
  check('temas: enlem/boylam iniş yeri, iniş yeri irtifası 0, durma/çarpma yok', Math.abs(tel.lat - SITE_LAT) < 1e-7 && Math.abs(wrap(tel.lon - SITE_LON)) < 1e-7 && Math.abs(tel.land.h) < 1e-3 && tel.tImpact === 0, `Δenlem ${(tel.lat - SITE_LAT).toExponential(1)} rad`);
  const ls = M.localState(last.h.t, ...[sub(last.h.r, E.moonPos(last.h.t)), sub(last.h.v, E.moonVel(last.h.t))]);
  check('yerçekimi: μ/r² görev motorunun yerel çerçevesindeki g ile aynı', Math.abs(tel.g - norm(ls.g)) < 1e-12, `${(tel.g * 1000).toFixed(4)} m/s²`);
}
{ // motor kesilirse çarpma süresi: gerçek motorla yayınlayıp ölç
  let worst = 0, nW = 0; const rows = [];
  for (const smp of samples) {
    if (!['YAKLASMA', 'SON_INIS'].includes(smp.h.phase)) continue;
    const tl = telOf(smp); if (!(tl.tImpact > 1)) continue;
    const st = new E.State(smp.h.t, smp.h.r, smp.h.v, 'N'), P = new E.Propagator(st, E.dummyVehicle(), 0.5, 1.0, { nbody: true });
    let t = 0; while (norm(P.s.seleno()[0]) > R_SITE && t < 400) { P.step(0.25); t = P.s.t - smp.h.t; }
    // son adım yüzeyin altında bitti: kesişim anına doğrusal geri ara değer (vr < 0)
    const rn = norm(P.s.seleno()[0]), vr = dot(P.s.seleno()[1], unit(P.s.seleno()[0])), want = t - (R_SITE - rn) / -vr;
    worst = Math.max(worst, Math.abs(tl.tImpact - want)); nW++; rows.push(`${tl.tImpact.toFixed(2)}/${want.toFixed(2)}`);
  }
  check('çarpma süresi: motor kesilirse Kepler tahmini, tam kuvvet modeliyle (J2/C22/Dünya) yayınlanan süreye uyar', nW >= 3 && worst < 0.15, `${nW} durum, en kötü fark ${worst.toFixed(3)} s (${rows.slice(0, 4).join(', ')})`);
}
{ // görüş hattı ve Güneş ışığı: bağımsız örnekleme (parça boyunca nokta, Güneş diskinde ışınlar)
  let nLos = 0, badLos = 0, nSun = 0, worstSun = 0, nEcl = 0;
  const rm0 = (t) => E.moonPos(t);
  for (const smp of samples) {
    const s = smp.h, tel = telOf(smp), rm = rm0(s.t);
    // görüş hattı: aracın Dünya merkezine doğrusu üzerindeki 6000 noktadan hiçbiri Ay kürelinde mi
    let blocked = false; const K = 6000;
    for (let i = 1; i < K; i++) { const p = add(s.r, scale(s.r, -i / K)); if (norm(sub(p, rm)) < E.R_M) { blocked = true; break; } }
    nLos++; if (blocked === tel.earthVisible) badLos++;
    // Güneş ışığı: Güneş diskinde 1200 ışın, her biri Dünya ya da Ay küresi tarafından kesiliyor mu
    if (smp.nev % 2 === 0 || tel.sunFrac < 0.999) {
      const frac = rayLit(s.r, E.sunPos(s.t), [[[0, 0, 0], E.R_E], [rm, E.R_M]], 40);
      worstSun = Math.max(worstSun, Math.abs(frac - tel.sunFrac)); nSun++; if (tel.sunFrac < 0.999) nEcl++;
    }
  }
  check('Dünya ile görüş hattı: Ay engeli, aracın Dünya\'ya doğrusu boyunca örneklemeyle', badLos === 0 && nLos > 100, `${nLos} durum, uyuşmayan ${badLos}`);
  check('Güneş ışığı oranı: Güneş diskinde ışın atmayla (Dünya ve Ay gölgesi)', nSun > 50 && nEcl >= 1 && worstSun < 0.03, `${nSun} durum (${nEcl} tutulmalı), en kötü fark ${worstSun.toFixed(3)}`);
}
{ // bozucu/merkezi çekim oranı: LEO'da çok küçük, transferde büyür (osküle koniğin güvenilirliği)
  const leo = telOf(samples[0]), mid = telOf(samples.find((s) => s.h.phase === 'MCC-1')), near = telOf(samples.find((s) => s.h.phase === 'AY_YORUNGESI'));
  check('osküle koniğin geçerliliği: bozucu/merkezi çekim LEO ~10⁻⁶, transferde ≥10⁻³', leo.pertRatio < 2e-6 && mid.pertRatio > 1e-3 && mid.pertRatio < 0.5 && near.pertRatio < 1e-3, `LEO ${leo.pertRatio.toExponential(1)}, transfer ${mid.pertRatio.toExponential(1)}, LLO ${near.pertRatio.toExponential(1)}`);
  check('yakınlık bayrakları: LEO\'da yüzeye göre hız anlamlı, 180.000 km\'de değil', leo.near.surf && leo.near.grav && !mid.near.surf && !mid.near.grav);
}

// ---------------------------------------------------------------- 6) Δv bütçesi
{
  const budgets = samples.map((smp) => ({ smp, b: T.dvBudget(D, DEF.nominal, evUpTo(smp.nev), smp.h, O.stages) }));
  let m1lo = Infinity, m1hi = -Infinity, m0lo = Infinity, m0hi = -Infinity, unplMax = -Infinity;
  for (const { b } of budgets) for (const q of b.rows) { if (q.stage === 1) { m1lo = Math.min(m1lo, q.margin); m1hi = Math.max(m1hi, q.margin); unplMax = Math.max(unplMax, q.unplanned); } else { m0lo = Math.min(m0lo, q.margin); m0hi = Math.max(m0hi, q.margin); } }
  const base = T.dvBaseline(D, DEF.nominal, O.stages);
  check('Δv payı: TLI kademesinde sabit (harcanan Δv hem kalandan hem gereksinimden düşer)', (m0hi - m0lo) < 1e-6, `pay ${m0lo.toFixed(4)} m/s, yayılım ${(m0hi - m0lo).toExponential(1)}`);
  check('Δv payı: iniş aracında tüm görev boyunca sabit (kısa yakışlar uygulanan Δv ile ilerler; nominal ile gerçek manevra farkı < 1 m/s)', m1hi - m1lo < 1 && Math.abs(m1lo - base[1]) < 1, `pay ${m1lo.toFixed(2)}…${m1hi.toFixed(2)} m/s, tasarım payı ${base[1].toFixed(2)} m/s`);
  check('Δv payı: bozulmasız uçuşta plan dışı harcama ≈ 0', unplMax < 1, `en büyük ${unplMax.toFixed(2)} m/s`);
  { // kısa yakışın ilerlemesi: olaydan beri uygulanan Δv, planlıyı geçmez (halo DEP, MCC)
    const dep = [{ key: 'DEP', dv: 0, dvm: 91.7 }], H = { profile: 'HALO', DV: { DEP: 91.7 } }, at = (dvKms) => T.dvProgress(H, null, dep, dvKms).find((p) => p.key === 'DEP');
    check('Δv bütçesi: DEP yakışı başladıktan sonra yapılan Δv kadar ilerler (40 m/s → kalan 51,7; bitince 0)', Math.abs(at(0.04).used - 40) < 1e-9 && !at(0.04).done && Math.abs(at(0.04).rem - 51.7) < 1e-9 && at(0.2).done && at(0.2).rem === 0 && Math.abs(at(0.2).used - 91.7) < 1e-9);
  }
  const fin = budgets[budgets.length - 1].b;
  check('Δv bütçesi: görev sonunda hiçbir planlı manevra kalmadı', fin.progress.every((p) => p.done) && fin.progress.every((p) => p.rem === 0), fin.progress.map((p) => `${p.key} ${p.used.toFixed(1)}`).join(', '));
  // plan dışı harcama: gerçek bir durumda ekstra yakış (m, prop azalır; kullanılan Δv artar): pay tam roket denklemi Δv'si kadar düşer
  const mid = samples.find((s) => s.h.phase === 'MCC-2' && s.h.k === 1) || samples.find((s) => s.h.k === 1), s0 = mid.h, st = D.STAGES[1], dm = 120;
  const dvX = st.isp * E.G0 * Math.log(s0.m / (s0.m - dm)) * 1000;
  const b0 = T.dvBudget(D, DEF.nominal, evUpTo(mid.nev), s0, O.stages), b1 = T.dvBudget(D, DEF.nominal, evUpTo(mid.nev), { ...s0, m: s0.m - dm, prop: s0.prop - dm, dv: s0.dv + dvX / 1000 }, O.stages);
  const q0 = b0.rows.find((q) => q.stage === 1), q1 = b1.rows.find((q) => q.stage === 1);
  check('Δv payı: plan dışı yakış (120 kg) tam roket denklemi Δv\'si kadar plan dışı harcama sayılır', Math.abs((q1.unplanned - q0.unplanned) - dvX) < 1e-6 && Math.abs((q0.margin - q1.margin) - dvX) < 1e-6, `${dvX.toFixed(2)} m/s`);
}

// ---------------------------------------------------------------- 7) uyarılar
{
  let bad = 0, nA = 0;
  for (const smp of samples) {
    const tel = telOf(smp), b = T.dvBudget(D, DEF.nominal, evUpTo(smp.nev), smp.h, O.stages), al = T.alerts(tel, b.rows, O);
    nA++; const hard = al.filter((a) => a.level !== 'info'); if (hard.length) { bad++; if (bad < 4) console.log('  yanlış alarm:', smp.h.phase, hard.map((a) => a.text).join(' | ')); }
  }
  check('uyarılar: bozulmasız nominal uçuşta bad/warn uyarısı yok (yalnız bilgi)', bad === 0, `${nA} durum`);
  const llo = samples.find((s) => s.h.phase === 'AY_YORUNGESI').h, rm = E.moonPos(llo.t), vm = E.moonVel(llo.t), vsel = sub(llo.v, vm), slow = sub(vsel, scale(unit(vsel), 0.15));
  const A = (over, tt) => { const tl = T.computeTelemetry({ ...llo, ...over }, O); return { tl, al: T.alerts(tl, [], O).map((a) => a.id) }; };
  const r1 = A({ v: add(vm, slow) });
  check('uyarı: alçak Ay yörüngesinde 150 m/s fren → "yörünge yüzeyi kesiyor" + çarpma süresi', r1.al.includes('surf') && r1.tl.tImpact > 0 && r1.tl.orbit.rp < R_SITE, `periselen ${(r1.tl.orbit.rp - R_SITE).toFixed(1)} km, çarpmaya ${r1.tl.tImpact.toFixed(0)} s`);
  check('uyarı: iniş aracının yakıtı bitti', A({ prop: 0 }).al.includes('burnout') && !A({ prop: 60, thr: 1 }).al.includes('burnout'));
  { // uzak transferde koniğin periseleni yüzeyin altında olsa da (üçüncü cisim hatası ≫ delme derinliği) "yüzey" uyarısı verilmez
    const far = add(rm, scale(unit(sub(llo.r, rm)), 50000)), vin = add(vm, scale(unit(sub(llo.r, rm)), -0.3)), farT = T.computeTelemetry(mkState(llo.t, far, vin, { phase: 'TRANSFER' }), O);
    check('uyarı: 50.000 km uzakta, periselen yüzeyin altında ama bozucu hatası delme derinliğinden büyük → "yüzey" uyarısı yok', farT.orbit.rp < R_SITE && farT.pertRatio > 1e-3 && !T.alerts(farT, [], O).some((a) => a.id === 'surf'), `periselen ${(farT.orbit.rp - R_SITE).toFixed(0)} km, bozucu/merkezi ${farT.pertRatio.toExponential(1)}, çarpmaya ${farT.tImpact == null ? '—' : farT.tImpact.toFixed(0) + ' s'}`);
  }
  const near = { ...llo, r: add(rm, scale(unit(sub(llo.r, rm)), R_SITE + 0.005)), v: add(vm, add(scale(unit(cross([0, 0, 1], sub(llo.r, rm))), 0.003), scale(unit(sub(llo.r, rm)), -0.005))), phase: 'SON_INIS' };
  const rt = T.computeTelemetry(near, O), at = T.alerts(rt, [], O).map((a) => a.id);
  check('uyarı: 5 m irtifada dikey 5 m/s, yatay ~3 m/s → temas hızı sınırın üstünde', at.includes('touch') && rt.land.h < 0.006, `h ${(rt.land.h * 1000).toFixed(0)} m, vz ${(rt.land.vz * 1000).toFixed(1)}, vh ${(rt.land.vh * 1000).toFixed(1)} m/s`);
  check('uyarı: kütle çok büyükse itki/ağırlık < 1 → askıda kalınamaz', T.alerts(T.computeTelemetry({ ...near, m: 30000, prop: 1500 }, O), [], O).some((a) => a.id === 'twr'));
  const stopCase = T.computeTelemetry({ ...near, v: add(vm, scale(unit(sub(llo.r, rm)), -0.06)) }, O);     // 5 m'de 60 m/s: tam itkıyla bile durdurulamaz
  check('uyarı: durma yüksekliğinin altında (5 m irtifada 60 m/s alçalış)', stopCase.land.stopMargin < 0 && T.alerts(stopCase, [], O).some((a) => a.id === 'stop'), `durma ${(stopCase.land.stopH * 1000).toFixed(0)} m > irtifa ${(stopCase.land.h * 1000).toFixed(0)} m`);
  const p0 = samples[0].h, vp = sub(p0.v, scale(unit(p0.v), 0.25));                                       // park yörüngesinde 250 m/s fren: perije atmosferde
  const re = T.computeTelemetry({ ...p0, v: vp }, O);
  check('uyarı: Dünya park yörüngesinde fren → perije atmosferde → giriş yörüngesi uyarısı', re.orbit.altPeri < 80 && T.alerts(re, [], O).some((a) => a.id === 'reentry'), `perije ${re.orbit.altPeri.toFixed(0)} km`);
  const dvBad = T.alerts(telOf(samples.find((s) => s.h.phase === 'MCC-2' && s.h.k === 1)), [{ stage: 1, avail: 100, req: 400, margin: -300, base: 420, unplanned: 720 }], O);
  const dvWarn = T.alerts(telOf(samples[0]), [{ stage: 1, avail: 600, req: 400, margin: 200, base: 420, unplanned: 220 }], O);
  check('uyarı: Δv yetersizse kırmızı, tasarım payının yarısından fazlası gittiyse sarı', dvBad.some((a) => a.id === 'dv1' && a.level === 'bad') && dvWarn.some((a) => a.id === 'dv1' && a.level === 'warn'));
}
// ---------------------------------------------------------------- 8) tüm görev profilleri (Apollo, NRHO, L1, L2, yörünge yükseltmeli): halo evreleri, NRI/SK/DEP, RAISE
{
  const ALL = JSON.parse(fs.readFileSync(new URL('../data/designs_default.json', import.meta.url)));
  for (const [name, entry] of Object.entries(ALL.profiles)) {
    const D2 = entry.design, nom = entry.nominal || null;
    E.setMoonZone(D2.profile === 'HALO' ? 1.25 * D2.HALO.stats.raKm : E.SOI_M);
    makeLive(SPK, PCK, eo, ALL.tStart);
    const M2 = new Mission({ design: D2 }); M2.P.tLimit = Infinity; M2.attachHistory();
    const O2 = { stages: D2.STAGES, siteIcrf, rSite: R_SITE, tLaunch: D2.LAUNCH.t_launch };
    let last = -1e9, n = 0, nS = 0, errs = 0, nan = 0, hard = 0, ex = '';
    const mg = { 0: [], 1: [] }, noNaN = (o) => Object.values(o).every((v) => (typeof v === 'number' ? !Number.isNaN(v) : v && typeof v === 'object' && !Array.isArray(v) ? noNaN(v) : true));
    for (;;) {
      if (M2.gen.next().done) break;
      const h = M2.hist[M2.hist.length - 1];
      if (h.t - last > (h.thr > 0 ? 40 : 1800)) {
        last = h.t; nS++;
        try {
          const tel = T.computeTelemetry({ ...h }, O2), b = T.dvBudget(D2, nom, M2.events, h, O2.stages), al = T.alerts(tel, b.rows, O2).filter((a) => a.level !== 'info');
          if (!noNaN(tel)) nan++; if (al.length) { hard++; ex = ex || `${h.phase}: ${al[0].text}`; } for (const q of b.rows) mg[q.stage].push(q.margin);
        } catch (e) { errs++; ex = ex || e.message; }
      }
      if (++n > 8e6) break;
    }
    const sp = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    check(`profil ${name}: telemetri istisnasız, NaN yok, yanlış alarm yok, Δv payı sabit, iniş başarılı`, M2.result && M2.result.ok && errs === 0 && nan === 0 && hard === 0 && sp(mg[0]) < 1 && sp(mg[1]) < 1.5,
      `${nS} örnek, pay yayılımı k0 ${sp(mg[0]).toFixed(2)} / k1 ${sp(mg[1]).toFixed(2)} m/s${ex ? ', ' + ex : ''}`);
  }
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
