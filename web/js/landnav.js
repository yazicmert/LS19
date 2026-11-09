// LS19 iniş seyrüseferi (L2): güdüm gerçek durumu değil, aracın kendi kestirimini kullanır. Saf kod (DOM yok), Node'da sınanır: test/test_landnav.js.
//
// Model (hata durumu biçiminde Kalman süzgeci; Ay merkezli eylemsiz ICRF eksenleri, SI birimleri):
//   kestirim = gerçek + e, e = [e_r (m), e_v (m/s)]. Gerçek durum fizikten (mission.js) gelir; kestirimin gerçekten farkı fiziksel olarak şöyle evrilir:
//   • IMU ilerletmesi (her fizik adımı): ivmeölçer kütleçekim dışı ivmeyi ölçer (itki/kütle); hatası sabit sapma b_a + eksen kaçıklığı μ×a + gürültü.
//     ė_v = G·e_r + δa (G: çekim gradyanı, kestirim yanlış yerde olduğu için çekimi yanlış hesaplar), ė_r = e_v.
//   • PDI'da başlangıç hatası: yer izlemesinden (yörünge belirleme) gelen konum/hız hatası, yerel eksenlerde (menzil, yan, yukarı) çekilir.
//   • Ölçümler (her NAV.DT = 2 s; Apollo LGC iniş radarı verisini 2 s'lik güdüm döngüsünde işler: Bennett, NASA TM X-58040, NTRS 19700024568):
//       radar altimetre: yüzeye göre irtifa h + sapma + gürültü; radar hız ölçer: yüzeye göre hız (3 eksen) + gürültü;
//       arazi göreli seyrüsefer (TRN, kamera + harita eşleme): 3 eksen konum; SLIM'de görüntü seyrüseferi engelden kaçınmadan önce ~50 m'de ≤ 10 m (≈3–4 m)
//       doğruluk verdi (JAXA, https://global.jaxa.jp/press/2024/01/20240125-1_e.html).
//     Her ölçümün kesilme (dropout) olasılığı vardır. Ölçüm kestirimden NAV.GATE·σ'dan fazla saparsa "makul değil" sayılıp reddedilir (makullük sınaması).
//   • Kalıcı ret kuralı (ispace HAKUTO-R M1 dersi: yazılım krater kenarında ani irtifa değişimini "algılayıcı arızası" sayıp doğru altimetre verisini kalıcı
//     reddetti, araç yüzeyde sandığı anda ~5 km yüksekteydi: https://ispace-inc.com/news-en/?p=4691, ispace Mission 1 debriefing): altimetre NAV.PERSIST döngü üst üste reddedilir ve
//     ölçümler kendi içinde tutarlıysa (arazi kabartmasının irtifayı gerçekten değiştirebildiği NAV.H_TERRAIN üstünde) kestirimin dikey belirsizliği büyütülüp
//     altimetre yeniden kabul edilir; bu irtifanın altında (iniş yeri düz ve önceden incelenmiş) tutarlı ama kestirimle uyuşmayan altimetre arızalı sayılır,
//     iniş IMU + hız ölçer (+ TRN) ile sürer. IM-2'de lazer altimetre girişim ve gürültüyle bozuldu (https://spacepolicyonline.com/news/im-2s-imperfect-landing-due-to-altimeter-interference-south-pole-lighting-conditions/):
//     sınama gürültülü/sapmalı ölçümü süzgeçten uzak tutar.
// (v): kaynaksız model değeri. Tüm rastgelelik tohumludur (aynı tohum → aynı uçuş).
import { add, sub, scale, dot, cross, norm } from './vec3.js';

export const NAV = {
  DT: 2.0,                                         // s: ölçüm döngüsü (Apollo, Bennett TM X-58040)
  INIT: { pos: [300, 300, 60], vel: [0.3, 0.3, 0.2] },     // PDI'da 1σ hata: konum (m) ve hız (m/s), yerel menzil/yan/yukarı (v)
  IMU: { bias: 5e-4, mis: 1e-4, noise: 2e-3 },     // ivmeölçer sapması 1σ (m/s², ~50 µg), eksen kaçıklığı (rad), hız rastgele yürüyüşü (m/s/√s) (v)
  ALT: { hOn: 15000, sig0: 1.0, sigRel: 0.01, bias: 1.0, drop: 0.05 },   // altimetre: devreye girdiği irtifa (m), gürültü max(sig0, sigRel·h) (m), sapma 1σ (m), kesilme olasılığı (v)
  VEL: { hOn: 8000, sig0: 0.05, sigRel: 0.01, drop: 0.05 },              // hız ölçer: devreye girdiği irtifa (m), gürültü max(sig0, sigRel·|v|) (m/s) (v)
  TRN: { hOn: 15000, hOff: 50, sig0: 1.0, sigRel: 0.002, drop: 0.1 },    // TRN: çalıştığı irtifa aralığı (m; alt sınır SLIM'deki 50 m), gürültü max(sig0, sigRel·h) (m) (v)
  GATE: 4.0, PERSIST: 5, H_TERRAIN: 2000,          // makullük kapısı (σ), kalıcı ret döngü sayısı, arazi kabartmasının irtifayı değiştirebildiği irtifa (m) (v)
};

