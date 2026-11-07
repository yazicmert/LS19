// Fırlatma ayrıntısında "Yükler" bölümü (launchpanel.js): fırlatmanın taşıdığı her uydu, uzay aracı ya da kapsül — amacı, neyi araştırdığı,
// sahibi, bugün nerede olduğu. Satıra dokununca: Vikipedi özeti (Wikidata eşlemesi olan yüklerde), ayrıntılar ve ölçekli yörünge çizimi.
// Hâlâ Dünya yörüngesindeyse "3B'de izle": etkin uydu listesindeyse doğrudan, değilse kaydı CelesTrak'tan alınıp sahneye eklenir (satlayer.js
// addByNorad). Atmosfere girmiş, dönmüş ya da derin uzaydaki yüklerde son durum ve (Dünya çevresindeyse) ilk yörüngesinin çizimi.
// Kalabalık fırlatmalar (Starlink, paylaşımlı uçuşlar) aynı programdaki yükleri tek satırda toplar. Yük verisi yıla göre, ilk açılışta iner.
// Veritabanında yük listesi olmayan fırlatmalarda (yaklaşan, veritabanından yeni) "Görev yükü" kartı: LL2'nin bildirdiği yükler ve araç, görev
// adından çözümleme (payloadresolve.js: yük ailesi, Wikidata/Vikipedi, görevin kendi sitesi). Vikipedi eşlemesi olmayan yükte de ad ile aranır.
import { loadPayloads, payloadsOf, groupPayloads, statusOf, statusCounts, purposes, disciplines, CLASS, PURPOSE, groupOf, groupName, orbitInfo, parseVague, stateName, wikiPick, wikiSummary, wikiUrl } from './payloads.js';
import { nameCandidates, familyLookup, loadFamilies, wikidataLookup, ll2Group } from './payloadresolve.js';
import { fmt } from './format.js';
import { mk } from './uiutil.js';
import { applyIcons } from './icons.js';
import { COUNTRY } from './launchdb.js';
import { LOC, t, lang, UNIT } from './i18n.js';

const MEMBERS = 30;                                  // açılan grupta önce gösterilen yük sayısı
const noTr = (el) => { el.setAttribute('translate', 'no'); return el; };
const DATA = new Map();                              // yıl -> yük verisi (indirildiyse)
function vdate(s) {
  const v = parseVague(s); if (!v) return '';
  const o = v.kesinlik === 'gun' ? { day: 'numeric', month: 'short', year: 'numeric' } : v.kesinlik === 'ay' ? { month: 'long', year: 'numeric' } : { year: 'numeric' };
  return (v.belirsiz ? '≈ ' : '') + new Date(v.ms).toLocaleDateString(LOC, { ...o, timeZone: 'UTC' });
}
const mass = (kg) => (kg >= 1000 ? `${fmt(kg / 1000, 1)} t` : kg >= 10 ? `${fmt(kg, 0)} kg` : `${fmt(kg, 1)} kg`);
const statusText = (p, s) => t(s.tpl, ...(p.st === 'A' || p.st === 'K' ? s.args : s.args.map((a) => t(a))));
const purposeText = (p) => purposes(p).map((x) => t(x.ad) + (x.belirsiz ? ' (?)' : '')).join(' · ');
// ülke: fırlatma listesindeki kısa adlar (ABD, SSCB…) varsa onlar, yoksa tarayıcının yerel adı
const ownerText = (p) => (p.sahip ? [p.sahip[0], COUNTRY[p.sahip[2]] ? t(COUNTRY[p.sahip[2]]) : stateName(p.sahip[2], lang)].filter(Boolean).join(' · ') : '');

