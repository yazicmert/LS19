// Ay'a iniş tasarım tezgâhı (landbench.js) doğrulaması:
//  • enerji korunumu (itkisiz serbest düşüşte yüzey hızı = enerji alt sınırı), roket denklemi ↔ ∫T/m dt
//  • Apollo 11 LM (PDI 15 km, 1.695 m/s, ~480 km, DPS 45 kN, Isp 311 s): ZEM/ZEV ve yakıt-optimal güdümle temas ölçütü içinde iniş; uçuş süresi, yakıt ve Δv
//    gerçek görevle aynı büyüklükte (Apollo 11: PDI → temas 756 s, iniş Δv ~2.000 m/s; otomatik güdümde yer değiştirme/elle uçuş yok, bu yüzden daha kısa)
//  • yakıt-optimal ≤ ZEM/ZEV ≤ irtifa tutmalı frenleme (yerçekimi kayıpları sırası); her başarılı inişte Δv ≥ enerji alt sınırı
import { initConic } from '../js/conic.js';
import * as B from '../js/landbench.js';
await initConic();

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const A = B.PRESETS.apollo11;

console.log('fizik tutarlılığı');
{
  const P = { ...A, T: 1e-6, thrMin: 0, vh0: 500, vv0: -20 }, r = B.simulate(P, () => [0, 0], { dt: 0.05 });       // yörünge altı hız: yüzeye düşer
  const speed = Math.hypot(r.vz, r.vh);
  check(r.landed && rel(speed, r.dvIdeal) < 1e-4, `itkisiz düşüş: yüzey hızı ${speed.toFixed(2)} m/s ↔ enerji korunumu √(v0² + 2μ(1/R − 1/r0)) = ${r.dvIdeal.toFixed(2)} m/s`);
  const g = B.MOON.MU / B.MOON.R ** 2;
  check(Math.abs(g - 1.624) < 0.002, `Ay yüzey çekimi ${g.toFixed(4)} m/s²`);
}
console.log('Apollo 11 LM');
const zem = B.runBench(A, 'zem'), opt = B.runBench(A, 'opt'), ret = B.runBench(A, 'retro');
{
  let dv = 0; for (let i = 1; i < zem.track.length; i++) { const [t0, , , , , thr, m] = zem.track[i - 1], [t1] = zem.track[i]; dv += thr * A.T / m * (t1 - t0); }
  check(rel(dv, zem.dvUsed) < 0.01, `roket denklemi Isp g0 ln(m0/mf) = ${zem.dvUsed.toFixed(0)} m/s ↔ ∫T/m dt ${dv.toFixed(0)} m/s`);
  check(rel(zem.tw0, 45040 / (15100 * B.MOON.MU / (B.MOON.R + 15000) ** 2)) < 1e-9 && zem.tw0 > 1.8 && zem.tw0 < 1.95, `PDI'da itki/ağırlık ${zem.tw0.toFixed(2)} (Ay çekimine göre)`);
  for (const [n, r] of [['ZEM/ZEV', zem], ['yakıt-optimal', opt]]) {
    check(r.ok && Math.abs(r.vz) <= B.TOUCH.vz && Math.abs(r.vh) <= B.TOUCH.vh && Math.abs(r.missM) < 50, `${n}: temas dikey ${r.vz.toFixed(2)} m/s, yatay ${r.vh.toFixed(2)} m/s, hedeften ${Math.abs(r.missM).toFixed(1)} m`);
    check(r.t > 450 && r.t < 800 && r.propUsed > 6000 && r.propUsed < 8200 && r.dvUsed > 1800 && r.dvUsed < 2150,
      `${n}: ${r.t.toFixed(0)} s, ${r.propUsed.toFixed(0)} kg yakıt, Δv ${r.dvUsed.toFixed(0)} m/s (alt sınır ${r.dvIdeal.toFixed(0)}, kayıp ${r.dvLoss.toFixed(0)} m/s), kalan ${r.hoverS.toFixed(0)} s askı`);
    check(r.dvUsed >= r.dvIdeal && r.hoverS > 0, `${n}: Δv ≥ enerji alt sınırı, askı payı pozitif`);
  }
  check(opt.propUsed <= zem.propUsed + 1, `yakıt-optimal ${opt.propUsed.toFixed(0)} kg ≤ ZEM/ZEV ${zem.propUsed.toFixed(0)} kg`);
  check(ret.dvLoss > zem.dvLoss && ret.dvLoss > opt.dvLoss, `irtifa tutmalı frenleme kaybı ${ret.dvLoss.toFixed(0)} m/s > ZEM ${zem.dvLoss.toFixed(0)} > optimal ${opt.dvLoss.toFixed(0)} (yerçekimi kaybı sıralaması)`);
}
console.log('küçük robotik iniş aracı (düşük itki/ağırlık)');
{
  const R = B.PRESETS.robotik, z = B.runBench(R, 'zem');
  check(z.ok && z.tw0 < 1.3 && z.dvLoss > zem.dvLoss, `T/W ${z.tw0.toFixed(2)}: iner (${z.t.toFixed(0)} s), yerçekimi kaybı Apollo'dan büyük (${z.dvLoss.toFixed(0)} > ${zem.dvLoss.toFixed(0)} m/s)`);
  const weak = B.runBench({ ...R, prop: 600 }, 'zem');
  check(!weak.ok && weak.dvCap < weak.dvIdeal, `yakıt 600 kg: Δv kapasitesi ${weak.dvCap.toFixed(0)} m/s < enerji alt sınırı ${weak.dvIdeal.toFixed(0)} m/s ⇒ hiçbir güdümle inilemez; benzetim de başarısız`);
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
