// Dünya/Ay/yıldız ana doku planı (saf veri, DOM ve THREE yok: Node'da sınanır; yükleyici texload.js).
// key  : World.build'in beklediği ad
// srgb : renk doku (sRGB) ya da veri doku (düz)
// red  : tek kanallı (R8) yükle: gölgelendirici yalnız .r okur (bulut, özyansıma); RGBA'ya göre bellek ve yükleme 4 kat az
// lo   : düşük bellekli cihazda çözülürken küçültülecek boyut [genişlik, yükseklik] (8192×4096 → 4096×2048: bellek 4 kat az)
// nearest : en yakın örnekleme, mip yok (LOLA yükseklik haritası köşe gölgelendiricisinde texelFetch ile okunur)
export const TEX = [
  { key: 'day', f: 'earth_day.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'night', f: 'earth_night.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'clouds', f: 'earth_clouds.jpg', srgb: false, red: true, lo: [4096, 2048] },
  { key: 'spec', f: 'earth_spec.png', srgb: false, red: true },
  { key: 'enorm', f: 'earth_normal.png', srgb: false },
  { key: 'mcol', f: 'moon_color.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'mnorm', f: 'moon_normal.jpg', srgb: false, lo: [2880, 1440] },
  { key: 'mh', f: 'moon_height.png', srgb: false, nearest: true },
  { key: 'stars', f: 'stars.jpg', srgb: true, lo: [4096, 2048] },
];

// Düşük bellekli cihaz mı? ?lowmem=1/0 her zaman kazanır; yoksa deviceMemory ≤ 4 GB (Chromium) ya da mobil kullanıcı aracısı.
// (≈1 GB'lık ana dokular 4 GB'lık telefonlarda sekmeyi öldürür; yakınlaştıkça gelen NASA parçaları ayrıntıyı yine verir.)
export function lowMemoryFrom({ search = '', deviceMemory = 0, ua = '' } = {}) {
  const q = new URLSearchParams(search).get('lowmem');
  if (q === '1') return true;
  if (q === '0') return false;
  return (deviceMemory > 0 && deviceMemory <= 4) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}
