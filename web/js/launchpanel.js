// Fırlatmalar sekmesi: üç görünüm.
//   Yaklaşan  — canlı LL2 kayıtları (launches.js): satıra dokununca ayrıntı (görev, müşteri, roket ve itici istatistikleri, iniş, pencere,
//               hava, canlı yayın, yılın kaçıncı fırlatması); kesin saatli olanda canlı geri sayım.
//   Geçmiş    — 1957'den bugüne veritabanı (launchdb.js, GCAT — J. McDowell, CC-BY-4.0) ve veritabanından yeni son günlerin LL2 kayıtları:
//               arama (roket, görev, COSPAR, yer, kuruluş, ülke, yük adı), yıl/ülke/sonuç/amaç süzgeci; ayrıntıda yörünge, itici ve yükler
//               (payloadui.js: her yükün amacı, araştırma alanı, bugünkü durumu, Vikipedi özeti, yörünge çizimi, yörüngedekiler için 3B'de izle).
//   İstatistik — seçili yılın sayıları, yıllara göre fırlatmalar (tek seri sütun; seçili yıl vurgulu, üzerine gelince değer; tıklayınca o yıl),
//               en çok fırlatan roketler / ülkeler / yerler ve ana yükün amacına göre dağılım (dokununca Geçmiş o süzgeçle açılır).
// Veritabanı yalnız Geçmiş ya da İstatistik ilk açılınca indirilir. Kaynak verisi (roket, görev, açıklama) çevrilmez: translate="no".
import { DONE, CREDITS, catalogObjects } from './launchdata.js';
import { loadLaunchDb, row, size, filterIdx, perYear, yearSummary, success, partial, countryName, ORBIT } from './launchdb.js';
import { whenText, cdText, statusChip } from './launchcal.js';
import { PayloadView } from './payloadui.js';
import { GROUPS, groupOf, groupName } from './payloads.js';
import { fmt } from './format.js';
import { $, mk } from './uiutil.js';
import { applyIcons } from './icons.js';
import { LOC, t, isEn } from './i18n.js';

