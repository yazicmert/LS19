// LS19 6-DOF yönelim: Dyn6 = rijit cisim durumu (q, ω) + denetleyici + aktüatörler (TVC gimbal, RCS). Fizik motoru (engine.js, Propagator) bu sınıfı kullanır.
// Gerçek 6 serbestlik dereceli dinamik (rigidbody.js): itki ekseni komuta kendiliğinden ışınlanmaz; denetleyici tork ister, aktüatörler (sınırlı yetkiyle) tork üretir,
// Euler denklemleri dönmeyi ilerletir, itki gerçek (gimbal sapmalı) eksen boyunca uygulanır. Parçalar:
//  • Denetleyici (her denetim periyodunda, tork bir periyot boyunca sabit): komutla itki ekseni arası hata → frenleme eğrili dönme hızı komutu (eldeki açısal ivmeyle durabilecek
//    biçimde, en çok wMax) → hız döngüsü (Kw) → tork komutu τ = I·a + ω×Iω (jiroskopik terim giderilir). Yuvarlanma (z) için hız sönümü.
//  • Tahsis: ana motor açıkken yunuslama/sapma torku TVC gimbaliyle (açı sınırlı, hız sınırlı, birinci derece gecikmeli; integratör gimbal açısı biriminde "kırpma"
//    (trim): kütle merkezi ofseti ve itki sapmasını sıfırlar, yakışlar arasında korunur, ateşlemeden önce gimbal bu konuma getirilir), TVC doyarsa artığı ve yuvarlanma RCS'ye.
//    Motor kapalıyken üç eksen de RCS ile. RCS: eksen başına tork çifti (yetki 2·n·F·kol), PWM + en küçük itki darbesi (altı yarım darbeden küçükse ateşlenmez), propellant
//    ṁ = |τ|/(kol·Isp·g₀) kademenin kuru kütlesinden düşer (kademenin RCS bütçesi biterse RCS yetkisi sıfır).
//  • Yarı-durağan tutma: itkisiz süzülürken komut ölü bant (0,5°) içinde ve yavaş (< 0,5°/s) döndüğünde dönme dinamiği simüle EDİLMEZ (günler süren süzülmede 0,05 s adımlar
//    kullanılamaz): yönelim komuta oturur, açısal hız komutun dönme hızıdır; sınır çevrimi ve tutma yakıtı modellenmez. Dönmeler (komut sıçraması), yakışlar ve iniş gerçek dinamikle koşar.
//  Gravite gradyanı torku da eklenir (çok küçük). Sensör, kestirim, çalkantı, esneklik YOKTUR: yönelim bilgisi mükemmeldir.
import { qMul, qRot, qConj, qNormalize, qFromZ, qSwing, vAngle, Z_AXIS, D2R } from './attitude.js';
import { massProps, rk4Rot, ggTorque, stageSpec } from './rigidbody.js';

const G0 = 9.80665;                                                // m/s²
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 1]; };
export const CTL = {
  HOLD_ENTER: 0.5 * D2R, HOLD_W: 0.3 * D2R, HOLD_RATE: 0.5 * D2R, HOLD_TRACK_MAX: 2.0 * D2R,     // yarı-durağan tutma: hata, hız hatası, komut hızı eşikleri (rad, rad/s)
  TVC_DERATE: 0.7, RCS_SUPPORT: 0.3, RCS_SUPPORT_FAST: 1.0,           // frenleme eğrisinde güvenilir yetki payları: gimbal (gecikme/hız sınırı için), motor açıkken RCS (yalnız TVC doyarsa yardım eder; iniş/elle uçuşta daha çok)
  FF_TAU: 2.0, FF_JUMP: 3.0 * D2R,                                  // komut hızı süzgeci zaman sabiti (s) ve bunun üstünde (rad/s) komut sıçraması sayılır
  ELL_MIN: 0.1,                                                     // kütle merkezi–gimbal kolu bundan küçükse TVC kullanılmaz (m)
  ERR_WARN: 10.0 * D2R,                                             // itki ekseni hatasının 'sürüyor' sayıldığı eşik (rad); süre errT'de birikir (telemetri uyarısı için)
  TVC_MIN: 0.3,                                                     // gimbal yalnız itki, tam itkinin bu oranından büyükken kullanılır: altında gimbal yetkisi küçüktür ve doygun gimbalin yan kuvveti yönelim komutuyla sürekli salınıma girer → yönelim RCS'ye bırakılır
};

