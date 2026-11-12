// Çarpma / yeniden giriş modeli: büyüklük sıraları, tutarlılık, eksantrik yörünge, biçimlendirme, Sentry ayrıştırma
import { assessSat, atmosphereDensity, fmtReentry, fmtSpan, sentryRows, fmtOdds, launchYear, ageYears, controlNote, analyzeHistory, expectedDecayKmDay, controlFromHistory, confidence, parseEpoch, histRow, calibHist, selectSats, CONF_TR, KLASS_TR } from '../js/impact.js';
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const MU = 398600.4418, RE = 6378.135;
// verilen perije/apoje yüksekliğinden (km) GP kaydı üret
const rec = (hp, ha, bstar, extra = {}) => { const a = (hp + ha) / 2 + RE, e = ((ha + RE) - (hp + RE)) / (2 * a), n = Math.sqrt(MU / a ** 3) * 86400 / (2 * Math.PI);
  return { OBJECT_NAME: 'TEST', EPOCH: '2026-10-01T00:00:00', MEAN_MOTION: n, ECCENTRICITY: e, BSTAR: bstar, MEAN_MOTION_DOT: 0, ...extra }; };
const years = (hp, ha, b) => assessSat(rec(hp, ha, b), Date.parse('2026-10-01T00:00:00Z'), false).lifeDays / 365.25;

// atmosfer: yükseklikle monoton azalır, bilinen değerlere yakın (Vallado)
ok(Math.abs(atmosphereDensity(400) / 3.725e-12 - 1) < 0.01 && atmosphereDensity(200) > atmosphereDensity(300) && atmosphereDensity(300) > atmosphereDensity(500), 'atmosfer yoğunluğu: 400 km = 3,7e-12, monoton');
// ISS benzeri: 420 km dairesel, B* 2e-4 -> yılda ~15–45 km alçalma (gerçek ISS ~ ayda 1–2 km)
{ const r = assessSat(rec(420, 420, 2e-4), Date.parse('2026-10-01T00:00:00Z'), true), c = r.curve.find((p) => p[0] >= 330);
  ok(c && 420 - c[1] > 10 && 420 - c[1] < 60, `420 km, B*=2e-4: ilk yılda ${c ? (420 - c[1]).toFixed(0) : '?'} km alçalma (10–60 km beklenir)`); }
// büyüklük sıraları
ok(years(400, 400, 1e-4) > 1.5 && years(400, 400, 1e-4) < 12, `400 km, B*=1e-4: ömür ${years(400, 400, 1e-4).toFixed(1)} yıl (2–12)`);
ok(years(300, 300, 1e-4) < 1, `300 km, B*=1e-4: ömür ${years(300, 300, 1e-4).toFixed(2)} yıl (< 1)`);
ok(years(200, 200, 1e-4) * 365.25 < 20, `200 km, B*=1e-4: ömür ${(years(200, 200, 1e-4) * 365.25).toFixed(1)} gün (< 20)`);
// monotonluk
ok(years(300, 300, 1e-4) < years(400, 400, 1e-4) && years(400, 400, 1e-4) < years(500, 500, 1e-4) && years(500, 500, 1e-4) < years(600, 600, 1e-4), 'yükseklik arttıkça ömür artar (300<400<500<600 km)');
ok(years(500, 500, 4e-4) < years(500, 500, 2e-4) && years(500, 500, 2e-4) < years(500, 500, 1e-4), 'B* arttıkça ömür kısalır');
// eksantrik yörünge: aynı perijeli dairesel yörüngeden daha kısa (apoje de sürüklenir) değil, perije aynıyken ömür ≥ dairesel/… ; perije düştükçe ömür kısalır
ok(years(300, 2000, 1e-4) < years(500, 2000, 1e-4), 'eksantrik: perije düştükçe ömür kısalır');
ok(years(250, 1500, 1e-4) > 0 && Number.isFinite(years(250, 1500, 1e-4)), `eksantrik (250×1500 km) sonlu ömür: ${years(250, 1500, 1e-4).toFixed(2)} yıl`);
// uç durumlar
ok(assessSat(rec(100, 100, 1e-4)).durum === 'reentry', 'perije < 120 km: yeniden giriş aşamasında');
ok(assessSat(rec(1600, 1600, 1e-4)).durum === 'high', 'perije > 1400 km: bozunma ihmal edilebilir');
ok(assessSat(rec(500, 500, -1e-4)).durum === 'nodrag', 'B* ≤ 0 ve ndot yok: belirsiz');
{ // B* yok, yalnız ndot: yine sonlu tahmin
  const r = assessSat(rec(400, 400, 0, { MEAN_MOTION_DOT: 1e-4 }), Date.parse('2026-10-01T00:00:00Z'), false); ok(r.method === 'ndot' && Number.isFinite(r.lifeDays) && r.lifeDays > 0, `yalnız ndot ile tahmin: ${(r.lifeDays / 365.25).toFixed(1)} yıl`); }