const PAGE = 40;
const NOF = () => ({ q: '', yil: null, ulke: null, sonuc: null, amac: null });
const TYPE = { Commercial: 'Ticari', Government: 'Devlet', Multinational: 'Çok uluslu', Educational: 'Eğitim', Private: 'Özel' };
const LAND = { ASDS: 'gemi', RTLS: 'karaya dönüş', ATL: 'okyanus' };
const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const noTr = (el) => { el.setAttribute('translate', 'no'); return el; };
const dateLong = (ms) => new Date(ms).toLocaleDateString(LOC, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hm = (ms) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
const pct = (x) => (isEn ? `${fmt(100 * x, 1)}%` : `%${fmt(100 * x, 1)}`);
const place = (l) => (l.yer || l.rampa || '').split(',')[0].trim();
function dayTile(ms) {
  const d = new Date(ms), el = mk('span', 'lp-day');
  el.append(mk('b', null, String(d.getDate())), mk('span', null, d.toLocaleDateString(LOC, { month: 'short' })));
  return el;
}
function outcomeChip(db, i) {
  const ok = success(db, i), part = partial(db, i);
  const [lab, cls] = ok ? (part ? ['Kısmi başarı', 'warn'] : ['Başarılı', 'ok']) : ['Başarısız', 'bad'];
  const c = mk('span', 'lc-chip ' + cls, lab);
  if (db.c.fr[i] !== null) c.title = `Başarı oranı ${db.c.fr[i]}/100 (McDowell)`;
  return c;
}
const ddl = () => mk('dl', 'tk-dl lp-dl');
function dd(dl, k, v, data = false) { if (v === null || v === undefined || v === '') return; const d = mk('dd', null, v); if (data) noTr(d); dl.append(mk('dt', null, k), d); }

export class LaunchPanel {
  constructor({ launches, sats, follow }) {
    Object.assign(this, { launches, sats, follow });
    this.root = $('#launchList'); this.view = 'yak'; this.open = null; this.db = null; this.dbErr = null; this.dbLoading = false;
    this.f = NOF(); this.shown = PAGE; this.statYear = new Date().getUTCFullYear(); this.cdEl = null;
    this.pv = new PayloadView({ sats, follow });
    if (!this.root) return;
    this.build();
  }
  build() {
    const seg = mk('div', 'tk-seg lp-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Fırlatma görünümü');
    for (const [v, lab] of [['yak', 'Yaklaşan'], ['gec', 'Geçmiş'], ['ist', 'İstatistik']]) {
      const b = mk('button', null, lab); b.type = 'button'; b.dataset.v = v;
      b.addEventListener('click', () => this.setView(v)); seg.appendChild(b);
    }
    this.seg = seg; this.body = mk('div', 'lp-body'); this.src = mk('p', 'note lp-src');
    this.root.replaceChildren(seg, this.body, this.src);
    this.syncSeg();
  }
  syncSeg() { this.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === this.view ? 'true' : 'false')); }
  setView(v) {
    this.view = v; this.open = null; this.syncSeg();
    if ((v === 'gec' || v === 'ist') && !this.db && !this.dbLoading) this.loadDb();
    this.render();
  }
  async loadDb() {
    this.dbLoading = true; this.dbErr = null;
    try { this.db = await loadLaunchDb(); } catch (e) { this.dbErr = e.message; }
    this.dbLoading = false; this.render();
  }
  visible() { return this.root && !this.root.closest('.tabpage').hidden; }
  render() {
    if (!this.root) return;
    this.cdEl = null;
    if (this.view === 'yak') this.renderUpcoming();
    else if (this.view === 'gec') this.renderHistory();
    else this.renderStats();
    applyIcons(this.body);
  }
  // her saniye (launchcal.tick): açık ayrıntının geri sayımı
  tick() { if (this.cdEl && this.cdEl.isConnected) { const s = cdText(this.cdEl._l); if (s && this.cdEl.textContent !== s) this.cdEl.textContent = s; } }
  // katalogdaki uydular değişti (uydu verisi yüklendi)
  satsChanged() { if (this.view !== 'ist' && this.open && this.visible()) this.render(); }

  // ---------------------------------------------------------------- Yaklaşan
  renderUpcoming() {
    const L = this.launches, cat = L.cat, now = Date.now(), out = [];
    if (!cat) { out.push(mk('p', 'tk-empty', L.err || 'Fırlatma takvimi yükleniyor…')); this.body.replaceChildren(...out); this.setSrc(null); return; }
    const up = cat.yaklasan.filter((l) => !DONE.has(l.durum) && (l.net >= now - 3600e3 || l.durum === 'ucusta'));
    const ul = mk('ul', 'tk-passes lp-list');
    if (!up.length) ul.appendChild(mk('li', 'tk-empty', 'Yaklaşan fırlatma bilgisi yok'));
    for (const l of up) ul.appendChild(this.liveItem(l, false, now));
    out.push(ul);
    this.body.replaceChildren(...out); this.setSrc(cat);
  }
  // canlı (LL2) kaydın satırı ve açık ayrıntısı
  liveItem(l, past, now) {
    const key = 'l:' + l.id, on = this.open === key, li = mk('li', 'tk-pass' + (on ? ' on' : ''));
    const btn = mk('button', 'tk-prow lp-row'); btn.type = 'button'; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    const main = mk('span', 'tk-pmain'), nm = noTr(mk('b')); nm.append(l.roket + ' · ', l.gorev);
    // saat önde: uzun yer adı kırpılsa da görünür kalsın (geri sayım ayrıntıda büyük)
    const meta = mk('span', 'tk-pmeta'); meta.append(mk('span', null, past ? dateLong(l.net) : whenText(l, now)), ' · ', noTr(mk('span', null, place(l))));
    main.append(nm, meta);
    btn.append(dayTile(l.net), main, statusChip(l.durum));
    btn.addEventListener('click', () => this.toggle(key));
    li.appendChild(btn);
    if (on) { const det = this.liveDetail(l, past, now); li.appendChild(det); this.enter(det); }
    return li;
  }
  liveDetail(l, past, now) {
    const box = mk('div', 'tk-pdet lp-det'), d = l.d || {};
    const cd = past ? null : cdText(l, now);
    if (cd) { const c = mk('div', 'lp-cd', cd); c._l = l; this.cdEl = c; box.appendChild(c); }
    if (d.son && !past) box.appendChild(noTr(mk('p', 'lp-update', d.son.m)));
    if (d.aciklama) box.appendChild(noTr(mk('p', 'lp-desc', d.aciklama)));
    const dl = ddl();
    dd(dl, 'Zaman', past ? `${dateLong(l.net)} ${hm(l.net)}` : whenText(l, now));
    if (!past && l.pencere && l.pencere[1] - l.pencere[0] >= 60e3) dd(dl, 'Pencere', `${hm(l.pencere[0])}–${hm(l.pencere[1])}`);
    dd(dl, 'Sağlayıcı', [l.saglayici, d.tur && TYPE[d.tur] ? t(TYPE[d.tur]) : null].filter(Boolean).join(' · '));
    const r = d.roket;
    if (r && r.toplam) dd(dl, 'Roket', [l.roket, `${fmt(r.toplam, 0)} fırlatma`, r.basarili != null ? `başarı ${pct(r.basarili / Math.max(1, r.basarili + (r.basarisiz || 0)))}` : null,
      r.inis ? `${fmt(r.inis, 0)} iniş` : null].filter(Boolean).join(' · '));
    else dd(dl, 'Roket', l.roket, true);
    for (const s of d.itici || []) {
      const L = s.inis, parts = [s.seri, s.ucus ? `${s.ucus}. uçuş` : null, L ? `iniş: ${L.yer || '?'}` : null, L && L.tip ? t(LAND[L.tip] || L.tip) : null,
        L && L.mesafe ? `${fmt(L.mesafe, 0)} km` : null, L && L.basari === true ? 'iniş başarılı' : L && L.basari === false ? 'iniş başarısız' : null].filter(Boolean);
      dd(dl, 'İtici', parts.join(' · '));
    }
    dd(dl, 'Yörünge', l.yorunge ? `${l.yorunge}${ORBIT[l.yorunge] ? ` · ${t(ORBIT[l.yorunge])}` : ''}` : null);
    dd(dl, 'Müşteri', (d.musteri || []).join(', '), true);
    dd(dl, 'Program', (d.program || []).join(', '), true);
    dd(dl, 'Rampa', [[l.rampa, place(l)].filter(Boolean).join(', '), d.sayac && d.sayac.rampaYil ? `bu yılın ${fmt(d.sayac.rampaYil, 0)}. fırlatması` : null].filter(Boolean).join(' · '));
    if (d.olasilik != null) dd(dl, 'Hava', [`%${fmt(d.olasilik, 0)} uygun`, d.hava].filter(Boolean).join(' · '));
    else if (d.hava) dd(dl, 'Hava', d.hava, true);
    if (d.sayac && d.sayac.yil) dd(dl, 'Sıra', `${new Date(l.net).getFullYear()} yılının ${fmt(d.sayac.yil, 0)}. yörüngesel fırlatma denemesi`);
    if (d.hata) dd(dl, 'Neden', d.hata, true);
    if (l.cospar) dd(dl, 'COSPAR', l.cospar);
    box.appendChild(dl);
    if (past && l.cospar) box.appendChild(this.catalogRow(l.cospar));
    const vids = d.yayin || [];
    if (vids.length) {
      const acts = mk('div', 'lp-acts');
      vids.forEach((v, k) => {
        const a = mk('a', k ? 'lp-link' : 'lp-btn'); a.href = v.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.innerHTML = '<i data-icon="play"></i>'; a.appendChild(mk('span', null, k ? 'Öteki yayın' : (l.canli ? 'Canlı yayında' : (v.resmi ? 'Resmî yayın' : 'Yayın'))));
        if (v.b) a.title = v.b;
        acts.appendChild(a);
      });
      box.appendChild(acts);
    }
    return box;
  }

  // ---------------------------------------------------------------- Geçmiş
  renderHistory() {
    const out = [], db = this.db;
    // arama ve süzgeçler (tek satır kontrol grubu, listenin üstünde)
    const search = mk('div', 'tk-search lp-search'); search.innerHTML = '<i data-icon="search"></i>';
    const inp = mk('input'); inp.type = 'search'; inp.placeholder = 'Ara: roket, görev, uydu, COSPAR, yer'; inp.setAttribute('aria-label', 'Fırlatma ara'); inp.value = this.f.q; inp.autocomplete = 'off'; inp.spellcheck = false;
    let tmr = null;
    inp.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { this.f.q = inp.value; this.shown = PAGE; this.open = null; this.renderHistoryList(); }, 140); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { inp.value = ''; this.f.q = ''; this.renderHistoryList(); } });
    search.appendChild(inp); out.push(search);
    const fr = mk('div', 'lp-filters');
    const sel = (label, opts, val, on) => {
      const s = mk('select'); s.setAttribute('aria-label', label);
      for (const [v, txt] of opts) { const o = mk('option', null, txt); o.value = v; if (String(val ?? '') === v) o.selected = true; s.appendChild(o); }
      s.addEventListener('change', () => { on(s.value); this.shown = PAGE; this.open = null; this.renderHistoryList(); });
      return s;
    };
    if (db) {
      const y1 = new Date(db.c.t[size(db) - 1] * 1000).getUTCFullYear(), years = [['', 'Her yıl']];
      for (let y = y1; y >= 1957; y--) years.push([String(y), String(y)]);
      const cc = new Map(); for (let i = 0; i < size(db); i++) { const c = db.ag[db.c.ag[i]][1] || db.site[db.c.site[i]][1]; cc.set(c, (cc.get(c) || 0) + 1); }
      const countries = [['', 'Her ülke'], ...[...cc.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => [c, t(countryName(c))])];
      fr.append(sel('Yıl', years, this.f.yil, (v) => { this.f.yil = v ? +v : null; }), sel('Ülke', countries, this.f.ulke, (v) => { this.f.ulke = v || null; }),
        sel('Sonuç', [['', 'Her sonuç'], ['S', 'Başarılı'], ['F', 'Başarısız']], this.f.sonuc, (v) => { this.f.sonuc = v || null; }),
        sel('Amaç', [['', 'Her amaç'], ...GROUPS.map(([g, ad]) => [g, t(ad)])], this.f.amac, (v) => { this.f.amac = v || null; }));
      out.push(fr);
    }
    this.list = mk('div', 'lp-hist'); out.push(this.list);
    this.body.replaceChildren(...out);
    this.renderHistoryList();
  }
  renderHistoryList() {
    const db = this.db, box = this.list; if (!box) return;
    if (!db) { box.replaceChildren(mk('p', 'tk-empty', this.dbErr ? `Fırlatma veritabanı alınamadı (${this.dbErr})` : 'Fırlatma veritabanı yükleniyor…')); this.setSrc(null, true); return; }
    const idx = filterIdx(db, this.f), now = Date.now(), lastT = db.c.t[size(db) - 1] * 1000;
    // veritabanından yeni son günler (canlı LL2): süzgeç yoksa ya da yalnız bu yıl seçiliyse ve aramaya uyuyorsa
    const cat = this.launches.cat, words = this.f.q.toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
    const fresh = cat && !this.f.ulke && !this.f.amac && this.f.sonuc !== 'F' && (this.f.yil === null || this.f.yil === new Date(now).getUTCFullYear())
      ? cat.gecmis.filter((l) => l.net > lastT + 60e3 && words.every((w) => `${l.roket} ${l.gorev} ${l.yer} ${l.saglayici} ${l.cospar || ''}`.toLocaleLowerCase('tr').includes(w))) : [];
    const head = mk('div', 'lp-count');
    head.append(mk('span', null, `${fmt(idx.length + fresh.length, 0)} fırlatma`));
    if (this.f.q || this.f.yil !== null || this.f.ulke || this.f.sonuc || this.f.amac) {
      const clr = mk('button', 'xs lp-clear', 'Süzgeci temizle'); clr.type = 'button';
      clr.addEventListener('click', () => { this.f = NOF(); this.shown = PAGE; this.open = null; this.renderHistory(); applyIcons(this.body); });
      head.appendChild(clr);
    }
    const ul = mk('ul', 'tk-passes lp-list');
    for (const l of fresh) ul.appendChild(this.liveItem(l, true, now));
    for (const i of idx.slice(0, Math.max(0, this.shown - fresh.length))) ul.appendChild(this.dbItem(db, i));
    if (!idx.length && !fresh.length) ul.appendChild(mk('li', 'tk-empty', 'Bu süzgeçle fırlatma yok.'));
    const kids = [head, ul];
    if (idx.length + fresh.length > this.shown) {
      const more = mk('button', 'xs lp-more', `Daha fazla göster (${fmt(idx.length + fresh.length - this.shown, 0)})`); more.type = 'button';
      more.addEventListener('click', () => { this.shown += PAGE * 2; this.renderHistoryList(); });
      kids.push(more);
    }
    box.replaceChildren(...kids); applyIcons(box);
    this.setSrc(cat, true);
  }
  dbItem(db, i) {
    const r = row(db, i), key = 'd:' + r.tag, on = this.open === key, li = mk('li', 'tk-pass' + (on ? ' on' : ''));
    const btn = mk('button', 'tk-prow lp-row'); btn.type = 'button'; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    const main = mk('span', 'tk-pmain'), nm = noTr(mk('b')); nm.append(r.roket + ' · ', r.gorev);
    const meta = mk('span', 'tk-pmeta'), g = groupOf(r.amac);
    // amaç (ana yük) tarihten hemen sonra: dar panelde kırpılan yer ve ülke olsun
    meta.append(mk('span', 'lp-date', dateLong(r.t)), ' · ', ...(g ? [mk('span', 'lp-pur', t(groupName(g, true))), ' · '] : []), noTr(mk('span', null, r.yer)), ' · ', mk('span', null, t(countryName(r.ulke))));
    main.append(nm, meta);
    btn.append(mk('span', 'lp-yr', String(new Date(r.t).getUTCFullYear())), main, outcomeChip(db, i));
    btn.addEventListener('click', () => this.toggle(key));
    li.appendChild(btn);
    if (on) {
      const box = mk('div', 'tk-pdet lp-det'), dl = ddl();
      dd(dl, 'Zaman', `${dateLong(r.t)} ${new Date(r.t).toISOString().slice(11, 16)} UTC`);
      dd(dl, 'Roket', [r.roket, r.surum].filter(Boolean).join(' · '), true);
      dd(dl, 'Uçuş', r.ucus, true);
      if (r.yuk && !r.nYuk) dd(dl, 'Yük', r.yuk, true);
      dd(dl, 'Kuruluş', `${r.kurulus} · ${t(countryName(r.ulke))}`);
      dd(dl, 'Fırlatma yeri', [r.yer, r.rampa].filter(Boolean).join(' · '), true);
      const orb = [r.yorunge ? `${r.yorunge}${ORBIT[r.yorunge] ? ` · ${t(ORBIT[r.yorunge])}` : ''}` : null,
        r.perije != null && r.apoje != null ? `${fmt(r.perije, 0)} × ${fmt(r.apoje, 0)} km` : null, r.egim != null ? `${fmt(r.egim, 1)}°` : null].filter(Boolean);
      if (orb.length) dd(dl, 'Yörünge', orb.join(' · '));
      if (r.kg) dd(dl, 'Yük kütlesi', r.kg >= 1000 ? `${fmt(r.kg / 1000, 1)} t` : `${fmt(r.kg, 0)} kg`);
      if (r.oran !== null) dd(dl, 'Başarı oranı', `${r.oran}/100`);
      dd(dl, 'COSPAR', r.tag);
      box.appendChild(dl);
      // yükler (veri yoksa — çok yeni fırlatma — etkin uydu kataloğundaki nesneler)
      box.appendChild(this.pv.section(r.tag, new Date(r.t).getUTCFullYear(), /^\d{4}-\d{3}$/.test(r.tag) ? () => this.catalogRow(r.tag) : null));
      li.appendChild(box); this.enter(box);
    }
    return li;
  }
  // COSPAR -> etkin uydu kataloğundaki nesneler ve İzle
  catalogRow(cospar) {
    const omm = this.sats && this.sats.omm, row = mk('div', 'lc-cat'), objs = catalogObjects(cospar, omm);
    if (!omm) row.append(mk('span', 'k', 'Uydu verisi bekleniyor…'));
    else if (!objs.length) row.append(mk('span', 'k', 'Bu fırlatmadan etkin uydu kataloğunda nesne yok'));
    else {
      const first = objs[0];
      row.append(mk('span', 'k', `Katalogda ${fmt(objs.length, 0)} nesne`));
      const b = mk('button', 'xs', 'İzle'); b.type = 'button'; b.title = `${first.ad} (#${first.id}): kamerayı uyduya kilitle`;
      b.addEventListener('click', () => this.follow(first.id)); row.appendChild(b);
      row.title = objs.slice(0, 12).map((o) => `${o.parca} ${o.ad}`).join('\n') + (objs.length > 12 ? '\n…' : '');
    }
    return row;
  }

  // ---------------------------------------------------------------- İstatistik
  renderStats() {
    const db = this.db;
    if (!db) { this.body.replaceChildren(mk('p', 'tk-empty', this.dbErr ? `Fırlatma veritabanı alınamadı (${this.dbErr})` : 'Fırlatma veritabanı yükleniyor…')); this.setSrc(null, true); return; }
    const py = perYear(db), y = Math.min(Math.max(this.statYear, py.yillar[0]), py.yillar[py.yillar.length - 1]), s = yearSummary(db, y);
    const prev = py.yillar.includes(y - 1) ? py.toplam[py.yillar.indexOf(y - 1)] : null;
    const out = [];
    // yıl seçimi
    const head = mk('div', 'lp-stathead');
    const ys = mk('select'); ys.setAttribute('aria-label', 'Yıl');
    for (let k = py.yillar.length - 1; k >= 0; k--) { const o = mk('option', null, String(py.yillar[k])); o.value = String(py.yillar[k]); if (py.yillar[k] === y) o.selected = true; ys.appendChild(o); }
    ys.addEventListener('change', () => { this.statYear = +ys.value; this.render(); });
    head.append(mk('h3', null, 'Yörüngesel fırlatmalar'), ys);
    out.push(head);
    // sayı kutucukları
    const tiles = mk('div', 'lp-tiles');
    const tile = (label, value, sub) => { const d = mk('div', 'lp-tile'); d.append(mk('span', 'lp-tl', label), mk('b', 'lp-tv', value)); if (sub) d.appendChild(mk('span', 'lp-ts', sub)); tiles.appendChild(d); };
    const partialYear = y === new Date().getUTCFullYear();
    tile('Fırlatma', fmt(s.n, 0), [prev !== null ? `geçen yıl: ${fmt(prev, 0)}` : null, partialYear ? 'yıl sürüyor' : null].filter(Boolean).join(' · ') || null);
    tile('Başarı', s.oran === null ? '—' : pct(s.oran), `${fmt(s.basarili, 0)} başarılı`);
    tile('Başarısız', fmt(s.basarisiz, 0), s.basarisiz ? null : 'kayıp yok');
    out.push(tiles);
    // yıllara göre sütun grafiği
    out.push(mk('p', 'lp-chart-t', 'Yıllara göre fırlatmalar'));
    out.push(this.yearChart(py, y));
    // en çok fırlatanlar
    const rank = (title, items, nameOf, apply) => {
      const box = mk('div', 'lp-rank'); box.appendChild(mk('p', 'lp-chart-t', title));
      const max = items.length ? items[0][1] : 1, ul = mk('ul');
      for (const [k, n] of items) {
        const li = mk('li'), b = mk('button', 'lp-rrow'); b.type = 'button'; b.title = 'Geçmişte göster';
        const nm = mk('span', 'lp-rname', nameOf(k)); if (apply.data) noTr(nm);
        const bar = mk('span', 'lp-rbar'), fill = mk('span'); fill.style.width = `${Math.max(2, (100 * n) / max)}%`; bar.appendChild(fill);
        b.append(nm, bar, mk('span', 'lp-rv', fmt(n, 0)));
        b.addEventListener('click', () => apply.fn(k));
        li.appendChild(b); ul.appendChild(li);
      }
      box.appendChild(ul); return box;
    };
    const toHist = (f) => { this.f = { ...NOF(), yil: y, ...f }; this.shown = PAGE; this.setView('gec'); };
    out.push(rank('Roketler', s.roket, (k) => k, { data: true, fn: (k) => toHist({ q: k }) }));
    out.push(rank('Ülkeler', s.ulke, (k) => t(countryName(k)), { fn: (k) => toHist({ ulke: k }) }));
    out.push(rank('Fırlatma yerleri', s.yer, (k) => k, { data: true, fn: (k) => toHist({ q: k }) }));
    if (s.amac.length) out.push(rank('Amaçlar (ana yük)', s.amac, (k) => t(groupName(k)), { fn: (k) => toHist({ amac: k }) }));
    this.body.replaceChildren(...out); this.setSrc(null, true);
  }
  // tek seri sütun grafiği (SVG): seçili yıl vurgulu; üzerine gelince yıl/sayı/başarısız; tıklayınca o yıl seçilir
  yearChart(py, sel) {
    const W = 320, H = 132, padL = 28, padB = 18, padT = 6, n = py.yillar.length, max = Math.max(...py.toplam);
    const step = [50, 100, 150, 200, 250].find((s) => max / s <= 3) || 100, top = Math.ceil(max / step) * step;
    const slot = (W - padL) / n, bw = Math.max(1.5, slot - 2), yOf = (v) => padT + (H - padT - padB) * (1 - v / top);
    const NS = 'http://www.w3.org/2000/svg', el = (tag, a) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
    const wrap = mk('div', 'lp-chart');
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('Yıllara göre yörüngesel fırlatma sayısı, {0}–{1}; en çok {2} ({3})', py.yillar[0], py.yillar[n - 1], fmt(max, 0), py.yillar[py.toplam.indexOf(max)]) });
    for (let v = 0; v <= top; v += step) {
      const yy = yOf(v); svg.appendChild(el('line', { x1: padL, x2: W, y1: yy, y2: yy, class: 'lp-grid' }));
      const tx = el('text', { x: padL - 5, y: yy + 3, class: 'lp-ax', 'text-anchor': 'end' }); tx.textContent = fmt(v, 0); svg.appendChild(tx);
    }
    for (const yr of [1960, 1980, 2000, 2020]) {
      const k = py.yillar.indexOf(yr); if (k < 0) continue;
      const tx = el('text', { x: padL + slot * (k + 0.5), y: H - 4, class: 'lp-ax', 'text-anchor': 'middle' }); tx.textContent = String(yr); svg.appendChild(tx);
    }
    const tip = mk('div', 'lp-tip'); tip.hidden = true;
    py.yillar.forEach((yr, k) => {
      const v = py.toplam[k], x = padL + slot * k + (slot - bw) / 2, yy = yOf(v), h = Math.max(0, H - padB - yy), r = Math.min(2, bw / 2);
      const g = el('g', { class: 'lp-bar' + (yr === sel ? ' on' : '') });
      // veri ucu yuvarlak, tabanda düz
      g.appendChild(el('path', { d: h > r ? `M${x},${H - padB}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${H - padB}Z` : `M${x},${H - padB}V${yy}H${x + bw}V${H - padB}Z` }));
      g.appendChild(el('rect', { x: padL + slot * k, y: padT, width: slot, height: H - padT - padB, class: 'lp-hit' }));      // isabet alanı sütundan geniş
      const show = () => {
        tip.replaceChildren(mk('b', null, String(yr)), mk('div', null, `${fmt(v, 0)} fırlatma`), ...(py.basarisiz[k] ? [mk('div', 'k', `${fmt(py.basarisiz[k], 0)} başarısız`)] : []));
        // ipucu grafiğin içinde, sütunun yanında (sağ yarıda solunda): sayı kutucuklarını ve sütunu örtmez
        tip.hidden = false; const right = k > n / 2, px = ((padL + slot * (right ? k : k + 1)) / W) * 100;
        tip.style.left = `${px}%`; tip.style.transform = right ? 'translateX(calc(-100% - 6px))' : 'translateX(6px)';
        g.classList.add('hover');
      };
      g.addEventListener('pointerenter', show);
      g.addEventListener('pointerleave', () => { tip.hidden = true; g.classList.remove('hover'); });
      g.addEventListener('click', () => { this.statYear = yr; this.render(); });
      svg.appendChild(g);
    });
    wrap.append(svg, tip);
    return wrap;
  }

  // ---------------------------------------------------------------- ortak
  toggle(key) {
    this.open = this.open === key ? null : key;
    if (this.view === 'gec') this.renderHistoryList(); else this.render();
  }
  enter(el) { if (!REDUCED() && el.animate) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); }
  setSrc(cat, db = false) {
    const p = this.src; p.replaceChildren();
    const link = (txt, u) => { const a = noTr(mk('a', null, txt)); a.href = u; a.target = '_blank'; a.rel = 'noopener'; return a; };
    const parts = [];
    if (db) {
      const m = this.db && this.db.meta;
      parts.push([mk('span', null, 'Geçmiş:'), ' ', link('GCAT — J. McDowell, planet4589.org', 'https://planet4589.org/space/gcat'), ' (CC BY 4.0)',
        ...(m ? [' · ', mk('span', null, `${fmt(m.n, 0)} fırlatma`), ' · ', mk('span', null, `veri: ${m.veri}`)] : [])]);
    }
    if (cat || this.launches.cat) {
      const c = cat || this.launches.cat, src = CREDITS[c.kod] || CREDITS.ll2;
      parts.push([mk('span', null, db ? 'Son günler:' : 'Kaynak:'), ' ', link(src.t, src.u), ' · ', mk('span', null, `${fmt(Math.max(0, (Date.now() - c.t) / 60000), 0)} dk önce alındı`)]);
    }
    parts.forEach((ps, k) => { if (k) p.appendChild(mk('br')); p.append(...ps); });
    if (!db) p.append(mk('br'), mk('span', null, 'Saatler yerel saattir; T-0 kesinliği kaynağın bildirdiği kadardır.'));
  }
}
