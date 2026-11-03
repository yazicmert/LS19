// Ay görevi › 1. adım: fırlatma rampası seçimi (dünyadaki yörüngesel rampalar, data/pads.json), rampa bilgisi (menzil, eğim aralığı, kalkış maliyeti),
// fırlatma anının hava durumu (weather.js) ve fırlatma penceresi tarayıcısının tablosu. Görevi app.js tasarlar; bu modül yalnız arayüzdür.
import { padIndex, siteOf, padShort, padAllowed, rangeOf, inclRange, minIncl, ROCKET_PADS, LEGACY_SITE, V_EQ, DEFAULT_PAD_ID } from './pads.js';
import { launchWeather, STATUS_TR, WX_SOURCES } from './weather.js';
import { fmt } from './format.js';
import { utcMsFromT } from './engine.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const COUNTRY_TR = { US: 'ABD', RU: 'Rusya', KZ: 'Kazakistan', CN: 'Çin', FR: 'Fransız Guyanası (Fransa)', GF: 'Fransız Guyanası (Fransa)', JP: 'Japonya', IN: 'Hindistan', NZ: 'Yeni Zelanda',
  KP: 'Kuzey Kore', KR: 'Güney Kore', IR: 'İran', IL: 'İsrail', BR: 'Brezilya', AU: 'Avustralya', GB: 'Birleşik Krallık', NO: 'Norveç', SE: 'İsveç', KE: 'Kenya', DZ: 'Cezayir', MH: 'Marshall Adaları', XX: 'Deniz / diğer' };

