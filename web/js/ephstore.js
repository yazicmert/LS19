// Parçalı JPL çekirdek deposu: de440s.bsp (32,7 MB) ve moon_pa_de440_200625.bpc (12,9 MB) yerine yalnız GEREKEN yılların Chebyshev kayıtları iner.
// Neden yeter: canlı efemeris DE440'ı yalnız başlangıç anında (et0) okur, sonrası N-cisim tümlemesidir (ephem.js); Efemeris sekmesi de görev süresince
// karşılaştırma için okur. Bir görev oturumu bu yüzden 1–2 yıllık kaydı (~120 KB/yıl) ister.
//
// Biçim (tools/efemeris_parcala.mjs üretir, data/eph/v1/):
//   index.json  çekirdek boyutları, başlık parçaları, segmentlerin kayıt düzeni, yıllık parça ızgarası (E0 + k·Y, Y = 365,25 gün)
//   head.bin    DAF dosya kaydı, özet/ad kayıtları ve her segmentin 4 sözcüklük kuyruğu (init, intlen, rsize, nrec) — kayıt verisi yok
//   y<k>.bin    k. yıl aralığına değen kayıtlar, index.json'daki segment sırasıyla art arda (Float64, küçük uçlu)
// Kayıtlar özgün dosyadaki YERLERİNE yazılır: SPKKernel/PCKKernel ve ChebSegment hiç değişmeden aynı tamponu okur, katsayılar bayt bayt aynıdır.
// Yüklenmemiş bir kayda erişim sessizce sıfır okumaz: ChebSegment.loaded denetimi hata atar (bkz. jplkernel.js).
import { SPKKernel, PCKKernel } from './jplkernel.js';

// get(yol, 'json' | 'buf') → Promise; tarayıcıda fetch, Node'da dosya okuyucu verilebilir (test/test_ephstore.js)
const fetchGet = (base) => (p, kind) => fetch(new URL(p, base)).then((r) => { if (!r.ok) throw new Error('Efemeris parçası yüklenemedi: ' + p + ' (' + r.status + ')'); return kind === 'json' ? r.json() : r.arrayBuffer(); });

// k. parça [cs, ce] aralığına değen kayıtların dizin aralığı (her iki uç dahil); değmiyorsa null. Üretici ile yükleyici AYNI işlevi kullanır.
export function recordRange(seg, cs, ce) {
  if (ce < seg.et0 || cs > seg.et1) return null;
  const clamp = (i) => Math.max(0, Math.min(seg.nrec - 1, i));
  const i0 = clamp(Math.floor((cs - seg.init) / seg.intlen)), i1 = clamp(Math.floor((ce - seg.init) / seg.intlen));
  return i1 >= i0 ? [i0, i1] : null;
}
export const chunkSpan = (ix, k) => [ix.E0 + k * ix.Y, ix.E0 + (k + 1) * ix.Y];

export class EphStore {
  // base: data/eph/v1/ klasörünün adresi (URL ya da yol); get: isteğe bağlı yükleyici
  static async open(base, get = null) {
    const g = get || fetchGet(base);
    const [ix, head] = await Promise.all([g('index.json', 'json'), g('head.bin', 'buf')]);
    return new EphStore(ix, head, g);
  }
  constructor(ix, head, get) {
    this.ix = ix; this.get = get; this.loaded = new Set(); this.pending = new Map();
    const hv = new Uint8Array(head); let hp = 0;
    this.bufs = {};
    for (const name of ['spk', 'pck']) {
      const k = ix.kernels[name], buf = new ArrayBuffer(k.size), u8 = new Uint8Array(buf);
      for (const [off, len] of k.head) { u8.set(hv.subarray(hp, hp + len), off); hp += len; }
      this.bufs[name] = buf;
    }
    this.spk = new SPKKernel(this.bufs.spk); this.pck = new PCKKernel(this.bufs.pck);
    // her segmentin ChebSegment'ine "yüklü kayıt" haritası: başlıkta tümü gelen segmentler (tek kayıtlı Merkür/Venüs barisentri) baştan yüklü
    const byStart = new Map();
    for (const s of this.spk.seg.values()) byStart.set('spk:' + (s.seg.data.byteOffset / 8 + 1), s.seg);
    for (const s of this.pck.segs) byStart.set('pck:' + (s.seg.data.byteOffset / 8 + 1), s.seg);
    this.segs = ix.segs.map((m) => {
      const cs = byStart.get(m.kernel + ':' + m.start); if (!cs) throw new Error('Efemeris dizini çekirdekle uyuşmuyor: ' + m.kernel + ' ' + m.start);
      cs.loaded = new Uint8Array(m.nrec); if (m.inHead) cs.loaded.fill(1);
      return { ...m, cheb: cs };
    });
  }
  // et (TDB s, J2000'den) için parça numarası (ızgara dışıysa sınıra çekilir)
  chunkOf(et) { return Math.max(0, Math.min(this.ix.n - 1, Math.floor((et - this.ix.E0) / this.ix.Y))); }
  chunksFor(et0, et1) { const a = this.chunkOf(Math.min(et0, et1)), b = this.chunkOf(Math.max(et0, et1)), out = []; for (let k = a; k <= b; k++) out.push(k); return out; }
  has(et0, et1 = et0) { return this.chunksFor(et0, et1).every((k) => this.loaded.has(k)); }
  // [et0, et1] aralığının kayıtlarını indir (yüklü olanlar ve süren istekler yinelenmez)
  ensure(et0, et1 = et0) { return Promise.all(this.chunksFor(et0, et1).map((k) => this.load(k))); }
  load(k) {
    if (this.loaded.has(k)) return Promise.resolve();
    let p = this.pending.get(k);
    if (!p) {
      p = this.get('y' + k + '.bin', 'buf').then((buf) => { this.apply(k, buf); this.loaded.add(k); }).finally(() => this.pending.delete(k));
      this.pending.set(k, p);
    }
    return p;
  }
  apply(k, buf) {
    const [cs, ce] = chunkSpan(this.ix, k), src = new Float64Array(buf);
    let o = 0;
    for (const s of this.segs) {
      if (s.inHead) continue;
      const r = recordRange(s, cs, ce); if (!r) continue;
      const n = (r[1] - r[0] + 1) * s.rsize, dst = new Float64Array(this.bufs[s.kernel], (s.start - 1 + r[0] * s.rsize) * 8, n);
      dst.set(src.subarray(o, o + n)); o += n;
      s.cheb.loaded.fill(1, r[0], r[1] + 1);
    }
    if (o !== src.length) throw new Error(`Efemeris parçası y${k}.bin bozuk: ${src.length} sözcük, beklenen ${o}`);
  }
}
