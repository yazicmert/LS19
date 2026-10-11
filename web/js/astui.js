// Asteroit arayüzü: katalog sekmesi ve bilgi kartı satırları. Saptırma denemeleri Laboratuvar'dadır (deflectui.js); buradan yalnız oraya geçilir.
import { AU } from './deflect.js';
import { AST_GROUPS } from './asteroids.js';
import { fmt } from './format.js';
import { sig, LD, distText as dist } from './labtext.js';

const $ = (s) => document.querySelector(s);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export class AstUI {
  // openLab(i, opts): Laboratuvar çalışma alanında saptırma deneyini bu asteroitle açar (app.js)
  constructor({ world, asts, getT, focusOn, setCam, ui, openLab }) {
    Object.assign(this, { world, asts, getT, focusOn, setCam, ui });
    this.deflect = null; this.openLabCb = openLab;                       // deflect: DeflectUI (app.js kurar)
    // katalog sekmesi
    $('#chkAst').addEventListener('change', (e) => { asts.enabled = e.target.checked; });
    let tmr = null;
    $('#astSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.search(e.target.value, '#astResults', (i) => { asts.select(i); $('#astSearch').value = asts.label(i); }), 150); });
    $('#astSearch').addEventListener('keydown', (e) => e.stopPropagation());
    asts.onChange = () => { this.renderCatalog(); if (this.deflect) this.deflect.onCatalog(); if (this.ui.pick && this.ui.pick.kind === 'ast') this.ui.renderPick(this.getT()); };
    this.renderCatalog();
  }
  openLab(i, opts) { if (this.openLabCb) this.openLabCb(i, opts); }
  update(eye) { if (this.deflect) this.deflect.update(eye); }              // 3B saptırma yolları (kare başına)

  // ---------------------------------------------------------------- katalog
  renderCatalog() {
    const A = this.asts, st = $('#astStatus'); st.replaceChildren();
    const line = (t) => st.appendChild(mk('div', null, t));
    if (A.n > 0) {
      line(`${fmt(A.n, 0)} asteroit · kaynak: JPL SBDB${A.sentry.size ? ` · Sentry risk listesi ${fmt(A.sentry.size, 0)}` : ''}`);
      for (const k of ['neo', 'mb']) if (A.sets[k]) line(`${A.sets[k].aciklama}: ${fmt(A.sets[k].n, 0)} (alındı ${new Date(A.sets[k].t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })})`);
      if (A.info.status !== 'hazır') line(A.info.status);
      if (A.nearCount != null) line(`Şu an Dünya'nın 0,05 AB (≈19 Ay uzaklığı) içinde: ${fmt(A.nearCount, 0)} asteroit. Güneş sistemi kamerası dışındaki görünümlerde yalnız bunlar çizilir.`);
      const b = mk('button', 'sm', 'Tümünü Güneş sistemi görünümünde göster');
      b.addEventListener('click', () => { this.setCam('SOLAR'); Object.assign(this.world.cam, { dist: 8.5e8, el: 1.05 }); });
      const row = mk('div', 'daterow'); row.appendChild(b); st.appendChild(row);
    } else line(A.info.status);
    const ul = $('#astGroups'); ul.replaceChildren();
    if (A.counts) AST_GROUPS.forEach((g, i) => {
      const li = mk('li'), cb = mk('input'); cb.type = 'checkbox'; cb.checked = !!A.mask[i]; cb.addEventListener('change', () => A.setMask(i, cb.checked));
      const sw = mk('span', 'sw'); sw.style.background = '#' + g.color.toString(16).padStart(6, '0');
      li.append(cb, sw, mk('span', null, g.name), mk('span', 'v', fmt(A.counts[i], 0))); ul.appendChild(li);
    });
    const sel = $('#astSel'); sel.replaceChildren();
    if (A.sel >= 0) {
      const b = mk('b', null, A.label(A.sel)); sel.appendChild(b);
      const bt = mk('div', 'daterow');
      const f = mk('button', 'sm', 'Kamerayla izle'); f.addEventListener('click', () => this.follow(A.sel));
      const d = mk('button', 'sm', 'Laboratuvarda dene'); d.addEventListener('click', () => this.openLab(A.sel));
      const x = mk('button', 'sm', 'Seçimi kaldır'); x.addEventListener('click', () => { A.select(-1); $('#astSearch').value = ''; });
      bt.append(f, d, x); sel.appendChild(bt);
    }
  }
  renderUpdater(U) { for (const id of ['#updStatus', '#updStatus2']) { const el = $(id); if (!el) continue; el.replaceChildren(...U.text().map((t) => mk('div', null, t))); } }
  search(q, ulSel, onPick) {
    const A = this.asts, ul = $(ulSel); ul.replaceChildren();
    if (!q) return;
    for (const i of A.search(q)) {
      const li = mk('li', null, `${A.label(i)} · ${A.C.cls[i]}${A.C.pha[i] ? ' · PHA' : ''}`);
      li.addEventListener('click', () => { onPick(i); ul.replaceChildren(); });
      ul.appendChild(li);
    }
  }
  follow(i) {
    const A = this.asts; A.select(i);
    const R = A.diam(i) / 2;
    this.focusOn({ kind: 'ast', fn: (t) => A.selPos(t), R }, Math.max(8 * R, 30));
    // Güneş'in aydınlattığı yandan bak (ekliptik tabanlı odak çerçevesi)
    const [r] = A.helio(i, this.getT()), n = Math.hypot(...r), d = r.map((x) => -x / n);
    const B1 = [0, 0.9174820621, 0.3977771559], B2 = [0, -0.3977771559, 0.9174820621];
    const az = Math.atan2(d[1] * B1[1] + d[2] * B1[2], d[0]), el = Math.asin(d[1] * B2[1] + d[2] * B2[2]);
    Object.assign(this.world.cam, { az: az + 0.7, el: Math.max(-1.2, Math.min(1.2, el + 0.25)) });
  }

  // ---------------------------------------------------------------- bilgi kartı
  card(d) {
    const rows = [];
    rows.push(['Grup', d.group], ['Sınıf', d.cls]);
    rows.push(['Mutlak parlaklık H', fmt(d.H, 2)], ['Çap', `${sig(d.D, 3)} km ${d.Dmeas ? '(ölçülmüş)' : '(H ve albedodan tahmini)'}`]);
    if (d.alb) rows.push(['Albedo', fmt(d.alb, 3)]);
    if (d.rot) rows.push(['Dönme periyodu', `${sig(d.rot, 4)} sa`]);
    if (d.spec) rows.push(['Tayf türü', d.spec]);
    rows.push(['a / e / i', `${fmt(d.a, 4)} AB / ${fmt(d.e, 4)} / ${fmt(d.inc, 2)}°`], ['Günberi / günöte', `${fmt(d.q, 4)} / ${fmt(d.Q, 4)} AB`],
      ['Yörünge periyodu', d.P > 2 ? `${fmt(d.P, 2)} yıl` : `${fmt(d.P * 365.25, 1)} gün`],
      ['Dünya MOID', d.moid != null ? `${fmt(d.moid, 5)} AB (${sig(d.moid * AU / LD, 3)} AM)` : '—'],
      ["Güneş'e uzaklık", `${fmt(d.dSun, 4)} AB`], ["Dünya'ya uzaklık", dist(d.dEarth)], ['Güneş merkezli hız', `${fmt(d.v, 2)} km/s`]);
    if (d.nextCa) rows.push(['Sonraki yakın geçiş (JPL)', `${d.nextCa.cd} · ${dist(d.nextCa.dist)}`]);
    if (d.sentry) rows.push(['Sentry çarpma olasılığı', `${sig(d.sentry.ip, 2)} (${d.sentry.range}, Palermo ${fmt(d.sentry.ps, 2)})`]);
    if (d.discovery) rows.push(['Keşif', d.discovery]);
    rows.push(['Yörünge belirsizliği (U)', `${d.cc || '—'} (0 en iyi, 9 en kötü)`], ['Gözlem yayı', d.arc ? `${fmt(d.arc, 0)} gün` : '—'],
      ['Öğelerin yaşı', `${fmt(d.epochAgeDays, 0)} gün (JPL SBDB)`]);
    if (d.shape) {
      const sh = d.shape, yon = sh.yontem === 'uzay' ? ['Uzay aracı görüntüleme', 'Çok yüksek: yüzey ayrıntıları (krater, kaya) çözülmüş'] : sh.yontem === 'radar' ? ['Radar görüntüleme', 'Yüksek: onlarca metre ayrıntı, çukurlar dahil'] :
        ['Işık eğrisi tersine çevirme', sh.nonconvex ? 'Orta: dışbükey olmayan model, ince yüzey ayrıntısı yok' : 'Düşük: dışbükey şekil, çukur ve yüzey ayrıntısı yok (boyut, dönme ve genel biçim güvenilir)'];
      rows.push(['Şekil yöntemi', yon[0]], ['Şekil doğruluğu', yon[1]],
        ['3B şekil modeli', `gerçek şekil (${sh.kaynak})${sh.damit ? ' · dönme ekseni ve fazı modelden' : ' · NASA PDS Küçük Cisimler Düğümü'} · hacim eşdeğeri yarıçap ${fmt(sh.req_km, sh.req_km < 1 ? 3 : 1)} km`]);
    }
    if (d.detailLoading) rows.push(['Ayrıntılar', 'JPL SBDB’den alınıyor…']);
    if (d.detailErr) rows.push(['Ayrıntılar', 'alınamadı (' + String(d.detailErr).replace(/<[^>]*>/g, '').slice(0, 60) + ')']);
    const fn = (d.fullname || '').trim();
    return { title: d.name, sub: `${fn && fn !== d.name ? fn : 'JPL Small-Body Database'}${d.pha ? ' · potansiyel tehlikeli' : ''}`, rows };
  }
}
