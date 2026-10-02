// LS19 arayüzü: HUD, görev paneli (olaylar, Δv bütçesi, grafikler, yörünge elemanları)
import * as E from './engine.js';
import * as EO from './earth.js';
import { R_SITE } from './mission.js';
import { etOf } from './live.js';
import { BODIES, IS, IE, IM } from './ephem.js';
import { sunElevationAtSite, PROFILES, normalizeConfig, configLabel } from './design.js';
import { dvKeys, DV_NAMES, dvFromEvents } from './dvbudget.js';
import { SAT_GROUPS } from './satlayer.js';
import { fmtReentry, ageYears, controlNote } from './impact.js';

const $ = (s) => document.querySelector(s);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export function fmtDur(s) {
  const neg = s < 0; s = Math.abs(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  const z = (x) => String(x).padStart(2, '0');
  return (neg ? '−' : '') + (d ? `${d}g ` : '') + `${z(h)}:${z(m)}:${z(sec)}`;
}
const PHASE_TR = { PARK: 'Park yörüngesi', TLI: "Ay'a transfer yakışı (TLI)", SUZULME: 'Serbest süzülme', 'MCC-1': 'Orta rota düzeltmesi 1',
  'MCC-2': 'Orta rota düzeltmesi 2', 'MCC-3': 'Orta rota düzeltmesi 3', LOI: 'Ay yörüngesine giriş (LOI)', AY_YORUNGESI: 'Ay yörüngesi',
  DOI: 'İniş yörüngesine geçiş (DOI)', INIS_SUZULME: "15 km'ye alçalış", PDI: 'Motorlu iniş: frenleme', YAKLASMA: 'Motorlu iniş: yaklaşma',
  SON_INIS: 'Son iniş', INDI: 'Yüzeyde', NRI: 'Halo yörüngesine giriş (NRI)', HALO: 'Halo yörüngesinde', DEP: "Halo'dan ayrılış yakışı",
  TRANSFER: "LLO'ya iniş transferi" };
const phaseName = (p) => PHASE_TR[p] || (/^SK-\d+$/.test(p) ? `İstasyon tutma yakışı (${p})` : p);
const sameCfg = (a, b) => JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
const DATE_MIN = '1850-01-01', DATE_MAX = '2149-12-01';        // de440s kapsamı (1849-12 … 2150-01) içinde, görev süresi payıyla
const AU = 149597870.7, D2R = Math.PI / 180, R2AS = 180 / Math.PI * 3600;
const ECL_POLE = [0, -0.3977771559, 0.9174820621];                // J2000 ekliptik kutbu (ICRF)
const K_EMB = BODIES[IM].gm / (BODIES[IE].gm + BODIES[IM].gm);   // Dünya–Ay kütle merkezinin Ay'a doğru kesri
const utcShort = (t) => E.utcString(t).slice(0, 16) + ' UTC';
const hms = (x) => { const s = ((x % 86400) + 86400) % 86400; return fmtDur(s).replace(/^.*?(\d\d:\d\d:\d\d)$/, '$1'); };
const dms = (as) => { const a = Math.abs(as), d = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
  return (as < 0 ? '−' : '') + (d ? `${d}° ` : '') + `${m}′ ${fmt(s, 1)}″`; };
// 3-1-3 Euler (φ, θ, ψ) -> ICRF->PA matrisi (DE440 PCK kuralı, ephem.paEuler'in tersi)
function paFromEuler([phi, th, psi]) {
  const Rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, s, 0], [-s, c, 0], [0, 0, 1]]; };
  const Rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
  const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return mm(mm(Rz(psi), Rx(th)), Rz(phi));
}
// iki dönüş matrisi arasındaki açı (küçük açılarda hassas: çarpık-simetrik kısımdan)
function rotAngle(A, B) {
  const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[j][0] + A[i][1] * B[j][1] + A[i][2] * B[j][2]));
  const s = 0.5 * Math.hypot(C[2][1] - C[1][2], C[0][2] - C[2][0], C[1][0] - C[0][1]), c = 0.5 * (C[0][0] + C[1][1] + C[2][2] - 1);
  return Math.atan2(s, c);
}
const mv = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

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
    for (const id of ['cfgEh', 'cfgEi', 'cfgEr', 'cfgMt', 'cfgHp', 'cfgHr', 'cfgLh', 'cfgLr'])
      $('#' + id).addEventListener('change', () => { this.syncProfileSel(); this.syncCfgVis(); });
    document.querySelectorAll('.cfg input').forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go($('#dateInput').value); }));
    this.setConfig(PROFILES.APOLLO.cfg);
    $('#btnCompare').addEventListener('click', () => this.onCompare && this.onCompare());
  }
  // ------------------------------------------------------------------ görev yapılandırması
  getConfig() {
    const n = (id) => parseFloat($('#' + id).value);
    return normalizeConfig({ earth: { h: n('cfgEh'), inc: n('cfgEi'), revs: n('cfgEr') },
      moon: { type: $('#cfgMt').value, llo: { h: n('cfgLh'), revs: n('cfgLr') }, halo: { preset: $('#cfgHp').value, revs: n('cfgHr') } } });
  }
  setConfig(c) {
    const cfg = normalizeConfig(c), set = (id, v) => ($('#' + id).value = v);
    set('cfgEh', cfg.earth.h); set('cfgEi', cfg.earth.inc); set('cfgEr', cfg.earth.revs); set('cfgMt', cfg.moon.type);
    set('cfgHp', cfg.moon.halo.preset); set('cfgHr', cfg.moon.halo.revs); set('cfgLh', cfg.moon.llo.h); set('cfgLr', cfg.moon.llo.revs);
    this.syncProfileSel(); this.syncCfgVis();
  }
  profileKeyOf(cfg) { return Object.keys(PROFILES).find((k) => sameCfg(PROFILES[k].cfg, cfg)) || 'CUSTOM'; }
  syncProfileSel() { $('#cfgProfile').value = this.profileKeyOf(this.getConfig()); }
  syncCfgVis() { $('#rowHalo').style.display = $('#cfgMt').value === 'HALO' ? '' : 'none'; }
  // profil karşılaştırma tablosu: rows = [{key, name, D (tasarım) | null, err, busy}]
  setCompare(rows, status = '') {
    const tb = $('#cmptable tbody'); tb.replaceChildren();
    const curKey = this.design ? this.profileKeyOf(this.design.cfg || PROFILES.APOLLO.cfg) : null;
    for (const r of rows) {
      const tr = document.createElement('tr'); if (r.key === curKey) tr.className = 'cur';
      const td = (html, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.append(...html); return c; };
      const txt = (t, small) => { const e = document.createElement(small ? 'small' : 'span'); e.textContent = t; return e; };
      const D = r.D, dv = D ? D.DV : null;
      const moon = dv ? Object.entries(dv).filter(([k]) => k !== 'TLI').reduce((a, [, v]) => a + v, 0) : null;
      const tot = dv ? moon + dv.TLI : null;
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
    if (D.cfg) this.setConfig(D.cfg);
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
    line([[`KSC LC-39B · azimut ${fmt(D.LAUNCH.az, 1)}° · park eğimi ${fmt(D.inc, 1)}°`]]);
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
    if (D.STAGES) line([[`Araç: ${fmt(D.STAGES.reduce((s, q) => s + q.dry + q.prop, 0), 0)} kg · TLI kademesi yakıtı ${fmt(D.STAGES[0].prop, 0)} kg · iniş aracı yakıtı ${fmt(D.STAGES[1].prop, 0)} kg`]]);
  }
  setNominal(dv) { this.nominal = dv; this.renderDv(); }
  isSkyTab(t) { const pg = document.getElementById('tab-' + t); return !!(pg && pg.closest('#skyPanel')); }
  // sekme yalnız kendi panelinde değişir (Ay Görevi paneli ve Canlı Gökyüzü paneli bağımsız)
  setTab(t) {
    const pg = document.getElementById('tab-' + t); if (!pg) return;
    const panel = pg.closest('aside');
    if (panel.id === 'skyPanel') this.skyTab = t; else this.tab = t;
    panel.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    panel.querySelectorAll('.tabpage').forEach((p) => (p.hidden = p.id !== 'tab-' + t));
    if (t === 'grafik') this.charts.forEach((c) => c.draw());
    if (t === 'carpma' && this.onCarpma) this.onCarpma();
  }
  pickTick(t, now) { if (this.pick && now - (this.lastPick || 0) > 500) { this.lastPick = now; this.renderPick(t); } }
  reset(plan, t0, tLaunch) {
    this.plan = plan; this.t0 = t0; this.tLaunch = tLaunch; this.events = [];
    this.series = { t: [], alt: [], spd: [] }; this.lastSample = -Infinity;
    $('#log').replaceChildren(); this.renderPlan(t0); this.renderDv();
  }
  addEvents(evs) {
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

  renderPlan(t) {
    const ul = $('#plan'); ul.replaceChildren();
    const doneKeys = new Map(this.events.map((e) => [e.key, e]));
    let nextMarked = false;
    for (const p of this.plan) {
      const li = document.createElement('li'); const ev = doneKeys.get(p.key) || doneKeys.get(p.key + '_SKIP');
      const dot = document.createElement('span'); dot.className = 'pl-dot';
      const name = document.createElement('span'); name.className = 'pl-n'; name.textContent = p.name;
      const when = document.createElement('span'); when.className = 'pl-t';
      if (ev) { li.className = 'done'; when.textContent = E.utcString(ev.t).slice(5, 19); }
      else if (!nextMarked) { li.className = 'next'; nextMarked = true; const tn = this.tNext != null && this.tNext > t + 1 ? this.tNext : p.t; when.textContent = 'T−' + fmtDur(Math.max(0, tn - t)); }
      else { li.className = 'later'; when.textContent = '~' + E.utcString(p.t).slice(5, 16); }
      li.append(dot, name, when); ul.appendChild(li);
      li.title = 'Bu olaya atla'; li.tabIndex = 0;
      const jump = () => this.onSeek && this.onSeek(p.t - (p.key === 'INS' ? 0 : p.key === 'INDI' ? 90 : p.key === 'PDI' ? 40 : 120));
      li.addEventListener('click', jump); li.addEventListener('keydown', (e) => { if (e.key === 'Enter') jump(); });
    }
  }

  renderDv() {
    const act = dvFromEvents(this.events), N = this.nominal, keys = dvKeys(this.design && this.design.profile);
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
      } else { const rE = E.norm(q.r), sp = q.r[2] / rE; alt = rE - E.R_E * (1 - sp * sp / 298.257); vv = E.norm(q.v); }
      this.series.t.push((q.t - this.tLaunch) / 3600); this.series.alt.push(Math.max(alt, 0.001)); this.series.spd.push(vv);
    }
    if (this.series.t.length > 8000) for (const k of ['t', 'alt', 'spd']) this.series[k].splice(0, 2000);
  }

  hud(s, now) {
    if (now - this.lastHud < 100) return; this.lastHud = now;
    const t = s.t, met = t - this.tLaunch, rm = E.moonPos(t), rsv = E.sub(s.r, rm), rs = E.norm(rsv);
    const nearM = rs < E.MOON_ZONE;
    $('#utc').textContent = E.utcString(t);
    $('#met').textContent = 'T+' + fmtDur(met);
    $('#phase').textContent = s.phase === 'PARK' && this.design && this.design.EARTH ? `Park yörüngesi (${fmt(this.design.EARTH.h, 0)} km)` : phaseName(s.phase);
    // Dünya: WGS-84 elipsoidine göre (yaklaşık), Ay: iniş yakınında iniş yeri yüzeyine, değilse ortalama yarıçapa göre
    const rE = E.norm(s.r), sphi = s.r[2] / rE, Rell = E.R_E * (1 - (1 / 298.257) * sphi * sphi);
    let alt = nearM ? (s.local ? s.local.p[2] : rs - E.R_M) : rE - Rell;
    if (Math.abs(alt) < 5e-5) alt = 0;                          // yüzeyde "−0,0 m" görünmesin
    const surf = nearM && s.local && s.local.p[2] < 50;
    const vRelVec = nearM ? E.sub(s.v, E.moonVel(t)) : s.v;
    const vRel = surf ? E.norm(s.local.v) : E.norm(vRelVec);
    $('#altRef').textContent = nearM ? (s.local ? 'iniş yerine göre' : "Ay'a göre") : "Dünya'ya göre";
    $('#spdRef').textContent = surf ? 'yüzeye göre' : nearM ? "Ay'a göre" : "Dünya'ya göre";
    $('#alt').textContent = alt > 100 ? fmt(alt, 0) + ' km' : alt > 2 ? fmt(alt, 2) + ' km' : fmt(alt * 1000, 1) + ' m';
    $('#spd').textContent = vRel > 0.1 ? fmt(vRel, 3) + ' km/s' : fmt(vRel * 1000, 2) + ' m/s';
    if (s.local && s.local.p[2] < 20) {
      const up = E.unit(rsv), vs = E.sub(s.v, E.moonVel(t)), vr = E.sub(vs, E.cross(E.omegaMoon(t), rsv));
      const vz = E.dot(vr, up), vh = E.norm(E.sub(vr, E.scale(up, vz))), rng = Math.hypot(s.local.p[0], s.local.p[1]);
      $('#vv').textContent = `dikey ${fmt(vz * 1000, 1)} m/s · yatay ${fmt(vh * 1000, 1)} m/s · iniş yerine ${rng > 5 ? fmt(rng, 1) + ' km' : fmt(rng * 1000, 0) + ' m'}`;
    } else $('#vv').textContent = `Ay'a uzaklık ${fmt(rs, 0)} km · Dünya'ya ${fmt(E.norm(s.r), 0)} km`;
    $('#mass').textContent = fmt(s.m, 0) + ' kg';
    $('#dvu').textContent = fmt(s.dv * 1000, 1) + ' m/s';
    const ST = (this.design && this.design.STAGES) || [{ prop: 6200 }, { prop: 2300 }];
    const stg = s.k === 0 ? { name: 'TLI kademesi', cap: ST[0].prop } : { name: 'İniş aracı', cap: ST[1].prop };
    $('#propName').textContent = stg.name; $('#propVal').textContent = fmt(s.prop, 0) + ' kg';
    $('#propBar').style.width = Math.max(0, Math.min(100, (100 * s.prop) / stg.cap)) + '%';
    $('#thrBar').style.width = (100 * (s.thr || 0)) + '%'; $('#thrVal').textContent = fmt(100 * (s.thr || 0), 0) + '%';
    $('#warpVal').textContent = '×' + (s.warp >= 100 ? fmt(s.warp, 0) : fmt(s.warp, s.warp < 10 ? 1 : 0));
    $('#status').textContent = s.status || (s.done ? (s.result && s.result.ok ? 'Görev tamamlandı: iniş başarılı' : 'Görev sona erdi') : '');
    // sonraki olay
    this.tNext = s.tNext; this.renderPlan(t);
    // yörünge sekmesi
    if (this.tab === 'yorunge') this.orbitTab(s);
    if (this.tab === 'efemeris' && now - this.lastEph > 250) { this.lastEph = now; this.ephTab(t); }
    if (this.pick && now - (this.lastPick || 0) > 500) { this.lastPick = now; this.renderPick(t); }
    if (this.tab === 'grafik') this.charts.forEach((c, i) => { c.set(this.series.t, i === 0 ? this.series.alt : this.series.spd); c.draw(); });
  }

  // ------------------------------------------------------------------ tıklanan cisim bilgisi (gezegen / uydu)
  showPick(obj, mx, my, t) {
    this.pick = obj; this.lastPick = 0;
    const el = $('#pick'), app = $('#app'), W = app.clientWidth, H = app.clientHeight;
    el.hidden = false; this.pickAnchor = [mx, my];
    el.style.left = Math.min(W - 308, Math.max(8, mx + 14)) + 'px';
    $('#pick').replaceChildren();
    this.renderPick(t, true);
  }
  // kart ekrana sığsın: alt çubuğa (≈88 px) binmesin, uzunsa kendi içinde kaydırılsın; içerik değişince (tazeleme) yeniden hizalanır
  placePick() {
    const el = $('#pick'), app = $('#app'), H = app.clientHeight, A = this.pickAnchor || [0, 80], bottom = 88, top0 = 8;
    el.style.maxHeight = Math.max(160, H - top0 - bottom) + 'px';
    const h = el.offsetHeight;
    el.style.top = Math.max(top0, Math.min(A[1] - 20, H - bottom - h)) + 'px';
  }
  hidePick() { this.pick = null; $('#pick').hidden = true; }
  renderPick(t, full = false) {
    const P = this.pick; if (!P) return;
    const root = $('#pick');
    let el = root.querySelector('.pbody'); if (!el) { el = document.createElement('div'); el.className = 'pbody'; root.prepend(el); }
    const d = P.refresh(t); el.replaceChildren();
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const head = mk('div', 'ph'), ttl = mk('div');
    const x = mk('button', 'px', '×'); x.title = 'Kapat (Esc)'; x.addEventListener('click', () => this.hidePick());
    if (!d) { ttl.append(mk('div', 'pt', 'Veri yok'), mk('div', 'ps', 'Bu an için durum hesaplanamadı')); head.append(ttl, x); el.appendChild(head); return; }
    const rows = [];
    const km = (v) => (Math.abs(v) >= 10000 ? fmt(v, 0) : fmt(v, 1)) + ' km';
    if (P.card) {
      const c = P.card(d); ttl.append(mk('div', 'pt', c.title), mk('div', 'ps', c.sub)); rows.push(...c.rows);
    } else if (P.kind === 'sat') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', `NORAD ${d.norad} · COSPAR ${d.cospar}${d.launchYear ? ` · fırlatma ${d.launchYear}` : ''}`));
      rows.push(['Grup', d.group], ['Yörünge türü', d.orbitType]);
      if (d.alt != null) rows.push(['İrtifa', km(d.alt)], ['Hız', fmt(d.speed, 3) + ' km/s'],
        ['Yer izi', `${fmt(Math.abs(d.lat), 2)}° ${d.lat >= 0 ? 'K' : 'G'}, ${fmt(Math.abs(d.lon), 2)}° ${d.lon >= 0 ? 'D' : 'B'}`],
        ['Aydınlanma', d.sunlit ? 'Güneş ışığında' : "Dünya'nın gölgesinde"]);
      rows.push(['Periyot', d.periodMin > 180 ? fmt(d.periodMin / 60, 2) + ' sa' : fmt(d.periodMin, 1) + ' dk'], ['Eğim', fmt(d.inc, 2) + '°'],
        ['Perije / apoje', `${fmt(d.perigee, 0)} / ${fmt(d.apogee, 0)} km`], ['Dış merkezlik', fmt(d.ecc, 5)],
        ['Öğelerin yaşı', `${fmt(d.epochAgeDays, 1)} gün`], ['Yörünge verisi', d.source || 'CelesTrak GP']);
      rows.push(['Tahmini yeniden giriş', fmtReentry(d.decay)]);
      rows.push(['Kontrol durumu', controlNote(d.decay && d.decay.age, d.group === SAT_GROUPS[0].name)]);
      rows.push(['3B model', d.model ? `${d.model.note || d.model.title} · NASA 3D Resources (~${fmt(d.model.size, 0)} m)` : d.family ? `${d.family.title} · temsili aile modeli (${d.family.note})` : 'nokta']);
      if (d.obsEl != null) rows.push([`${d.obsName}'dan`, d.obsEl > 0 ? `gökte ${fmt(d.obsEl, 1)}° · az ${fmt(d.obsAz, 0)}° · ${fmt(d.obsRange, 0)} km` : 'ufkun altında']);
      if (d.nextPass) { const p = d.nextPass, tt = new Date(p.rise.ms);
        rows.push(['Sonraki geçiş', `${tt.toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · en yüksek ${fmt(p.max.el, 0)}°${p.visible ? ' · görünür' : ''}`]); }
    } else if (P.kind === 'msat') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', 'Ay yörüngesinde · JPL Horizons'));
      rows.push(["İrtifa (Ay'a göre)", km(d.alt)], ['Hız', fmt(d.speed, 3) + ' km/s'],
        ['Periyot (anlık)', Number.isFinite(d.periodMin) ? (d.periodMin > 180 ? fmt(d.periodMin / 60, 2) + ' sa' : fmt(d.periodMin, 1) + ' dk') : '—']);
      if (d.model) rows.push(['3B model', `${d.model.title} · NASA 3D Resources`]);
    } else if (P.kind === 'planet') {
      ttl.append(mk('div', 'pt', d.name), mk('div', 'ps', 'Canlı efemeris (DE440 başlangıçlı N-cisim)'));
      rows.push(['Yarıçap', fmt(d.R, 0) + ' km'], ["Güneş'e uzaklık", fmt(d.dSun, 4) + ' AB'],
        ["Dünya'ya uzaklık", `${fmt(d.dEarth, 4)} AB (ışık ${fmt(d.lightMin, 1)} dk)`], ['Yörünge hızı', fmt(d.v, 2) + ' km/s'],
        ['Yörünge periyodu', d.periodDays > 1000 ? fmt(d.periodDays / 365.25, 2) + ' yıl' : fmt(d.periodDays, 1) + ' gün'],
        ['Yarı büyük eksen / e', `${fmt(d.a, 4)} AB / ${fmt(d.e, 4)}`]);
    }
    head.append(ttl, x); el.appendChild(head);
    const tb = mk('table');
    for (const [k, v] of rows) { const tr = mk('tr'); tr.append(mk('td', null, k), mk('td', 'num', v)); tb.appendChild(tr); }
    el.appendChild(tb);
    if (full && P.actions && P.actions.length) {                // düğmeler bir kez kurulur (tazelemede tıklama kaybolmasın)
      const pa = mk('div', 'pa');
      for (const a of P.actions) { const b = mk('button', null, a.label); b.addEventListener('click', () => { a.fn(); }); pa.appendChild(b); }
      root.appendChild(pa);
    }
    this.placePick();
  }

  // ------------------------------------------------------------------ uydular
  bindSats(L) {
    this.sats = L;
    $('#chkSats').addEventListener('change', (e) => { L.enabled = e.target.checked; });
    $('#chkMoonSats').addEventListener('change', (e) => { L.moonEnabled = e.target.checked; });
    let tmr = null;
    $('#satSearch').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.satSearch(e.target.value), 150); });
    $('#satSearch').addEventListener('keydown', (e) => e.stopPropagation());
    L.onChange = () => this.renderSats();
    this.renderSats();
  }
  renderSats() {
    const L = this.sats; if (!L) return;
    const st = $('#satStatus'); st.replaceChildren();
    const line = (txt) => { const d = document.createElement('div'); d.textContent = txt; st.appendChild(d); };
    if (L.n > 0) {
      const ep = new Date(L.epochMs).toISOString().slice(0, 16).replace('T', ' ');
      line(`${fmt(L.n, 0)} aktif uydu · kaynak: ${L.src ? L.src.kaynak : '—'}${L.src && L.src.yas ? ` (${fmt(L.src.yas / 3600, 1)} sa önce)` : ''}`);
      line(`Yörünge öğeleri çağı: ~${ep} UTC`);
    } else line(L.info.status);
    const ul = $('#satGroups'); ul.replaceChildren();
    if (L.counts) SAT_GROUPS.forEach((g, i) => {
      const li = document.createElement('li');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!L.mask[i]; cb.addEventListener('change', () => L.setMask(i, cb.checked));
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = '#' + g.color.toString(16).padStart(6, '0');
      const nm = document.createElement('span'); nm.textContent = g.name;
      const c = document.createElement('span'); c.className = 'v'; c.textContent = fmt(L.counts[i], 0);
      li.append(cb, sw, nm, c); ul.appendChild(li);
    });
    this.renderMoonSats();
  }
  satSearch(q) {
    const L = this.sats, ul = $('#satResults'); ul.replaceChildren();
    for (const i of L.search(q)) {
      const li = document.createElement('li'); li.textContent = `${L.names[i]} (${L.ids[i]})`;
      li.addEventListener('click', () => { L.select(i); ul.replaceChildren(); $('#satSearch').value = L.names[i]; });
      ul.appendChild(li);
    }
    if (!q) L.select(-1);
  }
  renderMoonSats(t = null) {
    const L = this.sats, tb = $('#moonSatTable tbody'); tb.replaceChildren();
    for (const m of L.moonSats) {
      const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'); b.className = 'num';
      a.textContent = m.name;
      const r = m.cur || (t != null && m.rows ? L.moonState(m, t) : null);
      b.textContent = r ? `irtifa ${fmt(Math.hypot(...r) - E.R_M, 0)} km` : m.status;
      tr.append(a, b); tb.appendChild(tr);
    }
  }
  satTab(t) {
    const L = this.sats; if (!L) return;
    const inf = L.selInfo(t), el = $('#satSel'); el.replaceChildren();
    if (inf) {
      const add = (txt, b) => { const d = document.createElement(b ? 'b' : 'div'); d.textContent = txt; el.appendChild(d); };
      add(`${inf.name} (NORAD ${inf.id})`, true);
      add(`İrtifa ${fmt(inf.alt, 0)} km · hız ${fmt(inf.v, 2)} km/s`);
      add(`Periyot ${fmt(inf.periodMin, 1)} dk · eğim ${fmt(inf.inc, 1)}° · dış merkezlik ${fmt(inf.ecc, 4)}`);
    }
    if (!L.validAt(t) && L.n > 0) { const d = document.createElement('div'); d.textContent = 'Simülasyon tarihi yörünge öğelerinin çağından 30 günden uzak: Dünya uyduları gizlendi.'; el.appendChild(d); }
    this.renderMoonSats(t);
  }

  orbitTab(s) {
    const t = s.t, rm = E.moonPos(t), nearM = E.norm(E.sub(s.r, rm)) < E.MOON_ZONE;
    const cen = nearM ? rm : [0, 0, 0], vc = nearM ? E.moonVel(t) : [0, 0, 0], mu = nearM ? E.MU_M : E.MU_E, Rb = nearM ? E.R_M : E.R_E;
    const r = E.sub(s.r, cen), v = E.sub(s.v, vc), el = E.elements(r, v, mu);
    // eğim: Dünya için tarihin ekvatoruna, Ay için Ay ekvatoruna (ME)
    const pole = nearM ? E.mtv(E.moonIcrfToMe(t), [0, 0, 1]) : E.precession(t)[2];
    const inc = Math.acos(E.dot(E.unit(el.h), pole)) * 180 / Math.PI;
    const period = el.e < 1 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / mu) : NaN;
    const rows = [['Merkez cisim', nearM ? 'Ay' : 'Dünya'], ['Tür', el.e < 1 ? 'elips' : 'hiperbol'],
      ['Yarı büyük eksen', Number.isFinite(el.a) ? fmt(el.a, 0) + ' km' : '—'], ['Dış merkezlik', fmt(el.e, 5)],
      ['Eğim (ekvatora göre)', fmt(inc, 2) + '°'], ['Periapsis irtifası', fmt(el.rp - Rb, 1) + ' km'],
      ['Apoapsis irtifası', el.e < 1 ? fmt(el.ra - Rb, 1) + ' km' : '∞'], ['Periyot', Number.isFinite(period) ? fmtDur(period) : '—'],
      ['Özgül enerji', fmt(el.energy, 4) + ' km²/s²']];
    const tb = $('#orbtable tbody'); tb.replaceChildren();
    for (const [k, val] of rows) { const tr = document.createElement('tr'); const a = document.createElement('td'); a.textContent = k; const b = document.createElement('td'); b.className = 'num'; b.textContent = val; tr.append(a, b); tb.appendChild(tr); }
  }

  // ------------------------------------------------------------------ canlı efemeris sekmesi
  ephTab(t) {
    const lv = this.live; if (!lv) return;
    const L = lv.L, et = etOf(t), { add, sub, scale, norm, unit, dot } = E;
    const [pE, vE] = L.body(IE, et), [pM, vM] = L.body(IM, et), [pS, vS] = L.body(IS, et);
    const rEM = sub(pM, pE), vEM = sub(vM, vE), d = norm(rEM);
    const pB = add(scale(pE, 1 - K_EMB), scale(pM, K_EMB)), vB = add(scale(vE, 1 - K_EMB), scale(vM, K_EMB));
    // resmi efemerise (DE440) göre fark: konum ve Ay yönelimi
    let dMoon = null, dEarth = null, dPA = null;
    try {
      const m = lv.spk.rel(3, 301, et)[0], e = lv.spk.rel(3, 399, et)[0];
      dMoon = norm(sub(sub(m, e), rEM)) * 1000;
      dEarth = norm(sub(lv.spk.ssb(399, et)[0], pE));
      dPA = rotAngle(paFromEuler(lv.pck.angles(et)[0]), E.moonIcrfToPa(t)) * R2AS;
    } catch (err) { /* çekirdek aralığı dışı */ }
    // Dünya yönelimi (IAU 2006/2000A)
    const jdTT = E.jdTdb(t), dT = EO.deltaT(jdTT), jdUT1 = jdTT - dT / 86400;
    const n = EO.npb(jdTT), gst = EO.gast(jdUT1, jdTT), era = EO.era(jdUT1);
    // Ay dönüşü (Euler denklemleri): açısal hız, Dünya'dan görülen libration, ekvator eğimi
    const { w } = L.moonAttitude(et), wDeg = norm(w) * 86400 / D2R;
    const Me = E.moonIcrfToMe(t), u = mv(Me, unit(scale(rEM, -1)));
    const libLat = Math.asin(u[2]) / D2R, libLon = Math.atan2(u[1], u[0]) / D2R;
    const moonEclInc = Math.acos(dot(Me[2], ECL_POLE)) / D2R;
    const fwd = L.fwd[L.fwd.length - 1].t, bwd = L.bwd[L.bwd.length - 1].t;
    const sec = (title) => ({ sec: title });
    const rows = [
      sec('Dünya–Ay çifti (ortak kütle merkezi)'),
      ['Dünya–Ay uzaklığı', fmt(d, 0) + ' km'],
      ['Kütle merkezinin Dünya merkezine uzaklığı', fmt(K_EMB * d, 0) + ' km'],
      ['… Dünya yüzeyinin altında', fmt(E.R_E - K_EMB * d, 0) + ' km'],
      ["Dünya'nın kütle merkezi etrafında hızı", fmt(K_EMB * norm(vEM) * 1000, 1) + ' m/s'],
      ["Ay'ın kütle merkezi etrafında hızı", fmt((1 - K_EMB) * norm(vEM), 3) + ' km/s'],
      ["Kütle merkezinin Güneş'e uzaklığı", fmt(norm(sub(pB, pS)) / AU, 5) + ' AB'],
      ["Kütle merkezinin Güneş etrafında hızı", fmt(norm(sub(vB, vS)), 3) + ' km/s'],
      ['Ay konumu: DE440 farkı', dMoon == null ? '—' : dMoon < 1000 ? fmt(dMoon, 1) + ' m' : fmt(dMoon / 1000, 2) + ' km'],
      ['Dünya konumu (Güneş sistemi merkezine göre): DE440 farkı', dEarth == null ? '—' : dEarth < 1 ? fmt(dEarth * 1000, 1) + ' m' : fmt(dEarth, 2) + ' km'],
      sec('Dünya dönüşü (IAU 2006/2000A)'),
      ['Greenwich görünür yıldız zamanı', hms(gst / (2 * Math.PI) * 86400)],
      ['Dünya dönüş açısı (ERA)', fmt(era / D2R, 4) + '°'],
      ['Dönüş hızı', '360,98561°/gün'],
      ['Yıldız günü', '23 sa 56 dk 4,1 s'],
      ['Nütasyon Δψ / Δε', `${fmt(n.dpsi * R2AS, 3)}″ / ${fmt(n.deps * R2AS, 3)}″`],
      ['Ekseninin eğikliği (gerçek)', fmt((n.epsa + n.deps) / D2R, 5) + '°'],
      ['Kutbun J2000 yönünden sapması (presesyon)', dms(Math.acos(Math.min(1, n.R[2][2])) * R2AS)],
      ['ΔT = TT − UT1', fmt(dT, 2) + ' s'],
      sec('Ay dönüşü (tork + Euler denklemleri)'),
      ['Açısal hız', fmt(wDeg, 4) + '°/gün'],
      ['Dönüş periyodu', fmt(360 / wDeg, 3) + ' gün'],
      ['Dünya\'dan görünen libration (enlem / boylam)', `${fmt(libLat, 2)}° / ${fmt(libLon, 2)}°`],
      ['Ay ekvatorunun ekliptiğe eğimi', fmt(moonEclInc, 3) + '°'],
      ['İniş yerinde Güneş yüksekliği', fmt(sunElevationAtSite(t), 2) + '°'],
      ['Yönelim: DE440 farkı', dPA == null ? '—' : fmt(dPA, 3) + '″'],
      sec('Entegratör'),
      ['Cisimler', '11 (Güneş, 8 gezegen, Plüton, Ay)'],
      ['Başlangıç (DE440 durumu)', utcShort(L.et0 - etOf(0))],
      ['Hesaplanan aralık', `${fmt((fwd - bwd) / 86400, 2)} gün · ${L.steps ?? L.fwd.length + L.bwd.length} adım`],
    ];
    const tb = $('#ephtable tbody'); tb.replaceChildren();
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.sec) { tr.className = 'sec'; const th = document.createElement('th'); th.colSpan = 2; th.textContent = r.sec; tr.appendChild(th); }
      else { const a = document.createElement('td'); a.textContent = r[0]; const b = document.createElement('td'); b.className = 'num'; b.textContent = r[1]; tr.append(a, b); }
      tb.appendChild(tr);
    }
  }
}

