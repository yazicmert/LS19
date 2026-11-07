// LS19 arayüzü: HUD, görev paneli (olaylar, Δv bütçesi, grafikler, yörünge elemanları)
import * as E from './engine.js';
import { R_SITE, STAGES, siteIcrf } from './mission.js';
import { ControlPanel } from './controlpanel.js';
import { sunElevationAtSite, PROFILES, normalizeConfig } from './design.js';
import { ROCKETS, ROCKET_IDS, DEFAULT_ROCKET, rocketOf, tliCapacity, parkPropellant } from './rockets.js';
import { ROCKET_INFO } from './rocketinfo.js';
import { dvKeys, DV_NAMES, dvFromEvents } from './dvbudget.js';
import { fmt, fmtDur } from './format.js';

import { ellipsoidAlt } from './geo.js';
import { $, setText, setWidth, utcShort } from './uiutil.js';
import { mixin } from './mixin.js';
import { PickCard } from './pickcard.js';
import { SatPanel } from './satpanel.js';
import { FlightTools } from './flighttools.js';
import { LineChart } from './linechart.js';
;

const PHASE_TR = { KALKIS: 'Kalkış (canlandırma; fizik yörüngeye girişte başlar)', PARK: 'Park yörüngesi', YUKSELTME: 'Yörünge yükseltme: eliptik park yörüngesi', TLI: "Ay'a transfer yakışı (TLI)", SUZULME: 'Serbest süzülme', 'MCC-1': 'Orta rota düzeltmesi 1',
  'MCC-2': 'Orta rota düzeltmesi 2', 'MCC-3': 'Orta rota düzeltmesi 3', LOI: 'Ay yörüngesine giriş (LOI)', AY_YORUNGESI: 'Ay yörüngesi',
  DOI: 'İniş yörüngesine geçiş (DOI)', INIS_SUZULME: "15 km'ye alçalış", PDI: 'Motorlu iniş: frenleme', YAKLASMA: 'Motorlu iniş: yaklaşma',
  SON_INIS: 'Son iniş', INDI: 'Yüzeyde', NRI: 'Halo yörüngesine giriş (NRI)', HALO: 'Halo yörüngesinde', DEP: "Halo'dan ayrılış yakışı",
  TRANSFER: "LLO'ya iniş transferi" };
const phaseName = (p) => PHASE_TR[p] || (/^SK-\d+$/.test(p) ? `İstasyon tutma yakışı (${p})` : /^RAISE-\d+$/.test(p) ? `Yörünge yükseltme yakışı ${p.slice(6)}` : p);
const sameCfg = (a, b) => JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
// roket kartı: ad, durum, rampa; TLI kademesi; türetilmiş TLI kapasitesi (rockets.js)
function rocketCard(id) {
  const r = ROCKETS[id], st = r.stage, cap = tliCapacity(id), w = document.createElement('div'), b = document.createElement('button');
  w.className = 'rcard'; b.className = 'optcard'; b.type = 'button'; b.dataset.rocket = id;
  const t = document.createElement('b'); t.textContent = r.name;
  const sm = document.createElement('small');
  sm.textContent = `${r.status} · ${r.pad}. TLI kademesi ${st.name}${st.engine ? ' (' + st.engine + ')' : ''}: ${fmt(st.T, 1)} kN, Isp ${fmt(st.isp, 1)} s, ${st.prop}` +
    (cap ? ` · TLI kapasitesi ≈ ${fmt(cap / 1000, 1)} t` : ' · yakıt göreve göre boyutlanır');
  b.append(t, sm); w.append(b);
  if (ROCKET_INFO[id]) {                                                   // bilgi kartı (3B, tarihçe, görevler, kaynaklar)
    const i = document.createElement('button'); i.className = 'rinfo'; i.type = 'button'; i.dataset.rocketInfo = id; i.textContent = 'ⓘ';
    i.title = `${r.name}: 3B model, tarihçe, görevler ve kaynaklar`; i.setAttribute('aria-label', i.title); w.append(i);
  }
  return w;
}
const DATE_MIN = '1850-01-01', DATE_MAX = '2149-12-01';        // de440s kapsamı (1849-12 … 2150-01) içinde, görev süresi payıyla