export class PayloadView {
  constructor({ sats, follow, search = null }) {
    Object.assign(this, { sats, follow, search });          // search(q): Geçmiş'te ara (yük ailesi satırı)
    this.openP = null; this.openG = new Set(); this.allG = new Set(); this.err = new Map(); this.busy = new Set(); this.boxes = new Set();
  }
  // görünen tüm yük bölümlerini yeniden çiz (uzun süren işten sonra: panel bu arada yeniden kurulmuş olabilir)
  refresh() { for (const b of this.boxes) { if (!b.isConnected) { this.boxes.delete(b); continue; } b._fill(); applyIcons(b); } }
  // bölüm öğesi; veri gelince doldurulur. fallback(): yük verisi olmayan (çok yeni) fırlatmada gösterilecek öğe
  section(tag, year, fallback, ms = null) {
    const box = mk('section', 'py'), d = DATA.get(year);
    const done = (pd) => { this.fill(box, pd, tag, fallback, ms); applyIcons(box); };
    if (d) done(d);
    else {
      box.appendChild(mk('p', 'py-wait', 'Yükler yükleniyor…'));
      loadPayloads(year).then((pd) => { DATA.set(year, pd); if (box.isConnected) done(pd); })
        .catch((e) => { if (box.isConnected) box.replaceChildren(mk('p', 'py-wait', t('Yük verisi alınamadı ({0})', e.message)), ...(fallback ? [fallback()] : [])); });
    }
    return box;
  }
  fill(box, pd, tag, fallback, ms = null) {
    const list = (payloadsOf(pd, tag) || []).map((p) => ({ ...p, _ms: ms, _tag: tag }));        // fırlatma zamanı ve COSPAR: ad ile aramada doğrulama
    if (!list.length) { box.replaceChildren(...(fallback ? [fallback()] : [])); return; }
    const redo = () => { this.fill(box, pd, tag, fallback, ms); applyIcons(box); };
    box._fill = () => this.fill(box, pd, tag, fallback, ms); this.boxes.add(box);
    const head = mk('h4', 'py-h'); head.append(mk('span', null, 'Yükler'), mk('span', 'py-n', fmt(list.length, 0)));
    const ul = mk('ul', 'py-list');
    for (const g of groupPayloads(list)) ul.appendChild(g.one ? this.item(g.one, redo) : this.group(g, redo));
    box.replaceChildren(head, ul);
  }
  // tek yük satırı (compact: grup içinde, amaç satırı yok)
  item(p, redo, compact = false) {
    const key = p.p + '|' + p.ad, on = this.openP === key, s = statusOf(p);
    const li = mk('li', 'py-item' + (on ? ' on' : '') + (compact ? ' sm' : ''));
    const row = mk('div', 'py-row'), btn = mk('button', 'py-main'); btn.type = 'button'; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    const txt = mk('span', 'py-txt');
    txt.appendChild(noTr(mk('b', 'py-name', p.ad)));
    if (!compact && p.k) txt.appendChild(mk('span', 'py-pur', purposeText(p)));
    const st = mk('span', 'py-st'); st.append(mk('i', 'py-dot ' + s.kind), mk('span', null, statusText(p, s)));
    if (p.sd && !s.live) st.append(mk('span', 'py-sd', '· ' + vdate(p.sd)));
    txt.appendChild(st);
    btn.appendChild(txt);
    btn.addEventListener('click', () => { this.openP = on ? null : key; redo(); });
    row.appendChild(btn);
    if (s.live && p.n) row.appendChild(this.watchBtn(p, redo, compact));
    li.appendChild(row);
    if (this.err.has(p.n)) li.appendChild(mk('p', 'py-err', this.err.get(p.n)));
    if (on) { const det = this.detail(p, s); li.appendChild(det); enter(det); }
    return li;
  }
  // 3B'de izle: etkin listedeyse hemen; değilse kaydı alıp sahneye ekle
  // compact (grup üyeleri): yalnız simge; adı aria-label'da
  watchBtn(p, redo, compact = false) {
    const b = mk('button', 'xs py-3d' + (compact ? ' ic' : '')), busy = this.busy.has(p.n);
    b.type = 'button'; b.disabled = busy;
    b.innerHTML = '<i data-icon="orbit"></i>';
    if (!compact) b.appendChild(mk('span', null, busy ? 'Alınıyor…' : "3B'de izle"));
    else b.setAttribute('aria-label', busy ? t('Alınıyor…') : t('{0}: 3B\'de izle', p.ad));
    b.title = t('{0}: kamerayı uyduya kilitle', p.ad);
    b.addEventListener('click', async () => {
      if (!this.sats) return;
      this.err.delete(p.n);
      if (this.sats.byId && this.sats.byId.has(p.n)) { this.follow(p.n); return; }
      this.busy.add(p.n); redo();
      try { await this.sats.addByNorad(p.n); this.busy.delete(p.n); this.refresh(); this.follow(p.n); }
      catch (e) { this.busy.delete(p.n); this.err.set(p.n, t('3B gösterilemedi: {0}', t(e.message))); this.refresh(); }
    });
    return b;
  }
  detail(p, s) {
    const box = mk('div', 'py-det');
    const w = wikiPick(p, lang);
    if (w) box.appendChild(wikiBlock(w));
    else {           // eşleme yok: yükün adıyla Wikidata'da ara (fırlatma tarihi ya da COSPAR tutmalı); bulunamazsa sessizce kalkar
      const names = [p.ad, ...(p.ad2 ? p.ad2.split(' · ') : [])].filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 3);
      box.appendChild(lookupBlock(names, { ms: p._ms ?? null, cospar: /^\d{4}-\d{3}$/.test(p._tag || '') ? p._tag : null }, true));
    }
    const dl = mk('dl', 'tk-dl py-dl');
    const dd = (k, v, data = false) => { if (!v) return; const d = mk('dd', null, v); if (data) noTr(d); dl.append(mk('dt', null, k), d); };
    dd('Amaç', purposes(p).map((x) => t(x.ad) + (x.belirsiz ? ' (?)' : '')).join(', '));
    dd('Araştırma', disciplines(p).map((x) => t(x)).join(', '));
    dd('Program', p.pr, true);
    if (p.sahip) { dd('Sahip', ownerText(p)); if (p.sahip[1]) dl.lastChild.title = p.sahip[1]; }
    if (p.s) dd('Sınıf', p.s.split('').map((c) => t(CLASS[c] || c)).join(' + '));
    if (p.kg) dd('Kütle', mass(p.kg));
    dd('Durum', [statusText(p, s), p.sd && !s.live ? vdate(p.sd) : null].filter(Boolean).join(' · '));
    if (p.te && p.te !== p.sd) dd('Görev sonu', vdate(p.te));
    if (p.r === 'F') dd('Sonuç', 'Yük görevini yapamadı (erken arıza)');
    else if (p.r === 'N' && p.st !== 'F') dd('Sonuç', 'Denenemedi (fırlatma sorunu)');
    dd('Öteki adlar', p.ad2, true);
    dd('Kimlik', `COSPAR ${p.p}${p.n ? ` · NORAD ${p.n}` : ''}`);
    if (p.c) { dd('Not', p.c, true); dl.lastChild.lang = 'en'; }
    box.appendChild(dl);
    if (s.kind !== 'deep') { const f = orbitFigure(p, s.live); if (f) box.appendChild(f); }
    return box;
  }
  // veritabanında yük listesi olmayan fırlatma (LL2 kaydı): LL2'nin yükleri ve aracı + görev adından çözümleme
  liveSection(l) {
    const d = l.d || {}, box = mk('section', 'py py-live'), ul = mk('ul', 'py-list');
    const head = mk('h4', 'py-h'); head.appendChild(mk('span', null, 'Görev yükü'));
    for (const y of d.yuk || []) ul.appendChild(ll2Item(y));
    ul.appendChild(this.missionItem(l));
    box.append(head, ul);
    applyIcons(box);
    return box;
  }
  // görev adından: amaç (LL2 görev türü, yoksa aile), yük ailesi, Wikidata/Vikipedi, görevin kendi sayfaları
  missionItem(l) {
    const d = l.d || {}, li = mk('li', 'py-item py-mis'), body = mk('div', 'py-mbody');
    const names = nameCandidates(l.gorev), g = ll2Group(d.gorevTur);
    const nm = noTr(mk('b', 'py-name', names[0] || l.gorev || '?'));
    const pur = mk('span', 'py-pur', g ? t(groupName(g)) : '');
    body.append(nm, pur);
    const fam = mk('div', 'py-fam'); body.appendChild(fam);
    loadFamilies().then((F) => {
      const f = familyLookup(names, F); if (!f || !fam.isConnected) return;
      // aile amacı LL2 türüyle çelişmiyorsa daha ayrıntılı amaç adı (ör. "Seyrüsefer, konum ve zaman")
      if (f.k && PURPOSE[f.k] && (!g || groupOf(f.k) === g)) pur.textContent = t(PURPOSE[f.k]);
      else if (!g && f.k) pur.textContent = t(PURPOSE[f.k] || f.k);
      const yrs = f.y0 === f.y1 ? String(f.y0) : `${f.y0}–${f.y1}`;
      const line = mk('span', 'py-fl');
      line.append(mk('span', null, t('Aynı aileden {0} yük ({1})', fmt(f.n, 0), yrs)), ...[f.pr, f.sahip, f.ulke ? (COUNTRY[f.ulke] ? t(COUNTRY[f.ulke]) : stateName(f.ulke, lang)) : null]
        .filter(Boolean).map((x) => noTr(mk('span', null, ' · ' + x))));
      fam.appendChild(line);
      if (this.search) { const b = mk('button', 'xs py-fb', 'Geçmişte göster'); b.type = 'button'; b.addEventListener('click', () => this.search(f.kok)); fam.appendChild(b); }
    }).catch(() => { /* aile dizini isteğe bağlı */ });
    // görevin kendi sayfaları: LL2'nin bildirdikleri hemen, Wikidata'nınkiler (P856) gelince — aynı site bir kez
    const seen = new Set(), links = (d.site || []).map((x) => ({ u: x.u, k: x.k }));
    if (names.length) body.appendChild(lookupBlock(names, { ms: l.net, cospar: l.cospar || null }, false, seen));
    if (links.length) body.appendChild(linkRow(links, 'Görevin sayfası', seen));
    li.appendChild(body);
    return li;
  }
  // aynı programdaki yükler (Starlink × 24): açınca üyeler
  group(g, redo) {
    const p0 = g.list[0], key = `g|${g.ad}|${p0.p}`, on = this.openG.has(key), n = g.list.length;
    const li = mk('li', 'py-item py-grp' + (on ? ' on' : ''));
    const btn = mk('button', 'py-main'); btn.type = 'button'; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    const txt = mk('span', 'py-txt'), nm = mk('b', 'py-name');
    nm.append(noTr(mk('span', null, g.ad)), mk('span', 'py-x', ` × ${fmt(n, 0)}`));
    txt.appendChild(nm);
    const sub = [p0.k ? purposeText(p0) : null, ownerText(p0)].filter(Boolean).join(' · ');
    if (sub) txt.appendChild(mk('span', 'py-pur', sub));
    const st = mk('span', 'py-st');
    statusCounts(g.list).slice(0, 3).forEach(([tpl, k, kind], j) => { if (j) st.append(' · '); st.append(mk('i', 'py-dot ' + kind), mk('span', null, `${t(tpl)} ${fmt(k, 0)}`)); });
    txt.appendChild(st);
    btn.append(txt, mk('span', 'py-chev', on ? '−' : '+'));
    btn.addEventListener('click', () => { if (on) this.openG.delete(key); else this.openG.add(key); redo(); });
    li.appendChild(btn);
    if (on) {
      const sub2 = mk('ul', 'py-sub'), all = this.allG.has(key), shown = all ? g.list : g.list.slice(0, MEMBERS);
      for (const p of shown) sub2.appendChild(this.item(p, redo, true));
      if (shown.length < n) {
        const more = mk('button', 'xs lp-more', t('Tümünü göster ({0})', fmt(n, 0))); more.type = 'button';
        more.addEventListener('click', () => { this.allG.add(key); redo(); });
        const mli = mk('li'); mli.appendChild(more); sub2.appendChild(mli);
      }
      li.appendChild(sub2); enter(sub2);
    }
    return li;
  }
}

