// Fırlatma pencereleri (app.js'ten ayrıldı): günlük pencere (aynı gün, menzilin izin verdiği park eğimleri: farklı azimut → farklı saat; her fırsatın
// fırlatma anındaki hava, önerilen: hava uygun olanlar arasında en az yakıt) ve sonraki N pencere taraması. Ana iş parçacığının efemeris kaynağı
// her taramanın sonunda geri yüklenir. Durum: scanning (sürüyor), cancelled (durdurma isteği: cancel()).
import * as E from './engine.js';
import { makeLive } from './live.js';
import { designMissionAsync } from './design.js';
import { minIncl, LEGACY_SITE, dailyIncls } from './pads.js';
import { launchWeather, pickLaunch } from './weather.js';
import { S } from './appstate.js';
import { DesignJob } from './designjob.js';

export class WindowScanner {
  // deps: { ui, launch (LaunchUI), siteIncl, tOfUtcMs, missionEtWindow, dateStr }; çekirdekler, tasarım ve tasarım durumu ortak durumdan (appstate.js)
  constructor(deps) { Object.assign(this, deps); this.scanning = false; this.cancelled = false; this.job = new DesignJob(); }
  cancel() { this.cancelled = true; this.job.drop(); }
  // tasarım iş parçacığında (designjob.js); kurulamazsa ana iş parçacığında (ana efemeris kaynağı kurulur, tarama sonunda geri yüklenir)
  async design(tFrom, tStart, cfg, prog) {
    const stop = () => this.cancelled || S.designing, K = S.K;
    let D = this.noWorker ? undefined : await this.job.run({ tFrom, tStart, cfg, win: this.missionEtWindow(tStart, cfg) }, prog, stop);
    if (D === undefined) { makeLive(K.spk, K.pck, K.eo, tStart); D = await designMissionAsync(tFrom, prog, stop, cfg); }
    return D && !stop() ? D : null;
  }
  // günlük fırlatma penceresi: aynı gün, menzilin izin verdiği park eğimleriyle (farklı azimut → farklı saat) fırsatlar; her birinin fırlatma anındaki hava;
  // önerilen: hava uygun olanlar arasında en az yakıt (weather.js pickLaunch)
  async day() {
    const K = S.K;
    if (this.scanning || S.designing || !K || !S.DESIGN) return;
    this.scanning = true; this.cancelled = false;
    const cfg0 = this.ui.getConfig(), st = cfg0.site || LEGACY_SITE, ir = this.siteIncl(cfg0.site) || [minIncl(st.lat), 90];
    const incs = dailyIncls(Math.max(ir[0], minIncl(st.lat)), ir[1]), prov0 = E.getProvider(), rows = incs.map((inc) => ({ inc, busy: true }));
    const tFrom = this.tOfUtcMs(Date.parse(this.dateStr() + 'T00:00:00Z')), tStart = tFrom - 86400;
    const render = (msg, busy) => { this.launch.setDay(rows, msg, busy, busy ? null : pickLaunch(rows.map((r) => (r.D ? { t: r.D.LAUNCH.t_launch, cost: r.cost, wx: r.wx } : null)))); };
    try {
      await K.eph.ensure(...this.missionEtWindow(tStart));
      for (let k = 0; k < rows.length && !this.cancelled; k++) {
        const row = rows[k]; render(`${k + 1}/${rows.length}: eğim ${row.inc}° tasarlanıyor…`, true);
        try {
          const cfg = JSON.parse(JSON.stringify(cfg0)); cfg.earth.inc = row.inc;
          const D = await this.design(tFrom, tStart, cfg, () => {});
          if (!D) break;
          row.D = D; row.busy = false;
          row.cost = (D.LANDER_NEED ?? D.STAGES.slice(1).reduce((q, x) => q + x.prop, 0)) + (D.TLI_NEED ?? D.STAGES[0].prop);
          row.margin = D.STAGES[0].rocket && D.STAGES[0].rocket !== 'GENEL' ? D.STAGES[0].prop - D.TLI_NEED : null;
          row.wx = await launchWeather(D.LAUNCH.lat ?? LEGACY_SITE.lat, D.LAUNCH.lon ?? LEGACY_SITE.lon, E.utcMsFromT(D.LAUNCH.t_launch));
        } catch (err) { row.busy = false; row.err = String(err.message || err).slice(0, 80); }
      }
      // aynı fırsata düşen eğimler (±10 dk): yalnız en az yakıtlı kalır; saate göre sırala
      const ok = rows.filter((r) => r.D).sort((a, b) => a.D.LAUNCH.t_launch - b.D.LAUNCH.t_launch), uniq = [];
      for (const r of ok) { const prev = uniq[uniq.length - 1]; if (prev && Math.abs(prev.D.LAUNCH.t_launch - r.D.LAUNCH.t_launch) < 600) { if (r.cost < prev.cost) uniq[uniq.length - 1] = r; } else uniq.push(r); }
      rows.length = 0; rows.push(...uniq);
    } finally {
      E.setProvider(prov0); this.scanning = false; this.job.drop();
      const p = pickLaunch(rows.map((r) => ({ t: r.D.LAUNCH.t_launch, cost: r.cost, wx: r.wx })));
      render(this.cancelled ? 'Durduruldu.' : rows.length ? `${rows.length} fırsat · ${p.index >= 0 ? 'önerilen ★: ' : ''}${p.why}` : 'Fırsat bulunamadı.', false);
    }
  }
  // sonraki N pencere: her biri bir öncekinin fırlatmasından 1 gün sonrasından aranır; ana iş parçacığının efemeris kaynağı tarama sonunda geri yüklenir
  async scan(N = 4) {
    const K = S.K;
    if (this.scanning || S.designing || !K) return;
    this.scanning = true; this.cancelled = false;
    const cfg = this.ui.getConfig(), prov0 = E.getProvider(), rows = [];
    let tFrom = this.tOfUtcMs(Date.parse(this.dateStr() + 'T00:00:00Z'));
    try {
      for (let k = 0; k < N && !this.cancelled; k++) {
        const row = { from: E.utcString(tFrom).slice(0, 10), busy: true }; rows.push(row); this.launch.setScan(rows, `${k + 1}/${N} tasarlanıyor…`, true);
        try {
          const tStart = tFrom - 86400;
          await K.eph.ensure(...this.missionEtWindow(tStart));
          const D = await this.design(tFrom, tStart, cfg, (m) => this.launch.setScan(rows, `${k + 1}/${N}: ${m.slice(0, 50)}`, true));
          if (!D) break;
          // yakıt: iniş aracının ve TLI'ın gerektirdiği (tasarım tabanları olmadan) — pencereler arasındaki gerçek fark
          const pay = D.LANDER_NEED ?? D.STAGES.slice(1).reduce((q, x) => q + x.prop, 0);
          row.D = D; row.busy = false;
          row.dvTot = Object.values(D.DV || {}).reduce((q, x) => q + x, 0);
          row.cost = pay + (D.TLI_NEED ?? D.STAGES[0].prop);
          row.margin = D.STAGES[0].rocket ? D.STAGES[0].prop - D.TLI_NEED : null;
          const L = D.LAUNCH;
          launchWeather(L.lat ?? LEGACY_SITE.lat, L.lon ?? LEGACY_SITE.lon, E.utcMsFromT(L.t_launch)).then((w) => { row.wx = w; if (!this.scanning) this.launch.setScan(rows, ''); });
          tFrom = L.t_launch + 86400;
        } catch (err) { row.busy = false; row.err = String(err.message || err).slice(0, 90); break; }
      }
    } finally {
      E.setProvider(prov0); this.scanning = false; this.job.drop();
      this.launch.setScan(rows, this.cancelled ? 'Tarama durduruldu.' : '', false);
    }
  }
}
