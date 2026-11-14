// Profil karşılaştırması (app.js'ten ayrıldı): seçili tarih ve roketle her hazır profilin tasarımı (yörünge optimizasyonu görünümü).
// Önbellekteki tasarımlar hemen gösterilir, eksikler sırayla hesaplanıp önbelleğe yazılır; yeni bir tasarım başlarsa ya da cancel() çağrılırsa durur.
import { designMissionAsync, PROFILES } from './design.js';
import { S } from './appstate.js';
import { DesignJob } from './designjob.js';

export class ProfileCompare {
  // deps: { ui, cachedDesign(ms, cfg), designCache (Map), cacheKey(ms, cfg), tOfUtcMs, missionEtWindow(tStart, cfg) }; başlangıç günü ve tasarım durumu ortak durumdan (appstate.js)
  constructor(deps) { Object.assign(this, deps); this.comparing = false; this.cancelled = false; this.job = new DesignJob(); }
  cancel() { this.cancelled = true; this.job.drop(); }
  cfg(key) { return { ...PROFILES[key].cfg, rocket: this.ui.rocket, moonSite: this.ui.getConfig().moonSite }; }          // profil + seçili roket + seçili Ay iniş yeri
  rows() {
    return Object.entries(PROFILES).map(([key, p]) => { const c = this.cachedDesign(S.START_MS, this.cfg(key)); return { key, name: p.name, D: c ? c.design : null }; });
  }
  refresh(status) { if (!this.comparing) this.ui.setCompare(this.rows(), status ?? ''); }
  async run() {
    if (this.comparing || S.designing) return;
    this.comparing = true; this.cancelled = false;
    const ms = S.START_MS, rows = this.rows(), tFrom = this.tOfUtcMs(ms), tStart = tFrom - 86400, ui = this.ui;
    for (const r of rows) {
      if (r.D) continue;
      r.busy = true; ui.setCompare(rows, `${r.name} hesaplanıyor…`);
      try {
        const prog = (m) => ui.setCompare(rows, `${r.name}: ${m.slice(0, 60)}`), stop = () => this.cancelled || S.designing, cfg = this.cfg(r.key);
        let D = this.noWorker ? undefined : await this.job.run({ tFrom, tStart, cfg, win: this.missionEtWindow(tStart, cfg) }, prog, stop);
        if (D === undefined) D = await designMissionAsync(tFrom, prog, stop, cfg);                 // iş parçacığı yok: eski yol (ana iş parçacığında, adım adım)
        if (D && stop()) D = null;
        if (!D) break;
        r.D = D; this.designCache.set(this.cacheKey(ms, this.cfg(r.key)), { tStart, design: D, nominal: null });
      } catch (err) { r.err = 'tasarım başarısız: ' + String(err.message || err).slice(0, 60); }
      r.busy = false; ui.setCompare(rows, '');
    }
    this.comparing = false; this.job.drop(); this.refresh('');
  }
}