ok(assessSat({ MEAN_MOTION: 0 }).durum === 'nodata', 'geçersiz kayıt: veri yok');
// B* ile ndot uyumu: B*'tan türetilen bozunma = ndot -> oran ~1 (birim tutarlılığı)
{ const base = rec(450, 450, 1.5e-4), a = Math.cbrt(MU / (base.MEAN_MOTION * 2 * Math.PI / 86400) ** 2);
  // B*'a karşılık gelen ndot'u model içinden çıkar: ilk adım da/dt
  const r = assessSat(base, Date.parse('2026-10-01T00:00:00Z'), true), c = r.curve.find((p) => p[0] > 20), dadt = (450 - c[1]) / c[0];                // km/gün
  const n = Math.sqrt(MU / a ** 3), dn = (3 * n / (2 * a)) * dadt / 86400, ndot = (dn * 86400 ** 2 / (2 * Math.PI)) / 2;                       // tur/gün²
  const r2 = assessSat({ ...base, BSTAR: 1.5e-4, MEAN_MOTION_DOT: ndot }, Date.parse('2026-10-01T00:00:00Z'), false);
  ok(r2.ratio > 0.7 && r2.ratio < 1.4, `B* ↔ MEAN_MOTION_DOT birim tutarlılığı: oran ${r2.ratio && r2.ratio.toFixed(2)} (≈1)`); }
// biçimlendirme
ok(fmtSpan(0.5) === '12 saat' && fmtSpan(45) === '45 gün' && /ay$/.test(fmtSpan(200)) && /yıl$/.test(fmtSpan(1500)), 'süre biçimi');
ok(/yeniden giriş/.test(fmtReentry({ durum: 'reentry' })) && /yüksek yörünge/.test(fmtReentry({ durum: 'high' })) && /\(.*sonra\)/.test(fmtReentry({ durum: 'decaying', reentryMs: Date.now() + 400 * 864e5, conf: 'mid' })), 'yeniden giriş metinleri');
// Sentry
{ const m = new Map([['2011 TO', { ip: 2.937e-6, ps: -6.15, ts: '0', range: '2064-2064', n: 1, D: 0.018, vinf: 8.55 }], ['A', { ip: 0.01, ps: -1, ts: '1', range: '2030-2040', n: 3, D: 0.2, vinf: 10 }]]);
  const r = sentryRows(m, 2026); ok(r[0].y0 === 2064 && r[0].inYears === 38 && r[1].y1 === 2040 && r[1].odds === 100, 'Sentry satırları: yıl aralığı, kalan yıl, 1/N');
  ok(fmtOdds(0.01) === '1 / 100' && fmtOdds(0) === '—', 'olasılık metni'); }
