// Sanal saat (kare kare dışa aktarım, exporter.js): sayfanın zaman kaynaklarını (performance.now, Date.now, requestAnimationFrame, setTimeout, setInterval)
// elle ilerleyen bir saate bağlar. advance(ms): zamanı ilerletir, vakti gelen zamanlayıcıları sırasıyla (her biri kendi vaktinde, now o an) çalıştırır,
// sonra bekleyen kare geri çağrılarını (rAF) bir kez çağırır. Böylece yönetmenin 30 ms denetimi, kart süreleri, alt yazı süreleri ve çizim döngüsü
// gerçek saatten bağımsız, kare süresine (1/fps) göre yürür: bilgisayar yavaşsa dışa aktarım uzar, video aynı kalır.
// uninstall(): özgün işlevler geri gelir; bekleyen zamanlayıcılar kalan süreleriyle gerçek saate, bekleyen rAF'ler gerçek rAF'e taşınır.
// Hedef nesne (g) enjekte edilebilir: testte sahte bir küresel nesneyle sınanır. Ağ, worker iletileri ve söz (Promise) zamanlaması değişmez.
export class VirtualClock {
  constructor(g = globalThis) {
    this.g = g; this.on = false; this.now = 0; this.timers = new Map(); this.raf = new Map(); this.seq = 0; this.dateOff = 0;
  }
  install() {
    if (this.on) return; const g = this.g, perf = g.performance;
    this.orig = { now: perf.now.bind(perf), ownNow: Object.prototype.hasOwnProperty.call(perf, 'now') ? perf.now : undefined, dateNow: g.Date.now, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame,
      st: g.setTimeout, ct: g.clearTimeout, si: g.setInterval, ci: g.clearInterval };
    this.now = this.orig.now(); this.dateOff = this.orig.dateNow.call(g.Date) - this.now;
    perf.now = () => this.now;
    g.Date.now = () => Math.round(this.now + this.dateOff);
    g.requestAnimationFrame = (fn) => { const id = 'r' + (++this.seq); this.raf.set(id, fn); return id; };
    g.cancelAnimationFrame = (id) => { this.raf.delete(id); };
    const add = (fn, ms, args, every) => { const id = 'v' + (++this.seq); const d = Math.max(0, +ms || 0); this.timers.set(id, { fn, args, at: this.now + d, every: every ? Math.max(1, d) : 0, o: this.seq }); return id; };
    // gerçek kimlikler (sayı) özgün işlevlere; sanal kimlikler (dize) burada
    g.setTimeout = (fn, ms, ...args) => (typeof fn === 'function' ? add(fn, ms, args, false) : this.orig.st.call(g, fn, ms));
    g.setInterval = (fn, ms, ...args) => (typeof fn === 'function' ? add(fn, ms, args, true) : this.orig.si.call(g, fn, ms));
    g.clearTimeout = (id) => { if (typeof id === 'string') this.timers.delete(id); else this.orig.ct.call(g, id); };
    g.clearInterval = (id) => { if (typeof id === 'string') this.timers.delete(id); else this.orig.ci.call(g, id); };
    this.on = true;
  }
  // ms ilerlet: zamanlayıcılar vakit sırasıyla (eşitlikte kurulma sırasıyla); sonra rAF (yeni istenenler bir sonraki kareye kalır)
  advance(ms) {
    if (!this.on) return;
    const end = this.now + Math.max(0, ms);
    for (let guard = 0; guard < 100000; guard++) {
      let next = null;
      for (const [id, t] of this.timers) if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && t.o < next[1].o))) next = [id, t];
      if (!next) break;
      const [id, t] = next; this.now = Math.max(this.now, t.at);
      if (t.every) { t.at += t.every; t.o = ++this.seq; } else this.timers.delete(id);
      try { t.fn(...(t.args || [])); } catch (e) { console.error(e); }
    }
    this.now = end;
    const cbs = [...this.raf.values()]; this.raf.clear();
    for (const fn of cbs) { try { fn(this.now); } catch (e) { console.error(e); } }
  }
  uninstall() {
    if (!this.on) return; const g = this.g, o = this.orig, perf = g.performance;
    this.on = false;
    // sanal saat gerçeğin önündeyse (dışa aktarım gerçek zamandan hızlıysa) performance.now geri gitmesin: sabit farkla sürer (tekdüze)
    const ahead = this.now - o.now();
    if (ahead > 0) { const real = o.now; perf.now = () => real() + ahead; } else if (o.ownNow === undefined) delete perf.now; else perf.now = o.ownNow;
    g.Date.now = o.dateNow; g.requestAnimationFrame = o.raf; g.cancelAnimationFrame = o.caf;
    g.setTimeout = o.st; g.clearTimeout = o.ct; g.setInterval = o.si; g.clearInterval = o.ci;
    // bekleyenleri gerçek saate taşı (kalan süreleriyle; aralıklılar her zamanki gibi sürer). Sanal kimlikle temizleme artık etkisiz: taşınan
    // zamanlayıcının gerçek kimliği eşlem tablosunda tutulur ve sanal kimlikle clear çağrısı onu da durdurur.
    const map = this.moved = new Map();
    for (const [id, t] of this.timers) {
      const left = Math.max(0, t.at - this.now);
      if (t.every) { const realId = o.st.call(g, () => { const iv = o.si.call(g, () => t.fn(...(t.args || [])), t.every); map.set(id, iv); t.fn(...(t.args || [])); }, left); map.set(id, realId); }
      else map.set(id, o.st.call(g, () => t.fn(...(t.args || [])), left));
    }
    this.timers.clear();
    const ct = g.clearTimeout, ci = g.clearInterval;
    if (map.size) {
      g.clearTimeout = (id) => (typeof id === 'string' && map.has(id) ? o.ct.call(g, map.get(id)) : ct.call(g, id));
      g.clearInterval = (id) => (typeof id === 'string' && map.has(id) ? (o.ct.call(g, map.get(id)), o.ci.call(g, map.get(id))) : ci.call(g, id));
    }
    for (const fn of this.raf.values()) o.raf.call(g, fn);
    this.raf.clear();
  }
}