export class LaunchUI {
  constructor({ onSite, onScan, onPick, getRocket, onDay, onPickInc }) {
    this.onSite = onSite; this.onScan = onScan; this.onPick = onPick; this.getRocket = getRocket; this.onDay = onDay; this.onPickInc = onPickInc;
    this.dayBtn = $('#btnDay'); this.dayTb = $('#daytable tbody'); this.dayMsg = $('#dayMsg');
    this.dayBtn.addEventListener('click', () => this.onDay && this.onDay());
    this.dayTb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-inc]'); if (tr && this.onPickInc) this.onPickInc(+tr.dataset.inc); });
    this.sel = $('#padSel'); this.info = $('#padInfo'); this.wx = $('#wxBox'); this.scanBtn = $('#btnScan'); this.scanTb = $('#wintable tbody'); this.scanMsg = $('#winMsg');
    this.pads = new Map(); this.site = null; this.wxSeq = 0;
    this.ready = fetch('data/pads.json').then((r) => (r.ok ? r.json() : null)).then((j) => { this.pads = padIndex(j); this.meta = j; this.fill(); }).catch(() => { this.info.textContent = 'Rampa listesi yüklenemedi; varsayılan KSC LC-39B kullanılıyor.'; });
    this.sel.addEventListener('change', () => { const id = +this.sel.value; this.site = id ? siteOf(this.pads.get(id)) : null; this.renderInfo(); this.onSite && this.onSite(this.site); });
    this.scanBtn.addEventListener('click', () => this.onScan && this.onScan());
    this.scanTb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-date]'); if (tr && this.onPick) this.onPick(tr.dataset.date); });
  }
  fill() {
    const sel = this.sel; sel.replaceChildren();
    const def = el('option', null, `${LEGACY_SITE.short} — varsayılan (hazır tasarımlar)`); def.value = '0'; sel.append(def);
    // listedeki LC-39B (LL2 4) varsayılanın kendisi: ayrıca listelenmez
    const groups = new Map();
    for (const p of this.pads.values()) {
      const g = COUNTRY_TR[p.cc] || p.country || p.cc || '—';
      if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p);
    }
    for (const g of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'tr'))) {
      const og = document.createElement('optgroup'); og.label = g;
      for (const p of groups.get(g).sort((a, b) => b.n - a.n)) {
        if (p.id === DEFAULT_PAD_ID) continue;
        const o = el('option', null, `${p.loc.replace(/,.*$/, '')} · ${padShort(p.name)} (${p.n} fırlatma${p.active ? '' : ', etkin değil'})`); o.value = String(p.id); og.append(o);
      }
      sel.append(og);
    }
    this.syncRocket(); this.setSite(this.site);
  }
  // seçili roket yalnız gerçek rampalarından fırlayabilir: diğerleri devre dışı
  syncRocket() {
    const rk = this.getRocket ? this.getRocket() : null;
    for (const o of this.sel.querySelectorAll('option')) { const id = +o.value; o.disabled = !!(id && rk && !padAllowed(rk, id)); }
    this.renderInfo();
  }
  // roket için rampa değişikliği: undefined = gerek yok; yoksa roketin ilk gerçek rampası (null = varsayılan LC-39B)
  padFor(rocket) {
    const cur = this.site ? this.site.id : 0;
    if (padAllowed(rocket, cur)) return undefined;
    const p = this.pads.get((ROCKET_PADS[rocket] || [])[0]); return p ? siteOf(p) : undefined;
  }
  setSite(site) {
    this.site = site && site.id ? site : null;
    this.sel.value = String(this.site ? this.site.id : 0);
    if (this.site && this.sel.value !== String(this.site.id)) this.sel.value = '0';
    this.renderInfo();
  }
  renderInfo() {
    const s = this.site || LEGACY_SITE, p = this.site ? this.pads.get(this.site.id) : null, r = p ? rangeOf(p.loc) : { name: 'Doğu Menzili', az: [35, 120] };
    const ir = s.az ? inclRange(s.lat, s.az) : [minIncl(s.lat), 90];
    const lat = `${Math.abs(s.lat).toFixed(3)}° ${s.lat >= 0 ? 'K' : 'G'}`, lon = `${Math.abs(s.lon).toFixed(3)}° ${s.lon >= 0 ? 'D' : 'B'}`;
    const t = [];
    t.push(`${p ? `${p.loc} · ${p.name}` : LEGACY_SITE.name + ' (varsayılan)'} — ${lat}, ${lon}.`);
    t.push(r ? `${r.name}: izinli azimut ${r.az[0]}°–${r.az[1]}° → park eğimi ${ir ? `${fmt(ir[0], 1)}°–${fmt(ir[1], 1)}°` : 'yok'}.` : `Menzil güvenliği sınırı verisi yok: yalnız enlem sınırı (eğim ≥ ${fmt(minIncl(s.lat), 1)}°).`);
    t.push(`Dünya dönüşünün katkısı ${fmt(V_EQ * 1000, 0)}·cos i m/s; en düşük eğimde ${fmt(V_EQ * 1000 * Math.cos((ir ? ir[0] : minIncl(s.lat)) * Math.PI / 180), 0)} m/s (Florida 28,5° için ${fmt(V_EQ * 1000 * Math.cos(28.5 * Math.PI / 180), 0)} m/s).`);
    this.info.replaceChildren(document.createTextNode(t.join(' ')));
    if (p && p.wiki) { const a = el('a', null, 'Rampa hakkında'); a.href = p.wiki; a.target = '_blank'; a.rel = 'noopener noreferrer'; this.info.append(a); }
    const src = el('small', null, ` · Rampa listesi: ${this.meta ? this.meta.kaynak + ', ' + this.meta.derlendi : 'Launch Library 2'}`); this.info.append(src);
  }
  // tasarlanan görev: kalkış özeti + fırlatma anının hava durumu
  async showDesign(D) {
    const id = ++this.wxSeq, L = D.LAUNCH, s = { lat: L.lat ?? LEGACY_SITE.lat, lon: L.lon ?? LEGACY_SITE.lon };
    const A = D.ASCENT, box = this.wx; box.replaceChildren();
    const head = el('div', 'wx-head');
    head.append(el('b', null, 'Kalkış'), document.createTextNode(` ${(L.site || '').replace(/\s*\(.*$/, '')}: azimut ${fmt(L.az, 1)}°, park eğimi ${fmt(D.inc, 1)}°` +
      (A ? ` · dönüş katkısı ${fmt(V_EQ * 1000 * Math.cos(D.inc * Math.PI / 180), 0)} m/s, 28,5°'ye göre ${A.dvPen >= 0 ? '+' : '−'}${fmt(Math.abs(A.dvPen), 1)} m/s` : '')));
    box.append(head);
    if (D.TLI_NEED != null && D.STAGES && D.STAGES[0] && D.STAGES[0].rocket && D.STAGES[0].rocket !== 'GENEL') {
      const m = D.STAGES[0].prop - D.TLI_NEED;
      box.append(el('div', 'wx-line', `TLI kademesi: park yörüngesinde ${fmt(D.STAGES[0].prop, 0)} kg yakıt, TLI${D.RAISE ? ' ve yükseltme' : ''} için ${fmt(D.TLI_NEED, 0)} kg gerekli → yakıt payı ${m >= 0 ? '+' : '−'}${fmt(Math.abs(m), 0)} kg.`));
    }
    const wl = el('div', 'wx-line', 'Hava durumu yükleniyor…'); box.append(wl);
    const tMs = utcMsFromT(D.LAUNCH.t_launch);
    const res = await launchWeather(s.lat, s.lon, tMs);
    if (id !== this.wxSeq) return;
    this.renderWx(wl, res, tMs);
  }
  renderWx(node, res, tMs) {
    node.replaceChildren();
    const when = new Date(tMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    if (res.status === 'na') { node.append(document.createTextNode(`Hava (${when}): veri yok — ${res.why}.`)); return; }
    const badge = el('span', 'wx-badge ' + res.status, STATUS_TR[res.status]);
    node.append(el('b', null, `Hava (${when}, ${res.kind === 'past' ? 'gerçekleşen' : 'tahmin'}): `), badge);
    const ul = el('ul', 'wx-checks');
    for (const c of res.checks) { const li = el('li', 'st-' + c.st); li.append(el('span', 'k', c.k), el('span', 'v', c.v), el('span', 'r', STATUS_TR[c.st])); li.title = c.rule; ul.append(li); }
    node.append(ul);
    if (res.status !== 'go') {                                                         // hava uygun değil/riskli: aynı günün diğer fırsatları
      const b = el('button', 'sm', 'Günün diğer fırsatlarını havayla değerlendir'); b.type = 'button';
      b.addEventListener('click', () => { this.onDay && this.onDay(); this.dayTb.closest('table').scrollIntoView({ block: 'nearest' }); });
      node.append(b);
    }
    const src = el('small', 'wx-src', 'Kurallar yaklaşık (saatlik model verisi): ');
    WX_SOURCES.forEach((x, i) => { const a = el('a', null, x.t); a.href = x.u; a.target = '_blank'; a.rel = 'noopener noreferrer'; src.append(a); if (i < WX_SOURCES.length - 1) src.append(document.createTextNode(' · ')); });
    node.append(src);
  }
  // günlük pencere tablosu: rows = [{ inc, D, cost, margin, wx, err, busy }], pick = { index, why }
  setDay(rows, msg = '', busy = false, pick = null) {
    this.dayBtn.disabled = busy; this.dayMsg.textContent = msg;
    const tb = this.dayTb; tb.replaceChildren();
    rows.forEach((r, i) => {
      const tr = el('tr');
      if (r.D) {
        const D = r.D, L = D.LAUNCH, ms = utcMsFromT(L.t_launch), rec = pick && pick.index === i;
        tr.dataset.inc = String(D.inc); tr.className = 'pick' + (rec ? ' best' : ''); tr.title = rec ? 'Önerilen: ' + pick.why : 'Bu fırsatla görevi kur';
        tr.append(el('td', null, (rec ? '★ ' : '') + new Date(ms).toISOString().slice(0, 16).replace('T', ' ')), el('td', 'num', fmt(L.az, 0) + '°'), el('td', 'num', fmt(D.inc, 1) + '°'),
          el('td', 'num', fmt(D.sunElAtLanding, 1) + '°'), el('td', 'num', fmt(r.cost, 0)), el('td', null, r.margin == null ? '—' : (r.margin >= 0 ? '+' : '−') + fmt(Math.abs(r.margin), 0) + ' kg'));
        const w = el('td'); w.append(el('span', 'wx-badge ' + (r.wx ? r.wx.status : 'na'), r.wx ? (r.wx.status === 'na' ? '—' : STATUS_TR[r.wx.status]) : '…'));
        if (r.wx) w.title = r.wx.why || (r.wx.checks || []).filter((c) => c.st !== 'go').map((c) => `${c.k}: ${c.v}`).join(' · ') || 'tüm ölçütler uygun';
        tr.append(w);
      } else { const td = el('td', null, `eğim ${fmt(r.inc, 1)}°: ${r.busy ? 'hesaplanıyor…' : r.err || '—'}`); td.colSpan = 7; tr.append(td); }
      tb.append(tr);
    });
  }
  // pencere tarayıcı tablosu: rows = [{ date, D, wx, err, busy }]
  setScan(rows, msg = '', busy = false) {
    this.scanBtn.disabled = busy; this.scanMsg.textContent = msg;
    const tb = this.scanTb; tb.replaceChildren();
    const ok = rows.filter((r) => r.D), best = ok.length ? Math.min(...ok.map((r) => r.cost)) : null;
    for (const r of rows) {
      const tr = el('tr');
      if (r.D) {
        const D = r.D, L = D.LAUNCH, ms = utcMsFromT(L.t_launch); tr.dataset.date = new Date(ms).toISOString().slice(0, 10); tr.className = 'pick' + (r.cost === best ? ' best' : ''); tr.title = 'Bu pencereyle görevi kur';
        const d = r.cost - best;
        tr.append(el('td', null, new Date(ms).toISOString().slice(0, 16).replace('T', ' ')), el('td', 'num', fmt(L.az, 0) + '°'), el('td', 'num', fmt(D.inc, 1) + '°'),
          el('td', 'num', fmt(r.dvTot, 0)), el('td', 'num', fmt(r.cost, 0)), el('td', 'num ' + (d > 0.5 ? 'worse' : 'better'), d > 0.5 ? '+' + fmt(d, 0) : 'en az'),
          el('td', null, r.margin == null ? '—' : (r.margin >= 0 ? '+' : '−') + fmt(Math.abs(r.margin), 0) + ' kg'));
        const w = el('td'); w.append(el('span', 'wx-badge ' + (r.wx ? r.wx.status : 'na'), r.wx ? (r.wx.status === 'na' ? '—' : STATUS_TR[r.wx.status]) : '…'));
        if (r.wx) w.title = r.wx.why || (r.wx.status === 'nogo' ? 'Bu fırsatta hava uygun değil: pencereyi kurup günlük pencerede diğer fırsatlara bakın' : ''); tr.append(w);
      } else {
        const td = el('td', null, r.busy ? `${r.from}: hesaplanıyor…` : `${r.from}: ${r.err || '—'}`); td.colSpan = 8; tr.append(td);
      }
      tb.append(tr);
    }
  }
}
