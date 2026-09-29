// Canlı veri güncelleyici: 10 dakikada bir /api/surum'u sorar; sürümü değişen kaynağın katmanını yeniden yükler.
// Kaynakların kendi kuralları sunucuda uygulanır (CelesTrak aynı veriyi 2 saatten sık vermez, JPL SBDB/Sentry günlük),
// bu yüzden sık denetim kaynağa yük bindirmez: çoğu denetim "değişiklik yok" ile biter.
export const CHECK_MS = 10 * 60 * 1000;

export class Updater {
  constructor(handlers) {
    this.h = handlers;                  // { gp: (v) => …, neo: (v) => …, mb: …, sentry: … }
    this.seen = {}; this.last = null; this.next = null; this.info = null; this.err = null; this.onChange = null; this.timer = null;
  }
  start() {
    this.check(true);
    this.timer = setInterval(() => this.check(false), CHECK_MS);
    document.addEventListener('visibilitychange', () => {        // sekme uzun süre arka plandaysa dönüşte hemen denetle
      if (!document.hidden && this.last && Date.now() - this.last > CHECK_MS) this.check(false);
    });
  }
  async check(first) {
    this.last = Date.now(); this.next = this.last + CHECK_MS;
    let s = null;
    try {
      const r = await fetch('api/surum', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      s = await r.json(); this.info = s; this.err = null;
    } catch (e) { this.err = 'Sürüm denetlenemedi: ' + e.message; }
    const changed = [], jobs = [];
    for (const k of Object.keys(this.h)) {
      const v = s && s.kaynaklar && s.kaynaklar[k] ? s.kaynaklar[k].surum : null;
      if (first || (v != null && v !== this.seen[k])) {
        this.seen[k] = v;
        if (!first) changed.push(k);
        jobs.push(Promise.resolve().then(() => this.h[k](v)));   // katmanlar kendi hatasını gösterir
      }
    }
    await Promise.allSettled(jobs);
    this.lastChanged = changed;
    if (this.onChange) this.onChange();
  }
  text() {
    const hm = (ms) => (ms ? new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—');
    const k = this.info && this.info.kaynaklar, age = (x) => (x && x.yas_s != null ? (x.yas_s < 5400 ? `${Math.round(x.yas_s / 60)} dk` : `${(x.yas_s / 3600).toFixed(1)} sa`) : '—');
    const lines = [`Otomatik güncelleme: 10 dakikada bir denetim · son ${hm(this.last)}, sonraki ${hm(this.next)}${this.info ? (this.info.mod === 'bulut' ? ' (bulut)' : ' (yerel sunucu)') : ''}`];
    if (k) lines.push(`Veri yaşı: uydular ${age(k.gp)}, asteroitler ${age(k.neo)}, Sentry ${age(k.sentry)}`);
    if (this.lastChanged && this.lastChanged.length) lines.push('Son denetimde yenilenen: ' + this.lastChanged.join(', '));
    if (this.err) lines.push(this.err);
    return lines;
  }
}
