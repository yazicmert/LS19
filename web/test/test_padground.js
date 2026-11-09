// Kalkış zemini (js/padground.js) saf yardımcıları — Node 20+: cd web && node test/test_padground.js
//  Mercator koordinatı ve karo penceresi (bilinen karo), büyük daire varış noktası (uzaklık ve azimut geri hesapla), Terrarium çözme, çift doğrusal örnekleme,
//  yer tutucu ayıklama, üstel köşe aralığı, ızgara (eğrilik, düz rampa çevresi, Mercator kayması ↔ seviye dönüşümü).
import * as P from '../js/padground.js';
import * as PM from '../js/padmodels.js';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const THREE = await import('three'), { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const near = (a, b, e) => Math.abs(a - b) <= e;
const D2R = Math.PI / 180;
const hav = (la1, lo1, la2, lo2, R = P.R_M) => { const a = Math.sin((la2 - la1) * D2R / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin((lo2 - lo1) * D2R / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };

// LC-39B (KSC): Esri/OSM karo şeması z18 → x 71065, y 109658 civarı (OSM slippy map formülü)
const LAT = 28.6272, LON = -80.6208;
const [X, Y] = P.merc01(LAT, LON);
const ox = Math.floor((LON + 180) / 360 * 2 ** 18), la = LAT * D2R, oy = Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * 2 ** 18);
check('Mercator: OSM karo formülüyle aynı karo (z18)', Math.floor(X * 2 ** 18) === ox && Math.floor(Y * 2 ** 18) === oy, `${Math.floor(X * 2 ** 18)},${Math.floor(Y * 2 ** 18)} ↔ ${ox},${oy}`);
check('Mercator: ekvator/başlangıç meridyeni ortada, kutuplar sınırda', near(P.merc01(0, 0)[0], 0.5, 1e-12) && near(P.merc01(0, 0)[1], 0.5, 1e-12) && P.merc01(89, 0)[1] >= 0 && P.merc01(-89, 0)[1] <= 1);
const r = P.levelRect(LAT, LON, 14, 6);
check('seviye penceresi rampayı ortaya yakın içerir', r.xc >= r.x0 + 2 && r.xc <= r.x0 + 4 && r.yc >= r.y0 + 2 && r.yc <= r.y0 + 4, JSON.stringify(r));
const r5 = P.levelRect(80, 0, 2, 6);
check('seviye penceresi haritanın içinde kalır (kuzeyde)', r5.y0 === 0, JSON.stringify(r5));

// büyük daire: 10 km ve 1000 km doğu/kuzey, geri hesaplanan uzaklık
for (const [az, d] of [[0, 1e4], [Math.PI / 2, 1e4], [Math.PI / 4, 1e6], [3, 1.6e6]]) {
  const [a, b] = P.destPoint(LAT, LON, az, d), back = hav(LAT, LON, a, b);
  check(`varış noktası: azimut ${az.toFixed(2)}, ${d / 1000} km → uzaklık geri`, near(back, d, d * 1e-9 + 1e-3), `${back.toFixed(3)} m`);
}
const [nLat, nLon] = P.destPoint(LAT, LON, 0, 1e5);
check('kuzeye gidiş: boylam aynı, enlem artar', near(nLon, LON, 1e-9) && nLat > LAT);

// Terrarium: (128, 0, 0) → 0 m; (127, 255, 128) → −0,5 m; (130, 16, 0) → 528 m
const px = new Uint8ClampedArray([128, 0, 0, 255, 127, 255, 128, 255, 130, 16, 0, 255]), h = P.decodeTerrarium(px);
check('Terrarium çözme', h[0] === 0 && near(h[1], -0.5, 1e-9) && h[2] === 528, Array.from(h).join(', '));

// çift doğrusal örnekleme: 2 × 2 ızgarada merkez ortalama, köşeler kendisi
const g = new Float32Array([0, 10, 20, 30]);
check('çift doğrusal: piksel merkezleri ve orta', near(P.sampleGrid(g, 2, 2, 0.5, 0.5), 0, 1e-6) && near(P.sampleGrid(g, 2, 2, 1.5, 1.5), 30, 1e-6) && near(P.sampleGrid(g, 2, 2, 1, 1), 15, 1e-6));

// yer tutucu: düz açık gri → evet; düz koyu mavi deniz → hayır; dokulu → hayır
const flat = (r0, g0, b0) => { const a = new Uint8ClampedArray(64); for (let i = 0; i < 16; i++) a.set([r0, g0, b0, 255], i * 4); return a; };
const tex = flat(90, 120, 60); tex.set([140, 150, 100, 255], 20);
check('yer tutucu ayıklama (gri evet, deniz ve doku hayır)', P.isPlaceholder(flat(242, 242, 242)) && !P.isPlaceholder(flat(18, 40, 62)) && !P.isPlaceholder(tex));

// üstel aralık: uçlar, simetri, merkezde ince
check('köşe aralığı: uçlar ±rMax, simetrik, merkezde < 2 m', near(P.spacing(1, 1.65e6), 1.65e6, 1e-6) && near(P.spacing(-1, 1.65e6), -1.65e6, 1e-6) && near(P.spacing(0.3, 5e5), -P.spacing(-0.3, 5e5), 1e-9) && P.spacing(2 / 192, 1.65e6) < 2);

// zemin yüksekliği: rampa çevresi düz (0,25 m), uzakta yüksek yerler yükselir, alçak yerler rampa düzeyinde kalır
check('zemin yüksekliği kuralı', P.groundY(300, 10, 100) === 0.25 && near(P.groundY(300, 10, 5000), 290.25, 1e-9) && P.groundY(-40, 10, 5000) === 0.25);

// ızgara: eğrilik (1000 km'de y ≈ −d²/2R), merkez yüksekliği, Mercator kayması ↔ seviye dönüşümü
const G = P.buildGround({ lat: LAT, lon: LON, nSeg: 64, rMax: 1.65e6 });
const n = G.n, mid = (n >> 1) * n + (n >> 1);
check('ızgara boyutları', G.pos.length === n * n * 3 && G.mxy.length === n * n * 2 && G.idx.length === 64 * 64 * 6);
check('ızgara merkezi rampada (0, 0,25, 0)', near(G.pos[mid * 3], 0, 1e-6) && near(G.pos[mid * 3 + 1], 0.25, 1e-6) && near(G.pos[mid * 3 + 2], 0, 1e-6) && G.mxy[mid * 2] === 0 && G.mxy[mid * 2 + 1] === 0);
let okCurv = true, worst = 0;
for (let k = 0; k < n * n; k++) {
  const x = G.pos[k * 3], y = G.pos[k * 3 + 1], z = G.pos[k * 3 + 2], rr = Math.hypot(x, y + P.R_M, z);   // küre merkezine uzaklık (rampa çerçevesinde merkez (0, −R, 0))
  worst = Math.max(worst, Math.abs(rr - P.R_M - 0.25)); if (worst > 1) okCurv = false;
}
check('ızgara köşeleri küre yüzeyinde (+0,25 m)', okCurv, `en büyük sapma ${worst.toFixed(3)} m`);
// bir köşenin Mercator kayması, seviye dönüşümüyle o köşenin enlem/boylamının karo koordinatını verir
{
  const k = (n >> 1) * n + (n >> 1) + 9, e = G.pos[k * 3], s = G.pos[k * 3 + 2];
  const d = Math.hypot(e, s), dArc = P.R_M * Math.asin(d / P.R_M), [a2, b2] = P.destPoint(LAT, LON, Math.atan2(e, -s), dArc);
  const rz = P.levelRect(LAT, LON, 14, 6), [sx, offx, offy] = P.levelXf(rz), uvx = G.mxy[k * 2] * sx + offx, uvy = G.mxy[k * 2 + 1] * sx + offy;
  const [X2, Y2] = P.merc01(a2, b2);
  check('Mercator kayması + seviye dönüşümü = karo koordinatı', near(uvx, X2 * 2 ** 14 - rz.x0, 1e-3) && near(uvy, Y2 * 2 ** 14 - rz.y0, 1e-3), `${uvx.toFixed(4)},${uvy.toFixed(4)}`);
}
// yükseklik işlevi: uzaktaki dağ yükselir, rampa çevresi düz kalır
const G2 = P.buildGround({ lat: LAT, lon: LON, nSeg: 64, rMax: 1.65e6, heightAt: () => 500, hPad: 10 });
check('kabartma: merkez düz, uzak köşe +490 m', near(G2.pos[mid * 3 + 1], 0.25, 1e-6) && near(G2.pos[1] - G.pos[1], 490, 1), `${(G2.pos[1] - G.pos[1]).toFixed(2)} m`);
// boylam 180°'yi aşan pencere (Marshall Adaları, 167°D): kayma sürekli
const G3 = P.buildGround({ lat: 9.05, lon: 167.74, nSeg: 32, rMax: 1.65e6 });
let maxJump = 0; for (let j = 0; j < 33; j++) for (let i = 0; i < 32; i++) maxJump = Math.max(maxJump, Math.abs(G3.mxy[(j * 33 + i + 1) * 2] - G3.mxy[(j * 33 + i) * 2]));
check('180. meridyeni aşan ızgarada Mercator kayması sürekli', maxJump < 2 ** 18 * 0.2, `en büyük sıçrama ${maxJump.toFixed(0)} karo`);

// rampa yapıları (padmodels.js)
{
  const k = ['Kennedy Uzay Merkezi LC-39B (28.6271°N, 80.6210°W)', 'KSC LC-39A', 'CCSFS SLC-40', 'Cape Canaveral SLC-41', 'Baikonur Site 1/5'].map(PM.padKey);
  check('rampa adı tanınır (LC-39A/B, SLC-40/41; diğerleri genel)', k.join() === 'LC-39B,LC-39A,SLC-40,SLC-41,generic', k.join());
  const A = PM.padLayout('LC-39A'), B = PM.padLayout('LC-39B'), Bml = PM.padLayout('LC-39B', { ml: true });
  const fss = A.find((p) => p.type === 'lattice'), lm = A.find((p) => p.type === 'mast' && p.y0), tr = A.find((p) => p.type === 'trench'), wt = A.find((p) => p.type === 'water');
  check('LC-39A: FSS 75 m, yıldırım direğiyle 106 m; hendek 137 × 17,7 m; su kulesi 88 m [NASA KSC]', Math.abs(fss.h - 75.3) < 0.2 && Math.abs(lm.y0 + lm.h - 105.8) < 0.2 && Math.abs(tr.len - 137.2) < 0.2 && Math.abs(tr.w - 17.7) < 0.1 && Math.abs(wt.h - 88.4) < 0.2,
    `FSS ${fss.h.toFixed(1)} m, direk tepesi ${(lm.y0 + lm.h).toFixed(1)} m, hendek ${tr.len.toFixed(1)} × ${tr.w.toFixed(1)} m, su kulesi ${wt.h.toFixed(1)} m`);
  const m3 = B.filter((p) => p.type === 'mast'), w3 = B.filter((p) => p.type === 'wire');
  check('LC-39B: üç 183 m yıldırım kulesi ve aralarında üç katener tel; Mobile Launcher varken hendek çizilmez', m3.length === 3 && m3.every((m) => Math.abs(m.h - 182.9) < 0.2) && w3.length === 3 && B.some((p) => p.type === 'trench') && !Bml.some((p) => p.type === 'trench'));
  const all = ['LC-39A', 'LC-39B', 'SLC-40', 'SLC-41', 'generic'].map((key) => [key, PM.padLayout(key)]);
  const fin = all.every(([, L]) => L.every((p) => Object.values(p).flat(2).every((v) => typeof v !== 'number' || Number.isFinite(v))));
  const clear = all.every(([, L]) => L.filter((p) => p.type === 'lattice' || p.type === 'mast' || p.type === 'water' || p.type === 'box').every((p) => Math.hypot(p.x, p.z) - (p.w || 0) / 2 > 12));   // roketten (orijin) uzakta
  const vif = PM.padLayout('SLC-41').find((p) => p.type === 'box');
  check('her rampada sayılar sonlu, yapılar roket ekseninden > 12 m; SLC-41 VIF 89 m, rampanın 550 m güneyinde', fin && clear && Math.abs(vif.h - 89) < 0.1 && vif.z === 550);
  let built = true, why = '';
  for (const [key] of all) { try { const r = PM.buildPad(THREE, mergeGeometries, key); if (!r.parts.length || r.parts.some((o) => !o.geometry)) { built = false; why += key + ' '; } } catch (e) { built = false; why += `${key}: ${e.message} `; } }
  check('her rampa three.js ile kurulur (birleştirilmiş kafes, tel, su kulesi)', built, why);
}
console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
