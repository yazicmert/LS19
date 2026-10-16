// Çarpma etkileri modeli (impacteffects.js) doğrulaması:
//  (1) iç tutarlılık: enerji, dayanım, parçalanma sonrası hızın sayısal tümlemesi ile kapalı biçimli Eq. 19–20'nin uyumu, enerji dengesi,
//      hava şoku/rüzgâr/sismik/ısı fonksiyonlarının tekdüzeliği ve bölge sınırlarında sürekliliği, eşik yarıçapı çözücüsü;
//  (2) gözlenmiş olaylar: Çelyabinsk 2013 (hava patlaması 29,7 km, ~0,4–0,5 Mt), Tunguska 1908 (5–15 km, 3–15 Mt), Meteor Krateri
//      (1,19 km basit krater), Chicxulub (~150–200 km karmaşık krater). Model büyüklük sırası doğruluğundadır; aralıklar buna göre geniştir.
import * as I from '../js/impacteffects.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const CASES = {
  celyabinsk: { L0: 19.8, rhoI: 3300, v0: 19160, thetaDeg: 18.3, target: 'sediman', rKm: 40 },
  tunguska: { L0: 60, rhoI: 2000, v0: 15000, thetaDeg: 35, target: 'sediman', rKm: 25 },
  meteor: { L0: 46, rhoI: 7800, v0: 12800, thetaDeg: 45, target: 'sediman', rKm: 10 },
  chicxulub: { L0: 10000, rhoI: 2680, v0: 20000, thetaDeg: 60, target: 'sediman', rKm: 1000 },
  okyanus: { L0: 300, rhoI: 3000, v0: 18000, thetaDeg: 45, target: 'su', depth: 4000, rKm: 500 },
  kucukdemir: { L0: 1, rhoI: 8000, v0: 15000, thetaDeg: 45, target: 'sediman', rKm: 1 },
};
const S = Object.fromEntries(Object.entries(CASES).map(([k, p]) => [k, I.scenario(p)]));