// LL2'nin bildirdiği yük ya da araç satırı (kaynak İngilizce: çevrilmez)
function ll2Item(y) {
  const li = mk('li', 'py-item py-ll2'), body = mk('div', 'py-mbody');
  const nm = mk('b', 'py-name'); nm.appendChild(noTr(mk('span', null, y.ad))); if (y.adet) nm.appendChild(mk('span', 'py-x', ` × ${fmt(y.adet, 0)}`));
  body.appendChild(nm);
  const sub = [y.arac ? t('Uzay aracı') : null, y.tur, y.op, y.uretici && y.uretici !== y.op ? y.uretici : null].filter(Boolean);
  if (sub.length) body.appendChild(noTr(mk('span', 'py-pur', sub.join(' · '))));
  const meta = [y.hedef ? t('hedef: {0}', y.hedef) : null, y.kg ? mass(y.kg) : null].filter(Boolean);
  if (meta.length) body.appendChild(mk('span', 'py-st', meta.join(' · ')));
  if (y.aciklama) { const p = noTr(mk('p', 'py-desc', y.aciklama)); p.lang = 'en'; body.appendChild(p); }
  const links = [y.url ? { u: y.url } : null, y.wiki ? { u: y.wiki, k: 'Vikipedi' } : null].filter(Boolean);
  if (links.length) body.appendChild(linkRow(links, 'Sitesi'));
  li.appendChild(body);
  return li;
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
// dış bağlantılar: "Görevin sayfası: mmx.jaxa.jp · spacex.com"; aynı site bir kez (seen: bölümde gösterilmiş siteler)
function linkRow(links, label, seen = new Set()) {
  links = links.filter((x) => { const h = host(x.u) + (x.k === 'Vikipedi' ? '#w' : ''); if (seen.has(h)) return false; seen.add(h); return true; });
  const row = mk('div', 'py-links'); if (!links.length) return row;
  row.appendChild(mk('span', 'k', label));
  links.forEach((x, i) => {
    const a = mk('a', 'lp-link'); a.href = x.u; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(x.k === 'Vikipedi' ? mk('span', null, 'Vikipedi') : noTr(mk('span', null, x.k && !/^https?:/.test(x.k) ? x.k : host(x.u))));
    if (i) row.appendChild(mk('span', 'k', '·'));
    row.appendChild(a);
  });
  return row;
}
// ad ile Wikidata araması: açıklama, Vikipedi özeti, kendi sitesi. quiet: bulunamazsa hiçbir şey gösterme
function lookupBlock(names, opt, quiet, seen = new Set()) {
  const box = mk('div', 'py-wd'), wait = mk('p', 'py-wait', 'Ansiklopedide aranıyor…');
  box.appendChild(wait);
  wikidataLookup(names, opt).then((it) => {
    if (!box.isConnected) return;                    // panel bu arada yeniden kuruldu
    if (!it) { if (quiet) box.remove(); else wait.textContent = t('Ansiklopedide bu görevin kaydı bulunamadı.'); return; }
    const kids = [];
    const desc = (lang === 'tr' && it.aciklama.tr) || it.aciklama.en;
    if (desc) { const p = noTr(mk('p', 'py-wdd')); p.append(noTr(mk('b', null, it.ad)), ' — ', desc); p.lang = lang === 'tr' && it.aciklama.tr ? 'tr' : 'en'; kids.push(p); }
    const w = wikiPick(it, lang); if (w) kids.push(wikiBlock(w));
    if (it.site.length) { const r = linkRow(it.site.map((u) => ({ u })), 'Kendi sitesi', seen); if (r.childNodes.length) kids.push(r); }
    if (it.cospar.length) kids.push(mk('span', 'py-lic', `Wikidata ${it.id} · COSPAR ${it.cospar.slice(0, 2).join(', ')}`));
    else kids.push(mk('span', 'py-lic', `Wikidata ${it.id}`));
    box.replaceChildren(...kids); applyIcons(box);
  }).catch(() => { if (quiet) box.remove(); else wait.textContent = t('Ansiklopedi şu an yanıt vermiyor.'); });
  return box;
}
function enter(el) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && el.animate) el.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
}
// Vikipedi özeti (dokununca açılan ayrıntıda; metin kaynağın dilinde, çevrilmez)
function wikiBlock(w) {
  const box = mk('div', 'py-wiki');
  const head = mk('div', 'py-wh');
  head.append(mk('span', 'py-wl', w.lang === 'en' && lang !== 'en' ? 'Vikipedi (İngilizce)' : 'Vikipedi'));
  const a = mk('a', 'lp-link'); a.href = wikiUrl(w.title, w.lang); a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.appendChild(mk('span', null, 'Maddeyi aç')); head.appendChild(a);
  const p = noTr(mk('p', 'py-wt', '…')); p.lang = w.lang;
  box.append(head, p);
  wikiSummary(w.title, w.lang).then((j) => {
    if (!j.metin) { p.remove(); return; }
    p.textContent = j.metin; a.href = j.url;
    box.appendChild(mk('span', 'py-lic', 'Metin: Vikipedi, CC BY-SA 4.0'));
  }).catch(() => { p.removeAttribute('translate'); p.removeAttribute('lang'); p.className = 'py-wt k'; p.textContent = t('Özet şu an alınamadı; madde bağı yukarıda.'); });
  return box;
}
// ölçekli yörünge çizimi (yörünge düzlemine dik bakış): Dünya, elips, perije/apoje; Dünya'da kalmayanlarda ilk yörünge (kesikli)
function orbitFigure(p, live) {
  const oi = orbitInfo(p); if (!oi) return null;
  const R = 6378.137, a = oi.a, e = oi.e, c = a * e, b = a * Math.sqrt(1 - e * e);
  const x0 = -(R + p.ap), x1 = R + p.pe, W = x1 - x0, H = Math.max(2 * Math.max(b, R), W * 0.3), m = W * 0.05;
  const rE = Math.max(R, W * 0.03), dot = W * 0.014;               // çok uzun yörüngede Dünya ve uç noktaları görünür kalsın
  const NS = 'http://www.w3.org/2000/svg', el = (tag, at) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) n.setAttribute(k, v); return n; };
  const fig = mk('figure', 'py-fig');
  const svg = el('svg', { viewBox: `${x0 - m} ${-H / 2 - m} ${W + 2 * m} ${H + 2 * m}`, preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-label': t('{0} yörünge çizimi: perije {1} km, apoje {2} km', p.ad, fmt(p.pe, 0), fmt(p.ap, 0)) });
  svg.appendChild(el('ellipse', { cx: -c, cy: 0, rx: a, ry: b, class: 'py-orb' + (live ? '' : ' old'), 'vector-effect': 'non-scaling-stroke' }));
  svg.appendChild(el('circle', { cx: 0, cy: 0, r: rE, class: 'py-earth' }));
  if (rE === R) svg.appendChild(el('circle', { cx: x1, cy: 0, r: dot, class: 'py-pt' }));         // Dünya büyütüldüyse perije noktası onun içinde kalır
  if (e > 0.01) svg.appendChild(el('circle', { cx: x0, cy: 0, r: dot, class: 'py-pt ap' }));
  const cap = mk('figcaption', 'py-cap');
  const per = oi.periyot < 300 ? `${fmt(oi.periyot, 0)} ${UNIT.min}` : oi.periyot < 2880 ? `${fmt(oi.periyot / 60, 1)} ${UNIT.h}` : t('{0} gün', fmt(oi.periyot / 1440, 1));
  cap.append(mk('b', null, t(oi.ad)), mk('span', null, `${fmt(p.pe, 0)} × ${fmt(p.ap, 0)} km`), ...(p.inc != null ? [mk('span', null, `${fmt(p.inc, 1)}°`)] : []),
    mk('span', null, t('periyot {0}', per)), ...(live ? [] : [mk('span', 'k', 'ilk yörüngesi')]));
  fig.append(svg, cap);
  return fig;
}
