// Gerçek 3B modeli olan uydular: NORAD numarası / ad kalıbı -> NASA modeli (saf veri; tarayıcı ve Node)
// Kaynaklar (src): 'nasa3d' NASA 3D Resources (github.com/nasa/NASA-3D-Resources, "free and without copyright");
//                  'eyes'   NASA Eyes on the Earth (eyes.nasa.gov, NASA/JPL-Caltech görselleştirme modelleri; NASA medya yönergeleri)
// Dönüştürme: tools/uydu_modelleri.mjs (liste: uydu_modelleri.txt, uydu_modelleri_eyes.txt)
// size: gerçek en uzun boyut (m, açılmış paneller ve antenler dahil, yaklaşık) · note: aynı tasarımdaki kardeş uydular için açıklama
// rot: model eksenlerini sahneye (Y başucu, Z uçuş yönü) çeviren Euler XYZ (rad). Eyes modellerinde Eyes'ın kendi 'align' tanımından
//      (Dünya'ya bakan eksen, uçuş yönündeki eksen) hesaplandı: alet yüzleri Dünya'ya bakar
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
  ssl1300:   { title: 'SSL-1300 ticari GEO platformu', size: 30, rot: [0, 0, 0] },
  swas:      { title: 'SWAS (Submillimeter Wave Astronomy Satellite)', size: 3 },
  sorce:     { title: 'SORCE', size: 4 },
  // NASA Eyes on the Earth (size: model ölçüsü, metre; NuSTAR ve ACS3 kaynaktaki gerçek ölçüyle)
  swot:      { title: 'SWOT', size: 14.3, src: 'eyes', rot: [-Math.PI, 0, -Math.PI] },
  nisar:     { title: 'NISAR', size: 14.3, src: 'eyes', rot: [0, 0, 0] },
  pace:      { title: 'PACE', size: 7, src: 'eyes', rot: [0, Math.PI / 2, 0] },
  smap:      { title: 'SMAP', size: 9.5, src: 'eyes', rot: [0, -Math.PI / 2, 0] },
  nustar:    { title: 'NuSTAR', size: 10.9, src: 'eyes' },
  ixpe:      { title: 'IXPE', size: 5.2, src: 'eyes' },
  spherex:   { title: 'SPHEREx', size: 3.3, src: 'eyes', rot: [0, 0, 0] },
  starling:  { title: 'Starling (6U)', size: 1.4, src: 'eyes', rot: [0, -Math.PI / 2, 0] },
  prefire:   { title: 'PREFIRE (6U)', size: 1.1, src: 'eyes', rot: [0, -Math.PI / 2, 0] },
  acs3:      { title: 'ACS3 güneş yelkeni', size: 12.7, src: 'eyes', rot: [-Math.PI / 2, 0, 0] },
  tempo:     { title: 'Intelsat 40e (TEMPO)', size: 19.5, src: 'eyes', rot: [0, 0, -Math.PI] },
  landsat9:  { title: 'Landsat 9', size: 17.5, src: 'eyes', rot: [Math.PI, Math.PI / 2, 0] },
  noaa20:    { title: 'NOAA-20 (JPSS-1)', size: 11.2, src: 'eyes', rot: [-Math.PI, 0, 0] },
  noaa21:    { title: 'NOAA-21 (JPSS-2)', size: 10.6, src: 'eyes', rot: [-Math.PI, 0, 0] },
  gracefo:   { title: 'GRACE-FO', size: 3.25, src: 'eyes', rot: [0, 0, 0] },
  polar:     { title: 'Polar', size: 142, src: 'eyes', rot: [0, 0, 0] },
  image:     { title: 'IMAGE', size: 502, src: 'eyes', rot: [Math.PI / 2, 0, Math.PI / 2] },
};
// model kaynağının kısa adı (bilgi kartı)
export const SRC_TITLE = { nasa3d: 'NASA 3D Resources', eyes: 'NASA Eyes on the Earth' };
export const srcOf = (m) => SRC_TITLE[(m && m.src) || 'nasa3d'];
const BY_ID = {
  25544: 'iss', 20580: 'hubble', 27424: 'aqua', 25994: 'terra', 28376: 'aura', 25867: 'chandra', 33053: 'fermi', 28485: 'swift',
  39574: 'gpm', 43613: 'icesat2', 39084: 'landsat8', 49260: 'landsat9',
  46984: 'sentinel6', 40059: 'oco2', 37849: 'npp', 43013: 'noaa20', 54234: 'noaa21',
  54754: 'swot', 65053: 'nisar', 58928: 'pace', 40376: 'smap', 38358: 'nustar', 49954: 'ixpe', 63182: 'spherex',
  57386: 'starling', 57387: 'starling', 57388: 'starling', 57389: 'starling', 59881: 'prefire', 59965: 'prefire', 59588: 'acs3',
  56174: ['tempo', 'Intelsat 40e — NASA TEMPO hava kirliliği aletini taşıyan yer eşzamanlı uydu'], 43476: 'gracefo', 43477: 'gracefo', 23802: 'polar', 26113: 'image',
  36395: 'sdo', 25560: 'swas', 27651: 'sorce', 43435: 'tess', 29479: 'hinode', 41240: ['jason', 'Jason-3 — Jason-2 ile aynı Proteus gövdesi'],
};
const BY_NAME = [
  [/^SENTINEL-6/, 'sentinel6', 'Sentinel-6 ikizi'],
  [/^CYGFM\d/, 'cygnss', null],
  [/^MMS \d/, 'mms', null],
  [/^THEMIS [A-E]$/, 'themis', null],
  [/^TDRS ([3-9]|10)$/, 'tdrs1', null],
  [/^TDRS 1[1-3]$/, 'tdrs3', null],
  [/^GOES 1[6-9]$/, 'goes', null],
  [/^(INTELSAT|SES-|ASTRA|EUTELSAT|ECHOSTAR|GALAXY|TELSTAR|ANIK|AMC-|DIRECTV|SIRIUS|SKYNET|NILESAT|YAHSAT|INMARSAT)/, 'ssl1300', 'SSL-1300 sınıfı ticari GEO platformunun temsili modeli — bu uydunun kendi modeli yayımlanmamıştır'],
  [/^GRACE-FO/, 'gracefo', null],
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

