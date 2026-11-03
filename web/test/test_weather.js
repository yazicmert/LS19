// Fırlatma hava durumu (Node): cd web && node test/test_weather.js
// Kurallar (NASA Artemis I hava kriterleri, 45. Hava Filosu) örnek Open-Meteo yanıtlarıyla; kapsam (16 gün ileri, 92 gün geri); istek adresi; önbellek ve hata.
import { evaluate, hourAt, coverage, weatherUrl, launchWeather, HOURLY, WX_SOURCES, pickLaunch } from '../js/weather.js';
import { dailyIncls } from '../js/pads.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const base = { temperature_2m: 22, precipitation: 0, precipitation_probability: 10, weather_code: 1, cloud_cover: 30, wind_speed_10m: 10, wind_gusts_10m: 15, wind_speed_120m: 14, cape: 200, wind_speed_250hPa: 50, storm: false };
const st = (h) => evaluate({ ...base, ...h });
const ck = (r, k) => r.checks.find((c) => c.k === k).st;

check(st({}).status === 'go' && st({}).checks.length === 6, 'sakin hava: uygun (6 ölçüt)');
check(ck(st({ precipitation: 0.5 }), 'Yağış') === 'nogo' && ck(st({ precipitation_probability: 60 }), 'Yağış') === 'risk', 'yağmur altında fırlatılmaz (≥ 0,2 mm/sa); olasılık ≥ %40 riskli');
check(st({ storm: true }).status === 'nogo' && ck(st({ cape: 1500 }), 'Yıldırım') === 'risk', 'gök gürültülü fırtına (WMO 95–99, ±1 sa): uygun değil; CAPE ≥ 1000: riskli');
check(ck(st({ wind_gusts_10m: 36 }), 'Kalkış rüzgârı') === 'nogo' && ck(st({ wind_speed_120m: 27 }), 'Kalkış rüzgârı') === 'risk' && ck(st({ wind_speed_120m: 20, wind_gusts_10m: 22 }), 'Kalkış rüzgârı') === 'go', 'kalkış rüzgârı: ≥ 34 kt uygun değil, ≥ 25 kt riskli (Artemis I: 29–39 kt)');
check(ck(st({ cloud_cover: 95 }), 'Kalın bulut') === 'risk' && ck(st({ wind_speed_250hPa: 110 }), 'Üst seviye rüzgâr') === 'risk' && ck(st({ temperature_2m: 3 }), 'Sıcaklık') === 'risk', 'kalın bulut ≥ %90, 250 hPa ≥ 100 kt, sıcaklık < 5,2°C (41,4°F): riskli');
check(st({ cloud_cover: 95, precipitation: 1 }).status === 'nogo' && st({ cloud_cover: 95 }).status === 'risk', 'genel durum en kötü ölçüt');
check(evaluate({ storm: false }).status === 'na' && evaluate({ storm: false }).checks.every((c) => c.st === 'na') && st({ cape: null }).status === 'go', 'veri yoksa ölçüt ve genel durum "veri yok" (yanıltıcı "uygun" ya da "uygun değil" yok)');

const now = Date.UTC(2026, 10, 3, 12);
check(coverage(now + 10 * 86400e3, now).kind === 'forecast' && coverage(now - 20 * 86400e3, now).kind === 'past' && coverage(now + 20 * 86400e3, now).kind === 'none' && coverage(now - 100 * 86400e3, now).kind === 'none', 'kapsam: 16 gün ileri tahmin, 92 gün geri gerçekleşen, ötesi yok');
const u = new URL(weatherUrl(45.92, 63.342, now - 21 * 86400e3, now));
check(u.host === 'api.open-meteo.com' && u.searchParams.get('hourly') === HOURLY.join(',') && u.searchParams.get('wind_speed_unit') === 'kn' && u.searchParams.get('timezone') === 'UTC' && +u.searchParams.get('past_days') === 22, 'istek: saatlik değişkenler, düğüm (kt), UTC, geçmiş için past_days');

const H = { time: [], weather_code: [] }; for (const k of HOURLY) H[k] = H[k] || [];
for (let i = 0; i < 48; i++) { H.time.push(new Date(now + i * 3600e3).toISOString().slice(0, 16)); for (const k of HOURLY) H[k].push(k === 'weather_code' ? (i === 11 ? 95 : 1) : base[k]); }
const h10 = hourAt({ hourly: H }, now + 10 * 3600e3 + 600e3), h30 = hourAt({ hourly: H }, now + 30 * 3600e3);
check(h10 && h10.time === H.time[10] && h10.storm === true && h30.storm === false && hourAt({ hourly: H }, now + 60 * 3600e3) === null, 'en yakın saat; yıldırım ±1 saat penceresinde; kapsam dışı saat: veri yok');
let calls = 0;
const fake = async () => { calls++; return { ok: true, json: async () => ({ hourly: H }) }; };
const r1 = await launchWeather(45.9, 63.3, now + 30 * 3600e3, { nowMs: now, fetchFn: fake }), r2 = await launchWeather(45.9, 63.3, now + 31 * 3600e3, { nowMs: now, fetchFn: fake });
check(r1.status === 'go' && r1.kind === 'forecast' && r2.status === 'go' && calls === 1, 'aynı rampa/saat diliminde tek istek (bellek önbelleği)');
const bad = await launchWeather(10, 10, now + 3600e3, { nowMs: now, fetchFn: async () => ({ ok: false, status: 429, json: async () => ({ error: true, reason: 'Daily API request limit exceeded' }) }) });
check(bad.status === 'na' && /limit/.test(bad.why), `hata (ör. kota): "veri yok" + neden ("${bad.why}")`);
const far = await launchWeather(10, 10, now + 40 * 86400e3, { nowMs: now, fetchFn: fake });
check(far.status === 'na' && /16 gün/.test(far.why), 'tahmin aralığı dışında: istek atılmaz, neden söylenir');
// günlük fırlatma penceresi: önerilen fırsat
const R = (t, cost, status) => ({ t, cost, wx: { status } });
check(pickLaunch([R(1, 100, 'nogo'), R(2, 120, 'go'), R(3, 110, 'go')]).index === 2 && pickLaunch([R(1, 100, 'nogo'), R(2, 120, 'risk')]).index === 1, 'önerilen: hava uygun olanlar arasında en az yakıt; yoksa riskli olanlar');
check(pickLaunch([R(1, 100, 'nogo'), R(2, 90, 'nogo')]).index === -1 && /sonraki pencere/.test(pickLaunch([R(1, 100, 'nogo')]).why), 'hepsi uygun değilse öneri yok: sonraki pencere');
check(pickLaunch([R(5, 100, 'na'), R(2, 100, 'na')]).index === 1 && /verisi yok/.test(pickLaunch([R(5, 100, 'na')]).why) && pickLaunch([null, R(1, 50, 'go')]).index === 1, 'hava verisi yoksa en az yakıt (eşitse en erken); boş satırlar atlanır');
const di = dailyIncls(28.7, 59.7), dv = dailyIncls(58.1, 90);
check(di[0] === 28.7 && di.includes(32.5) && di.every((i) => i <= 59.7) && di.length === 7 && dv[0] === 58.1 && dv.every((i) => i <= 90), `günlük pencerenin aday eğimleri (Florida: ${di.join(', ')})`);
check(WX_SOURCES.length >= 3 && WX_SOURCES.every((s) => /^https:\/\//.test(s.u)), 'kural kaynakları (NASA, 45. Hava Filosu, Open-Meteo)');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
