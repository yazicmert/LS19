// Dünya ve Ay görsellerinin doğrulaması (Node 20+): cd web && node test/test_gorsel.js
//  1) atmosfer: fiziksel tek saçılma (Rayleigh + Mie), Dünya gölgesi, önçarpımlı karışım, kamera içerideyken arka yüz; gölgelendiricinin sayısal eşi
//     (aynı katsayılar) gökyüzü maviliğini, ufkun kızıllığını ve gece tarafının karanlığını verir
//  3) görev gününün bulutları (NASA GIBS VIIRS): gün seçimi, parça adresi, mozaik boyu, zemine göre bulut çözümü, bulut gölgesi, sahne ve uygulama bağlantısı
//  4) mevsimsel Dünya: dönem seçimi, oran hesabı (algılayıcı farkı, alt ortanca, renk korunan sınır, tropik tavanı, geçerlilik), gölgelendirici ve sahne
//  2) Ay kabartma gölgesi: LOLA yükseklik alanında Güneş yönünde yürüyüş, eğrilik, yalnız alçak Güneş, yakında söner; yükseklik çözümü VS_BODY ile aynı
import { register } from 'node:module';
import { sceneSrc } from './scenesrc.js';
register('./importmap_loader.mjs', import.meta.url);
const { FS_ATM, FS_MOON, VS_BODY, FS_EARTH } = await import('../js/bodyshaders.js');
const BL = await import('../js/bulutlar.js');
const MV = await import('../js/mevsim.js');
import fs from 'fs';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const scene = sceneSrc();