// kontrol durumu: yaş ≥ görev ömrü (≈5) + 5 yıl
ok(launchYear({ OBJECT_ID: '1998-067A' }) === 1998 && launchYear({ OBJECT_ID: '1998-067XY' }) === null, 'ISS (1998-067A) yılı var, ISS\'ten bırakılan nesneler (1998-067xx) bilinmiyor');
ok(launchYear({ OBJECT_ID: '1990-037B' }) === 1990 && launchYear({ OBJECT_ID: '' }) === null && launchYear({ OBJECT_ID: '1900-001A' }) === null, 'COSPAR kimliğinden fırlatma yılı');
{ const now = Date.UTC(2026, 9, 2); const a = ageYears({ OBJECT_ID: '1990-037B' }, now); ok(a > 36 && a < 37, `yaş hesabı: ${a.toFixed(1)} yıl`);
  ok(/yaşlı.*kontrolsüz/.test(controlNote(36)) && /orta yaşlı/.test(controlNote(7)) && /genç.*manevra/.test(controlNote(2)) && /kontrollü \(istasyon\)/.test(controlNote(28, true)) && /bilinmiyor/.test(controlNote(null)), 'kontrol durumu metinleri (≥10 yıl kontrolsüz aday, <5 genç, istasyon kontrollü)');
  ok(assessSat({ ...rec(400, 400, 1e-4), OBJECT_ID: '2020-001A' }, now, false).age > 6 && assessSat({ ...rec(400, 400, 1e-4), OBJECT_ID: '2020-001A' }, now, false).age < 7, 'assessSat çıktısında yaş'); }
// geçmiş yörünge analizi: sentetik a(t) serileri
{ const D = 864e5, t0 = Date.UTC(2025, 7, 1), mk = (days, f) => days.map((d) => ({ t: t0 + d * D, a: f(d) }));
  const days = Array.from({ length: 61 }, (_, k) => k * 7);                                                // 420 gün, 7 günde bir
  // 1) manevrasız, düzenli alçalma: -0.05 km/gün
  const free = analyzeHistory(mk(days, (d) => 6800 - 0.05 * d));
  ok(free.boostCount === 0 && Math.abs(free.slopeKmDay + 0.05) < 1e-6 && free.spanDays === 420, `manevrasız seri: eğim ${free.slopeKmDay.toFixed(4)} km/gün, manevra ${free.boostCount}`);
  // 2) her ~60 günde +3 km yükseltme: manevralar bulunur, eğim yalnız son dilimden
  const reb = analyzeHistory(mk(days, (d) => 6800 - 0.05 * (d % 63) + 3 * Math.floor(d / 63)));
  ok(reb.boostCount >= 5 && Math.abs(reb.slopeKmDay + 0.05) < 0.01 && reb.segDays < 70, `yükseltmeli seri: ${reb.boostCount} manevra, son dilim eğimi ${reb.slopeKmDay.toFixed(3)} km/gün`);
  // 3) tek aykırı değer eğimi bozmaz (Theil–Sen)
  const out = analyzeHistory(mk(days, (d) => 6800 - 0.05 * d + (d === 210 ? -0.3 : 0)));
  ok(Math.abs(out.slopeKmDay + 0.05) < 0.003, `aykırı değere dayanıklı eğim: ${out.slopeKmDay.toFixed(4)}`);
  ok(analyzeHistory(mk([0, 7], (d) => 6800 - d)).durum === 'short', 'iki örnekle analiz yok');
  // sınıflandırma: B*'tan beklenen bozunma ile gözlenen uyumlu -> serbest; sürekli itki (gözlenen ≪ beklenen) -> korunuyor
  const a = RE + 420, exp = expectedDecayKmDay(a, 0.0005, 2e-4); ok(exp > 0.01 && exp < 0.5, `B*=2e-4, 420 km: beklenen bozunma ${exp.toFixed(3)} km/gün`);
  const base = { spanDays: 400, boostCount: 0, lastBoostMs: 0, rms: 0.4, expKmDay: exp, segDays: 400 }, now = Date.now();
  ok(controlFromHistory({ ...base, slopeKmDay: -exp * 1.3 }, now).klass === 'free', 'gözlenen ≈ beklenen, manevra yok -> serbest');
  ok(controlFromHistory({ ...base, slopeKmDay: -exp * 0.05 }, now).klass === 'kept', 'gözlenen ≪ beklenen -> korunuyor (sürekli itki)');
  ok(controlFromHistory({ ...base, slopeKmDay: -exp, boostCount: 3, lastBoostMs: now - 30 * D }, now).klass === 'kept', 'son 30 günde yükseltme -> korunuyor');
  ok(controlFromHistory({ ...base, slopeKmDay: -exp, boostCount: 2, lastBoostMs: now - 300 * D }, now).klass === 'free', '300 gün önceki yükseltme: şimdi serbest');
  ok(controlFromHistory({ ...base, slopeKmDay: -exp, rms: 20 }, now).klass === 'unknown' && controlFromHistory({ ...base, slopeKmDay: -exp * 40 }, now).klass === 'unknown', 'düzensiz a(t) ya da aşırı hızlı alçalma -> belirsiz');
  ok(controlFromHistory({ ...base, spanDays: 60, slopeKmDay: -exp }, now).klass === 'unknown' && controlFromHistory(null).klass === 'unknown', 'kısa/yok geçmiş -> belirsiz');
  // gözlenen eğimden kalibre edilen tahmin: B* yanlışsa (10× fazla) geçmiş eğimi düzeltir
  const o = rec(420, 420, 2e-3), nowMs = Date.parse('2026-10-01T00:00:00Z'), truth = assessSat(rec(420, 420, 2e-4), nowMs, false), wrong = assessSat(o, nowMs, false);
  const cal = assessSat(o, nowMs, false, { slopeKmDay: -expectedDecayKmDay(RE + 420, 0, 2e-4), segDays: 300, spanDays: 400 });
  ok(cal.method === 'hist' && Math.abs(cal.lifeDays / truth.lifeDays - 1) < 0.15 && wrong.lifeDays < truth.lifeDays / 4, `geçmiş eğimiyle kalibrasyon: ömür ${(cal.lifeDays / 365.25).toFixed(1)} yıl (doğru ${(truth.lifeDays / 365.25).toFixed(1)}, yanlış B* ${(wrong.lifeDays / 365.25).toFixed(1)})`);
}