// v vektörünü, d birim vektörünü z eksenine götüren dönmeyle döndür (Rodrigues): komutu "itki çerçevesinde" ifade eder
function toThrustFrame(d, v) {
  const s = Math.hypot(d[0], d[1]); if (s < 1e-12) return v;
  const k = [d[1] / s, -d[0] / s, 0], c = d[2], kv = dot(k, v), kxv = cross(k, v);          // k = d × ẑ / |d × ẑ|, cosθ = d_z, sinθ = s
  return [v[0] * c + kxv[0] * s + k[0] * kv * (1 - c), v[1] * c + kxv[1] * s + k[1] * kv * (1 - c), v[2] * c + kxv[2] * s + k[2] * kv * (1 - c)];
}

export class Dyn6 {
  constructor(z, ref = [1, 0, 0], w = [0, 0, 0]) {
    this.q = qFromZ(z, ref); this.w = w.slice();
    this.g = [0, 0];                                                // gerçek gimbal (gövde x, y: itki yönü teğetleri)
    this.gi = [0, 0];                                               // kırpma (trim) integratörü, gimbal biriminde
    this.tq = [0, 0, 0]; this.tqTvc = [0, 0, 0]; this.tqRcs = [0, 0, 0]; this.duty = [0, 0, 0];      // son adımın torku (N·m), RCS görev oranları (−1..1)
    this.err = 0; this.errT = 0; this.mode = 'hold'; this.sat = false;   // itki ekseni–komut hatası (rad), hatanın ERR_WARN üstünde kesintisiz sürdüğü süre (s), kip ('hold' | 'dyn' | 'free'), TVC doyma
    this.cPrev = null; this.tPrev = 0;                              // önceki komut (hız tahmini)
    this.acc = [0, 0, 0];                                           // RCS darbe birikimi (N·m·s)
    this.ffs = [0, 0, 0];                                           // süzülmüş komut dönme hızı (eylemsiz, rad/s): yakışta kayan yönü (TLI) gecikmesiz izlemek için ileri besleme
  }
  get dynamic() { return true; }
  // arayüz/telemetri için anlık tanı (kopya): açısal hız, gimbal, tork, RCS görev oranları, hata, kip
  diag() { return { w: this.w.slice(), g: this.g.slice(), gi: this.gi.slice(), tq: this.tq.slice(), tqTvc: this.tqTvc.slice(), tqRcs: this.tqRcs.slice(), duty: this.duty.slice(), err: this.err, errT: this.errT, mode: this.mode, sat: this.sat }; }
  axis() { return qRot(this.q, Z_AXIS); }
  angleTo(cmd) { return vAngle(this.axis(), unit(cmd)); }
  copy() { const o = new Dyn6([0, 0, 1]); for (const k of ['q', 'w', 'g', 'gi', 'tq', 'tqTvc', 'tqRcs', 'duty', 'acc', 'ffs', 'cPrev']) o[k] = this[k] ? this[k].slice() : this[k]; o.err = this.err; o.errT = this.errT; o.mode = this.mode; o.tPrev = this.tPrev; return o; }
  // ekran zamanına geri sarma ya da dış durum atama (yalnız yönelim; kırpma integratörü korunur)
  set(q, w = null) { this.q = q.slice(); if (w) this.w = w.slice(); this.cPrev = null; this.errT = 0; }
  // kinematik olay (temas): ekseni (yuvarlanmayı koruyarak) cmd'ye getir ve dur
  snapTo(cmd) {
    const a = this.axis(), c = unit(cmd), th = vAngle(a, c);
    if (th > 1e-12) this.q = qNormalize(qMul(qSwing(a, c, this.q, th), this.q));
    this.w = [0, 0, 0]; this.tq = [0, 0, 0]; this.tqRcs = [0, 0, 0]; this.tqTvc = [0, 0, 0]; this.duty = [0, 0, 0]; this.err = 0; this.errT = 0; this.mode = 'hold';
  }
  // komut hızı tahmini (önceki komuttan): ff (eylemsiz dönme vektörü, rad/s), rate (rad/s)
  trackRate(cmd, t) {
    let ff = [0, 0, 0], rate = 0;
    if (this.cPrev && t > this.tPrev + 1e-9) {
      const dt = t - this.tPrev, c = cross(this.cPrev, cmd), s = norm(c), ang = Math.atan2(s, dot(this.cPrev, cmd));
      rate = ang / dt;
      if (ang < 5 * D2R && s > 1e-15) ff = [c[0] * ang / (s * dt), c[1] * ang / (s * dt), c[2] * ang / (s * dt)];
    }
    return { ff, rate };
  }