console.log('iç tutarlılık');
{
  const e = S.celyabinsk.entry, m = Math.PI / 6 * 3300 * 19.8 ** 3;
  check(rel(e.mass, m) < 1e-12 && rel(e.E0, 0.5 * m * 19160 ** 2) < 1e-12, `kütle ${m.toExponential(3)} kg, E0 = ½mv² = ${e.E0Mt.toFixed(3)} Mt`);
  check(rel(e.Yi, 10 ** (2.107 + 0.0624 * Math.sqrt(3300))) < 1e-12 && e.Yi > 3e5 && e.Yi < 1e6, `dayanım Yi(3300 kg/m³) = ${(e.Yi / 1e6).toFixed(2)} MPa (Eq. 10)`);
  check(rel(e.If, 4.0777 * 8000 * e.Yi / (3300 * 19.8 * 19160 ** 2 * Math.sin(18.3 * Math.PI / 180))) < 1e-3, 'If = 4,07 H Yi / (ρi L0 v0² sinθ) (Eq. 12)');
}
for (const [k, p] of Object.entries(CASES)) {
  const e = S[k].entry, cf = I.closedFormVelocity(p, e);
  if (!cf) continue;
  const v = e.regime === 'hava' ? e.vb : e.vI;
  check(rel(v, cf) < 3e-3, `${k}: parçalanma sonrası hız, sayısal tümleme ${(v / 1e3).toFixed(3)} km/s ↔ kapalı biçim (Eq. 19–20) ${(cf / 1e3).toFixed(3)} km/s`);
}
for (const k of ['meteor', 'chicxulub', 'okyanus', 'kucukdemir']) {
  const e = S[k].entry;
  check(rel(e.Eatm + e.Esurf, e.E0) < 1e-12 && e.Eblast <= e.E0 * (1 + 1e-12), `${k}: enerji dengesi E_atmosfer + E_yüzey = E0, E_şok ≤ E0`);
}
{
  const e = S.celyabinsk.entry;
  check(e.Eblast < e.E0 && e.vb > 0 && e.vb < 19160 && rel(e.Eblast, e.E0 - 0.5 * e.mass * e.vb ** 2) < 1e-12, 'hava patlaması: bırakılan enerji = E0 − ½ m v_b² < E0 (kalan kinetik enerji parçacık bulutunda)');
}
{
  const k = S.kucukdemir.entry;
  check(k.regime === 'butun' && k.If >= 1 && k.vI > 0 && k.vI < 15000, `1 m demir göktaşı: If = ${k.If.toFixed(2)} ≥ 1, parçalanmadan ${(k.vI / 1e3).toFixed(2)} km/s ile yere ulaşır`);
  const vt = Math.sqrt(4 * 8000 * 0.1 * 9.81 / (3 * 2)), e2 = I.atmosphericEntry({ L0: 0.1, rhoI: 8000, v0: 15000, thetaDeg: 45 });
  check(e2.regime === 'butun' && rel(e2.vI, vt) < 1e-9, `10 cm demir: uç hıza düşer (${e2.vI.toFixed(0)} m/s = √(4ρi L g / 3ρ0 Cd))`);
}
// hava şoku: tekdüzelik ve bölge sınırlarında süreklilik
{
  let mono = true, jump = 0;
  for (const [Ekt, zb] of [[1, 0], [235, 30800], [5290, 11400], [1e4, 3000], [5e6, 0], [500, 2000]]) {
    let prev = Infinity;
    for (let lr = 1; lr <= 7; lr += 0.01) { const p = I.overpressure(Ekt, zb, 10 ** lr); if (p > prev * (1 + 1e-9)) mono = false; prev = p; }
    if (zb > 0) {                                                                // Mach bölgesi kenarları (ölçekli d = rMach ± dS)
      const sf = Math.cbrt(Ekt), zs = zb / sf; if (zs < 550) {
        const rM = 550 * zs / (1.2 * (550 - zs)), dS = zs * zs * 0.00328;
        for (const d of [rM - dS, rM + dS]) { const a = I.overpressure(Ekt, zb, (d - 1e-6) * sf), b = I.overpressure(Ekt, zb, (d + 1e-6) * sf); jump = Math.max(jump, Math.abs(a - b) / b); }
      }
    }
  }
  check(mono, 'aşırı basınç uzaklıkla tekdüze azalır (yüzey ve hava patlaması, 6 durum, 10 m–10 000 km)');
  check(jump < 0.02, `Mach yansıma bölgesi kenarlarında süreklilik (en büyük sıçrama %${(100 * jump).toFixed(2)})`);
  check(rel(I.windSpeed(1e5), (5 / 7) * 330 / Math.sqrt(1 + 6 / 7)) < 1e-12 && rel(I.splDb(20), 20 * Math.log10(1e6)) < 1e-12, 'rüzgâr hızı Eq. 57 (p = P0 → 173 m/s), ses basınç düzeyi 20 µPa referanslı');
}
{
  const e = S.chicxulub.entry, cr = S.chicxulub.crater;
  const m59 = I.seismic(e, cr, 59999.9).Meff, m60 = I.seismic(e, cr, 60000.1).Meff, m699 = I.seismic(e, cr, 699999).Meff, m701 = I.seismic(e, cr, 700001).Meff;
  check(Math.abs(m59 - m60) < 0.05, `sismik etkin büyüklük 60 km'de sürekli (sıçrama ${(m59 - m60).toFixed(3)})`);
  check(Math.abs(m699 - m701) < 0.5, `700 km'de Båth yüzey dalgası bağıntısına geçiş (sıçrama ${(m699 - m701).toFixed(2)}, makaledeki gibi < 0,5)`);
  let mono = true, prev = Infinity; for (let r = 1e3; r < 2e7; r *= 1.05) { const t = I.thermal(e, cr, r); const v = t ? t.phi : 0; if (v > prev * (1 + 1e-9)) mono = false; prev = v; }
  const t0 = I.thermal(e, cr, 1000), tFar = I.thermal(e, cr, 1.5e7);
  check(mono && t0.visible > 0.99 && tFar.below, `ısı: uzaklıkla azalır, yakında ateş topu tam görünür (${t0.visible.toFixed(3)}), ufkun ötesinde görünmez`);
  const rr = I.radiusWhere((r) => I.overpressure(e.EblastKt, 0, r), 6900);
  check(rel(I.overpressure(e.EblastKt, 0, rr), 6900) < 1e-6, `eşik yarıçapı çözücüsü: p(${(rr / 1e3).toFixed(0)} km) = 6,9 kPa`);
}
{
  const ts = S.okyanus.tsunami, ts2 = I.tsunami(S.okyanus.crater, 1e6, 4000, 300);
  check(ts && ts.upper >= ts.lower && ts2.upper < ts.upper && ts.speed > 100 && ts.speed < 200, `tsunami: üst ≥ alt sınır, uzaklıkla azalır, dalga hızı ${ts.speed.toFixed(0)} m/s (4 km derinlik)`);
  check(S.okyanus.crater.water.vSea < 100 && S.okyanus.crater.water.Dwater > 5e3, '4 km su, 300 m cisim: deniz tabanına hız ~0, su "krateri" ~6,6 km');
}
check(I.recurrenceYears(1e6, 0.001) < I.recurrenceYears(1e9, 1) && I.recurrenceYears(1e9, 1) < I.recurrenceYears(1e15, 1e6), 'yineleme süresi kütleyle artar');