// ================================================================ bağımsız referanslar
// Modelin fiziği (B* genliği, Vallado profili) burada ayrıca yazılır; yörünge ortalaması yerine ya hareket denklemleri doğrudan tümlenir ya da
// ortalama çok ince (4000 nokta) alınır. Böylece toplama, de/dt türetmesi ve adım denetimi modelin kendisinden bağımsız sınanır.
const NOW = Date.parse('2026-10-01T00:00:00Z');
const kr0B = (bstar, hp) => { const sAlt = hp >= 156 ? 78 : hp >= 98 ? hp - 78 : 20, q0 = 1 + 120 / RE, s = 1 + sAlt / RE, r = (RE + hp) / RE; return 2 * bstar * ((q0 - s) / (r - s)) ** 4 / RE; };
const elems = (hp, ha) => { const a = (hp + ha) / 2 + RE; return [a, (ha - hp) / (2 * a)]; };
// yörünge ortalamalı türevler, N noktalı (referans: N büyük)
function avgDer(a, e, kr0, rho0, N) {
  let sV3 = 0, sV = 0;
  for (let k = 0; k < N; k++) { const cE = Math.cos(2 * Math.PI * (k + 0.5) / N), r = a * (1 - e * cE), v = Math.sqrt(MU * (2 / r - 1 / a)), kr = kr0 * atmosphereDensity(r - RE) / rho0, w = (1 - e * cE) / N; sV3 += w * kr * v ** 3; sV += w * kr * v; }
  const dadt = -(a * a / MU) * sV3; return [dadt, e < 1e-6 ? 0 : ((1 - e * e) / e) * (0.5 * sV + 0.5 * dadt / a)];
}
{ // 1) Kartezyen tümleme (iki cisim + sürüklenme ivmesi −½Kρ|v|v, RK4 10 s): 300 × 2000 km, 3 günde a ve e değişimi ↔ modelin eğrisi
  const hp = 300, ha = 2000, B = 0.05, [a0, e0] = elems(hp, ha), kr0 = kr0B(B, hp), rho0 = atmosphereDensity(hp);
  const acc = (s) => { const r = Math.hypot(s[0], s[1]), v = Math.hypot(s[2], s[3]), k = 0.5 * kr0 * atmosphereDensity(r - RE) / rho0 * v, g = -MU / r ** 3; return [s[2], s[3], g * s[0] - k * s[2], g * s[1] - k * s[3]]; };
  const add = (s, d, h) => s.map((x, i) => x + d[i] * h);
  let s = [a0 * (1 - e0), 0, 0, Math.sqrt(MU * (1 + e0) / (a0 * (1 - e0)))], t = 0; const T = 3 * 86400, h = 10;
  while (t < T) { const k1 = acc(s), k2 = acc(add(s, k1, h / 2)), k3 = acc(add(s, k2, h / 2)), k4 = acc(add(s, k3, h)); s = s.map((x, i) => x + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])); t += h; }
  const r = Math.hypot(s[0], s[1]), v2 = s[2] ** 2 + s[3] ** 2, a1 = 1 / (2 / r - v2 / MU), hh = s[0] * s[3] - s[1] * s[2], e1 = Math.sqrt(Math.max(0, 1 - hh * hh / (MU * a1)));
  const m = assessSat(rec(hp, ha, B), NOW, true), C = m.curve, k = C.findIndex((p) => p[0] >= 3), [t0, p0, q0] = C[k - 1], [t1, p1, q1] = C[k], f = (3 - t0) / (t1 - t0);
  const hpM = p0 + (p1 - p0) * f, haM = q0 + (q1 - q0) * f, aM = (hpM + haM) / 2 + RE, eM = (haM - hpM) / (2 * aM);
  const da = a0 - a1, daM = a0 - aM, de = e0 - e1, deM = e0 - eM;
  ok(da > 20 && Math.abs(daM / da - 1) < 0.03 && Math.abs(deM / de - 1) < 0.03, `Kartezyen tümleme ↔ model (300×2000 km, 3 gün): Δa ${da.toFixed(2)} ↔ ${daM.toFixed(2)} km, Δe ${de.toExponential(3)} ↔ ${deM.toExponential(3)}`);
}
{ // 2) toplama yakınsaması: modelin da/dt'si (expectedDecayKmDay) ↔ 20.000 noktalı ortalama; GTO ve Molniya dahil (eski sabit 24 nokta GTO'da 0,20 veriyordu)
  let worst = 0; const rows = [];
  for (const [hp, ha] of [[400, 420], [300, 2000], [250, 6000], [250, 20000], [250, 35786], [200, 35786], [500, 39800], [130, 35786]]) {
    const [a, e] = elems(hp, ha), ref = -avgDer(a, e, kr0B(1e-4, hp), atmosphereDensity(hp), 20000)[0] * 86400, got = expectedDecayKmDay(a, e, 1e-4);
    worst = Math.max(worst, Math.abs(got / ref - 1)); rows.push(`${hp}×${ha}: ${(got / ref).toFixed(4)}`);
  }
  ok(worst < 0.01, `eksantrik toplama yakınsak (model / 20.000 noktalı referans): ${rows.join(', ')}`);
}
{ // 3) ömür: ince adımlı (orta nokta; adım başına perije ≤ 0,15 km, a ≤ (ae + 50 km)'nin %0,2'si) ve 4000 noktalı referans tümleme ↔ model
  const refLife = (hp, ha, b) => { let [a, e] = elems(hp, ha), t = 0; const kr0 = kr0B(b, hp), rho0 = atmosphereDensity(hp);
    while (a * (1 - e) - RE > 120) { const [d1, g1] = avgDer(a, e, kr0, rho0, 4000), dt = Math.min(0.15 / Math.max(-(d1 * (1 - e) - a * g1), 1e-18), 0.002 * (a * e + 50) / -d1), [d2, g2] = avgDer(a + d1 * dt / 2, Math.max(0, e + g1 * dt / 2), kr0, rho0, 4000); a += d2 * dt; e = Math.max(0, e + g2 * dt); t += dt; }
    return t / 86400; };
  for (const [hp, ha, b] of [[400, 400, 1e-4], [250, 1500, 1e-4], [300, 2000, 1e-3], [200, 35786, 1e-3]]) {
    const L = refLife(hp, ha, b), M = assessSat(rec(hp, ha, b), NOW, false).lifeDays;
    ok(Math.abs(M / L - 1) < 0.04, `ömür ↔ ince referans (${hp}×${ha} km, B*=${b}): ${M.toFixed(1)} ↔ ${L.toFixed(1)} gün`);
  }
}
{ // 4) MEAN_MOTION_DOT eksantrik yörüngede: B*'ın verdiği bozunmadan üretilen ṅ aynı genliği geri vermeli (eski dairesel formül 8–11× şaşıyordu)
  for (const [hp, ha] of [[400, 400], [300, 2000], [250, 6000]]) {
    const [a, e] = elems(hp, ha), dadt = avgDer(a, e, kr0B(1e-4, hp), atmosphereDensity(hp), 20000)[0], n = Math.sqrt(MU / a ** 3), ndot = (-(3 * n / (2 * a)) * dadt) * 86400 ** 2 / (2 * Math.PI) / 2;
    const both = assessSat(rec(hp, ha, 1e-4, { MEAN_MOTION_DOT: ndot }), NOW, false), only = assessSat(rec(hp, ha, 0, { MEAN_MOTION_DOT: ndot }), NOW, false);
    ok(Math.abs(both.ratio - 1) < 0.01 && only.method === 'ndot' && Math.abs(only.lifeDays / both.lifeDays - 1) < 0.01, `ṅ ↔ B* (${hp}×${ha} km): oran ${both.ratio.toFixed(3)}, yalnız ṅ ömrü ${only.lifeDays.toFixed(0)} ↔ ${both.lifeDays.toFixed(0)} gün`);
  }
}
// ================================================================ güven, derin uzay, çağ
ok(confidence({ ratio: 1, lifeDays: 30 }) === 'high' && confidence({ ratio: 1, lifeDays: 400 }) === 'mid' && confidence({ ratio: 1, lifeDays: 30 * 365.25 }) === 'low', 'güven: iki kaynak uyumlu -> < 60 gün yüksek, < 25 yıl orta, sonrası düşük');
ok(confidence({ ratio: 1.2, lifeDays: 300, histOk: true }) === 'high' && confidence({ ratio: 1.2, lifeDays: 5 * 365.25, histOk: true }) === 'mid' && confidence({ ratio: 2.5, lifeDays: 300, histOk: true }) === 'mid', 'güven: geçmiş eğimi uyumlu -> yalnız < 1 yıl yüksek (15 yıllık tahmin artık yüksek değil)');
ok(confidence({ ratio: 5, lifeDays: 10 }) === 'low' && confidence({ ratio: null, lifeDays: 10 }) === 'mid' && confidence({ ratio: null, lifeDays: 100 }) === 'low' && confidence({ ratio: 1, lifeDays: 10, deep: true }) === 'low', 'güven: uyumsuz / tek kaynak / derin uzay -> düşük');
{ const gto = assessSat(rec(200, 35786, 1e-3), NOW, false), leo = assessSat(rec(300, 2000, 1e-4), NOW, false), geo = assessSat(rec(35786, 35786, 1e-4), NOW, false);
  ok(gto.deep && gto.conf === 'low' && !leo.deep && geo.durum === 'high', 'periyot ≥ 225 dk ve alçak perije (GTO): derin uzay işareti, güven düşük; 300×2000 km işaretsiz');
  ok(/Ay–Güneş/.test(fmtReentry(gto, NOW)) && !/Ay–Güneş/.test(fmtReentry(leo, NOW)) && /Ay–Güneş/.test(fmtReentry({ ...gto, capped: true }, NOW)), 'derin uzay yörüngesinde metin Ay–Güneş çekimini söyler'); }
