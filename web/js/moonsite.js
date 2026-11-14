// Ay iniş yerleri (saf veri + Ay'a bağlı çerçeveden ICRF'ye dönüşüm). Görev tasarımı (design.js), fizik (mission.js: her Mission örneği kendi yerini
// tasarımdan alır) ve görüntü (scene.js, kamera, telemetri) aynı çözücüyü kullanır: siteOf(design) ya da siteOf(id).
// Koordinatlar (ortalama Dünya yönü / Ay'ın asal eksenleri, derece; LRO ölçümleri): Wikipedia görev sayfalarının "Lunar lander › Landing site" satırı
// (Apollo 12: Ocean of Storms, 14: Fra Mauro, 15: Hadley–Apennine, 16: Descartes Highlands, 17: Taurus–Littrow; kullanıcının ilettiği ekran görüntüleri, Kasım 2026).
// Yerel yarıçap: Apollo 11'de ölçülmüş değer (1735,47 km; arazi: LOLA 16 ppd yaması data/site_dem.json). Öteki yerlerde 1737,4 km + depodaki küresel LOLA
// dokusundan (textures/moon_height.png, 8 ppd; Ay küresi bu dokuyla çizilir) iniş noktasında çift doğrusal yükseklik; arazi yaması aynı dokudan
// (data/site_dems.json, tools/ay_yerleri.py). Doku eşlemesi Apollo 11'de ölçülmüş yamayla doğrulandı (korelasyon 0,9986; iniş noktasında 88 m fark:
// öteki yerlerin yarıçap hata payı ≈ ±0,1 km). test_moonsite.js yarıçapların dosyadaki h_site ile aynı kaldığını denetler.
import * as E from './engine.js';
import { scale, mtv } from './vec3.js';

export const DEFAULT_SITE = 'A11';
const SRC_DEM = 'LOLA 16 ppd yaması (ölçülmüş)', SRC_TEX = 'LOLA küresel doku, 8 ppd (≈ ±0,1 km)';
export const LUNAR_SITES = {
  A11: { name: 'Apollo 11 · Huzur Denizi', lat: 0.67409, lon: 23.47298, r: 1735.47, src: SRC_DEM, dem: 'site_dem.json' },
  A12: { name: 'Apollo 12 · Fırtınalar Okyanusu', lat: -3.01239, lon: -23.42157, r: 1735.873, src: SRC_TEX, dem: 'site_dems.json' },
  A14: { name: 'Apollo 14 · Fra Mauro', lat: -3.64530, lon: -17.47136, r: 1736.264, src: SRC_TEX, dem: 'site_dems.json' },
  A15: { name: 'Apollo 15 · Hadley–Apennine', lat: 26.1322, lon: 3.6339, r: 1735.361, src: SRC_TEX, dem: 'site_dems.json' },
  A16: { name: 'Apollo 16 · Descartes Dağlık Bölgesi', lat: -8.97301, lon: 15.50019, r: 1737.328, src: SRC_TEX, dem: 'site_dems.json' },
  A17: { name: 'Apollo 17 · Taurus–Littrow', lat: 20.1908, lon: 30.7717, r: 1734.692, src: SRC_TEX, dem: 'site_dems.json' },
};
// tasarım aydınlanma penceresini saatlik tarar (design.js findLandingWindow): kutup bölgeleri desteklenmez
export const MAX_SITE_LAT = 30;
export const validSite = (id) => (Object.hasOwn(LUNAR_SITES, id) && Math.abs(LUNAR_SITES[id].lat) <= MAX_SITE_LAT ? id : DEFAULT_SITE);

// görevin efemeris penceresi (gün, başlangıçtan): Apollo 11 dışındaki yerlerde tasarım iki sonraki aydınlanma penceresini deneyebilir (design.js, en çok
// +59 gün) ve halo görevleri ~1 ay sürer: 200 gün. Varsayılan yerde 120 gün (eskisi gibi). x: tasarım (MOONSITE) ya da yapılandırma (moonSite)
export const ephSpanDays = (x) => (x && ((x.MOONSITE && x.MOONSITE !== DEFAULT_SITE) || (x.moonSite && validSite(x.moonSite) !== DEFAULT_SITE)) ? 200 : 120);

const cache = new Map();
// id ya da tasarım ({ MOONSITE }) → { id, name, lat, lon (rad), latDeg, lonDeg, r (km), src (yarıçap kaynağı), dem (arazi dosyası), me (birim, Ay'a bağlı), icrf(t) (km, Ay merkezli ICRF) }
export function siteOf(x) {
  const id = validSite(typeof x === 'string' ? x : x && x.MOONSITE ? x.MOONSITE : DEFAULT_SITE);
  if (cache.has(id)) return cache.get(id);
  const S = LUNAR_SITES[id], lat = S.lat * Math.PI / 180, lon = S.lon * Math.PI / 180;
  const me = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)], r = S.r;
  const o = { id, name: S.name, lat, lon, latDeg: S.lat, lonDeg: S.lon, r, src: S.src, dem: S.dem, me, icrf: (t) => scale(mtv(E.moonIcrfToMe(t), me), r) };
  cache.set(id, o); return o;
}

// ana iş parçacığının görüntülediği yer (sahne, kamera, telemetri, HUD): tek yerde, app.js görev hazır olunca (ready) setViewSite(tasarım) ile günceller.
// İş parçacıkları bunu kullanmaz: her Mission yerini kendi tasarımından alır.
export const VIEW = { site: siteOf(DEFAULT_SITE) };
export function setViewSite(x) { VIEW.site = siteOf(x); return VIEW.site; }
