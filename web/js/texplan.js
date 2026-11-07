// Dünya/Ay/yıldız ana doku planı (saf veri, DOM ve THREE yok: Node'da sınanır; yükleyici texload.js).
// key  : World.build'in beklediği ad
// f    : ana dosya (WebP; tools/doku_webp.py üretir: veri haritaları kayıpsız, fotoğraf dokuları kalite 90, PSNR ≥ 40 dB)
// flo  : önceden "lo" boyutuna küçültülmüş dosya. Her cihaz ilk yüklemede bunu indirir (ilk görüntü ~3 kat erken); düşük bellekli cihaz
//        bununla kalır, masaüstü tam çözünürlüğü (f) sonra alır: Dünya ve yıldızlar hemen ardından, Ay kamera yaklaşınca (scene.js upgradeTextures)
// fb   : yedek (özgün JPG/PNG): tarayıcı WebP'yi çözemezse bu indirilir
// srgb : renk doku (sRGB) ya da veri doku (düz)
// red  : tek kanallı (R8) yükle: gölgelendirici yalnız .r okur (bulut, özyansıma); RGBA'ya göre bellek ve yükleme 4 kat az
// lo   : düşük bellekli cihazda kullanılacak boyut [genişlik, yükseklik] (8192×4096 → 4096×2048: bellek 4 kat az)
// nearest : en yakın örnekleme, mip yok (LOLA yükseklik haritası köşe gölgelendiricisinde texelFetch ile okunur)
export const TEX = [
  { key: 'day', f: 'earth_day.webp', flo: 'earth_day_lo.webp', fb: 'earth_day.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'night', f: 'earth_night.webp', flo: 'earth_night_lo.webp', fb: 'earth_night.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'clouds', f: 'earth_clouds.webp', flo: 'earth_clouds_lo.webp', fb: 'earth_clouds.jpg', srgb: false, red: true, lo: [4096, 2048] },
  { key: 'spec', f: 'earth_spec.webp', fb: 'earth_spec.png', srgb: false, red: true },
  { key: 'enorm', f: 'earth_normal.webp', fb: 'earth_normal.png', srgb: false },
  { key: 'mcol', f: 'moon_color.webp', flo: 'moon_color_lo.webp', fb: 'moon_color.jpg', srgb: true, lo: [4096, 2048] },
  { key: 'mnorm', f: 'moon_normal.webp', flo: 'moon_normal_lo.webp', fb: 'moon_normal.jpg', srgb: false, lo: [2880, 1440] },
  { key: 'mh', f: 'moon_height.webp', flo: 'moon_height_lo.webp', fb: 'moon_height.png', srgb: false, nearest: true, lo: [1440, 720] },      // _lo: yükseklik alanında 2×2 ortalama (tools/doku_webp.py)
  { key: 'stars', f: 'stars.webp', flo: 'stars_lo.webp', fb: 'stars.jpg', srgb: true, lo: [4096, 2048] },
];
// tam çözünürlüğe yükseltme grupları (masaüstü): Dünya ve yıldızlar ilk görüntüden hemen sonra, Ay kamera yaklaşınca
export const UPGRADE = { earth: ['day', 'night', 'clouds', 'stars'], moon: ['mcol', 'mnorm', 'mh'] };
// indirilecek dosya ve çözme planı: düşük bellekte (ve her cihazın ilk yüklemesinde) önceden küçültülmüş dosya (çözerken yeniden küçültme gerekmez:
// lo boşaltılır); yedekte özgün dosya + cihazda küçültme. Veri haritası (nearest: paketli 16 bit yükseklik) cihazda küçültülmez: ortalama değeri bozar.
export function fileFor(s, lowmem, fallback = false) {
  if (fallback) return { file: s.fb || s.f, spec: s.nearest ? { ...s, lo: null } : s };
  if (lowmem && s.flo) return { file: s.flo, spec: { ...s, lo: null } };
  return { file: s.f, spec: s };
}

// Düşük bellekli cihaz mı? ?lowmem=1/0 her zaman kazanır; yoksa deviceMemory ≤ 4 GB (Chromium) ya da mobil kullanıcı aracısı.
// (≈1 GB'lık ana dokular 4 GB'lık telefonlarda sekmeyi öldürür; yakınlaştıkça gelen NASA parçaları ayrıntıyı yine verir.)
export function lowMemoryFrom({ search = '', deviceMemory = 0, ua = '' } = {}) {
  const q = new URLSearchParams(search).get('lowmem');
  if (q === '1') return true;
  if (q === '0') return false;
  return (deviceMemory > 0 && deviceMemory <= 4) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}
