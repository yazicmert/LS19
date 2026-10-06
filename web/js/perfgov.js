// Uyarlanır çizim çözünürlüğü: kare süresi sürekli yüksekse (≈ 40 kare/sn'nin altı) piksel oranı kademeli düşürülür, rahatsa geri çıkarılır.
// Retina/4K ekranlarda parça gölgelendiricisi (Dünya/Ay: bulut, okyanus, gürültü) piksel sayısıyla doğru orantılı yüklenir: 2× oran = 4× piksel.
// Saf mantık (DOM ve THREE yok): Node'da sınanır. Kullanım: her çizim karesinde tick(kareMs, şimdiMs); dönen oran null değilse uygulanır.
// Salınmaz: geri çıkış (1) bekleme süresi dolmadan, (2) kare süresi ekran hızına yakınken, (3) kestirilen yeni süre (≈ oran²) yavaş eşiğinin altında kalıyorsa yapılır;
// yine de yükselince yavaşlarsa o seviye "tavan" olarak 30 dk hatırlanır.
export class PixelGovernor {
  // max: en yüksek oran (örn. min(devicePixelRatio, 2)); min: en düşük; step: kademe; slowMs: bu kare süresinin (medyan) üstü yavaş; win: ölçüm penceresi (kare)
  constructor({ max, min = 1, step = 0.25, slowMs = 24, win = 40 } = {}) {
    this.max = max; this.min = Math.min(min, max); this.step = step; this.slowMs = slowMs; this.win = win;
    this.r = max; this.buf = []; this.cool = 0; this.fails = 0; this.base = Infinity; this.lastChange = 0; this.lastUp = -1e12; this.ceil = max; this.ceilUntil = 0;
  }
  get active() { return this.max > this.min; }
  tick(frameMs, now) {
    if (!this.active) return null;
    if (!(frameMs > 0) || frameMs > 250) { this.buf.length = 0; return null; }              // duraklama, sekme değişimi, yükleme: ölçüm sayılmaz
    this.buf.push(frameMs); if (this.buf.length < this.win) return null;
    const s = this.buf.slice().sort((a, b) => a - b), med = s[s.length >> 1]; this.buf.length = 0;
    this.base = Math.min(this.base, med);                                                    // en iyi görülen medyan ≈ ekran yenileme aralığı (16,7 / 8,3 ms)
    if (this.fails && now - this.lastChange > 600000) this.fails = 0;                        // uzun süre değişmediyse bekleme süresi sıfırlanır
    if (med > this.slowMs && this.r > this.min) {                                            // yavaş: bir kademe düş, geri çıkmadan önce bekle (her düşüşte iki kat, en çok 4 dk)
      if (now - this.lastUp < 30000) { this.ceil = Math.max(this.min, this.r - this.step); this.ceilUntil = now + 1800000; }   // az önce yükselmiştik: o seviye taşımıyor
      this.r = Math.max(this.min, this.r - this.step); this.fails++; this.lastChange = now;
      this.cool = now + Math.min(240000, 15000 * 2 ** (this.fails - 1)); return this.r;
    }
    const up = this.r + this.step, pred = med * (up / this.r) ** 2;                          // doldurma oranına bağlı sahnede süre ≈ oran²
    if (this.r < this.max && now > this.cool && med <= this.base * 1.12 && pred < this.slowMs * 0.92 && (up <= this.ceil + 1e-9 || now > this.ceilUntil)) {
      this.r = Math.min(this.max, up); this.lastChange = this.lastUp = now; return this.r;   // ekran hızında ve bol pay var: bir kademe yüksel
    }
    return null;
  }
}
