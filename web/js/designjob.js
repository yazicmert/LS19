// Canlı sayfadaki görev tasarımları için iş parçacığı sürücüsü (profil karşılaştırması, fırlatma penceresi taramaları): designwork.js'i çalıştırır.
// run(): tasarım | null (iptal: drop() ya da cancelled() doğru) | undefined (iş parçacığı kurulamadı: çağıran ana iş parçacığı yoluna, designMissionAsync, düşer).
// Aynı iş parçacığı ardışık tasarımlarda yeniden kullanılır (efemeris kurulumu bir kez); iptal iş parçacığını kapatır, sonraki run() yenisini kurar.
import { workerOpts } from './i18n.js';

export class DesignJob {
  constructor() { this.wk = null; this.end = null; }
  drop() { if (this.wk) { this.wk.terminate(); this.wk = null; } if (this.end) { const e = this.end; this.end = null; e(null); } }
  // job: { tFrom, tStart, cfg, win (efemeris penceresi) }; onProg(msg); cancelled() → iptal (200 ms'de bir yoklanır)
  run(job, onProg, cancelled) {
    return new Promise((res, rej) => {
      if (!this.wk) { try { this.wk = new Worker(new URL('./designwork.js', import.meta.url), workerOpts()); } catch (e) { this.wk = null; return res(undefined); } }
      const w = this.wk, iv = setInterval(() => { if (cancelled()) this.drop(); }, 200);
      const end = this.end = (v, err) => { clearInterval(iv); this.end = null; w.onmessage = w.onerror = null; if (err) rej(err); else res(v); };
      w.onmessage = ({ data: d }) => { if (d.type === 'progress') onProg(d.msg); else if (d.type === 'done') end(d.design); else end(null, new Error(d.msg)); };
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.wk = null; w.terminate(); end(undefined); };
      w.postMessage(job);
    });
  }
}
