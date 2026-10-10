// Uyarlanır çizim çözünürlüğü: kare süresi sürekli yüksekse (≈ 40 kare/sn'nin altı) piksel oranı kademeli düşürülür, rahatsa geri çıkarılır.
// Retina/4K ekranlarda parça gölgelendiricisi (Dünya/Ay: bulut, okyanus, gürültü) piksel sayısıyla doğru orantılı yüklenir: 2× oran = 4× piksel.
// Saf mantık (DOM ve THREE yok): Node'da sınanır. Kullanım: her çizim karesinde tick(kareMs, şimdiMs); dönen oran null değilse uygulanır.
// Kare süresi GPU'nun gerçek maliyetini değil ekranın ritmini de yansıtır (60 Hz'de dikey eşzamanlama, iOS Düşük Güç Modu'nda 30 Hz sınırı) ve darboğaz piksel
// olmayabilir (yavaş CPU, köşe işi). Bu yüzden:
//  - düşüş: medyan > slowMs; düşüşten sonra bir sonraki pencerede kare süresi ≥ %5 iyileşmediyse darboğaz piksel DEĞİLDİR: önceki oran geri verilir ve 5 dk daha düşürülmez
//    (aksi halde hiçbir kazanç olmadan yalnız bulanıklık eklenirdi),
//  - geri çıkış: kare süresi ekran ritmine yakınsa (≤ en iyi görülen medyan × 1,12) BİR KADEME DENENİR; deneme yavaşlarsa o seviye "tavan" olarak 30 dk hatırlanır
//    (salınmaz); tavan seviyesinde kare süresi ≥ %15 düşerse (sahne hafifledi, güç tasarrufu kalktı) tavan kalkar: oran kendiliğinden geri döner, tabanda takılı kalmaz,
//  - 250 ms'den uzun kareler de (çok yavaş cihaz) ölçüme girer; yalnız > 1,5 sn'lik duraklamalar (sekme, yükleme) ölçümü sıfırlar. Medyan birkaç sıçramaya dayanıklıdır.
export class PixelGovernor {
  // max: en yüksek oran (örn. min(devicePixelRatio, 2)); min: en düşük; step: kademe; slowMs: bu kare süresinin (medyan) üstü yavaş; win: ölçüm penceresi (kare)
  constructor({ max, min = 1, step = 0.25, slowMs = 24, win = 40, stallMs = 1500 } = {}) {
    this.max = max; this.min = Math.min(min, max); this.step = step; this.slowMs = slowMs; this.win = win; this.stallMs = stallMs;
    this.r = max; this.buf = []; this.cool = 0; this.fails = 0; this.base = Infinity; this.lastChange = 0; this.lastUp = -1e12; this.ceil = max; this.ceilUntil = 0;
    this.pending = null; this.noGainUntil = 0; this.ceilMed = 0;
  }
  get active() { return this.max > this.min; }
  tick(frameMs, now) {
    if (!this.active || !(frameMs > 0)) return null;
    if (frameMs > this.stallMs) { this.buf.length = 0; return null; }                       // duraklama, sekme değişimi, yükleme: ölçüm sayılmaz
    this.buf.push(frameMs); if (this.buf.length < this.win) return null;
    const s = this.buf.slice().sort((a, b) => a - b), med = s[s.length >> 1]; this.buf.length = 0;
    this.base = Math.min(this.base, med);                                                    // en iyi görülen medyan ≈ ekran yenileme aralığı (16,7 / 8,3 / 33,3 ms)
    if (this.fails && now - this.lastChange > 600000) this.fails = 0;                        // uzun süre değişmediyse bekleme süresi sıfırlanır
    if (this.pending) {                                                                      // az önce düşürdük: işe yaradı mı?
      const p = this.pending; this.pending = null;
      if (med > this.slowMs && med > p.med * 0.95) {                                         // iyileşme yok: darboğaz piksel değil → eski oran geri, bir süre düşürme
        this.r = p.from; this.noGainUntil = now + 300000; this.lastChange = now; this.fails = Math.max(0, this.fails - 1); return this.r;
      }
      if (p.ceiling) this.ceilMed = med;                                                     // tavan seviyesindeki kare süresi: sahne hafifleyince tavan kalkar (aşağıda)
    }
    if (this.ceilMed && med < this.ceilMed * 0.85 && this.r <= this.ceil + 1e-9) { this.ceilUntil = 0; this.ceilMed = 0; }
    if (med > this.slowMs && this.r > this.min && now > this.noGainUntil) {                  // yavaş: bir kademe düş, geri çıkmadan önce bekle (her düşüşte iki kat, en çok 4 dk)
      const ceiling = now - this.lastUp < 30000;                                             // az önce yükselmiştik: o seviye taşımıyor
      if (ceiling) { this.ceil = Math.max(this.min, this.r - this.step); this.ceilUntil = now + 1800000; this.ceilMed = 0; }
      this.pending = { from: this.r, med, ceiling };
      this.r = Math.max(this.min, this.r - this.step); this.fails++; this.lastChange = now;
      this.cool = now + Math.min(240000, 15000 * 2 ** (this.fails - 1)); return this.r;
    }
    const up = this.r + this.step;
    if (this.r < this.max && now > this.cool && med <= this.base * 1.12 && (up <= this.ceil + 1e-9 || now > this.ceilUntil)) {
      this.r = Math.min(this.max, up); this.lastChange = this.lastUp = now; return this.r;   // ekran ritminde: bir kademe dene
    }
    return null;
  }
}
