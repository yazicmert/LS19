// Uydu aileleri: gerçek bir 3B modeli yayımlanmamış uydular için ad ve yörüngeye göre temsili model ailesi (saf veri; tarayıcı ve Node).
// Modeller tools/uydu_aileleri.py ile Blender'da üretilir (web/models/fam/<anahtar>.glb); boyutlar yayımlanmış yaklaşık değerlerdir.
// Gerçek (NASA) modeli olan uydular satcatalog.js'tedir; orada olmayan her uydu bir aileye düşer.
export const FAMILIES = {
  starlink_v1: { title: 'Starlink v1/v1.5', note: 'düz panel gövde, tek güneş dizisi (~2,8 × 1,4 m gövde, ~8 m dizi)' },
  starlink_v2: { title: 'Starlink v2 mini', note: 'büyük düz panel gövde, iki güneş dizisi (~4 × 2,7 m gövde, ~30 m açıklık)' },
  oneweb:      { title: 'OneWeb', note: 'küp gövde ve iki güneş paneli (~1 m gövde)' },
  kuiper:      { title: 'Amazon Kuiper', note: 'düz gövde ve tek güneş dizisi' },
  flatsat:     { title: 'Düz panelli megakonstelasyon uydusu', note: 'Qianfan / Guowang / Hulianwang sınıfı, temsili' },
  iridium:     { title: 'Iridium NEXT', note: 'üçgen kesitli gövde, üç ana anten, iki panel' },
  globalstar:  { title: 'Globalstar', note: 'kutu gövde ve iki panel' },
  gnss:        { title: 'Seyrüsefer uydusu', note: 'GPS / Galileo / BeiDou / GLONASS sınıfı: dikdörtgen gövde, iki uzun dizi, nadir L-bant dizisi' },
  geo:         { title: 'Yer eşzamanlı haberleşme uydusu', note: 'kutu gövde, iki uzun dizi, iki reflektör' },
  cubesat:     { title: 'CubeSat (3U)', note: '10 × 10 × 34 cm ve açılmış paneller' },
  microsat:    { title: 'Küçük uydu', note: '~100–300 kg sınıfı' },
  bus:         { title: 'Genel uydu gövdesi', note: 'yer gözlem / bilimsel / askerî uydular için temsili gövde ve iki panel' },
};
export const FAMILY_KEYS = Object.keys(FAMILIES);
export const FAMILY_DIR = 'models/fam/';

const BY_NAME = [
  [/^STARLINK-(\d+)/, (m) => (+m[1] >= 30000 ? 'starlink_v2' : 'starlink_v1')],
  [/^STARLINK/, () => 'starlink_v2'],                                       // STARLINK-DTC vb.
  [/^ONEWEB/, 'oneweb'],
  [/^KUIPER/, 'kuiper'],
  [/^(QIANFAN|HULIANWANG|GUOWANG|SPACESAIL)/, 'flatsat'],
  [/^IRIDIUM/, 'iridium'],
  [/^GLOBALSTAR/, 'globalstar'],
  [/NAVSTAR|GPS|GLONASS|GALILEO|GSAT0[12]\d\d|BEIDOU|QZS|IRNSS|NAVIC/, 'gnss'],
  [/^(FLOCK|LEMUR|DOVE|SWARM|KINEIS|CENTISPACE|ASTROCAST|HAWK|CUBE|TEVEL|BRO-|SPIRE|ARKYD|NAYIF|ELFIN|LIGHTSAIL)/, 'cubesat'],
  [/^(ORBCOMM|ICEYE|SKYSAT|NUSAT|GEESAT|SITRO|TIANQI|CONNECTA|TIANMU|SDA_|PRAETORIAN|YAM|STRIX|SPACEMOBILE|QPS|AETHER|APRIZESAT|TOMORROW)/, 'microsat'],
];

// o: CelesTrak GP kaydı (OBJECT_NAME, MEAN_MOTION, ECCENTRICITY) -> aile anahtarı
export function familyOf(o) {
  const n = o.OBJECT_NAME || '', mm = +o.MEAN_MOTION;
  for (const [re, k] of BY_NAME) { const m = re.exec(n); if (m) return typeof k === 'function' ? k(m) : k; }
  if (mm > 0.95 && mm < 1.05 && +o.ECCENTRICITY < 0.05) return 'geo';
  return 'bus';
}
