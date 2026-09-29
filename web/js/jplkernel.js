// JPL DAF (SPK / ikili PCK) okuyucu — tip 2 Chebyshev segmentleri. Tarayıcıda ve Node'da çalışır.
// SPK: konum (km) ve hız (km/s); PCK: Ay asal eksen (PA) Euler açıları 3-1-3 (rad) ve türevleri (rad/s).
// Zaman: ET = TDB saniye, J2000'den (JD 2451545.0 TDB).

export class DAF {
  constructor(buffer) {
    this.buf = buffer;
    const dv = new DataView(buffer);
    const id = new TextDecoder().decode(new Uint8Array(buffer, 0, 8));
    const fmt = new TextDecoder().decode(new Uint8Array(buffer, 88, 8));
    if (!/^DAF\//.test(id)) throw new Error('DAF dosyası değil: ' + id);
    if (fmt !== 'LTL-IEEE') throw new Error('Yalnız küçük-uçlu (LTL-IEEE) çekirdekler destekleniyor: ' + fmt);
    this.kind = id.trim();
    this.nd = dv.getInt32(8, true); this.ni = dv.getInt32(12, true);
    let rec = dv.getInt32(76, true);
    const ss = this.nd + Math.floor((this.ni + 1) / 2);
    this.segments = [];
    while (rec > 0) {
      const base = (rec - 1) * 1024;
      const next = dv.getFloat64(base, true), nsum = dv.getFloat64(base + 16, true);
      for (let i = 0; i < nsum; i++) {
        const o = base + 24 + i * ss * 8;
        const d = [], n = [];
        for (let k = 0; k < this.nd; k++) d.push(dv.getFloat64(o + k * 8, true));
        for (let k = 0; k < this.ni; k++) n.push(dv.getInt32(o + this.nd * 8 + k * 4, true));
        this.segments.push({ d, n });
      }
      rec = next;
    }
  }
}

class ChebSegment {
  // start/end: 1-tabanlı çift kelime adresleri
  constructor(buf, start, end, ncomp) {
    this.data = new Float64Array(buf, (start - 1) * 8, end - start + 1);
    const L = this.data.length;
    this.init = this.data[L - 4]; this.intlen = this.data[L - 3]; this.rsize = this.data[L - 2]; this.nrec = this.data[L - 1];
    this.ncomp = ncomp; this.ncoef = (this.rsize - 2) / ncomp;
    this.T = new Float64Array(this.ncoef); this.dT = new Float64Array(this.ncoef);
  }
  eval(et, withRate = true) {
    let i = Math.floor((et - this.init) / this.intlen);
    if (i < 0) i = 0; if (i >= this.nrec) i = this.nrec - 1;
    const o = i * this.rsize, mid = this.data[o], rad = this.data[o + 1];
    const x = (et - mid) / rad, n = this.ncoef, T = this.T, dT = this.dT;
    T[0] = 1; T[1] = x; dT[0] = 0; dT[1] = 1;
    for (let k = 2; k < n; k++) { T[k] = 2 * x * T[k - 1] - T[k - 2]; dT[k] = 2 * T[k - 1] + 2 * x * dT[k - 1] - dT[k - 2]; }
    const p = [0, 0, 0], v = [0, 0, 0];
    for (let c = 0; c < this.ncomp; c++) {
      const base = o + 2 + c * n; let s = 0, sd = 0;
      for (let k = 0; k < n; k++) { const a = this.data[base + k]; s += a * T[k]; if (withRate) sd += a * dT[k]; }
      p[c] = s; v[c] = sd / rad;
    }
    return [p, v];
  }
}

// SPK: gövde durumları (Güneş sistemi barisentrine göre)
export class SPKKernel {
  constructor(buffer) {
    const daf = new DAF(buffer);
    this.seg = new Map();
    for (const s of daf.segments) {
      const [target, center, frame, type, start, end] = s.n;
      if (type !== 2) continue;
      this.seg.set(center + '>' + target, { seg: new ChebSegment(buffer, start, end, 3), et0: s.d[0], et1: s.d[1] });
    }
  }
  has(center, target) { return this.seg.has(center + '>' + target); }
  rel(center, target, et) {
    const s = this.seg.get(center + '>' + target);
    if (!s) throw new Error(`SPK segmenti yok: ${center} -> ${target}`);
    if (et < s.et0 || et > s.et1) throw new Error('Tarih çekirdek aralığı dışında (1849–2150)');
    return s.seg.eval(et);
  }
  // SSB'ye göre konum/hız: 0 (SSB), 1..9 barisentrler, 10 Güneş, 199, 299, 399 Dünya, 301 Ay
  ssb(body, et) {
    if (body === 0) return [[0, 0, 0], [0, 0, 0]];
    if (body <= 10) return this.rel(0, body, et);
    const bary = Math.floor(body / 100);
    const [pb, vb] = this.rel(0, bary, et), [p, v] = this.rel(bary, body, et);
    return [[pb[0] + p[0], pb[1] + p[1], pb[2] + p[2]], [vb[0] + v[0], vb[1] + v[1], vb[2] + v[2]]];
  }
}

// İkili PCK: Ay PA Euler açıları (φ, θ, ψ) ve türevleri
export class PCKKernel {
  constructor(buffer) {
    const daf = new DAF(buffer);
    this.segs = [];
    for (const s of daf.segments) {
      const [body, frame, type, start, end] = s.n;
      if (type !== 2) continue;
      this.segs.push({ body, frame, seg: new ChebSegment(buffer, start, end, 3), et0: s.d[0], et1: s.d[1] });
    }
  }
  angles(et) {
    const s = this.segs.find((q) => et >= q.et0 && et <= q.et1);
    if (!s) throw new Error('Tarih Ay yönelim çekirdeği aralığı dışında');
    return s.seg.eval(et);
  }
}
