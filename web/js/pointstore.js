// Float64 nokta deposu: iz noktaları [x, y, z] dizileri yerine tek düz dizide tutulur.
// Çizim her karede tüm noktaları "nokta − göz" olarak (yüzen başlangıç) GPU tamponuna yazar; düz dizi bunu dizi-dizi erişimine göre kat kat ucuzlatır
// ve bellek/GC yükünü azaltır. Saf JS (DOM ve THREE yok): Node'da sınanır.
export class PointStore {
  constructor(cap = 2048) { this.a = new Float64Array(cap * 3); this.n = 0; }
  get length() { return this.n; }
  push(p) {
    if ((this.n + 1) * 3 > this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const i = this.n * 3; this.a[i] = p[0]; this.a[i + 1] = p[1]; this.a[i + 2] = p[2]; this.n++;
  }
  // baştan k noktayı at (iz uzunluğu sınırı)
  dropFirst(k) { k = Math.min(k, this.n); if (k <= 0) return; this.a.copyWithin(0, k * 3, this.n * 3); this.n -= k; }
  clear() { this.n = 0; }
  at(i) { const j = i * 3; return [this.a[j], this.a[j + 1], this.a[j + 2]]; }
  // dst'ye (nokta + off − eye) yaz (ifade sırası eski diziler-dizisi kodundakiyle aynı: (p + off) − eye); yazılan nokta sayısı = n
  fillRelative(dst, off, eye) {
    const a = this.a, n = this.n * 3, o0 = off[0], o1 = off[1], o2 = off[2], e0 = eye[0], e1 = eye[1], e2 = eye[2];
    for (let i = 0; i < n; i += 3) { dst[i] = a[i] + o0 - e0; dst[i + 1] = a[i + 1] + o1 - e1; dst[i + 2] = a[i + 2] + o2 - e2; }
    return this.n;
  }
}

// Ay'la dönen (sinodik) çerçevenin eksenleri: x Dünya→Ay, z Ay'ın yörünge normali, y = z × x (rm, vm: Ay'ın Dünya merkezli konumu ve hızı)
export function synodicBasis(rm, vm) {
  const u = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ex = u(rm), ez = u(cr(rm, vm)); return [ex, cr(ez, ex), ez];
}
// Dünya merkezli noktanın sinodik koordinatları (o anki eksenlerde) ve başka bir anın eksenlerine geri taşınması
export const toSynodic = (r, B) => [0, 1, 2].map((k) => r[0] * B[k][0] + r[1] * B[k][1] + r[2] * B[k][2]);
export const fromSynodic = (s, B) => [0, 1, 2].map((k) => s[0] * B[0][k] + s[1] * B[1][k] + s[2] * B[2][k]);
