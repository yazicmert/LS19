// Cihazda başarım okuması (?olcum=1): uzaktan hata ayıklama olmadan telefonda ekran görüntüsü alınabilecek küçük bir kutu.
// Yalnız bu parametreyle tembel yüklenir (app.js, dinamik import): normal açılışa maliyeti yoktur.
// Gösterir: kare aralıkları (son 5 sn: medyan, %95, en uzun, 50 ms'den uzun kare sayısı), son karenin üçgen ve çizim çağrısı sayısı, çizim çözünürlüğü,
// doku katmanı (düşük bellek, KTX2, Dünya haritası boyutu), uzun görevler (tarayıcı destekliyorsa; Safari'de yok: kare aralıkları yine ölçülür), cihaz bilgisi.
// "Kopyala" aynı bilgiyi JSON olarak panoya verir (docs/performans.md §11.4).
import { t } from './i18n.js';

const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);

export class PerfHud {
  constructor(world) {
    this.world = world; this.gaps = []; this.long = []; this.last = 0; this.shown = 0; this.t0 = performance.now(); this.maxGap = 0; this.maxGapAt = 0;
    const el = this.el = document.createElement('div');
    el.id = 'perfHud'; el.setAttribute('translate', 'no');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;max-width:min(92vw,360px);padding:8px 10px;border-radius:10px;background:rgba(10,14,20,.86);color:#d8dde6;font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:auto';
    this.txt = document.createElement('div'); el.appendChild(this.txt);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t('Kopyala'); b.style.cssText = 'margin-top:6px;font:inherit;padding:2px 8px';
    b.addEventListener('click', async () => { const s = JSON.stringify(this.read(), null, 1); try { await navigator.clipboard.writeText(s); b.textContent = t('Kopyalandı'); } catch (e) { window.prompt('JSON', s); } setTimeout(() => { b.textContent = t('Kopyala'); }, 2000); });
    el.appendChild(b); document.body.appendChild(el);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) this.long.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); this.hasLong = true; } catch (e) { this.hasLong = false; }
  }
  // app.js her kareden sonra (world.render'dan sonra) çağırır
  frame(now, dtMs) {
    if (this.last) { this.gaps.push([now, dtMs]); if (dtMs > this.maxGap) { this.maxGap = dtMs; this.maxGapAt = now; } }
    this.last = now;
    while (this.gaps.length && now - this.gaps[0][0] > 5000) this.gaps.shift();
    const info = this.world.renderer.info.render; this.tri = info.triangles; this.calls = info.calls;
    if (now - this.shown > 1000) { this.shown = now; this.txt.textContent = this.text(this.read()); }
  }
  read() {
    const w = this.world, r = w.renderer, g = this.gaps.map((x) => x[1]), now = performance.now(), cv = r.domElement;
    const day = w.earthU && w.earthU.dayMap.value, sz = day && day.userData && day.userData.size;
    const lt = this.long.filter((x) => now - x[0] < 10000);
    return {
      sn: Math.round((now - this.t0) / 1000),
      kare: { medyanMs: r1(q(g, 0.5)), p95Ms: r1(q(g, 0.95)), enUzunMs: r1(Math.max(0, ...g)), uzun50: g.filter((x) => x > 50).length, n: g.length, acilistanBeriEnUzunMs: r1(this.maxGap), enUzunSn: Math.round((this.maxGapAt - this.t0) / 1000) },
      cizim: { ucgen: this.tri, cagri: this.calls, kamera: w.cam && w.cam.mode },
      cozunurluk: { oran: r1(r.getPixelRatio()), tampon: `${cv.width}×${cv.height}`, dpr: r1(window.devicePixelRatio) },
      doku: { dusukBellek: !!w.lowMem, ktx2: !!(day && day.isCompressedTexture), dunya: sz ? `${sz[0]}×${sz[1]}` : null },
      uzunGorev: this.hasLong ? { son10sn: lt.length, enUzunMs: Math.round(Math.max(0, ...lt.map((x) => x[1]))) } : null,
      cihaz: { bellekGB: navigator.deviceMemory || null, cekirdek: navigator.hardwareConcurrency || null, ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90) },
    };
  }
  text(o) {
    const k = o.kare, c = o.cizim, z = o.cozunurluk, d = o.doku, u = o.uzunGorev;
    return [
      `${t('kare')} ${k.medyanMs} ms (${t('%95')} ${k.p95Ms}, ${t('en uzun')} ${k.enUzunMs}) · >50 ms: ${k.uzun50}/${k.n}`,
      `${t('açılıştan beri en uzun kare aralığı')} ${k.acilistanBeriEnUzunMs} ms (${k.enUzunSn}. sn)`,
      `${t('üçgen')} ${c.ucgen != null ? c.ucgen.toLocaleString() : '—'} · ${t('çağrı')} ${c.cagri} · ${c.kamera || ''}`,
      `${t('oran')} ${z.oran} (dpr ${z.dpr}) · ${z.tampon}`,
      `${t('doku')} ${d.ktx2 ? 'KTX2' : 'WebP'}${d.dusukBellek ? ' · ' + t('düşük bellek') : ''} · ${d.dunya || '—'}`,
      u ? `${t('uzun görev')} (10 sn) ${u.son10sn} · ${t('en uzun')} ${u.enUzunMs} ms` : t('uzun görev ölçümü yok (tarayıcı desteklemiyor)'),
      `${o.cihaz.bellekGB ? o.cihaz.bellekGB + ' GB · ' : ''}${o.cihaz.cekirdek || '?'} ${t('çekirdek')} · ${o.sn} sn`,
    ].join('\n');
  }
}
