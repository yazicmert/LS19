// KTX2 dosya başlığı okuyucu (saf JS; tools/doku_ktx2.mjs ve test/test_ktx2.js kullanır). Belirtim: KHR KTX 2.0, Khronos Data Format 1.3.
// Döner: { vkFormat, width, height, layers, faces, levels, scheme, model, transfer, srgb, flags, levelIndex: [{ off, len, raw }], kv: { anahtar: değer } }
//   scheme: üstsıkıştırma (0 yok, 1 BasisLZ/ETC1S, 2 Zstandard), model: DFD renk modeli (163 ETC1S, 166 UASTC), transfer: 1 doğrusal, 2 sRGB
export const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
export const MODEL = { ETC1S: 163, UASTC: 166 };

export function parseKtx2(u8) {
  if (!(u8 instanceof Uint8Array) || u8.length < 80 || KTX2_ID.some((b, i) => u8[i] !== b)) throw new Error('KTX2 değil (tanımlayıcı tutmuyor)');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), u32 = (o) => dv.getUint32(o, true), u64 = (o) => Number(dv.getBigUint64(o, true));
  const h = {
    vkFormat: u32(12), width: u32(20), height: u32(24), layers: u32(32), faces: u32(36), levels: u32(40), scheme: u32(44),
  };
  const dfdOff = u32(48), dfdLen = u32(52), kvdOff = u32(56), kvdLen = u32(60);
  if (80 + Math.max(1, h.levels) * 24 > u8.length || dfdOff + dfdLen > u8.length || kvdOff + kvdLen > u8.length) throw new Error('KTX2 dizini dosya dışına taşıyor');
  h.levelIndex = [];
  for (let i = 0; i < Math.max(1, h.levels); i++) {
    const o = 80 + i * 24, l = { off: u64(o), len: u64(o + 8), raw: u64(o + 16) };
    if (l.off + l.len > u8.length) throw new Error(`KTX2 düzey ${i} dosya dışına taşıyor`);
    h.levelIndex.push(l);
  }
  // DFD: toplam boyut (4), satıcı/tür (4), sürüm (2), blok boyu (2), renk modeli, renk temelleri, aktarım işlevi, bayraklar
  h.model = u8[dfdOff + 12]; h.primaries = u8[dfdOff + 13]; h.transfer = u8[dfdOff + 14]; h.flags = u8[dfdOff + 15];
  h.srgb = h.transfer === 2;
  h.kv = {};
  for (let o = kvdOff; o + 4 <= kvdOff + kvdLen;) {
    const n = u32(o), b = u8.subarray(o + 4, o + 4 + n), z = b.indexOf(0);
    if (z > 0) h.kv[new TextDecoder().decode(b.subarray(0, z))] = new TextDecoder().decode(b.subarray(z + 1)).replace(/\0+$/, '');
    o += 4 + n + ((4 - (n % 4)) % 4);
  }
  return h;
}

// tam mip zinciri düzey sayısı (en büyük kenar 1 olana dek)
export const fullMipLevels = (w, h) => Math.floor(Math.log2(Math.max(w, h))) + 1;
