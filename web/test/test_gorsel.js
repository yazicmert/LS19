// Dünya ve Ay görsellerinin doğrulaması (Node 20+): cd web && node test/test_gorsel.js
//  1) atmosfer: fiziksel tek saçılma (Rayleigh + Mie), Dünya gölgesi, önçarpımlı karışım, kamera içerideyken arka yüz; gölgelendiricinin sayısal eşi
//     (aynı katsayılar) gökyüzü maviliğini, ufkun kızıllığını ve gece tarafının karanlığını verir
//  3) görev gününün bulutları (NASA GIBS VIIRS): gün seçimi, parça adresi, mozaik boyu, zemine göre bulut çözümü, bulut gölgesi, sahne ve uygulama bağlantısı
//  2) Ay kabartma gölgesi: LOLA yükseklik alanında Güneş yönünde yürüyüş, eğrilik, yalnız alçak Güneş, yakında söner; yükseklik çözümü VS_BODY ile aynı
import { register } from 'node:module';
import { sceneSrc } from './scenesrc.js';
register('./importmap_loader.mjs', import.meta.url);
const { FS_ATM, FS_MOON, VS_BODY, FS_EARTH } = await import('../js/bodyshaders.js');
const BL = await import('../js/bulutlar.js');
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
    /vec3 a3 = \(rc - gr\) \/ \(1\.001 - gr\); float al = min\(a3\.r, min\(a3\.g, a3\.b\)\)/.test(FS_EARTH) && /pow\(max\(texture2D\(dayMap, uv\)\.rgb, vec3\(0\.0\)\), vec3\(1\.0 \/ 2\.2\)\)/.test(FS_EARTH)
    && /step\(0\.03, max\(rc\.r/.test(FS_EARTH) && /dkm = min\(6\.0 \* sqrt/.test(FS_EARTH) && /, 60\.0\)/.test(FS_EARTH) && /\(1\.0 - 0\.5 \* cShade\)/.test(FS_EARTH)
    && !/vec3\(0\.32, 0\.55, 1\.0\) \* max\(ndl \+ 0\.15/.test(FS_EARTH));
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  check('sahne ve uygulama: setRealClouds (aynı gün yeniden inmez, eski doku bırakılır, düşük bellekte seviye 2, ?bulut=0 kapatır); görev kurulunca kalkış günüyle çağrılır',
    /async setRealClouds\(ms\)/.test(scene) && /if \(gun === this\.realGun\) return true;/.test(scene) && /this\.lowMem \? 2 : 3/.test(scene) && /bulut=0/.test(scene) && /old\.dispose\(\)/.test(scene)
    && /realMap: \{ value: flat\(\[0, 0, 0, 255\]\) \}, useReal: \{ value: 0 \}/.test(scene) && /world\.setRealClouds\(E\.utcMsFromT\(S\.DESIGN\.LAUNCH\.t_launch\)\)/.test(app));
}

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
