// Geçiş tahmini doğrulaması: ISS, İstanbul, 29.09.2026'dan 3 gün — Skyfield (bağımsız SGP4 + WGS-84) sonuçlarıyla.
import fs from 'fs';
import * as S from '../lib/satellite.esm.js';
import * as P from '../js/passes.js';
const o = JSON.parse(fs.readFileSync(new URL('./fixtures/iss_omm.json', import.meta.url))), rec = S.json2satrec(o);
const obs = { lat: 41.0082, lon: 28.9784, h: 0.04 };
// Skyfield 1.x: find_events(altitude 0°) ile (doğuş, en yüksek, batış) UTC ve en yüksek açı
const REF = [['2026-09-29T08:57:28', '09:02:35', 23.81, '09:07:43'], ['2026-09-29T10:33:51', '10:39:16', 42.25, '10:44:42'],
  ['2026-09-29T17:03:43', '17:08:49', 23.12, '17:13:52'], ['2026-09-30T09:46:34', '09:52:03', 67.10, '09:57:33'],
  ['2026-09-30T17:55:09', '17:57:46', 2.61, '18:00:22'], ['2026-10-01T08:59:24', '09:04:53', 73.38, '09:10:23'], ['2026-10-01T17:06:58', '17:10:52', 7.29, '17:14:45']];
const ps = P.findPasses(rec, obs, Date.parse('2026-09-29T00:00:00Z'), 3, { minMaxEl: 0 });
let worst = 0, worstEl = 0, found = 0;
for (const [r, m, el, st] of REF) {
  const tr = Date.parse(r + 'Z'), p = ps.find((q) => Math.abs(q.rise.ms - tr) < 60000); if (!p) { console.log('  ✗ bulunamadı', r); continue; }
  found++;
  const d = r.slice(0, 11), dm = Math.abs(p.max.ms - Date.parse(d + m + 'Z')), ds = Math.abs(p.set.ms - Date.parse(d + st + 'Z')), dr = Math.abs(p.rise.ms - tr);
  worst = Math.max(worst, dr, dm, ds); worstEl = Math.max(worstEl, Math.abs(p.max.el - el));
}
console.log(`  ${found}/${REF.length} geçiş eşleşti · en büyük zaman farkı ${(worst / 1000).toFixed(1)} s · en yüksek açı farkı ${worstEl.toFixed(3)}°`);
const vis = ps.filter((p) => p.visible).map((p) => new Date(p.visFrom).toISOString().slice(0, 16));
console.log('  görünür geçişler (UTC):', vis.join(', '));
const ok = found === REF.length && worst < 2500 && worstEl < 0.05 && vis.includes('2026-09-29T17:03');
console.log(ok ? 'TAMAM' : 'HATA');