// ---------------------------------------------------------------- 1) atmosfer
{
  check('atmosfer gölgelendiricisi: Rayleigh/Mie katsayıları ve ölçek yükseklikleri, 16×4 ışın yürütme, Dünya gölgesi, önçarpımlı çıkış',
    /BR = vec3\(5\.8e-3, 13\.5e-3, 33\.1e-3\)/.test(FS_ATM) && /BM = 21e-3, HR = 8\.0, HM = 1\.2/.test(FS_ATM) && /const int N = 16/.test(FS_ATM) && /j < 4/.test(FS_ATM)
    && /Dünya'nın gölgesi/.test(FS_ATM) && /gl_FragColor = vec4\(col, 1\.0 - \(T\.r \+ T\.g \+ T\.b\) \/ 3\.0\)/.test(FS_ATM));
  check('sahne: önçarpımlı karışım (ONE, ONE_MINUS_SRC_ALPHA), içeriden arka yüz, pozlama sabiti',
    /blendSrc: THREE\.OneFactor, blendDst: THREE\.OneMinusSrcAlphaFactor/.test(scene) && /this\.atm\.material\.side = this\.earth\.position\.length\(\) < E\.R_E \* 1\.0125 \? THREE\.BackSide : THREE\.FrontSide/.test(scene)
    && /const ATM_K = [\d.]+;/.test(scene));
  // sayısal eş: düz yer, gözlemci yerde; Güneş tepede ve ufukta. Gökyüzü tepeye bakınca mavi baskın, ufukta Güneş batarken kırmızı/turuncu payı artar
  const BR = [5.8e-3, 13.5e-3, 33.1e-3], BM = 21e-3, HR = 8, HM = 1.2, Rp = 6371, Ra = Rp * 1.0125;
  const sph = (o, d, r) => { const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], q = [o[0] - b * d[0], o[1] - b * d[1], o[2] - b * d[2]], h = r * r - (q[0] ** 2 + q[1] ** 2 + q[2] ** 2); if (h < 0) return [1e9, -1e9]; const s = Math.sqrt(h); return [-b - s, -b + s]; };
  const sky = (o, d, L) => {
    const ta = sph(o, d, Ra); let t0 = Math.max(ta[0], 0), t1 = ta[1]; const tp = sph(o, d, Rp); if (tp[0] < tp[1] && tp[1] > 0) t1 = Math.min(t1, Math.max(tp[0], 0));
    if (t1 <= t0) return [0, 0, 0];
    const mu = d[0] * L[0] + d[1] * L[1] + d[2] * L[2], g = 0.76, g2 = g * g, pR = 3 / (16 * Math.PI) * (1 + mu * mu), pM = 3 / (8 * Math.PI) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * (1 + g2 - 2 * g * mu) ** 1.5);
    const N = 16, ds = (t1 - t0) / N; const sR = [0, 0, 0], sM = [0, 0, 0]; let oR = 0, oM = 0;
    for (let i = 0; i < N; i++) {
      const t = t0 + (i + 0.5) * ds, p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], h = Math.max(Math.hypot(...p) - Rp, 0);
      const hr = Math.exp(-h / HR) * ds, hm = Math.exp(-h / HM) * ds; oR += hr; oM += hm;
      const tpl = sph(p, L, Rp); if (tpl[0] < tpl[1] && tpl[1] > 0) continue;
      const dl = sph(p, L, Ra)[1] / 4; let lR = 0, lM = 0;
      for (let j = 0; j < 4; j++) { const s = (j + 0.5) * dl, hl = Math.max(Math.hypot(p[0] + L[0] * s, p[1] + L[1] * s, p[2] + L[2] * s) - Rp, 0); lR += Math.exp(-hl / HR) * dl; lM += Math.exp(-hl / HM) * dl; }
      for (let c = 0; c < 3; c++) { const a = Math.exp(-(BR[c] * (oR + lR) + BM * 1.1 * (oM + lM))); sR[c] += a * hr; sM[c] += a * hm; }
    }
    return [0, 1, 2].map((c) => sR[c] * BR[c] * pR + sM[c] * BM * pM);
  };
  const o = [0, 0, Rp + 0.01], up = [0, 0, 1], low = (az) => [Math.cos(az), 0, Math.sin(0.03)], sunHigh = [0, 0, 1], sunSet = [1, 0, 0.02], sunNight = [0, 0, -1];
  const noon = sky(o, up, sunHigh), dusk = sky(o, low(0), sunSet), night = sky(o, up, sunNight);
  const rb = (c) => c[0] / c[2];
  check('sayısal eş: öğlen gökyüzü mavi (B > G > R), gün batımında ufuk kızıl (R/B öğlenin 3 katından fazla), gece karanlık',
    noon[2] > noon[1] && noon[1] > noon[0] && rb(dusk) > 3 * rb(noon) && night.every((v) => v === 0), `öğlen R/B ${rb(noon).toFixed(2)}, gün batımı R/B ${rb(dusk).toFixed(2)}`);
  // uzaydan: disk merkezinde pus azdır, kenarda (teğet bakış) çok daha fazla saçılma
  const cam = [0, -20000, 0], toC = (x) => { const d = [x - cam[0], -cam[1], 0]; const n = Math.hypot(...d); return d.map((v) => v / n); };
  const sunSide = [0, -1, 0], centre = sky(cam, toC(0), sunSide), limb = sky(cam, toC(Rp + 20), sunSide);
  check('uzaydan: kenar (teğet bakış) disk merkezinden en az 1,5 kat parlak', limb[2] > 1.5 * centre[2], `merkez ${centre[2].toExponential(2)}, kenar ${limb[2].toExponential(2)}`);
}

