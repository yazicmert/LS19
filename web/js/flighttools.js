// Uçuş aletleri (ui.js'ten ayrıldı; UI'ya karıştırılır): Yörünge sekmesi (anlık yörünge elemanları, kuvvet dökümü) ve Canlı efemeris sekmesi
// (Güneş/Ay/Dünya konumları, Ay yönelimi, IAU kutbu, Dünya–Ay kütle merkezi; başvuru değerlerine göre farklar).
import * as E from './engine.js';
import * as EO from './earth.js';
import { etOf } from './live.js';
import { BODIES, IS, IE, IM } from './ephem.js';
import { sunElevationAtSite } from './design.js';
import { fmt, fmtDur } from './format.js';
import { $, setText, setWidth, utcShort } from './uiutil.js';

const AU = 149597870.7, D2R = Math.PI / 180, R2AS = 180 / Math.PI * 3600;
const ECL_POLE = [0, -0.3977771559, 0.9174820621];                // J2000 ekliptik kutbu (ICRF)
const K_EMB = BODIES[IM].gm / (BODIES[IE].gm + BODIES[IM].gm);   // Dünya–Ay kütle merkezinin Ay'a doğru kesri
const hms = (x) => { const s = ((x % 86400) + 86400) % 86400; return fmtDur(s).replace(/^.*?(\d\d:\d\d:\d\d)$/, '$1'); };
const dms = (as) => { const a = Math.abs(as), d = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  return (as < 0 ? '−' : '') + (d ? `${d}° ` : '') + `${m}′ ${fmt(s, 1)}″`; };
const mv = E.mv;
// 3-1-3 Euler (φ, θ, ψ) -> ICRF->PA matrisi (DE440 PCK kuralı, ephem.paEuler'in tersi)
function paFromEuler([phi, th, psi]) {
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
  const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
  const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mm(mm(Rz(psi), Rx(th)), Rz(phi));
}
// iki dönüş matrisi arasındaki açı (küçük açılarda hassas: çarpık-simetrik kısımdan)
function rotAngle(A, B) {
  const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[j][0] + A[i][1] * B[j][1] + A[i][2] * B[j][2]));
  const s = 0.5 * Math.hypot(C[2][1] - C[1][2], C[0][2] - C[2][0], C[1][0] - C[0][1]), c = 0.5 * (C[0][0] + C[1][1] + C[2][2] - 1);
  return Math.atan2(s, c);
}

