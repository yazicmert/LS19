// Çarpma / yeniden giriş modeli: büyüklük sıraları, tutarlılık, eksantrik yörünge, biçimlendirme, Sentry ayrıştırma
import { assessSat, atmosphereDensity, fmtReentry, fmtSpan, sentryRows, fmtOdds, launchYear, ageYears, controlNote } from '../js/impact.js';
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
ok(assessSat(rec(100, 100, 1e-4)).durum === 'girdi', 'perije < 120 km: yeniden giriş aşamasında');
ok(assessSat(rec(1600, 1600, 1e-4)).durum === 'yüksek', 'perije > 1400 km: bozunma ihmal edilebilir');
ok(assessSat(rec(500, 500, -1e-4)).durum === 'sürüklenme yok', 'B* ≤ 0 ve ndot yok: belirsiz');
{ // B* yok, yalnız ndot: yine sonlu tahmin
  const r = assessSat(rec(400, 400, 0, { MEAN_MOTION_DOT: 1e-4 }), Date.parse('2026-10-01T00:00:00Z'), false); ok(r.method === 'ndot' && Number.isFinite(r.lifeDays) && r.lifeDays > 0, `yalnız ndot ile tahmin: ${(r.lifeDays / 365.25).toFixed(1)} yıl`); }
ok(assessSat({ MEAN_MOTION: 0 }).durum === 'veri yok', 'geçersiz kayıt: veri yok');
// B* ile ndot uyumu: B*'tan türetilen bozunma = ndot -> oran ~1 (birim tutarlılığı)
{ const base = rec(450, 450, 1.5e-4), a = Math.cbrt(MU / (base.MEAN_MOTION * 2 * Math.PI / 86400) ** 2);
  // B*'a karşılık gelen ndot'u model içinden çıkar: ilk adım da/dt
  const r = assessSat(base, Date.parse('2026-10-01T00:00:00Z'), true), c = r.curve.find((p) => p[0] > 20), dadt = (450 - c[1]) / c[0];                // km/gün
  const n = Math.sqrt(MU / a ** 3), dn = (3 * n / (2 * a)) * dadt / 86400, ndot = (dn * 86400 ** 2 / (2 * Math.PI)) / 2;                       // tur/gün²
  const r2 = assessSat({ ...base, BSTAR: 1.5e-4, MEAN_MOTION_DOT: ndot }, Date.parse('2026-10-01T00:00:00Z'), false);
  ok(r2.ratio > 0.7 && r2.ratio < 1.4, `B* ↔ MEAN_MOTION_DOT birim tutarlılığı: oran ${r2.ratio && r2.ratio.toFixed(2)} (≈1)`); }
// biçimlendirme
ok(fmtSpan(0.5) === '12 saat' && fmtSpan(45) === '45 gün' && /ay$/.test(fmtSpan(200)) && /yıl$/.test(fmtSpan(1500)), 'süre biçimi');
ok(/yeniden giriş/.test(fmtReentry({ durum: 'girdi' })) && /yüksek yörünge/.test(fmtReentry({ durum: 'yüksek' })) && /\(.*sonra\)/.test(fmtReentry({ durum: 'bozunuyor', reentryMs: Date.now() + 400 * 864e5, conf: 'orta' })), 'yeniden giriş metinleri');
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
if (fail) process.exit(1);