// ---------------------------------------------------------------- 2) Ay kabartma gölgesi
{
  const dec = (src, name) => (src.match(new RegExp(`float ${name}\\(vec4 c\\) \\{ return ([^}]*) \\}`)) || [])[1];
  check('Ay kabartma gölgesi: Güneş yönünde 12 adım (2,2 km × 1,45ⁿ ≈ 140 km), eğrilik payı s²/2R, yalnız alçak Güneş (< 30°), yakında söner; doğrudan ışığı çarpar',
    /float reliefShadow\(vec3 N, vec3 T, vec3 B, vec3 L\)/.test(FS_MOON) && /k < 12/.test(FS_MOON) && /s = 2\.2/.test(FS_MOON) && /s \*= 1\.45/.test(FS_MOON)
    && /s \* s \/ \(2\.0 \* radius\)/.test(FS_MOON) && /sEl > 0\.5\) return 1\.0/.test(FS_MOON) && /float near = smoothstep\(0\.06, 0\.2, length\(fwidth\(vUv \* hSize\)\)\)/.test(FS_MOON)
    && /float mu0 = max\(dot\(Np, L\), 0\.0\) \* reliefShadow\(N, T, B, L\)/.test(FS_MOON));
  check('yükseklik çözümü gölgelendiricilerde aynı (R·256+G, −10…+11 km)', dec(VS_BODY, 'decH') && dec(VS_BODY, 'decH') === dec(FS_MOON, 'decHf'));
  // geometri: en uzun adım ≥ 100 km (alçak Güneş'te 4 km'lik sırt 2°'de ~115 km gölge düşürür)
  let s = 2.2, top = 0; for (let k = 0; k < 12; k++) { top = s; s *= 1.45; }
  check('yürüyüş erimi: son adım ≥ 100 km', top >= 100, `${top.toFixed(0)} km`);
}

