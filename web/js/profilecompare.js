// Profil karşılaştırması (app.js'ten ayrıldı): seçili tarih ve roketle her hazır profilin tasarımı (yörünge optimizasyonu görünümü).
// Önbellekteki tasarımlar hemen gösterilir, eksikler sırayla hesaplanıp önbelleğe yazılır; yeni bir tasarım başlarsa ya da cancel() çağrılırsa durur.
import { designMissionAsync, PROFILES } from './design.js';

export class ProfileCompare {
  // deps: { ui, getStartMs, isDesigning, cachedDesign(ms, cfg), designCache (Map), cacheKey(ms, cfg), tOfUtcMs }
  constructor(deps) { Object.assign(this, deps); this.comparing = false; this.cancelled = false; }
  cancel() { this.cancelled = true; }
  cfg(key) { return { ...PROFILES[key].cfg, rocket: this.ui.rocket }; }          // profil + seçili roket
  rows() {
    return Object.entries(PROFILES).map(([key, p]) => { const c = this.cachedDesign(this.getStartMs(), this.cfg(key)); return { key, name: p.name, D: c ? c.design : null }; });
  }
  refresh(status) { if (!this.comparing) this.ui.setCompare(this.rows(), status ?? ''); }
  async run() {
    if (this.comparing || this.isDesigning()) return;
    this.comparing = true; this.cancelled = false;
    const ms = this.getStartMs(), rows = this.rows(), tFrom = this.tOfUtcMs(ms), tStart = tFrom - 86400, ui = this.ui;
    for (const r of rows) {
      if (r.D) continue;
      r.busy = true; ui.setCompare(rows, `${r.name} hesaplanıyor…`);
      try {
        const D = await designMissionAsync(tFrom, (m) => ui.setCompare(rows, `${r.name}: ${m.slice(0, 60)}`), () => this.cancelled || this.isDesigning(), this.cfg(r.key));
        if (!D) break;
        r.D = D; this.designCache.set(this.cacheKey(ms, this.cfg(r.key)), { tStart, design: D, nominal: null });
      } catch (err) { r.err = 'tasarım başarısız: ' + String(err.message || err).slice(0, 60); }
      r.busy = false; ui.setCompare(rows, '');
    }
    this.comparing = false; this.refresh('');
  }
}