// zaman dilimli tarama (findPassesIter): aynı sonucu verir, tek uzun görev yerine çok sayıda kısa dilim yapar (Tracker.computePasses dilimler arasında tarayıcıya döner)
const t0 = performance.now(), it = P.findPassesIter(rec, obs, Date.parse('2026-09-29T00:00:00Z'), 3, { minMaxEl: 0 });
let slices = 0, r, maxSlice = 0, tl = performance.now();
while (!(r = it.next()).done) { slices++; const now = performance.now(); maxSlice = Math.max(maxSlice, now - tl); tl = now; }
const same = JSON.stringify(r.value) === JSON.stringify(ps), total = performance.now() - t0;
console.log(`  dilimli tarama: ${slices} dilim, en uzun dilim ${maxSlice.toFixed(1)} ms (toplam ${total.toFixed(0)} ms), sonuç tek seferlikle ${same ? 'aynı' : 'FARKLI'}`);
const ok2 = same && slices >= 30 && maxSlice < 40 && P.PASS_SLICE === 256;           // 3 gün / 30 s = 8640 adım → 33 dilim
const ge = P.findPassesIter({ ...rec, no: 0.0043 }, obs, Date.parse('2026-09-29T00:00:00Z'), 3), g1 = ge.next();        // yer sabit uydu: geçiş kavramı yok, dilimsiz biter
const ok3 = g1.done && Array.isArray(g1.value);
// Gözlemci kamerası geometrisi (observerFrame): ISS'in geçiş boyunca kameradan görülen yüksekliği = geçiş tablosunun lookAngles yüksekliği;
// eski yöntem (aynı jeodezik enlemle küre üstüne konan nokta, radyal dikey) 41° enlemde dereceler mertebesinde sapıyordu
let worstFrame = 0, worstOld = 0;
{
  const p = ps.find((q) => q.max.el > 60), fr = P.observerFrame(obs.lat, obs.lon, obs.h), D2R = Math.PI / 180;
  const f = obs.lat * D2R, l = obs.lon * D2R, R = P.R_E, oldEye = [R * Math.cos(f) * Math.cos(l), R * Math.cos(f) * Math.sin(l), R * Math.sin(f)], oldUp = oldEye.map((x) => x / R);
  const elFrom = (eye, up, s) => { const d = s.map((x, k) => x - eye[k]), n = Math.hypot(...d); return Math.asin((d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / n) / D2R; };
  for (let ms = p.rise.ms; ms <= p.set.ms; ms += 10000) {
    const st = P.stateAt(rec, ms, obs);
    worstFrame = Math.max(worstFrame, Math.abs(elFrom(fr.eye, fr.up, st.ecf) - st.el)); worstOld = Math.max(worstOld, Math.abs(elFrom(oldEye, oldUp, st.ecf) - st.el));
  }
  console.log(`  gözlemci kamerası: yükseklik farkı (geçiş tablosuna göre) ${worstFrame.toExponential(1)}° · eski küre yöntemi ${worstOld.toFixed(2)}°`);
}
const ok4 = worstFrame < 1e-9 && worstOld > 0.5;
// Çerçeve zinciri çapraz denetimi: TEME -> ICRF (earth.temeToIcrf) -> ITRF (earth.icrfToItrf, IAU 2006/2000A + ΔT tablosu) ile
// TEME -> PEF (GMST, passes.js) aynı yer noktasını vermeli; fark yalnız UT1−UTC (~0,09 s) ve kutup hareketi ihmallerinden gelir
const EO = await import('../js/earth.js'); EO.loadEarthOrientation(JSON.parse(fs.readFileSync(new URL('../data/earth_orient.json', import.meta.url))));
let worstChain = 0;
for (let k = 0; k < 24; k++) {
  const ms = Date.parse('2026-09-29T00:00:00Z') + k * 3 * 3600e3, pv = P.propagate(rec, ms), jdU = ms / 86400000 + 2440587.5, jdTT = jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400;
  const Mt = EO.temeToIcrf(jdTT), gc = [0, 1, 2].map((i) => Mt[i][0] * pv.p[0] + Mt[i][1] * pv.p[1] + Mt[i][2] * pv.p[2]);
  const Mi = EO.icrfToItrf(jdTT), itrf = [0, 1, 2].map((i) => Mi[i][0] * gc[0] + Mi[i][1] * gc[1] + Mi[i][2] * gc[2]), pef = P.eciToEcf(pv.p, P.gmst(ms));
  worstChain = Math.max(worstChain, Math.hypot(itrf[0] - pef[0], itrf[1] - pef[1], itrf[2] - pef[2]) * 1000);
}
console.log(`  çerçeve zinciri: TEME→ICRF→ITRF ile TEME→PEF (GMST) arasında en büyük fark ${worstChain.toFixed(1)} m (UT1−UTC ≈ 0,09 s ihmali)`);
const okC = worstChain < 150;
const tem = P.observerFrame(10, 20, 0).east, okE = Math.abs(Math.hypot(...tem) - 1) < 1e-15;
console.log(ok2 && ok3 && ok4 && okE && okC ? 'TAMAM' : 'HATA'); process.exit(ok && ok2 && ok3 && ok4 && okE && okC ? 0 : 1);