// ---------------------------------------------------------------- 3) gerçek bulutlar
{
  const G = 864e5, now = Date.UTC(2026, 10, 23, 15), gun = (y, m, d) => Date.UTC(y, m - 1, d, 9);
  check('bulut günü: geçmiş kalkış o gün; bugün ve gelecek dün (günlük mozaik ertesi gün tamamlanır); tarih yoksa dün',
    BL.bulutGunu(gun(2026, 10, 13), now) === '2026-10-13' && BL.bulutGunu(gun(2026, 11, 23), now) === '2026-11-22' && BL.bulutGunu(gun(2027, 3, 1), now) === '2026-11-22' && BL.bulutGunu(NaN, now) === '2026-11-22' && G > 0);
  check('GIBS parça adresi ve mozaik boyu: VIIRS NOAA-20, 250m matrisi, z/satır/sütun; seviye 3 = 10 × 5 parça = 5120 × 2560, seviye 2 = 2560 × 1280',
    BL.parcaAdresi('2026-10-13', 3, 4, 2) === 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-10-13/250m/3/2/4.jpg'
    && BL.SEVIYE[3].cols * 512 === BL.SEVIYE[3].w && BL.SEVIYE[3].rows * 512 === BL.SEVIYE[3].h && BL.SEVIYE[2].w === 2560 && BL.SEVIYE[2].h === 1280);
  check('Dünya gölgelendiricisi: bulut = zemin (sRGB) ile beyaz arasındaki karışımın α\'sı; veri boşluğu ve kar/buz durağan dokudan; bulut gölgesi 6 km/tan(yükseliş), en çok 60 km; eski kenar pusu yok',
    /vec3 a3 = \(rc - gr\) \/ \(1\.001 - gr\); float al = min\(a3\.r, min\(a3\.g, a3\.b\)\)/.test(FS_EARTH) && /seasonal\(uv, texture2D\(dayMap, uv\)\.rgb, [^;]*\), 0\.0, 1\.0\), vec3\(1\.0 \/ 2\.2\)\)/.test(FS_EARTH)
    && /step\(0\.03, max\(rc\.r/.test(FS_EARTH) && /dkm = min\(6\.0 \* sqrt/.test(FS_EARTH) && /, 60\.0\)/.test(FS_EARTH) && /\(1\.0 - 0\.5 \* cShade\)/.test(FS_EARTH)
    && !/vec3\(0\.32, 0\.55, 1\.0\) \* max\(ndl \+ 0\.15/.test(FS_EARTH));
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  check('sahne ve uygulama: setRealClouds (aynı gün yeniden inmez, eski doku bırakılır, düşük bellekte seviye 2, ?bulut=0 kapatır); görev kurulunca kalkış günüyle çağrılır',
    /async setRealClouds\(ms\)/.test(scene) && /if \(gun === this\.realGun\) return true;/.test(scene) && /this\.lowMem \? 2 : 3/.test(scene) && /bulut=0/.test(scene) && /old\.dispose\(\)/.test(scene)
    && /realMap: \{ value: flat\(\[0, 0, 0, 255\]\) \}, useReal: \{ value: 0 \},/.test(scene) && /const ms = E\.utcMsFromT\(S\.DESIGN\.LAUNCH\.t_launch\); world\.setRealClouds\(ms\)/.test(app));
}

// ---------------------------------------------------------------- 4) mevsimsel Dünya
{
  const now = Date.UTC(2026, 10, 23, 15), g = (y, m, d) => Date.UTC(y, m - 1, d, 9), D = (t) => MV.mevsimDonemleri(t, now).join(' ');
  check('mevsim dönemleri: kalkışı içeren 8 günlük dönem ve önceki 3 (yıl başında 1 Ocak, önceki yılın 27 Aralık kısa dönemi); 45 güne dek gelecek güncel dönem, ötesi geçen yılın aynı mevsimi; 2018 öncesi son yılın aynı mevsimi',
    D(g(2026, 10, 13)) === '2026-10-08 2026-09-30 2026-09-22 2026-09-14' && D(g(2026, 1, 3)) === '2026-01-01 2025-12-27 2025-12-19 2025-12-11'
    && D(g(2026, 12, 1)) === '2026-11-01 2026-10-24 2026-10-16 2026-10-08' && D(g(2027, 6, 1)) === '2026-05-25 2026-05-17 2026-05-09 2026-05-01'
    && D(g(1969, 7, 16)) === '2026-07-12 2026-07-04 2026-06-26 2026-06-18' && D(NaN) === D(g(2026, 11, 7)));
  check('mevsim parça adresi: VIIRS NOAA-20 8 günlük yüzey yansıması (M5-M4-M3), 500m matrisi seviye 1 (3 × 2 parça → 1280 × 640)',
    MV.mevsimAdresi('2026-10-08', 2, 1) === 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_NOAA20_L3_SurfaceReflectance_BandsM5-M4-M3_8Day/default/2026-10-08/500m/1/1/2.jpg'
    && MV.MW === 1280 && MV.MH === 640 && MV.KODLA === 12);
  // küçük yapay dünya: W × H, satır 0 = kuzey; taban orta tonlu kara (A = 0) ya da su (A = 255)
  const W = 48, H = 24, N = W * H, lat = (y) => 90 - (y + 0.5) / H * 180;
  const img = (f) => { const a = new Uint8Array(N * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = f(x, y), o = (y * W + x) * 4; a[o] = v[0]; a[o + 1] = v[1]; a[o + 2] = v[2]; a[o + 3] = v[3] ?? 255; } return a; };
  const taban = img(() => [110, 120, 90, 0]), dec = (v) => (v / 255 - 0.5) * MV.KODLA, at = (r, x, y) => r.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4);
  const r0 = MV.mevsimOrani([taban, taban], taban, W, H);
  check('aynı dönem = taban: oran 1 (128), geçerlilik tam, kalibre 0', r0.kalibre.every((k) => k === 0) && [...at(r0, 10, 12)].join() === '128,128,128,255');
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, enc = (l) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
  const iki = img(() => [enc(2 * lin(110)), enc(2 * lin(120)), enc(2 * lin(90))]);
  const r1 = MV.mevsimOrani([iki], taban, W, H);
  check('algılayıcı farkı (her yer 2 kat parlak) ortanca ile ayıklanır: kalibre ≈ +1, oran ≈ 1',
    r1.kalibre.every((k) => Math.abs(k - 1) < 0.05) && [...at(r1, 5, 5)].slice(0, 3).every((v) => Math.abs(v - 128) <= 1));
  // (30, 6) pikselinde üç dönem: bulut (beyaz), zemin, bulut gölgesi (yarı parlak). Alt ortanca = zemin
  const bulut = img((x, y) => x === 30 && y === 6 ? [250, 250, 250] : [110, 120, 90]), golge = img((x, y) => x === 30 && y === 6 ? [60, 66, 50] : [110, 120, 90]);
  const r2 = MV.mevsimOrani([bulut, taban, golge], taban, W, H);
  check('bulut ve bulut gölgesi elenir: üç dönemde parlaklığa göre alt ortanca', [...at(r2, 30, 6)].slice(0, 3).every((v) => Math.abs(v - 128) <= 1));
  // (6, 3) ~60° K: koyu orman taban, mozaikte kar → çok büyük oran; kanallar birlikte kaydırılır (renk dönmez); (20, 12) ekvator: beyaz leke ≤ 1,6 kat
  const tb = img((x, y) => x === 6 && y === 3 ? [8, 30, 8, 0] : [110, 120, 90, 0]);
  const kar = img((x, y) => (x === 6 && y === 3) || (x === 20 && y === 12) ? [245, 245, 245] : [110, 120, 90]);
  const r3 = MV.mevsimOrani([kar], tb, W, H), k = at(r3, 6, 3), e = at(r3, 20, 12);
  const raw = [0, 1, 2].map((c) => Math.log2((lin(245) + 0.005) / (lin([8, 30, 8][c]) + 0.005)));
  const Le = 0.2126 * lin(110) * 2 ** dec(e[0]) + 0.7152 * lin(120) * 2 ** dec(e[1]) + 0.0722 * lin(90) * 2 ** dec(e[2]), L0 = 0.2126 * lin(110) + 0.7152 * lin(120) + 0.0722 * lin(90);
  check('kar: aralık dışı oran üç kanal birlikte sınırlanır (kanal farkları korunur, en büyüğü sınırda); tropikte beyaz leke parlaklığı en çok 1,6 kat; enlemler ' + lat(3).toFixed(0) + '° ve ' + lat(12).toFixed(0) + '°',
    Math.abs((dec(k[0]) - dec(k[1])) - (raw[0] - raw[1])) < 0.1 && Math.max(dec(k[0]), dec(k[1]), dec(k[2])) > MV.KODLA / 2 - 0.15 && Math.abs(Le / L0 - 1.6) < 0.08);
  const bos = img((x, y) => y < 4 ? [0, 0, 0] : [110, 120, 90]);
  const r4 = MV.mevsimOrani([bos], taban, W, H);
  check('veri boşluğu (kutup gecesi): geçerlilik 0, oran 1; sınırdan içe doğru yumuşak geçiş (ilk satırlar kısmi)',
    [...at(r4, 10, 2)].join() === '128,128,128,0' && at(r4, 10, 4)[3] > 0 && at(r4, 10, 4)[3] < 255 && at(r4, 10, 16)[3] === 255);
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'), wk = fs.readFileSync(new URL('../js/mevsimworker.js', import.meta.url), 'utf8');
  check('gölgelendirici: gündüz = taban × 2^((oran − 0,5)·12·geçerlilik·kara); gerçek bulut zemini de mevsimli; sahne: taban gündüz dokusundan (ayrı indirme yok), oran iş parçacığında, ?mevsim=0 kapatır; görev kurulunca çağrılır',
    /vec3 seasonal\(vec2 uv, vec3 c, float land\)/.test(FS_EARTH) && /exp2\(\(s\.rgb - 0\.5\) \* 12\.0 \* \(s\.a \* land\)\)/.test(FS_EARTH) && /day = seasonal\(vUv, day, landE\);/.test(FS_EARTH)
    && /gr = pow\(clamp\(seasonal\(uv, texture2D\(dayMap, uv\)\.rgb/.test(FS_EARTH)
    && /async setSeason\(ms\)/.test(scene) && /seasonBase\(W, H\)/.test(scene) && /readRenderTargetPixels/.test(scene) && /mevsim=0/.test(scene) && /mevsimworker\.js/.test(scene)
    && /seasonMap: \{ value: flat\(\[128, 128, 128, 0\]\) \}, useSeason: \{ value: 0 \}/.test(scene) && /world\.setSeason\(ms\)/.test(app) && /mevsimOrani\(kareler, taban\)/.test(wk));
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