console.log('gözlenmiş olaylar');
{
  const e = S.celyabinsk.entry;
  check(e.regime === 'hava' && e.zb > 25e3 && e.zb < 35e3, `Çelyabinsk 2013: hava patlaması ${(e.zb / 1e3).toFixed(1)} km (gözlenen en parlak an 29,7 km; Popova vd. 2013)`);
  check(e.E0Mt > 0.4 && e.E0Mt < 0.7 && e.Eblast / I.MT > 0.15, `Çelyabinsk: kinetik enerji ${e.E0Mt.toFixed(2)} Mt (gözlenen ~0,44–0,5 Mt), atmosfere bırakılan ${(e.Eblast / I.MT).toFixed(2)} Mt`);
  const b = S.celyabinsk.blast;
  check(b.p > 690 && b.p < 6900, `Çelyabinsk kenti (~40 km): ${(b.p / 1e3).toFixed(2)} kPa → "camlar kırılabilir" bandında (gözlenen: yaygın cam hasarı)`);
  check(S.celyabinsk.recurrence > 20 && S.celyabinsk.recurrence < 300, `Çelyabinsk boyutunda olay ~${S.celyabinsk.recurrence.toFixed(0)} yılda bir`);
}
{
  const e = S.tunguska.entry;
  check(e.regime === 'hava' && e.zb > 5e3 && e.zb < 15e3 && e.Eblast / I.MT > 3 && e.Eblast / I.MT < 15, `Tunguska 1908: ${(e.zb / 1e3).toFixed(1)} km'de ${(e.Eblast / I.MT).toFixed(1)} Mt hava patlaması (tahminler 5–15 km, 3–15 Mt)`);
}
{
  const c = S.meteor.crater;
  check(c && !c.complex && c.Dfr > 1000 && c.Dfr < 1500, `Meteor Krateri: basit krater, çap ${(c.Dfr / 1e3).toFixed(2)} km (gözlenen 1,19 km)`);
  check(c.dfr / c.Dfr > 0.15 && c.dfr / c.Dfr < 0.25, `Meteor Krateri: derinlik/çap ${(c.dfr / c.Dfr).toFixed(2)} (basit kraterler ~0,2)`);
}
{
  const c = S.chicxulub.crater, s = S.chicxulub.seismic;
  check(c.complex && c.Dfr > 100e3 && c.Dfr < 220e3, `Chicxulub (10 km, 20 km/s, 60°): karmaşık krater ${(c.Dfr / 1e3).toFixed(0)} km (gözlenen ~150–200 km; cisim çapı tahmini 10–15 km)`);
  check(c.Vmelt > 1e3 && c.Vmelt < 1e5 && s.M > 9.5 && s.M < 10.5, `Chicxulub: ergime ${c.Vmelt.toFixed(0)} km³, sismik büyüklük ${s.M.toFixed(1)}`);
  check(S.chicxulub.recurrence > 3e7, `Chicxulub boyutunda olay ~${(S.chicxulub.recurrence / 1e6).toFixed(0)} milyon yılda bir`);
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