export class UI {
  constructor(world, send) {
    this.world = world; this.send = send;
    this.events = []; this.plan = []; this.t0 = 0; this.tLaunch = 0;
    this.series = { t: [], alt: [], spd: [] }; this.lastSample = -Infinity;
    this.lastHud = 0; this.lastEph = 0; this.tab = 'gorev'; this.nominal = null; this.live = null; this.design = null;
    this.skyTab = 'takip';
    document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
    // sekmeler arasında ok tuşlarıyla gezinme (erişilebilirlik)
    document.querySelectorAll('.tabs').forEach((nav) => nav.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const bs = [...nav.querySelectorAll('.tab')], i = bs.indexOf(document.activeElement); if (i < 0) return;
      const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); this.setTab(n.dataset.tab); e.preventDefault();
    }));
    this.charts = [new LineChart($('#chartAlt'), 'İrtifa', 'km', true), new LineChart($('#chartSpd'), 'Hız', 'km/s', false)];
    this.cp = new ControlPanel($('#tab-kontrol')); this.lastS = null;
    // görev tarihi: seçilen günden itibaren ilk uygun pencere için tarayıcıda yeniden tasarım
    const go = (d) => {
      if (!/^\d{4}-\d\d-\d\d$/.test(d || '') || d < DATE_MIN || d > DATE_MAX) { this.designMsg(`Tarih ${DATE_MIN.slice(0, 4)}–${DATE_MAX.slice(0, 4)} arasında olmalı (JPL DE440 kapsamı).`); return; }
      this.onDesign && this.onDesign(d);
    };
    $('#btnDesign').addEventListener('click', () => go($('#dateInput').value));
    $('#dateInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e.target.value); e.stopPropagation(); });
    document.querySelectorAll('.presets [data-date]').forEach((b) => b.addEventListener('click', () =>
      go(b.dataset.date === 'today' ? new Date().toISOString().slice(0, 10) : b.dataset.date)));
    // görev yapılandırması (modüler park yörüngeleri)
    $('#cfgProfile').addEventListener('change', (e) => { if (PROFILES[e.target.value]) this.setConfig(PROFILES[e.target.value].cfg); });
    for (const id of ['cfgEh', 'cfgEi', 'cfgEr', 'cfgRn', 'cfgRa', 'cfgMt', 'cfgHp', 'cfgHr', 'cfgLh', 'cfgLr'])
      $('#' + id).addEventListener('change', () => { this.syncProfileSel(); this.syncCfgVis(); });
    document.querySelectorAll('.cfg input').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go($('#dateInput').value); }));
    // fırlatma aracı (roket): kartlar rockets.js'ten
    this.rocket = DEFAULT_ROCKET; this.site = null;
    const rc = $('#rocketCards');
    if (rc) { for (const id of ROCKET_IDS) rc.append(rocketCard(id)); rc.addEventListener('click', (e) => {
      const inf = e.target.closest('[data-rocket-info]'); if (inf) { this.onRocketInfo && this.onRocketInfo(inf.dataset.rocketInfo); return; }
      const b = e.target.closest('[data-rocket]'); if (b && this.onRocket) this.onRocket(b.dataset.rocket);
    }); }
    this.setRocket(DEFAULT_ROCKET);
    this.setConfig(PROFILES.APOLLO.cfg);
    $('#btnCompare').addEventListener('click', () => this.onCompare && this.onCompare());
  }
  // ------------------------------------------------------------------ görev yapılandırması
  getConfig() {
    const n = (id) => parseFloat($('#' + id).value);
    return normalizeConfig({ rocket: this.rocket, site: this.site || undefined, earth: { h: n('cfgEh'), inc: n('cfgEi'), revs: n('cfgEr'), raise: { n: n('cfgRn') || 0, ha: n('cfgRa') } },
      moon: { type: $('#cfgMt').value, llo: { h: n('cfgLh'), revs: n('cfgLr') }, halo: { preset: $('#cfgHp').value, revs: n('cfgHr') } } });
  }
  setConfig(c) {
    const cfg = normalizeConfig(c), set = (id, v) => ($('#' + id).value = v);
    set('cfgEh', cfg.earth.h); set('cfgEi', cfg.earth.inc); set('cfgEr', cfg.earth.revs); set('cfgRn', cfg.earth.raise.n); set('cfgRa', cfg.earth.raise.ha); set('cfgMt', cfg.moon.type);
    set('cfgHp', cfg.moon.halo.preset); set('cfgHr', cfg.moon.halo.revs); set('cfgLh', cfg.moon.llo.h); set('cfgLr', cfg.moon.llo.revs);
    if (c && 'rocket' in c) this.setRocket(c.rocket);                     // profiller roketi taşımaz: seçili roket kalır
    if (c && 'site' in c) { this.site = c.site || null; this.onSiteSync && this.onSiteSync(this.site); }   // rampa da (profiller taşımaz)
    this.syncProfileSel(); this.syncCfgVis();
  }
  // profil eşleşmesi roketten bağımsız; rampa profilin eğimini kendi sınırına çekiyorsa (ör. Baykonur ≥ 46°) yine aynı profil sayılır
  profileKeyOf(cfg) { const c = { ...cfg, rocket: undefined }; return Object.keys(PROFILES).find((k) => sameCfg({ ...PROFILES[k].cfg, site: cfg.site }, c)) || 'CUSTOM'; }
  // roket seçimi (yalnız arayüz durumu; görevi app.js yeniden tasarlar). pay: iniş aracı kütlesi (kg; tasarım varsa ondan)
  setRocket(id, msg = '') {
    this.rocket = ROCKETS[id] ? id : DEFAULT_ROCKET;
    document.querySelectorAll('[data-rocket]').forEach((b) => b.classList.toggle('on', b.dataset.rocket === this.rocket));
    this.rocketInfo(msg);
  }
  rocketInfo(msg = '') {
    const el = $('#rocketInfo'); if (!el) return;
    const r = rocketOf(this.rocket), D = this.design, S = D && D.STAGES;
    const pay = S ? S.slice(1).reduce((q, x) => q + x.dry + x.prop, 0) : null, prop = pay != null ? parkPropellant(this.rocket, pay) : null;
    const st = S && S[0] && (S[0].rocket || DEFAULT_ROCKET) === this.rocket ? S[0] : null;
    let t = r.note;
    if (st && pay != null) {
      const m0 = st.dry + st.prop + pay, c = st.isp * 9.80665, dv = D.DV && D.DV.TLI, mCut = dv ? m0 * Math.exp(-dv / c) : null;
      t += ` Bu görevde: yük ${fmt(pay, 0)} kg, ${st.name} park yörüngesinde ${fmt(st.prop, 0)} kg yakıtla` + (mCut ? `, TLI ${fmt(dv, 0)} m/s, ~${fmt((m0 - mCut) / (st.T * 1000 / c), 0)} s yakış, kesmede ivme ${fmt(st.T * 1000 / mCut / 9.80665, 1)} g` : '') + '.';
    } else if (prop != null) t += ` Park yörüngesindeki yakıt yükle değişir (bu yükle ≈ ${fmt(prop, 0)} kg).`;
    if (r.ref) t += ` Başarım kaynağı: ${r.ref.src}.`;
    el.textContent = (msg ? msg + ' ' : '') + t;
    el.classList.toggle('warn', !!msg);
  }
  syncProfileSel() { $('#cfgProfile').value = this.profileKeyOf(this.getConfig()); }
  syncCfgVis() { $('#rowHalo').style.display = $('#cfgMt').value === 'HALO' ? '' : 'none'; $('#cfgRa').disabled = !(parseFloat($('#cfgRn').value) > 0); }
  // profil karşılaştırma tablosu: rows = [{key, name, D (tasarım) | null, err, busy}]
  setCompare(rows, status = '') {
    const tb = $('#cmptable tbody'); tb.replaceChildren();
    const curKey = this.design ? this.profileKeyOf(this.design.cfg || PROFILES.APOLLO.cfg) : null;
    for (const r of rows) {
      const tr = document.createElement('tr'); if (r.key === curKey) tr.className = 'cur';
      const td = (html, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.append(...html); return c; };
      const txt = (t, small) => { const e = document.createElement(small ? 'small' : 'span'); e.textContent = t; return e; };
      const D = r.D, dv = D ? D.DV : null;
      const moon = dv ? Object.entries(dv).filter(([k]) => k !== 'TLI' && k !== 'RAISE').reduce((a, [, v]) => a + v, 0) : null;
      const tot = dv ? moon + dv.TLI + (dv.RAISE || 0) : null;
      const days = D ? (D.t_L - D.LAUNCH.t_launch) / 86400 : null;
      tr.append(td([txt(r.name), txt(D ? `fırlatma ${utcShort(D.LAUNCH.t_launch).slice(0, 10)}, iniş aracı yakıtı ${fmt(D.STAGES[1].prop, 0)} kg` : (r.err || (r.busy ? 'hesaplanıyor…' : '—')), true)]),
        td([txt(moon != null ? fmt(moon, 0) : '')], 'num'), td([txt(tot != null ? fmt(tot, 0) : '')], 'num'), td([txt(days != null ? fmt(days, 1) + ' g' : '')], 'num'));
      tr.addEventListener('click', () => this.onProfile && this.onProfile(r.key));
      tb.appendChild(tr);
    }
    $('#cmpStatus').textContent = status;
  }
  // ------------------------------------------------------------------ görev tasarımı bilgisi
  designMsg(txt) { const el = $('#designInfo'); el.replaceChildren(); const p = document.createElement('div'); p.textContent = txt; el.appendChild(p); }
  beginDesign(dateStr) {
    $('#designLog').replaceChildren();
    this.designMsg(`${dateStr} için görev tasarlanıyor…`);
    this.nominal = null;
  }
  designLog(msg) {
    const li = document.createElement('li'); li.textContent = msg; $('#designLog').appendChild(li);
  }
  setDesign(D, startMs) {
    this.design = D;
    if (D.cfg) this.setConfig({ ...D.cfg, site: D.cfg.site || null });          // tasarımın rampası (varsayılan: null)
    this.setRocket((D.STAGES && D.STAGES[0] && D.STAGES[0].rocket) || DEFAULT_ROCKET);   // tasarımı yapan roket (hazır tasarımlar: genel kademe)
    const day = new Date(startMs).toISOString().slice(0, 10), tl = D.LAUNCH.t_launch, tTouch = D.t_L - 1620;
    const wait = (tl - E.tFromUtcMs(startMs)) / 86400;
    const el = $('#designInfo'); el.replaceChildren();
    const line = (parts) => {
      const div = document.createElement('div');
      for (const [txt, bold] of parts) { const s = document.createElement(bold ? 'b' : 'span'); s.textContent = txt; div.appendChild(s); }
      el.appendChild(div);
    };
    line([[`${day} sonrası ilk uygun pencere` + (wait > 1 ? ` (${fmt(wait, 0)} gün sonra)` : '')]]);
    line([['Fırlatma: '], [utcShort(tl), true]]);
    line([[`${(D.LAUNCH.site || 'KSC LC-39B').replace(/\s*\(.*$/, '')} · azimut ${fmt(D.LAUNCH.az, 1)}° · park eğimi ${fmt(D.inc, 1)}°`]]);
    if (D.RAISE) {
      const R = D.RAISE;
      line([[`Yörünge yükseltme: ${R.n} yakış (${R.burns.map((b) => `${fmt(b.dur, 0)} s`).join(' + ')}), apoje ${R.burns.map((b) => fmt(b.apo, 0)).join(' → ')} km; park yörüngesi ${fmt(R.leo.alt, 0)} km`]]);
      line([[`TLI: ${utcShort(D.TLI.t_ign)} (girişten ${fmt((D.TLI.t_ign - D.INS.t) / 3600, 1)} sa sonra, ${fmt(D.TLI.x[1], 0)} s yakış)`]]);
    }
    if (D.profile === 'HALO') {
      const H = D.HALO;
      line([[`Halo girişi (NRI): ~${utcShort(D.ARRIVAL.t_P)}`]]);
      line([[`${H.name}: periyot ${fmt(H.T / 86400, 2)} g, perilün ${fmt(H.stats.rpKm, 0)} km, apolün ${fmt(H.stats.raKm, 0)} km, kararlılık ν ${fmt(H.stability, 2)}`]]);
      line([[`Halo'dan ayrılış (${D.DEP.from === 'apo' ? 'apolünden' : 'perilünden'}): ~${utcShort(D.DEP.t)} · LLO girişi ~${utcShort(D.LLO.tP)}`]]);
    } else line([['Ay yörüngesine varış: ~' + utcShort(D.ARRIVAL.t_P)]]);
    line([['İniş: ~'], [utcShort(tTouch), true]]);
    line([[`İniş yerinde Güneş ${fmt(sunElevationAtSite(tTouch), 1)}° (Apollo 11'de 10,8°)`]]);
    if (day >= '1969-07-01' && day <= '1969-07-31') line([['Gerçek Apollo 11: fırlatma 16.07.1969 13:32 UTC, iniş 20.07.1969 20:17 UTC']]);
    // tasarım Δv bütçesi (itkisel tahmin) ve araç
    if (D.DV) {
      const tbl = document.createElement('table'); tbl.className = 'dvmini';
      const row = (a, b, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; const x = document.createElement('td'); x.textContent = a; const y = document.createElement('td'); y.className = 'num'; y.textContent = b; tr.append(x, y); tbl.appendChild(tr); };
      let tot = 0;
      for (const [k, v] of Object.entries(D.DV)) { tot += v; row(DV_NAMES[k] || k, fmt(v, 0) + ' m/s'); }
      row('Toplam (tasarım)', fmt(tot, 0) + ' m/s', 'tot');
      el.appendChild(tbl);
    }
    if (D.STAGES) line([[`Araç: ${fmt(D.STAGES.reduce((s, q) => s + q.dry + q.prop, 0), 0)} kg · ${D.STAGES.map((q) => `${q.name} yakıtı ${fmt(q.prop, 0)} kg`).join(' · ')}${D.SEP2 ? ` · yörünge kademesi ${fmt(D.SEP2.hSep, 0)} km irtifada ayrılır` : ''}`]]);
  }
  setNominal(dv) { this.nominal = dv; this.renderDv(); }
  isSkyTab(t) { const pg = document.getElementById('tab-' + t); return !!(pg && pg.closest('#skyPanel')); }
  isMissionTab(t) { const pg = document.getElementById('tab-' + t); return !!(pg && pg.closest('#lab-ay')); }
  // Sekme yalnız kendi grubunda değişir. Grup: sekme sayfasının ebeveyni (sekme çubuğu ve sayfalar kardeştir): Canlı Gökyüzü'nde <aside id="skyPanel">,
  // Ay görevinde <div id="lab-ay"> (dört adım) ve iç içe <div id="tab-ucus"> (Uçuş adımının aletleri). İç sayfa açılınca onu taşıyan adım da açılır.
  // this.tab / this.skyTab GÖRÜNEN yaprak sayfadır (kare başına güncellenen sekmeler buna bakar: kontrol, yorunge, efemeris, grafik).
  _activate(pg) {
    const g = pg.parentElement, t = pg.id.slice(4);
    g.querySelectorAll(':scope > .tabs .tab').forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    g.querySelectorAll(':scope > .tabpage').forEach((p) => (p.hidden = p !== pg));
  }
  _leaf(g) {
    for (;;) {
      const on = [...g.children].find((c) => c.classList.contains('tabpage') && !c.hidden); if (!on) return null;
      if (![...on.children].some((c) => c.classList.contains('tabpage'))) return on.id.slice(4);
      g = on;
    }
  }
  setTab(tab) {
    const pg = document.getElementById('tab-' + tab); if (!pg || !pg.classList.contains('tabpage')) return;
    for (let p = pg; p; p = p.parentElement.closest('.tabpage')) this._activate(p);
    const sky = pg.closest('#skyPanel'), root = sky || pg.closest('#lab-ay') || pg.parentElement, t = this._leaf(root) || tab;
    if (sky) this.skyTab = t; else this.tab = t;
    if (this.onTab) this.onTab(t, tab);
    if (t === 'grafik') this.charts.forEach((c) => { c._sig = null; c.draw(); });
    if (t === 'kontrol' && this.lastS) this.cp.update(this.lastS, this.cpCtx(this.lastS.t));
    if (t === 'carpma' && this.onCarpma) this.onCarpma();
  }
  pickTick(t, now) { if (this.pick && now - (this.lastPick || 0) > 500) { this.lastPick = now; this.renderPick(t); } }
  reset(plan, t0, tLaunch) {
    this.plan = plan; this.t0 = t0; this.tLaunch = tLaunch; this.events = []; this.evVer = (this.evVer || 0) + 1; this.planUi = null;
    this.series = { t: [], alt: [], spd: [] }; this.lastSample = -Infinity;
    $('#log').replaceChildren(); this.renderPlan(t0); this.renderDv(); this.cp.reset();
  }
  addEvents(evs) {
    if (evs.length) this.evVer = (this.evVer || 0) + 1;
    for (const e of evs) {
      this.events.push(e);
      const li = document.createElement('li');
      const tm = document.createElement('span'); tm.className = 'ev-t'; tm.textContent = 'T+' + fmtDur(e.t - this.tLaunch);
      const tx = document.createElement('span'); tx.className = 'ev-m'; tx.textContent = e.msg;
      li.append(tm, tx);
      if (e.key === 'PERTURB') li.classList.add('warn');
      if (e.key === 'INDI' && /ÇARPMA/.test(e.msg)) li.classList.add('bad');
      $('#log').prepend(li);
    }
    if (evs.length) this.renderDv();
  }

  // plan listesi: öğeler plan değişince bir kez kurulur; her güncellemede yalnız sınıf ve geri sayım/saat metni değişenlere yazılır (liste 10 Hz'te yeniden kurulmaz)
  buildPlan(ul) {
    ul.replaceChildren(); const items = [];
    for (const p of this.plan) {
      const li = document.createElement('li'), dot = document.createElement('span'), name = document.createElement('span'), when = document.createElement('span');
      dot.className = 'pl-dot'; name.className = 'pl-n'; name.textContent = p.name; when.className = 'pl-t';
      li.append(dot, name, when); ul.appendChild(li);
      li.title = 'Bu olaya atla'; li.tabIndex = 0;
      const jump = () => this.onSeek && this.onSeek(p.t - (p.key === 'INS' ? 0 : p.key === 'INDI' ? 90 : p.key === 'PDI' ? 40 : 120));
      li.addEventListener('click', jump); li.addEventListener('keydown', (e) => { if (e.key === 'Enter') jump(); });
      items.push({ p, li, when, cls: '', evFor: null, evTxt: '', laterTxt: '' });
    }
    this.planUi = { plan: this.plan, items, evVer: -1, done: new Map() };
  }
  renderPlan(t) {
    if (!this.planUi || this.planUi.plan !== this.plan) this.buildPlan($('#plan'));
    const U = this.planUi;
    if (U.evVer !== this.evVer) { U.evVer = this.evVer; U.done = new Map(this.events.map((e) => [e.key, e])); }          // olaylar değişince tamamlanan anahtarlar
    let nextMarked = false;
    for (const it of U.items) {
      const p = it.p, ev = U.done.get(p.key) || U.done.get(p.key + '_SKIP');
      let cls, when;
      if (ev) { cls = 'done'; if (it.evFor !== ev) { it.evFor = ev; it.evTxt = E.utcString(ev.t).slice(5, 19); } when = it.evTxt; }
      else if (!nextMarked) { cls = 'next'; nextMarked = true; const tn = this.tNext != null && this.tNext > t + 1 ? this.tNext : p.t; when = 'T−' + fmtDur(Math.max(0, tn - t)); }
      else { cls = 'later'; if (!it.laterTxt) it.laterTxt = '~' + E.utcString(p.t).slice(5, 16); when = it.laterTxt; }
      if (it.cls !== cls) { it.cls = cls; it.li.className = cls; }
      setText(it.when, when);
    }
  }

  renderDv() {
    const act = dvFromEvents(this.events), N = this.nominal, keys = dvKeys(this.design || undefined);
    const tb = $('#dvtable tbody'); tb.replaceChildren();
    let sumNom = 0;
    for (const k of keys) {
      const v = act[k], nom = N ? N[k] : null;
      const tr = document.createElement('tr');
      const c = (txt, cls) => { const td = document.createElement('td'); td.textContent = txt; if (cls) td.className = cls; return td; };
      if (nom != null) sumNom += nom;
      const d = v != null && nom != null ? v - nom : null;
      const dTxt = d == null ? '' : Math.abs(d) < 0.05 ? '0,0' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), 1);
      tr.append(c(DV_NAMES[k] || k), c(nom != null ? fmt(nom, 1) : N ? '—' : '…', 'num'), c(v != null ? fmt(v, 1) : '—', 'num'), c(dTxt, 'num ' + (d != null && Math.abs(d) > 1 ? 'dev' : '')));
      tb.appendChild(tr);
    }
    $('#dvNom').textContent = N ? fmt(sumNom, 1) : 'hesaplanıyor…';
  }

  onState(s) {}
  // grafik örnekleri worker'ın yol noktalarından (olaya atlamada geçmiş de gelir)
  addSamples(points, reset) {
    if (reset) this.series = { t: [], alt: [], spd: [] };
    for (const q of points) {
      const rm = E.moonPos(q.t), rsv = E.sub(q.r, rm), rs = E.norm(rsv), nearM = rs < E.MOON_ZONE;
      let alt, vv;
      if (nearM) {
        const vs = E.sub(q.v, E.moonVel(q.t));
        alt = rs - R_SITE;
        vv = alt < 50 ? E.norm(E.sub(vs, E.cross(E.omegaMoon(q.t), rsv))) : E.norm(vs);
      } else { alt = ellipsoidAlt(q.r); vv = E.norm(q.v); }
      this.series.t.push((q.t - this.tLaunch) / 3600); this.series.alt.push(Math.max(alt, 0.001)); this.series.spd.push(vv);
    }
    if (this.series.t.length > 8000) for (const k of ['t', 'alt', 'spd']) this.series[k].splice(0, 2000);
  }

  // evre adı (HUD ve kontrol paneli ortak): park yörüngesinde irtifa da yazar
  phaseLabel(p) { return p === 'PARK' && this.design && this.design.EARTH ? `Park yörüngesi (${fmt(this.design.RAISE ? this.design.RAISE.leo.alt : this.design.EARTH.h, 0)} km)` : phaseName(p); }
  // sıradaki planlı olay ve ona kalan süre (görev çizelgesiyle aynı mantık)
  nextEvent(t) {
    const done = new Set(this.events.map((e) => e.key)), p = this.plan.find((q) => !done.has(q.key) && !done.has(q.key + '_SKIP'));
    return p ? { name: p.name, dt: (this.tNext != null && this.tNext > t + 1 ? this.tNext : p.t) - t } : null;
  }
  // kontrol paneli bağlamı: araç kademeleri, tasarım, olaylar, nominal Δv, iniş yeri
  cpCtx(t) {
    const D = this.design;
    return { stages: (D && D.STAGES) || STAGES, design: D, events: this.events, nominal: this.nominal, siteIcrf, rSite: R_SITE, tLaunch: this.tLaunch, phaseName: (p) => this.phaseLabel(p), next: this.nextEvent(t) };
  }

  hud(s, now) {
    if (now - this.lastHud < 100) return; this.lastHud = now;
    const H = this.hudRefs || (this.hudRefs = Object.fromEntries(['utc', 'met', 'phase', 'altRef', 'spdRef', 'alt', 'spd', 'vv', 'mass', 'dvu', 'propName', 'propVal', 'propBar', 'thrBar', 'thrVal', 'warpVal', 'status'].map((k) => [k, $('#' + k)])));
    const t = s.t, met = t - this.tLaunch, rm = E.moonPos(t), rsv = E.sub(s.r, rm), rs = E.norm(rsv);
    const nearM = rs < E.MOON_ZONE;
    setText(H.utc, E.utcString(t).replace(/ UTC$/, ''));                                    // başlık zaten "UTC"
    setText(H.met, met < 0 ? 'T−' + fmtDur(-met) : 'T+' + fmtDur(met));
    setText(H.phase, this.phaseLabel(s.phase));
    // Dünya: WGS-84 elipsoidine göre (yaklaşık), Ay: iniş yakınında iniş yeri yüzeyine, değilse ortalama yarıçapa göre
    let alt = s.altKm != null ? s.altKm : nearM ? (s.local ? s.local.p[2] : rs - E.R_M) : ellipsoidAlt(s.r);          // altKm: kalkış canlandırmasının WGS-84 irtifası (yaklaşık formül rampada ~12 m sapar)
    if (Math.abs(alt) < 5e-5) alt = 0;                          // yüzeyde "−0,0 m" görünmesin
    const surf = nearM && s.local && s.local.p[2] < 50;
    const vRelVec = nearM ? E.sub(s.v, E.moonVel(t)) : s.v;
    // kalkış canlandırması (s.asc): yere göre hız (Dünya ile dönen çerçeve; alttaki bantla aynı) — rampada 0; eylemsiz hız Florida'da dönüşten ~0,41 km/s olurdu
    const A = s.asc, vRel = A ? A.spd : surf ? E.norm(s.local.v) : E.norm(vRelVec);
    setText(H.altRef, nearM ? (s.local ? 'iniş yerine göre' : "Ay'a göre") : "Dünya'ya göre");
    setText(H.spdRef, A ? 'yere göre' : surf ? 'yüzeye göre' : nearM ? "Ay'a göre" : "Dünya'ya göre");
    setText(H.alt, alt > 100 ? fmt(alt, 0) + ' km' : alt > 2 ? fmt(alt, 2) + ' km' : fmt(alt * 1000, 1) + ' m');
    setText(H.spd, vRel > 0.1 ? fmt(vRel, 3) + ' km/s' : fmt(vRel * 1000, 2) + ' m/s');
    if (s.local && s.local.p[2] < 20) {
      const up = E.unit(rsv), vs = E.sub(s.v, E.moonVel(t)), vr = E.sub(vs, E.cross(E.omegaMoon(t), rsv));
      const vz = E.dot(vr, up), vh = E.norm(E.sub(vr, E.scale(up, vz))), rng = Math.hypot(s.local.p[0], s.local.p[1]);
      setText(H.vv, `dikey ${fmt(vz * 1000, 1)} m/s · yatay ${fmt(vh * 1000, 1)} m/s · iniş yerine ${rng > 5 ? fmt(rng, 1) + ' km' : fmt(rng * 1000, 0) + ' m'}`);
    } else setText(H.vv, `Ay'a uzaklık ${fmt(rs, 0)} km · Dünya'ya ${fmt(E.norm(s.r), 0)} km`);
    if (A) {                                                                             // kalkış: roketin yaklaşık kütlesi, yanan kademenin kalan yakıtı, itkisi
      setText(H.mass, A.m != null ? '≈ ' + fmt(A.m, 0) + ' kg' : '—'); setText(H.dvu, '—');
      setText(H.propName, A.stage); setText(H.propVal, A.left != null ? '%' + fmt(100 * A.left, 0) : '—');                          // "<kademe> yakıtı" (index.html)
      setWidth(H.propBar, (A.left != null ? 100 * A.left : 0).toFixed(1) + '%');
      setWidth(H.thrBar, (100 * A.thr).toFixed(1) + '%'); setText(H.thrVal, fmt(100 * A.thr, 0) + '%');
    } else {
      setText(H.mass, fmt(s.m, 0) + ' kg');
      setText(H.dvu, fmt(s.dv * 1000, 1) + ' m/s');
      const ST = (this.design && this.design.STAGES) || [{ name: 'TLI kademesi', prop: 6200 }, { name: 'İniş aracı', prop: 2300 }];
      const stg = { name: (ST[s.k] || ST[ST.length - 1]).name || (s.k === 0 ? 'TLI kademesi' : 'İniş aracı'), cap: (ST[s.k] || ST[ST.length - 1]).prop };
      setText(H.propName, stg.name); setText(H.propVal, fmt(s.prop, 0) + ' kg');
      setWidth(H.propBar, Math.max(0, Math.min(100, (100 * s.prop) / stg.cap)).toFixed(1) + '%');
      setWidth(H.thrBar, (100 * (s.thr || 0)).toFixed(1) + '%'); setText(H.thrVal, fmt(100 * (s.thr || 0), 0) + '%');
    }
    setText(H.warpVal, '×' + (s.warp >= 100 ? fmt(s.warp, 0) : fmt(s.warp, s.warp < 10 ? 1 : 0)));
    setText(H.status, s.status || (s.done ? (s.result && s.result.ok ? 'Görev tamamlandı: iniş başarılı' : 'Görev sona erdi') : ''));
    // sonraki olay
    this.tNext = s.tNext; this.renderPlan(t);
    // yörünge sekmesi
    this.lastS = s;
    if (this.tab === 'kontrol') this.cp.update(s, this.cpCtx(t));
    if (this.tab === 'yorunge') { this.orbitTab(s); this.forceTab(s); }
    if (this.tab === 'efemeris' && now - this.lastEph > 250) { this.lastEph = now; this.ephTab(t); }
    if (this.pick && now - (this.lastPick || 0) > 500) { this.lastPick = now; this.renderPick(t); }
    if (this.tab === 'grafik') this.charts.forEach((c, i) => { c.set(this.series.t, i === 0 ? this.series.alt : this.series.spd); c.draw(); });
  }





}

mixin(UI, PickCard, SatPanel, FlightTools);