// tohumlu sözde rastgele (mulberry32) ve normal dağılım (Box–Muller)
function rng(seed) {
  let a = (seed >>> 0) || 1, spare = null;
  const u = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => { if (spare !== null) { const s = spare; spare = null; return s; } let x, y, r; do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r >= 1 || r === 0); const f = Math.sqrt(-2 * Math.log(r) / r); spare = y * f; return x * f; };
  return { u, n };
}
const zeros6 = () => Array.from({ length: 6 }, () => new Array(6).fill(0));

export class LandNav {
  // o: { seed, init (off: [menzil, yan, yukarı] m sabit ek PDI hatası), imu, alt, vel, trn (NAV alt kümelerini geçersiz kılar; trn: false kapatır), persist (false: kalıcı ret kuralı yok — ispace M1 davranışı),
  //      faults: [{ sensor: 'alt', bias: m, below: m (gerçek irtifa bu değerin altındayken), above: m }, { sensor: 'alt'|'vel'|'trn', drop: true, below, above }] }
  constructor(o = {}) {
    this.o = o; this.R = rng(o.seed ?? 1);
    this.cfg = { INIT: { ...NAV.INIT, ...(o.init || {}) }, IMU: { ...NAV.IMU, ...(o.imu || {}) }, ALT: { ...NAV.ALT, ...(o.alt || {}) }, VEL: { ...NAV.VEL, ...(o.vel || {}) },
      TRN: o.trn === false ? null : { ...NAV.TRN, ...(o.trn || {}) } };
    this.persist = o.persist !== false; this.faults = o.faults || [];
    this.ev = []; this.t = null; this.tMeas = null; this.e = [0, 0, 0, 0, 0, 0]; this.P = zeros6();
    this.st = { alt: { on: false, rej: 0, ys: [], dead: false, n: 0, nRej: 0 }, vel: { on: false, n: 0, nRej: 0 }, trn: { on: false, n: 0, nRej: 0 } };
  }
  note(t, key, msg) { this.ev.push({ t, key, msg }); }
  // PDI: gerçek durum (km, km/s), yerel eksenler (satırlar: menzil, yan, yukarı)
  init(t, rs, vs, Rf) {
    const { n } = this.R, C = this.cfg, I = C.INIT;
    const off = I.off || [0, 0, 0], dl = [n() * I.pos[0] + off[0], n() * I.pos[1] + off[1], n() * I.pos[2] + off[2]], dvl = [n() * I.vel[0], n() * I.vel[1], n() * I.vel[2]];
    const toI = (l) => add(add(scale(Rf[0], l[0]), scale(Rf[1], l[1])), scale(Rf[2], l[2]));
    const er = toI(dl), ev = toI(dvl); this.e = [...er, ...ev];
    for (let i = 0; i < 3; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {          // P0 = Rfᵀ diag(σ²) Rf
      this.P[a][b] += Rf[i][a] * Rf[i][b] * I.pos[i] ** 2; this.P[a + 3][b + 3] += Rf[i][a] * Rf[i][b] * I.vel[i] ** 2;
    }
    this.ba = [n() * C.IMU.bias, n() * C.IMU.bias, n() * C.IMU.bias]; this.mu = [n() * C.IMU.mis, n() * C.IMU.mis, n() * C.IMU.mis];
    this.bAlt = n() * C.ALT.bias; this.t = t; this.tMeas = t; this.tCov = t;
    this.note(t, 'NAV', `Seyrüsefer: PDI durum hatası ${norm(dl).toFixed(0)} m, ${norm(dvl).toFixed(2)} m/s (yer izlemesi); IMU ile ilerletiliyor`);
  }
  // fizik adımı: t'ye kadar hata durumunu ilerlet. aThr: son aralıkta uygulanan gerçek kütleçekim dışı ivme (km/s², ICRF), rs Ay merkezli konum (km)
  propagate(t, aThr, rs, mu = 4902.800066) {
    const dt = t - this.t; if (!(dt > 0)) return;
    const a = scale(aThr, 1000), C = this.cfg.IMU, e = this.e, er = e.slice(0, 3), r = norm(rs), rh = scale(rs, 1 / r), k = mu / (r * r * r);          // k: 1/s²
    const G = sub(scale(rh, 3 * k * dot(rh, er)), scale(er, k));
    const sw = C.noise / Math.sqrt(dt), na = [this.R.n() * sw, this.R.n() * sw, this.R.n() * sw];
    const da = add(add(this.ba, cross(this.mu, a)), norm(a) > 0 ? na : [0, 0, 0]);          // ivmeölçer yalnız itkiyle anlamlı ölçer; süzülmede gürültü eklenmez (v)
    for (let i = 0; i < 3; i++) { e[3 + i] += (G[i] + da[i]) * dt; e[i] += e[3 + i] * dt; }
    this.t = t;
  }
  // kovaryans: son ölçümden bu yana (sabit hız modeli + ivme gürültüsü q = sapma² + gürültü²/dt yaklaşığı)
  covProp(t) {
    const dt = t - this.tCov; if (!(dt > 0)) return;
    const P = this.P, C = this.cfg.IMU, q = C.bias ** 2 * dt + C.noise ** 2;          // m²/s³ eşdeğeri: sapma rastgele yürüyüş gibi ele alınır (v)
    const N = zeros6();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      // Φ = [[I, I dt], [0, I]]
      const pij = P[i][j], pi3 = i < 3 ? P[i + 3][j] : 0, pj3 = j < 3 ? P[i][j + 3] : 0, p33 = i < 3 && j < 3 ? P[i + 3][j + 3] : 0;
      N[i][j] = pij + dt * (pi3 + pj3) + dt * dt * p33;
    }
    for (let i = 0; i < 3; i++) { N[i][i] += q * dt ** 3 / 3; N[i][i + 3] += q * dt ** 2 / 2; N[i + 3][i] += q * dt ** 2 / 2; N[i + 3][i + 3] += q * dt; }
    this.P = N; this.tCov = t;
  }
  // skaler ölçüm: h (6), y = z − tahmin (yenilik), R gürültü varyansı. Döner { ok, nis }
  scalar(h, y, Rv, gate = NAV.GATE) {
    const P = this.P, Ph = P.map((row) => row.reduce((s, x, j) => s + x * h[j], 0)), S = h.reduce((s, x, i) => s + x * Ph[i], 0) + Rv;
    const nis = y / Math.sqrt(S);
    if (Math.abs(nis) > gate) return { ok: false, nis, S };
    const K = Ph.map((x) => x / S);
    for (let i = 0; i < 6; i++) this.e[i] += K[i] * y;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) P[i][j] -= K[i] * Ph[j];
    for (let i = 0; i < 6; i++) for (let j = 0; j < i; j++) { const m = 0.5 * (P[i][j] + P[j][i]); P[i][j] = m; P[j][i] = m; }
    return { ok: true, nis, S };
  }
  fault(sensor, h) { return this.faults.filter((f) => f.sensor === sensor && (f.below == null || h < f.below) && (f.above == null || h >= f.above)); }
  // ölçüm döngüsü (her NAV.DT s): gerçek durum rs, vs (km, km/s), yüzeye göre hız vrel (km/s), yerel eksenler Rf, gerçek irtifa h (m, iniş yeri yüzeyinden)
  measure(t, { Rf, h, vrel }) {
    if (t < this.tMeas + NAV.DT - 1e-9) return;
    this.tMeas = t; this.covProp(t);
    const { n, u } = this.R, C = this.cfg, S = this.st, up = Rf[2];
    // radar altimetre (gerçek irtifa + sapma + gürültü; arıza: ek sapma ya da kesilme)
    const fa = this.fault('alt', h), A = S.alt;
    if (h < C.ALT.hOn && !A.dead) {
      if (!A.on) { A.on = true; this.note(t, 'NAV_ALT', `İniş radarı: irtifa verisi alındı (${(h / 1000).toFixed(1)} km)`); }
      if (!(u() < C.ALT.drop) && !fa.some((f) => f.drop)) {
        const sig = Math.max(C.ALT.sig0, C.ALT.sigRel * h), z = h + this.bAlt + fa.reduce((s, f) => s + (f.bias || 0), 0) + n() * sig;
        const y = z - (h + dot(up, this.e.slice(0, 3)));                        // tahmin: kestirimin irtifası
        const r = this.scalar([...up, 0, 0, 0], y, sig * sig);
        A.n++;
        if (r.ok) { A.rej = 0; A.ys = []; }
        else {
          A.nRej++; A.rej++; A.ys.push(y);
          if (A.rej === 1) this.note(t, 'NAV_REJ', `Makullük sınaması: altimetre kestirimden ${y.toFixed(1)} m sapıyor (${Math.abs(r.nis).toFixed(1)}σ), veri reddedildi`);
          if (A.rej >= NAV.PERSIST) {
            const m = A.ys.reduce((s, x) => s + x, 0) / A.ys.length, sd = Math.sqrt(A.ys.reduce((s, x) => s + (x - m) ** 2, 0) / A.ys.length), hEst = h + dot(up, this.e.slice(0, 3));
            const consistent = sd < 3 * sig + 0.05 * Math.abs(m);
            if (this.persist && consistent && hEst > NAV.H_TERRAIN) {
              // dikey belirsizliği büyüt, altimetreyi yeniden kabul et (ispace M1 dersi)
              const v = m * m; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.P[i][j] += v * up[i] * up[j];
              this.scalar([...up, 0, 0, 0], y, sig * sig, Infinity);
              this.note(t, 'NAV_ACCEPT', `Altimetre ${NAV.PERSIST * NAV.DT} s tutarlı biçimde ${m.toFixed(0)} m farklı ölçüyor: arazi kabartması sayıldı, veri yeniden kabul edildi`);
              A.rej = 0; A.ys = [];
            } else if (this.persist && consistent) {
              A.dead = true;
              this.note(t, 'NAV_FAULT', `Altimetre arızalı sayıldı (${NAV.PERSIST * NAV.DT} s boyunca ${m.toFixed(0)} m tutarlı sapma, ${(hEst).toFixed(0)} m irtifada): iniş IMU, hız ölçer ve TRN ile sürüyor`);
            } else A.ys = A.ys.slice(-NAV.PERSIST);
          }
        }
      }
    }
    // radar hız ölçer: yüzeye göre hız, yerel üç eksende
    const V = S.vel, fv = this.fault('vel', h);
    if (h < C.VEL.hOn) {
      if (!V.on) { V.on = true; this.note(t, 'NAV_VEL', `İniş radarı: hız verisi alındı (${(h / 1000).toFixed(1)} km)`); }
      if (!(u() < C.VEL.drop) && !fv.some((f) => f.drop)) {
        const sig = Math.max(C.VEL.sig0, C.VEL.sigRel * norm(vrel) * 1000);
        for (let k = 0; k < 3; k++) {
          const ax = Rf[k], z = dot(ax, vrel) * 1000 + fv.reduce((s, f) => s + (f.bias || 0), 0) + n() * sig, y = z - (dot(ax, vrel) * 1000 + dot(ax, this.e.slice(3)));
          const r = this.scalar([0, 0, 0, ...ax], y, sig * sig); V.n++; if (!r.ok) V.nRej++;
        }
      }
    }
    // TRN: harita eşleme ile 3 eksen konum
    const T = C.TRN, Ts = S.trn, ft = this.fault('trn', h);
    if (T && h < T.hOn && h > T.hOff) {
      if (!Ts.on) { Ts.on = true; this.note(t, 'NAV_TRN', `Arazi göreli seyrüsefer (kamera + harita) devrede (${(h / 1000).toFixed(1)} km)`); }
      if (!(u() < T.drop) && !ft.some((f) => f.drop)) {
        const sig = Math.max(T.sig0, T.sigRel * h);
        for (let k = 0; k < 3; k++) {
          const ax = Rf[k], y = n() * sig + ft.reduce((s, f) => s + (f.bias || 0), 0) - dot(ax, this.e.slice(0, 3));
          const r = this.scalar([...ax, 0, 0, 0], y, sig * sig); Ts.n++; if (!r.ok) Ts.nRej++;
        }
      }
    } else if (T && Ts.on && h <= T.hOff && !Ts.off) { Ts.off = true; this.note(t, 'NAV_TRN', `Arazi göreli seyrüsefer bitti (${h.toFixed(0)} m): son metreler IMU, radar irtifa ve hızıyla`); }
  }
  // kestirim (km, km/s): gerçek + hata
  estimate(rs, vs) { const e = this.e; return [add(rs, scale(e.slice(0, 3), 1e-3)), add(vs, scale(e.slice(3), 1e-3))]; }
  sigma() { const P = this.P; return { pos: Math.sqrt(P[0][0] + P[1][1] + P[2][2]), vel: Math.sqrt(P[3][3] + P[4][4] + P[5][5]) }; }
}