  // ---------------------------------------------------------------- denetleyici (saf: durumu değiştirmez; kip ve tork isteklerini döner)
  // ctx: { cmd (birim, eylemsiz), t, T (itki kN), mp (massProps), rcsLeft (kg) }
  plan(ctx) {
    const { cmd, t, T, mp, rcsLeft } = ctx, sp = mp.sp, c = sp.ctl, I = mp.I;
    const qi = qConj(this.q), cb0 = qRot(qi, cmd);
    // hedef: itki VEKTÖRÜ (gövde ekseni değil) komuta baksın. Kırpma gimbali + itki sapması itkiyi gövde ekseninden dT kadar saptırır (kütle merkezinden geçen itki çizgisi):
    // komut itki çerçevesine (dT → z) alınır; böylece kütle merkezi ofseti ve sapma yakışta sistematik yön hatası bırakmaz.
    const dT = T > 0 || ctx.aim ? unit([this.gi[0] + sp.align[0], this.gi[1] + sp.align[1], 1]) : null;       // aim: yakış öncesi hizalama (ateşlemede sıçrama olmasın)
    const cb = dT ? toThrustFrame(dT, cb0) : cb0;
    const th = Math.atan2(Math.hypot(cb[0], cb[1]), cb[2]);
    const { ff, rate } = this.trackRate(cmd, t), ffb = qRot(qi, ff), wrel = norm([this.w[0] - ffb[0], this.w[1] - ffb[1], this.w[2] - ffb[2]]);
    const P = { cmd, cb, th, ff, ffb, rate, T, mp, sp, hold: false, free: false, t, rcsLeft, dT };
    this.err = th;
    if (T <= 0 && th <= CTL.HOLD_ENTER && rate <= CTL.HOLD_RATE && wrel <= CTL.HOLD_W) { P.hold = true; return P; }
    // yetkiler
    const rcs = sp.rcs, rcsOn = rcsLeft > 0, tvcOn = T > 0 && !!sp.tvc && mp.ell > CTL.ELL_MIN && (!ctx.Tmax || T >= CTL.TVC_MIN * ctx.Tmax);
    if (!rcsOn && !tvcOn) { P.free = true; return P; }                 // RCS yakıtı bitti, gimbal yok: denetim YOK; yönelim torksuz serbest döner (büyük adımlarla)
    const tauMax = rcsOn ? [0, 1, 2].map((i) => 2 * rcs.n[i] * rcs.F * 1000 * rcs.arm[i]) : [0, 0, 0];
    const Tl = tvcOn ? T * 1000 * mp.ell : 0;                       // gimbal teğeti başına tork (N·m)
    const tvcMax = tvcOn ? Tl * Math.tan(sp.tvc.max * D2R) : 0;
    const rf = tvcOn ? (ctx.fast ? CTL.RCS_SUPPORT_FAST : CTL.RCS_SUPPORT) : 1;                          // motor açıkken yunuslama/sapma yetkisi esas olarak gimbaldir
    const aX = Math.max((rf * tauMax[0] + CTL.TVC_DERATE * tvcMax) / I[0], 1e-6), aY = Math.max((rf * tauMax[1] + CTL.TVC_DERATE * tvcMax) / I[1], 1e-6);
    // hata ekseni (gövde x–y düzleminde), eksen boyunca eldeki açısal ivme, frenleme eğrili hız komutu
    const sxy = Math.hypot(cb[0], cb[1]), nb = sxy > 1e-9 ? [-cb[1] / sxy, cb[0] / sxy, 0] : [0, 1, 0];
    const al = 1 / Math.hypot(nb[0] / aX, nb[1] / aY), alB = c.brake * al, thL = c.thLin * D2R;
    const wLim = (ctx.fast ? c.wMax : Math.min(c.wMax, c.wCruise)) * D2R;      // iniş ve elle uçuşta çevik, seyir dönmelerinde yavaş (RCS yakıtı ∝ I·ω)
    const wc = Math.min(th <= thL ? Math.sqrt(alB / thL) * th : Math.sqrt(2 * alB * (th - 0.5 * thL)), wLim);
    const ffu = T > 0 && !ctx.fast ? qRot(qi, this.ffs) : [0, 0, 0];     // ileri besleme yalnız yakışta ve inişte değil (iniş güdümünün komut gürültüsünü büyütür)
    const wcmd = [nb[0] * wc + ffu[0], nb[1] * wc + ffu[1], 0];
    const e = [wcmd[0] - this.w[0], wcmd[1] - this.w[1], wcmd[2] - this.w[2]];
    const Iw = [I[0] * this.w[0], I[1] * this.w[1], I[2] * this.w[2]], gy = cross(this.w, Iw);
    const tauCmd = [I[0] * c.Kw * e[0] + gy[0], I[1] * c.Kw * e[1] + gy[1], I[2] * c.Kw * e[2] + gy[2]];
    // tahsis
    let tauRcs = tauCmd.slice(), gcmd = this.gi.slice(), sat = false;
    if (tvcOn) {
      let gx = -tauCmd[1] / Tl + this.gi[0], gyv = tauCmd[0] / Tl + this.gi[1];          // τ_x = Tl·g_y, τ_y = −Tl·g_x
      const gm = Math.tan(sp.tvc.max * D2R), gn = Math.hypot(gx, gyv);
      if (gn > gm) { const s = gm / gn; gx *= s; gyv *= s; sat = true; }
      gcmd = [gx, gyv];
      tauRcs[0] = tauCmd[0] - Tl * (gyv - this.gi[1]); tauRcs[1] = tauCmd[1] + Tl * (gx - this.gi[0]);
    }
    Object.assign(P, { tauMax, tauCmd, tauRcs, gcmd, sat, e, Tl, tvcOn, wcmd });
    return P;
  }