ok(parseEpoch('2026-10-01T00:00:00') === NOW && parseEpoch('2026-10-01T00:00:00Z') === NOW && parseEpoch('2026-10-01T03:00:00+03:00') === NOW && Number.isNaN(parseEpoch('')) && Number.isNaN(parseEpoch('bozuk')), 'çağ: saat dilimsiz UTC, Z ve ±ss:dd okunur; boş/bozuk NaN');
ok(assessSat({ ...rec(400, 400, 1e-4), EPOCH: '2026-10-01T00:00:00Z' }, NOW + 5e9, false).epochMs === NOW && assessSat({ ...rec(400, 400, 1e-4), EPOCH: '' }, NOW, false).epochMs === NOW, 'assessSat: Z\'li çağ sessizce "şimdi"ye düşmez; çağ yoksa şimdi');
ok(Object.keys(CONF_TR).join() === 'high,mid,low' && Object.keys(KLASS_TR).join() === 'kept,free,unknown' && /güven: orta/.test(fmtReentry({ durum: 'decaying', reentryMs: NOW + 400 * 864e5, conf: 'mid' }, NOW)), 'durum kodları dilden bağımsız, ekranda Türkçe adları');
ok(sentryRows(new Map([['X', { ip: 1e-5, ps: -4, ts: null, range: '2150-2190' }], ['Y', { ip: 1e-5, ps: -4, ts: 0, range: '2050-2060' }]]), 2026).map((r) => r.ts).join('|') === '|0', 'Sentry: Torino boşsa (100 yıldan uzak) 0 değil boş kalır');
// ================================================================ geçmiş satırı ve liste süzgeci (arayüzün saf kısmı)
{ const D = 864e5, exp = expectedDecayKmDay(RE + 420, 0, 2e-4), row = (slope, boostDay = 0, n = 0) => [60, 400, n, boostDay, slope, 0.4, RE + 420, Math.round(NOW / D), exp, 400];
  const hFree = histRow(row(-exp), NOW), hKept = histRow(row(-exp * 0.05), NOW), hBoost = histRow(row(-exp, Math.round(NOW / D) - 20, 2), NOW);
  ok(hFree.ctl.klass === 'free' && hKept.ctl.klass === 'kept' && hBoost.ctl.klass === 'kept' && hFree.segDays === 400 && calibHist(hFree) === hFree && calibHist(hKept) === null && calibHist(null) === null, 'gecmis.json satırı -> özet + sınıf; kalibrasyonda yalnız serbest bozunanlar');
  const mkSat = (id, name, cospar, hp, b, h = null) => { const o = { ...rec(hp, hp, b), OBJECT_NAME: name, OBJECT_ID: cospar, NORAD_CAT_ID: id }; return { o, id, h, r: assessSat(o, NOW, false, calibHist(h)) }; };
  const res = [mkSat(1, 'ESKI ENKAZ', '2005-001A', 300, 1e-4, hFree), mkSat(2, 'GENC UYDU', '2024-010B', 300, 1e-4), mkSat(3, 'KORUNAN', '2001-002A', 350, 1e-4, hKept), mkSat(4, 'ISTASYON', '1998-067A', 420, 2e-4),
    mkSat(5, 'YUKSEK', '1990-001A', 1600, 1e-4), mkSat(6, 'UZUN OMUR', '1995-003C', 550, 1e-4), mkSat(7, 'SURESI DOLMUS', '2000-004A', 150, 1e-3)];
  const groupOf = (id) => (id === 4 ? 0 : 3), now = NOW + 30 * D, ids = (o) => selectSats(res, { now, groupOf, ...o }).sel.map((x) => x.id).join();
  const all = selectSats(res, { now, groupOf, ctl: 0 });
  ok(all.stale === 1 && all.nHigh === 1 && all.alive.length === 5 && all.sel.every((x, k, A) => !k || A[k - 1].r.reentryMs <= x.r.reentryMs), `süzgeç (tümü): ${all.alive.length} bozunan, ${all.stale} süresi dolmuş, ${all.nHigh} çok yüksek; yeniden giriş sırasına dizili`);
  const d10 = selectSats(res, { now, groupOf, ctl: 10 });
  ok(ids({ ctl: 10 }) === '1,6' && d10.nKept === 1, 'süzgeç (≥ 10 yıl): genç uydu, istasyon ve yörüngesini koruyan elenir (elenen korunan sayılır)');
  ok(ids({ ctl: 'hist' }) === '1' && ids({ ctl: 0, q: 'genc' }) === '2' && ids({ ctl: 0, q: '6' }) === '6' && ids({ ctl: 0, group: 0 }) === '4' && ids({ ctl: 0, horizonDays: 365.25 }) === '2' && ids({ ctl: 0, horizonDays: 2 * 365.25 }) === '2,3,1', 'süzgeç: geçmişe göre serbest, ad / NORAD araması, grup, ufuk');
  ok(all.n1 === 1 && all.n5 === 4 && selectSats([], {}).sel.length === 0, 'süzgeç: 1 ve 5 yıl sayıları; boş katalog');
}
if (fail) process.exit(1);