export class FlightTools {
  orbitTab(s) {
    const t = s.t, rm = E.moonPos(t), nearM = E.norm(E.sub(s.r, rm)) < E.MOON_ZONE;
    const cen = nearM ? rm : [0, 0, 0], vc = nearM ? E.moonVel(t) : [0, 0, 0], mu = nearM ? E.MU_M : E.MU_E, Rb = nearM ? E.R_M : E.R_E;
    const r = E.sub(s.r, cen), v = E.sub(s.v, vc), el = E.elements(r, v, mu);
    // eğim: Dünya için tarihin ekvatoruna, Ay için Ay ekvatoruna (ME)
    const pole = nearM ? E.mtv(E.moonIcrfToMe(t), [0, 0, 1]) : E.precession(t)[2];
    const inc = Math.acos(E.dot(E.unit(el.h), pole)) * 180 / Math.PI;
    const period = el.e < 1 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / mu) : NaN;
    const rows = [['Merkez cisim', nearM ? 'Ay' : 'Dünya'], ['Tür', el.e < 1 ? 'elips' : 'hiperbol'],
      ['Yarı büyük eksen', Number.isFinite(el.a) ? fmt(el.a, 0) + ' km' : '—'], ['Dış merkezlik', fmt(el.e, 5)],
      ['Eğim (ekvatora göre)', fmt(inc, 2) + '°'], ['Periapsis irtifası', fmt(el.rp - Rb, 1) + ' km'],
      ['Apoapsis irtifası', el.e < 1 ? fmt(el.ra - Rb, 1) + ' km' : '∞'], ['Periyot', Number.isFinite(period) ? fmtDur(period) : '—'],
      ['Özgül enerji', fmt(el.energy, 4) + ' km²/s²']];
    this.fillRows($('#orbtable tbody'), rows);
  }
  // etiket/değer satırlarını yerinde güncelle: yapı (etiketler ve bölüm başlıkları) değişmedikçe düğümler yeniden kurulmaz, yalnız değişen değer metinleri yazılır
  fillRows(tb, rows) {
    const sig = rows.map((r) => (r.sec ? '§' + r.sec : r[0])).join('|');
    let S = tb._rows;
    if (!S || S.sig !== sig) {
      tb.replaceChildren(); const cells = [];
      for (const r of rows) {
        const tr = document.createElement('tr');
        if (r.sec) { tr.className = 'sec'; const th = document.createElement('th'); th.colSpan = 2; th.textContent = r.sec; tr.appendChild(th); cells.push(null); }
        else { const a = document.createElement('td'); a.textContent = r[0]; const b = document.createElement('td'); b.className = 'num'; tr.append(a, b); cells.push(b); }
        tb.appendChild(tr);
      }
      S = tb._rows = { sig, cells };
    }
    rows.forEach((r, i) => { if (!r.sec) setText(S.cells[i], r[1]); });
  }
  // kuvvet dökümü: Dünya, Ay, Güneş (+gezegenler), şekil terimleri ve itki; çubuklar logaritmik (10⁻⁹ … 10¹ m/s²)
  forceTab(s) {
    const f = s.forces; if (!f) return;
    const fx = (x) => (x > 0 ? x.toExponential(2).replace('.', ',').replace('e+', '·10^').replace('e-', '·10^−') : '—');
    const sup = (t) => t.replace(/\^(−?)(\d+)/, (m, sg, d) => (sg ? '⁻' : '') + d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''));
    const rows = [['Dünya', f.earth, f.earthEff], ['Ay', f.moon, f.moonEff], ['Güneş', f.sun, f.sunEff], ['Gezegenler (toplam)', null, f.planets],
      ['Dünya J2 (basıklık)', null, f.earthJ2], ['Ay J2/C22 (şekil)', null, f.moonFig], ['İtki', null, f.thrust]];
    const eff = rows.map((r) => r[2] || 0), top = Math.max(...eff.slice(0, 3)), tb = $('#forcetable tbody');
    setText($('#forceFrame'), `Baskın cisim: ${f.frame === 'M' ? 'Ay' : 'Dünya'} · Ay'a ${fmt(f.moonDist, 0)} km, Dünya'ya ${fmt(f.earthDist, 0)} km · çözücü: ${s.nbody ? 'N-cisim (tek çerçeve)' : 'etki küresi (iki merkez cisim)'}`);
    let S = tb._force;
    if (!S) {                                                    // satırlar sabit: bir kez kurulur, sonra yalnız metin/çubuk genişliği güncellenir
      tb.replaceChildren(); S = tb._force = rows.map((r) => {
        const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td'), bar = document.createElement('span'), tn = document.createTextNode('');
        a.textContent = r[0]; b.className = 'num'; c.className = 'num'; bar.className = 'fbar'; c.append(tn, bar); tr.append(a, b, c); tb.appendChild(tr);
        return { tr, b, tn, bar, cls: '' };
      });
    }
    rows.forEach((r, i) => {
      const o = S[i], cls = i < 3 && r[2] === top ? 'hl' : '';
      if (o.cls !== cls) { o.cls = cls; o.tr.className = cls; }
      setText(o.b, r[1] != null ? sup(fx(r[1])) : '');
      const txt = sup(fx(r[2] || 0)); if (o.tn.nodeValue !== txt) o.tn.nodeValue = txt;
      setWidth(o.bar, Math.max(0, Math.min(100, ((Math.log10(Math.max(r[2] || 0, 1e-12)) + 9) / 10) * 100)).toFixed(1) + '%');
    });
  }
  // ------------------------------------------------------------------ canlı efemeris sekmesi
  ephTab(t) {
    const lv = this.live; if (!lv) return;
    const L = lv.L, et = etOf(t), { add, sub, scale, norm, unit, dot } = E;
    const [pE, vE] = L.body(IE, et), [pM, vM] = L.body(IM, et), [pS, vS] = L.body(IS, et);
    const rEM = sub(pM, pE), vEM = sub(vM, vE), d = norm(rEM);
    const pB = add(scale(pE, 1 - K_EMB), scale(pM, K_EMB)), vB = add(scale(vE, 1 - K_EMB), scale(vM, K_EMB));
    // resmi efemerise (DE440) göre fark: konum ve Ay yönelimi
    let dMoon = null, dEarth = null, dPA = null;
    try {
      const m = lv.spk.rel(3, 301, et)[0], e = lv.spk.rel(3, 399, et)[0];
      dMoon = norm(sub(sub(m, e), rEM)) * 1000;
      dEarth = norm(sub(lv.spk.ssb(399, et)[0], pE));
      dPA = rotAngle(paFromEuler(lv.pck.angles(et)[0]), E.moonIcrfToPa(t)) * R2AS;
    } catch (err) { /* çekirdek aralığı dışı */ }
    // Dünya yönelimi (IAU 2006/2000A)
    const jdTT = E.jdTdb(t), dT = EO.deltaT(jdTT), jdUT1 = jdTT - dT / 86400;
    const n = EO.npb(jdTT), gst = EO.gast(jdUT1, jdTT), era = EO.era(jdUT1);
    // Ay dönüşü (Euler denklemleri): açısal hız, Dünya'dan görülen libration, ekvator eğimi
    const { w } = L.moonAttitude(et), wDeg = norm(w) * 86400 / D2R;
    const Me = E.moonIcrfToMe(t), u = mv(Me, unit(scale(rEM, -1)));
    const libLat = Math.asin(u[2]) / D2R, libLon = Math.atan2(u[1], u[0]) / D2R;
    const moonEclInc = Math.acos(dot(Me[2], ECL_POLE)) / D2R;
    const fwd = L.fwd[L.fwd.length - 1].t, bwd = L.bwd[L.bwd.length - 1].t;
    const sec = (title) => ({ sec: title });
    const rows = [
      sec('Dünya–Ay çifti (ortak kütle merkezi)'),
      ['Dünya–Ay uzaklığı', fmt(d, 0) + ' km'],
      ['Kütle merkezinin Dünya merkezine uzaklığı', fmt(K_EMB * d, 0) + ' km'],
      ['… Dünya yüzeyinin altında', fmt(E.R_E - K_EMB * d, 0) + ' km'],
      ["Dünya'nın kütle merkezi etrafında hızı", fmt(K_EMB * norm(vEM) * 1000, 1) + ' m/s'],
      ["Ay'ın kütle merkezi etrafında hızı", fmt((1 - K_EMB) * norm(vEM), 3) + ' km/s'],
      ["Kütle merkezinin Güneş'e uzaklığı", fmt(norm(sub(pB, pS)) / AU, 5) + ' AB'],
      ["Kütle merkezinin Güneş etrafında hızı", fmt(norm(sub(vB, vS)), 3) + ' km/s'],
      ['Ay konumu: DE440 farkı', dMoon == null ? '—' : dMoon < 1000 ? fmt(dMoon, 1) + ' m' : fmt(dMoon / 1000, 2) + ' km'],
      ['Dünya konumu (Güneş sistemi merkezine göre): DE440 farkı', dEarth == null ? '—' : dEarth < 1 ? fmt(dEarth * 1000, 1) + ' m' : fmt(dEarth, 2) + ' km'],
      sec('Dünya dönüşü (IAU 2006/2000A)'),
      ['Greenwich görünür yıldız zamanı', hms(gst / (2 * Math.PI) * 86400)],
      ['Dünya dönüş açısı (ERA)', fmt(era / D2R, 4) + '°'],
      ['Dönüş hızı', '360,98561°/gün'],
      ['Yıldız günü', '23 sa 56 dk 4,1 s'],
      ['Nütasyon Δψ / Δε', `${fmt(n.dpsi * R2AS, 3)}″ / ${fmt(n.deps * R2AS, 3)}″`],
      ['Ekseninin eğikliği (gerçek)', fmt((n.epsa + n.deps) / D2R, 5) + '°'],
      ['Kutbun J2000 yönünden sapması (presesyon)', dms(Math.acos(Math.min(1, n.R[2][2])) * R2AS)],
      ['ΔT = TT − UT1', fmt(dT, 2) + ' s'],
      sec('Ay dönüşü (tork + Euler denklemleri)'),
      ['Açısal hız', fmt(wDeg, 4) + '°/gün'],
      ['Dönüş periyodu', fmt(360 / wDeg, 3) + ' gün'],
      ['Dünya\'dan görünen libration (enlem / boylam)', `${fmt(libLat, 2)}° / ${fmt(libLon, 2)}°`],
      ['Ay ekvatorunun ekliptiğe eğimi', fmt(moonEclInc, 3) + '°'],
      ['İniş yerinde Güneş yüksekliği', fmt(sunElevationAtSite(t), 2) + '°'],
      ['Yönelim: DE440 farkı', dPA == null ? '—' : fmt(dPA, 3) + '″'],
      sec('Entegratör'),
      ['Cisimler', '11 (Güneş, 8 gezegen, Plüton, Ay)'],
      ['Başlangıç (DE440 durumu)', utcShort(L.et0 - etOf(0))],
      ['Hesaplanan aralık', `${fmt((fwd - bwd) / 86400, 2)} gün · ${L.steps ?? L.fwd.length + L.bwd.length} adım`],
    ];
    this.fillRows($('#ephtable tbody'), rows);
  }
}