  // ---------------------------------------------------------------- bir adımın aktüatör + dönme integrasyonu (saf): durumu değiştirmez
  // ctx: { gg?: { rhat (eylemsiz birim), k3 } }. Döner: { q1, w1, g1, u (itki yönü, eylemsiz, birim | null), dm (RCS yakıtı, kg), tau, tauTvc, tauRcs, duty }
  integrate(P, h, ctx = {}) {
    const { mp, sp, T } = P, I = mp.I, rcs = sp.rcs, tvc = sp.tvc;
    // gimbal aktüatörü: birinci derece gecikme + hız sınırı + açı sınırı; itkisizken kırpma konumuna getirilir
    let g1 = this.g;
    if (tvc) {
      const tgt = T > 0 && P.gcmd ? P.gcmd : this.gi, a = 1 - Math.exp(-h / tvc.lag), rmax = tvc.rate * D2R * h;
      let dx = (tgt[0] - this.g[0]) * a, dy = (tgt[1] - this.g[1]) * a; const dn = Math.hypot(dx, dy);
      if (dn > rmax) { dx *= rmax / dn; dy *= rmax / dn; }
      g1 = [this.g[0] + dx, this.g[1] + dy];
      const gm = Math.tan(tvc.max * D2R), gn = Math.hypot(g1[0], g1[1]); if (gn > gm) { g1 = [g1[0] * gm / gn, g1[1] * gm / gn]; }
    }
    const gmid = [0.5 * (this.g[0] + g1[0]), 0.5 * (this.g[1] + g1[1])];
    // ana motor: gimbalde ve sapmalı itki yönü (gövde), kuvvet, kütle merkezine göre tork τ = r × F
    let tauT = [0, 0, 0], dB = null;
    if (T > 0) {
      const dx = gmid[0] + sp.align[0], dy = gmid[1] + sp.align[1], dn = Math.sqrt(1 + dx * dx + dy * dy);
      dB = [dx / dn, dy / dn, 1 / dn];
      tauT = cross([-sp.cgOff[0], -sp.cgOff[1], -mp.ell], [T * 1000 * dB[0], T * 1000 * dB[1], T * 1000 * dB[2]]);
    }
    // RCS: darbe sıklığı modülasyonu (PFM) — istenen darbe (τ·h) birikir, birikim en küçük darbeyi (τ_maks·tmin) aşınca (ya da gerektiği kadar) ateşlenir,
    // verilen darbe birikimden düşer: ortalama tork komutla aynı kalır, rölede olduğu gibi sınır çevrimi (titreme) ve boşa yakıt oluşmaz. Propellant: ṁ = |τ|/(kol·Isp·g₀)
    const tauR = [0, 0, 0], duty = [0, 0, 0], acc1 = [0, 0, 0]; let dm = 0;
    if (P.tauRcs) {
      const cEx = rcs.isp * G0;
      for (let i = 0; i < 3; i++) {
        const A = P.tauMax[i]; if (!(A > 0)) continue;
        const Jmin = A * rcs.tmin; let acc = this.acc[i] + P.tauRcs[i] * h, ton = 0;
        if (Math.abs(acc) >= Jmin) ton = Math.min(h, Math.abs(acc) / A);
        const J = Math.sign(acc) * A * ton; acc -= J;
        const lim = A * h + Jmin; acc1[i] = Math.max(-lim, Math.min(lim, acc));
        duty[i] = Math.sign(J) * ton / h; tauR[i] = J / h; dm += ton * A / (rcs.arm[i] * cEx);
      }
      if (P.rcsLeft != null && dm > P.rcsLeft) { const s = P.rcsLeft / dm; for (let i = 0; i < 3; i++) { tauR[i] *= s; duty[i] *= s; } dm = P.rcsLeft; }
    }
    // gravite gradyanı
    let tauG = [0, 0, 0];
    if (ctx.gg) tauG = ggTorque(qRot(qConj(this.q), ctx.gg.rhat), ctx.gg.k3, I);
    const tau = [tauT[0] + tauR[0] + tauG[0], tauT[1] + tauR[1] + tauG[1], tauT[2] + tauR[2] + tauG[2]];
    // dönme: iki yarım RK4 adımı (orta nokta itki ekseni için)
    const A = rk4Rot(this.q, this.w, I, tau, h / 2), B = rk4Rot(A.q, A.w, I, tau, h / 2);
    let u = null;
    if (T > 0) {
      const u0 = qRot(this.q, dB), um = qRot(A.q, dB), u1 = qRot(B.q, dB);
      u = unit([(u0[0] + 4 * um[0] + u1[0]) / 6, (u0[1] + 4 * um[1] + u1[1]) / 6, (u0[2] + 4 * um[2] + u1[2]) / 6]);
    }
    return { q1: B.q, w1: B.w, g1, u, dm, tau, tauTvc: tauT, tauRcs: tauR, duty, acc1 };
  }
  // kabul edilen adımı uygula: durum, kırpma integratörü, tork/tanılama; RCS yakıtı kademenin kuru kütlesinden düşer
  commit(R, P, st, h, t0) {
    this.q = R.q1; this.w = R.w1; this.g = R.g1;
    if (P.tvcOn && !P.sat) {                                         // kırpma integratörü (gimbal biriminde); doymada dondurulur (anti-windup)
      const c = P.sp.ctl, I = P.mp.I, lim = 0.8 * Math.tan(P.sp.tvc.max * D2R), k = c.Ki * h / P.Tl;
      this.gi = [Math.max(-lim, Math.min(lim, this.gi[0] - k * I[1] * P.e[1])), Math.max(-lim, Math.min(lim, this.gi[1] + k * I[0] * P.e[0]))];
    }
    this.tq = R.tau; this.tqTvc = R.tauTvc; this.tqRcs = R.tauRcs; this.duty = R.duty; this.acc = R.acc1; this.sat = !!P.sat; this.mode = P.free ? 'free' : 'dyn'; this.errT = P.th > CTL.ERR_WARN ? this.errT + h : 0;
    if (R.dm > 0) { st.dry = Math.max(0, st.dry - R.dm); st.rcsUsed = (st.rcsUsed || 0) + R.dm; }
    const dtf = h, af = 1 - Math.exp(-dtf / CTL.FF_TAU), big = P.rate > CTL.FF_JUMP;                // süzgeç: komut sıçraması (büyük hız) sıfırlar
    this.ffs = big ? [0, 0, 0] : [this.ffs[0] + af * (P.ff[0] - this.ffs[0]), this.ffs[1] + af * (P.ff[1] - this.ffs[1]), this.ffs[2] + af * (P.ff[2] - this.ffs[2])];
    this.cPrev = P.cmd; this.tPrev = t0;
  }
  // yarı-durağan tutma: yönelim adım sonundaki komuta oturur (hata ≤ HOLD_ENTER + komut hareketi ise tam; değilse hız sınırlı), açısal hız KOMUTUN dönme hızıdır
  holdCommit(P, cmdEnd, h, t1) {
    const c0 = unit(P.cmd), c1 = unit(cmdEnd), a = P.dT ? qRot(this.q, P.dT) : this.axis(), th = vAngle(a, c1);          // a: hizalanan vektör (itki vektörü ya da gövde ekseni)
    if (th > 1e-12) {
      const phi = Math.min(th, CTL.HOLD_ENTER + CTL.HOLD_TRACK_MAX * h);
      this.q = qNormalize(qMul(qSwing(a, c1, this.q, phi), this.q));
    }
    const n = cross(c0, c1), s = norm(n), ang = Math.atan2(s, dot(c0, c1)), wi = s > 1e-15 ? [n[0] * ang / (s * h), n[1] * ang / (s * h), n[2] * ang / (s * h)] : [0, 0, 0];
    this.w = qRot(qConj(this.q), wi); this.g = this.gi.slice();
    this.tq = [0, 0, 0]; this.tqTvc = [0, 0, 0]; this.tqRcs = [0, 0, 0]; this.duty = [0, 0, 0]; this.acc = [0, 0, 0]; this.ffs = wi.slice(); this.sat = false; this.mode = 'hold';
    this.err = vAngle(P.dT ? qRot(this.q, P.dT) : this.axis(), c1); this.errT = 0;
    this.cPrev = c1; this.tPrev = t1;
  }
}
export { stageSpec, massProps };
