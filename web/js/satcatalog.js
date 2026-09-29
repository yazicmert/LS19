// Gerçek 3B modeli olan uydular: NORAD numarası / ad kalıbı -> NASA 3D Resources modeli (saf veri; tarayıcı ve Node)
// size: gerçek en uzun boyut (m, açılmış paneller dahil, yaklaşık) · note: aynı tasarımdaki kardeş uydular için açıklama
export const MODELS = {
  iss:       { title: 'Uluslararası Uzay İstasyonu', size: 109, rot: [0, Math.PI / 2, 0] },   // kafes (truss) yörünge normali boyunca, modüller uçuş yönünde
  hubble:    { title: 'Hubble Uzay Teleskobu', size: 13.2 },
  aqua:      { title: 'Aqua (EOS PM-1)', size: 16.7 },
  terra:     { title: 'Terra (EOS AM-1)', size: 17 },
  aura:      { title: 'Aura (EOS CH-1)', size: 17 },
  chandra:   { title: 'Chandra X-ışını Gözlemevi', size: 19.5 },
  fermi:     { title: 'Fermi Gama Işını Teleskobu', size: 14 },
  swift:     { title: 'Neil Gehrels Swift', size: 5.6 },
  gpm:       { title: 'GPM Core Observatory', size: 13 },
  icesat2:   { title: 'ICESat-2', size: 7.5 },
  landsat8:  { title: 'Landsat 8', size: 10 },
  sentinel6: { title: 'Sentinel-6 Michael Freilich', size: 5.3 },
  oco2:      { title: 'OCO-2', size: 7 },
  npp:       { title: 'Suomi NPP', size: 9 },
  sdo:       { title: 'Solar Dynamics Observatory', size: 6.25 },
  tess:      { title: 'TESS', size: 4 },
  hinode:    { title: 'Hinode (Solar-B)', size: 6 },
  cygnss:    { title: 'CYGNSS', size: 1.7 },
  mms:       { title: 'Magnetospheric Multiscale', size: 3.5 },
  themis:    { title: 'THEMIS / ARTEMIS', size: 7 },
  tdrs1:     { title: 'TDRS (1. kuşak)', size: 17.4 },
  tdrs3:     { title: 'TDRS (3. kuşak, K–M)', size: 21 },
  goes:      { title: 'GOES-R serisi', size: 11 },
  grace:     { title: 'GRACE', size: 3.1 },
  jason:     { title: 'Jason-2 (OSTM)', size: 3.8 },
  lro:       { title: 'Lunar Reconnaissance Orbiter', size: 5 },
};
const BY_ID = {
  25544: 'iss', 20580: 'hubble', 27424: 'aqua', 25994: 'terra', 28376: 'aura', 25867: 'chandra', 33053: 'fermi', 28485: 'swift',
  39574: 'gpm', 43613: 'icesat2', 39084: 'landsat8', 49260: ['landsat8', 'Landsat 9 — Landsat 8 ile aynı tasarım'],
  46984: 'sentinel6', 40059: 'oco2', 37849: 'npp', 43013: ['npp', 'NOAA-20 — Suomi NPP ile aynı gövde'], 54234: ['npp', 'NOAA-21 — Suomi NPP ile aynı gövde'],
  36395: 'sdo', 43435: 'tess', 29479: 'hinode', 41240: ['jason', 'Jason-3 — Jason-2 ile aynı Proteus gövdesi'],
};
const BY_NAME = [
  [/^SENTINEL-6/, 'sentinel6', 'Sentinel-6 ikizi'],
  [/^CYGFM\d/, 'cygnss', null],
  [/^MMS \d/, 'mms', null],
  [/^THEMIS [A-E]$/, 'themis', null],
  [/^TDRS ([3-9]|10)$/, 'tdrs1', null],
  [/^TDRS 1[1-3]$/, 'tdrs3', null],
  [/^GOES 1[6-9]$/, 'goes', null],
  [/^GRACE-FO/, 'grace', 'GRACE-FO — öncül GRACE modeli (benzer gövde)'],
];
// Ay uyduları (Horizons): LRO ve ARTEMIS P1/P2 (THEMIS B/C)
export const MOON_MODELS = { LRO: 'lro', 'ARTEMIS P1': 'themis', 'ARTEMIS P2': 'themis' };

export function modelFor(id, name = '') {
  let e = BY_ID[+id], note = null;
  if (Array.isArray(e)) { note = e[1]; e = e[0]; }
  if (!e) for (const [re, k, n] of BY_NAME) if (re.test(name)) { e = k; note = n; break; }
  return e ? { key: e, ...MODELS[e], note } : null;
}
// görünür olacağı en büyük kamera uzaklığı (km): büyük yapılar daha uzaktan
export const showDist = (key) => Math.max(1.5, MODELS[key].size * 0.15);