// ------------------------------------------------------------------ çizgi grafiği (tek seri, çapraz imleçli)
class LineChart {
  constructor(canvas, title, unit, log) {
    this.c = canvas; this.title = title; this.unit = unit; this.log = log; this.x = []; this.y = []; this.hover = null;
    canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); this.hover = e.clientX - r.left; this.draw(); });
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }
  set(x, y) { this.x = x; this.y = y; }
  draw() {
    const c = this.c, dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement);
    const ink2 = cs.getPropertyValue('--text-secondary').trim(), grid = cs.getPropertyValue('--grid').trim(), ser = cs.getPropertyValue('--series-1').trim();
    const L = 60, R = 12, T = 22, B = 22;
    g.font = '12px system-ui, sans-serif'; g.fillStyle = ink2; g.textBaseline = 'alphabetic';
    g.fillText(`${this.title} (${this.unit})`, L, 14);
    const n = this.x.length; if (n < 2) return;
    const x0 = this.x[0], x1 = this.x[n - 1] || x0 + 1;
    const fy = this.log ? (v) => Math.log10(Math.max(v, 1e-3)) : (v) => v;
    let ymin = Infinity, ymax = -Infinity; for (const v of this.y) { const f = fy(v); ymin = Math.min(ymin, f); ymax = Math.max(ymax, f); }
    if (this.log) { ymin = Math.floor(ymin); ymax = Math.ceil(ymax); } else { ymin = 0; ymax = ymax * 1.08 || 1; }
    const px = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), py = (f) => T + (1 - (f - ymin) / (ymax - ymin || 1)) * (H - T - B);
    // ızgara + eksen etiketleri
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = ink2; g.textAlign = 'right';
    const ticks = this.log ? Array.from({ length: ymax - ymin + 1 }, (_, i) => ymin + i) : [0, 0.25, 0.5, 0.75, 1].map((k) => ymin + k * (ymax - ymin));
    for (const f of ticks) {
      const y = Math.round(py(f)) + 0.5; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      const v = this.log ? 10 ** f : f; g.fillText(this.log ? (v >= 1 ? fmt(v, 0) : String(v)) : fmt(v, v < 10 ? 1 : 0), L - 6, y + 4);
    }
    g.textAlign = 'center';
    for (let k = 0; k <= 4; k++) { const xv = x0 + (k / 4) * (x1 - x0); g.fillText(fmt(xv, xv < 10 ? 1 : 0) + ' sa', px(xv), H - 6); }
    // seri
    g.strokeStyle = ser; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i < n; i++) { const X = px(this.x[i]), Y = py(fy(this.y[i])); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke();
    // uç noktası
    const lx = px(this.x[n - 1]), ly = py(fy(this.y[n - 1]));
    g.fillStyle = cs.getPropertyValue('--surface-1').trim(); g.beginPath(); g.arc(lx, ly, 6, 0, 7); g.fill();
    g.fillStyle = ser; g.beginPath(); g.arc(lx, ly, 4, 0, 7); g.fill();
    // çapraz imleç + araç ipucu
    if (this.hover != null && this.hover >= L && this.hover <= W - R) {
      const xv = x0 + ((this.hover - L) / (W - L - R)) * (x1 - x0);
      let j = 0; while (j < n - 1 && this.x[j + 1] < xv) j++;
      const X = px(this.x[j]); g.strokeStyle = ink2; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(X) + 0.5, T); g.lineTo(Math.round(X) + 0.5, H - B); g.stroke();
      const val = this.y[j], lab = `${fmt(val, val < 10 ? 3 : 0)} ${this.unit}`, sub = `T+${fmt(this.x[j], 2)} sa`;
      g.font = '600 12px system-ui, sans-serif'; const w = Math.max(g.measureText(lab).width, g.measureText(sub).width) + 16;
      const bx = Math.min(W - R - w, Math.max(L, X + 8)), by = T + 4;
      g.fillStyle = cs.getPropertyValue('--surface-2').trim(); g.fillRect(bx, by, w, 38);
      g.fillStyle = cs.getPropertyValue('--text-primary').trim(); g.textAlign = 'left'; g.fillText(lab, bx + 8, by + 16);
      g.font = '12px system-ui, sans-serif'; g.fillStyle = ink2; g.fillText(sub, bx + 8, by + 31);
    }
  }
}
