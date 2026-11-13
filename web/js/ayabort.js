// Laboratuvar › Ay görevi › Uçuş › Çizelge: görev iptali okuması. "Şu an bir arıza olsa eve dönmek için ne kadar Δv gerekir?" (Apollo 13 sorusu).
// Görevin o anki durumunun kopyası ayrı iş parçacığına (abortwork.js → abort.js, tam kuvvet modeli) gider; canlı uçuş etkilenmez. Metin: aytext.js › abortSummary.
import { $, mk } from './uiutil.js';
import { workerOpts } from './i18n.js';
import { abortSummary } from './aytext.js';
import { stageDvs } from './telemetry.js';

export class AyAbort {
  // get(): { tStart, state: { t, r, v, m, prop, k }, stages, utc(t), halo } ya da null
  constructor({ get }) {
    this.get = get; this.w = null; this.id = 0;
    $('#abRun').addEventListener('click', () => this.run());
  }
  run() {
    const g = this.get(); if (!g || !g.state) { $('#abMsg').textContent = 'Önce görev kurulsun.'; return; }
    if (this.w) this.w.terminate();
    const id = ++this.id, s = g.state, w = (this.w = new Worker(new URL('./abortwork.js', import.meta.url), workerOpts()));
    // aracın kalan Δv'si: etkin ve sonraki kademeler (roket denklemi, telemetry.js); TLI kademesi atıldıysa yalnız uzay aracı
    const dvs = g.stages ? stageDvs(g.stages, s.k, s.m, s.prop) : null, dvLeft = dvs ? dvs.reduce((a, x) => a + (x ? x.dv : 0), 0) : NaN;
    this.ctx = { t: s.t, dvLeft, utc: g.utc, halo: !!g.halo };
    $('#abRun').disabled = true; $('#abMsg').textContent = 'Hesaplanıyor…'; $('#abOut').hidden = true;
    w.onmessage = (e) => {
      const d = e.data; if (d.id !== this.id) return;
      if (d.type === 'progress') { $('#abMsg').textContent = `${d.msg} %${Math.round(100 * d.f)}`; return; }
      $('#abRun').disabled = false; w.terminate(); if (this.w === w) this.w = null;
      if (d.type === 'error') { $('#abMsg').textContent = 'Hata: ' + d.error; return; }
      this.res = d; this.render();
    };
    w.onerror = (e) => { $('#abRun').disabled = false; $('#abMsg').textContent = 'Hesap iş parçacığı hatası: ' + (e.message || ''); };
    w.postMessage({ id, tStart: g.tStart, t: s.t, r: s.r, v: s.v });
  }
  render() {
    const c = this.ctx, a = abortSummary({ now: this.res.now, win: this.res.win, dvLeft: c.dvLeft, t: c.t, utc: c.utc });
    $('#abMsg').textContent = `Durum: ${c.utc(c.t)}`;
    $('#abOut').hidden = false; $('#abVerdict').className = 'unc ' + a.kind; $('#abVT').textContent = a.title;
    const tb = $('#abTbl tbody'); tb.replaceChildren();
    for (const [k, v] of a.rows) { const tr = mk('tr'); tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); }
  }
}
