// Laboratuvar hedef seçicileri: tüm katalog listelenmez — filtreler (grup, yükseklik, eğim, yörünge türü / sınıf, PHA, Sentry, çap, MOID) ya da ad/numara ile daraltılır.
//   SatPicker: CelesTrak aktif uydular (Canlı Gökyüzü katmanı) + istek üzerine çöp bulutları (CelesTrak grupları)
//   AstPicker: JPL SBDB asteroit kataloğu (Dünya'ya yakın tümü + büyük ana kuşak) ve Sentry risk listesi
import { SAT_GROUPS, fetchGroup } from './satlayer.js';
import { CLASS_TR } from './asteroids.js';
import { perApo } from './conjunction.js';
import { fmt } from './format.js';
import { esc } from './labkit.js';

const MAX_ROWS = 40;
export const DEBRIS = [
  { key: 'cosmos-2251-debris', ad: 'Cosmos 2251', not: '2009 Iridium 33 çarpışması' },
  { key: 'iridium-33-debris', ad: 'Iridium 33', not: '2009 Cosmos 2251 çarpışması' },
  { key: 'fengyun-1c-debris', ad: 'Fengyun-1C', not: '2007 uydu karşıtı füze denemesi' },
  { key: 'cosmos-1408-debris', ad: 'Kosmos 1408', not: '2021 uydu karşıtı füze denemesi' },
];
const debrisCache = new Map();                                                        // grup -> Promise<{ omm, kaynak }>
const GRP_SHORT = ['İstasyonlar', 'Starlink', 'OneWeb', 'Seyrüsefer', 'GEO', 'Diğer'];
const OTYPE = [['', 'Tümü'], ['leo', 'Alçak (LEO)'], ['meo', 'Orta (MEO)'], ['geo', 'Yer eşzamanlı'], ['heo', 'Yüksek eliptik']];
export function orbitType(q, e) { return e >= 0.25 ? 'heo' : Math.abs(q.period - 1436) < 30 && e < 0.05 ? 'geo' : q.ha < 2000 ? 'leo' : 'meo'; }
const numOrNull = (el) => (el.value === '' ? null : +el.value);

// ---------------------------------------------------------------- uydu seçici
export class SatPicker {
  // getSats(): SatLayer (tembel kurulur); onPick({ id, name, omm, group, src }); preset: başlangıç süzgeçleri; allowDebris
  constructor(root, { getSats, onPick, preset = {}, allowDebris = true, placeholder = 'Ad ya da NORAD numarası (ör. ISS, 25544)' }) {
    Object.assign(this, { root, getSats, onPick, allowDebris });
    this.src = 'aktif'; this.grpOn = GRP_SHORT.map(() => true); this.deb = DEBRIS[0].key; this.cache = null; this.debRows = new Map();
    root.classList.add('picker');
    root.innerHTML = `<div class="daterow"><input type="search" data-pk="q" placeholder="${esc(placeholder)}" aria-label="Uydu ara" autocomplete="off"></div>
      ${allowDebris ? '<div class="chips pk-src" role="radiogroup" aria-label="Kaynak"><button type="button" class="chip on" data-src="aktif" role="radio" aria-checked="true">Aktif uydular</button><button type="button" class="chip" data-src="cop" role="radio" aria-checked="false">Çöp bulutları</button></div>' : ''}
      <div class="chips pk-grp" aria-label="Uydu grupları">${GRP_SHORT.map((g, i) => `<button type="button" class="chip on" data-g="${i}" aria-pressed="true" title="${esc(SAT_GROUPS[i].name)}">${g}</button>`).join('')}</div>
      <div class="chips pk-deb" hidden aria-label="Çöp bulutu">${DEBRIS.map((d, i) => `<button type="button" class="chip${i ? '' : ' on'}" data-d="${d.key}" aria-pressed="${i ? 'false' : 'true'}" title="${esc(d.not)}">${d.ad}</button>`).join('')}</div>
      <details class="adv pk-adv"><summary>Yörünge süzgeçleri</summary><div class="frow3">
        <label>Perije ≥<span><input data-pk="hpMin" type="number" step="any" placeholder="—"> km</span></label>
        <label>Apoje ≤<span><input data-pk="haMax" type="number" step="any" placeholder="—"> km</span></label>
        <label>Yörünge<span><select data-pk="otype">${OTYPE.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></span></label>
        <label>Eğim ≥<span><input data-pk="iMin" type="number" step="any" placeholder="—"> °</span></label>
        <label>Eğim ≤<span><input data-pk="iMax" type="number" step="any" placeholder="—"> °</span></label>
        <label>Sırala<span><select data-pk="sort"><option value="name">Ada göre</option><option value="hp">Perijeye göre</option><option value="inc">Eğime göre</option><option value="age">Veri yaşına göre</option></select></span></label>
      </div></details>
      <div class="k small pk-count" role="status" aria-live="polite"></div>
      <ul class="plist" aria-label="Eşleşen uydular"></ul>`;
    this.q = (k) => root.querySelector(`[data-pk="${k}"]`);
    for (const [k, v] of Object.entries(preset)) { const el = this.q(k); if (el) el.value = v; }
    if (preset.groups) this.grpOn = GRP_SHORT.map((_, i) => preset.groups.includes(i));
    root.querySelectorAll('[data-g]').forEach((b) => { const i = +b.dataset.g; b.classList.toggle('on', this.grpOn[i]); b.setAttribute('aria-pressed', String(this.grpOn[i])); });
    if (Object.keys(preset).some((k) => k !== 'groups' && k !== 'sort')) root.querySelector('.pk-adv').open = true;
    root.addEventListener('input', () => this.render());
    root.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') this.render(); });     // metin kutusunun "change"i odak kaybında gelir: tıklanan satır yeniden çizilip tıklama kaybolmasın
    root.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'), s = e.target.closest('[data-src]'), d = e.target.closest('[data-d]'), r = e.target.closest('[data-row]');
      if (g) { const i = +g.dataset.g; this.grpOn[i] = !this.grpOn[i]; if (!this.grpOn.some(Boolean)) this.grpOn[i] = true; g.classList.toggle('on', this.grpOn[i]); g.setAttribute('aria-pressed', String(this.grpOn[i])); this.render(); }
      else if (s) this.setSrc(s.dataset.src);
      else if (d) { this.deb = d.dataset.d; root.querySelectorAll('[data-d]').forEach((b) => { const on = b === d; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); this.loadDebris(); }
      else if (r) { const row = this.shown[+r.dataset.row]; if (row && this.onPick) { root.querySelectorAll('.prow').forEach((x) => x.classList.toggle('on', x === r)); this.onPick(this.pickOf(row)); } }
    });
    this.render();
  }
  setSrc(src) {
    this.src = src;
    this.root.querySelectorAll('[data-src]').forEach((b) => { const on = b.dataset.src === src; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    this.root.querySelector('.pk-grp').hidden = src !== 'aktif'; this.root.querySelector('.pk-deb').hidden = src !== 'cop';
    if (src === 'cop') this.loadDebris(); else this.render();
  }
  loadDebris() {
    const key = this.deb;
    if (!debrisCache.has(key)) debrisCache.set(key, fetchGroup(key));
    if (!this.debRows.has(key)) {
      this.status('CelesTrak çöp bulutu verisi alınıyor…'); this.list([]);
      debrisCache.get(key).then((d) => { this.debRows.set(key, { rows: this.rowsOf(d.omm, () => 5, DEBRIS.find((x) => x.key === key).ad + ' enkazı'), kaynak: d.kaynak }); if (this.deb === key) this.render(); })
        .catch((err) => { debrisCache.delete(key); if (this.deb === key) { this.status('Çöp bulutu verisi alınamadı: ' + err.message); } });
      return;
    }
    this.render();
  }
  rowsOf(omm, grpOf, label) {
    const now = Date.now();
    return omm.map((o) => {
      const q = perApo(o), e = +o.ECCENTRICITY, g = grpOf(o);
      return { id: +o.NORAD_CAT_ID, name: o.OBJECT_NAME || String(o.NORAD_CAT_ID), o, ...q, e, g, ot: orbitType(q, e), age: (now - Date.parse(o.EPOCH + 'Z')) / 86400000, label: label || SAT_GROUPS[g].name };
    }).filter((r) => Number.isFinite(r.hp));
  }
  activeRows() {
    const sats = this.getSats();
    if (!sats || !sats.omm) return null;
    if (!this.cache || this.cache.omm !== sats.omm || this.cache.n !== sats.n) {
      const grp = (o) => { const i = sats.indexOf(+o.NORAD_CAT_ID); return i >= 0 && sats.groups ? sats.groups[i] : 5; };
      this.cache = { omm: sats.omm, n: sats.n, rows: this.rowsOf(sats.omm, grp) };
    }
    return this.cache.rows;
  }
  // süzgeçten geçen tüm satırlar (yakın geçiş taramasında aday listesi olarak da kullanılır)
  filtered() {
    const rows = this.src === 'cop' ? (this.debRows.get(this.deb) || {}).rows : this.activeRows();
    if (!rows) return null;
    const q = this.q('q').value.trim().toLocaleUpperCase('tr-TR'), hpMin = numOrNull(this.q('hpMin')), haMax = numOrNull(this.q('haMax')), iMin = numOrNull(this.q('iMin')), iMax = numOrNull(this.q('iMax')), ot = this.q('otype').value;
    const qUp = q.replace(/İ/g, 'I');
    return rows.filter((r) => (this.src === 'cop' || this.grpOn[r.g]) && (hpMin == null || r.hp >= hpMin) && (haMax == null || r.ha <= haMax) && (iMin == null || r.inc >= iMin) && (iMax == null || r.inc <= iMax)
      && (!ot || r.ot === ot) && (!q || String(r.id) === q || r.name.toUpperCase().includes(qUp)));
  }
  render() {
    if (this.src === 'cop' && !this.debRows.has(this.deb)) return;
    const rows = this.filtered();
    if (!rows) { this.status('Uydu kataloğu yükleniyor (CelesTrak)…'); this.list([]); clearTimeout(this.retry); this.retry = setTimeout(() => this.render(), 1000); return; }
    const k = this.q('sort').value, q = this.q('q').value.trim().toUpperCase();
    const cmp = { name: (a, b) => a.name.localeCompare(b.name, 'tr'), hp: (a, b) => a.hp - b.hp, inc: (a, b) => a.inc - b.inc, age: (a, b) => a.age - b.age }[k];
    const sorted = rows.slice().sort((a, b) => (q ? (b.name.toUpperCase().startsWith(q) - a.name.toUpperCase().startsWith(q)) || (String(b.id) === q) - (String(a.id) === q) : 0) || cmp(a, b));
    const src = this.src === 'cop' ? ` · ${this.debRows.get(this.deb).kaynak}` : '';
    this.status(`${fmt(rows.length)} cisim süzgeçten geçiyor${rows.length > MAX_ROWS ? ` · ilk ${MAX_ROWS}'i gösteriliyor (ad, numara ya da süzgeçle daraltın)` : ''}${src}`);
    this.list(sorted.slice(0, MAX_ROWS));
  }
  status(t) { this.root.querySelector('.pk-count').textContent = t; }
  list(rows) {
    this.shown = rows;
    const ul = this.root.querySelector('.plist');
    ul.innerHTML = rows.map((r, i) => `<li><button type="button" class="prow${this.sel === r.id ? ' on' : ''}" data-row="${i}"><span class="pn">${esc(r.name)}</span><span class="pm">${r.id} · ${fmt(r.hp)}×${fmt(r.ha)} km · ${fmt(r.inc, 1)}° · ${esc(r.label)}</span></button></li>`).join('');
  }
  pickOf(r) { this.sel = r.id; return { id: r.id, name: r.name, omm: r.o, group: r.label, src: this.src, hp: r.hp, ha: r.ha, inc: r.inc, e: r.e, period: r.period, ageDays: r.age }; }
}

// ---------------------------------------------------------------- asteroit seçici
const ACLS = [['IEO', 'Atira'], ['ATE', 'Aten'], ['APO', 'Apollo'], ['AMO', 'Amor'], ['_', 'Diğer']];
export class AstPicker {
  // getAsts(): AsteroidLayer; onPick({ i, des, name, D (m), Dmeas, H, alb, cls, pha, a, e, inc, moid, spec, sentry })
  constructor(root, { getAsts, onPick, preset = {} }) {
    Object.assign(this, { root, getAsts, onPick });
    this.clsOn = ACLS.map(([k]) => k !== '_'); this.pha = false; this.sentry = false;
    root.classList.add('picker');
    root.innerHTML = `<div class="daterow"><input type="search" data-pk="q" placeholder="Ad, numara ya da tanım (ör. Apophis, 99942, 2023 DW)" aria-label="Asteroit ara" autocomplete="off"></div>
      <div class="chips pk-cls" aria-label="Yörünge sınıfı">${ACLS.map(([k, t], i) => `<button type="button" class="chip${this.clsOn[i] ? ' on' : ''}" data-c="${i}" aria-pressed="${this.clsOn[i]}" title="${esc(CLASS_TR[k] || 'Ana kuşak, Mars kesen, Truvalılar…')}">${t}</button>`).join('')}</div>
      <div class="chips pk-flag"><button type="button" class="chip" data-flag="pha" aria-pressed="false" title="Potansiyel tehlikeli: MOID ≤ 0,05 AB ve H ≤ 22">Yalnız PHA</button><button type="button" class="chip" data-flag="sentry" aria-pressed="false" title="JPL Sentry: gelecekte çarpma olasılığı sıfır olmayan">Yalnız Sentry listesi</button></div>
      <details class="adv pk-adv"><summary>Boyut ve yaklaşma süzgeçleri</summary><div class="frow3">
        <label>Çap ≥<span><input data-pk="dMin" type="number" step="any" placeholder="—"> m</span></label>
        <label>Çap ≤<span><input data-pk="dMax" type="number" step="any" placeholder="—"> m</span></label>
        <label>MOID ≤<span><input data-pk="moidMax" type="number" step="any" placeholder="—"> AB</span></label>
        <label>H ≤<span><input data-pk="hMax" type="number" step="any" placeholder="—"></span></label>
        <label>Sırala<span><select data-pk="sort"><option value="D">Çapa göre (büyük)</option><option value="moid">MOID'e göre</option><option value="ip">Çarpma olasılığına göre</option><option value="name">Ada göre</option></select></span></label>
      </div></details>
      <div class="k small pk-count" role="status" aria-live="polite"></div>
      <ul class="plist" aria-label="Eşleşen asteroitler"></ul>`;
    this.q = (k) => root.querySelector(`[data-pk="${k}"]`);
    for (const [k, v] of Object.entries(preset)) { const el = this.q(k); if (el) el.value = v; }
    root.addEventListener('input', () => this.render());
    root.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') this.render(); });     // metin kutusunun "change"i odak kaybında gelir: tıklanan satır yeniden çizilip tıklama kaybolmasın
    root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]'), fl = e.target.closest('[data-flag]'), r = e.target.closest('[data-row]');
      if (c) { const i = +c.dataset.c; this.clsOn[i] = !this.clsOn[i]; if (!this.clsOn.some(Boolean)) this.clsOn[i] = true; c.classList.toggle('on', this.clsOn[i]); c.setAttribute('aria-pressed', String(this.clsOn[i])); this.render(); }
      else if (fl) { const k = fl.dataset.flag; this[k] = !this[k]; fl.classList.toggle('on', this[k]); fl.setAttribute('aria-pressed', String(this[k])); this.render(); }
      else if (r) { const i = this.shown[+r.dataset.row]; if (i != null && this.onPick) { root.querySelectorAll('.prow').forEach((x) => x.classList.toggle('on', x === r)); this.onPick(this.pickOf(i)); } }
    });
    this.render();
  }
  render() {
    const A = this.getAsts();
    if (!A || !A.C || !A.n) { this.status(A && A.info && /alınamadı/.test(A.info.status || '') ? A.info.status : 'Asteroit kataloğu yükleniyor (JPL SBDB)…'); this.list(null, []); clearTimeout(this.retry); this.retry = setTimeout(() => this.render(), 1000); return; }
    const C = A.C, q = this.q('q').value.trim(), dMin = numOrNull(this.q('dMin')), dMax = numOrNull(this.q('dMax')), moidMax = numOrNull(this.q('moidMax')), hMax = numOrNull(this.q('hMax'));
    const clsIdx = (c) => { const k = ACLS.findIndex(([x]) => x === c); return k < 0 ? 4 : k; };
    let idx;
    if (q) idx = A.search(q);                                                                  // ad/numara: katalog araması (süzgeçler yine uygulanır)
    else { idx = []; for (let i = 0; i < A.n; i++) idx.push(i); }
    const sen = (i) => A.sentry.get(C.des[i]);
    idx = idx.filter((i) => this.clsOn[clsIdx(C.cls[i])] && (!this.pha || C.pha[i]) && (!this.sentry || sen(i)) && (moidMax == null || (C.moid[i] != null && C.moid[i] <= moidMax))
      && (hMax == null || C.H[i] <= hMax) && (dMin == null || A.diam(i) * 1000 >= dMin) && (dMax == null || A.diam(i) * 1000 <= dMax));
    const k = this.q('sort').value;
    if (!q) {
      const key = { D: (i) => -A.diam(i), moid: (i) => (C.moid[i] == null ? 9 : C.moid[i]), ip: (i) => { const s = sen(i); return s ? -s.ip : 1; }, name: null }[k];
      if (key) { const v = new Map(idx.map((i) => [i, key(i)])); idx.sort((a, b) => v.get(a) - v.get(b)); } else idx.sort((a, b) => A.label(a).localeCompare(A.label(b), 'tr'));
    }
    this.status(`${fmt(idx.length)} asteroit süzgeçten geçiyor${idx.length > MAX_ROWS ? ` · ilk ${MAX_ROWS}'i gösteriliyor` : ''}${q && idx.length === 0 ? ' (ad aramasında sınıf/çap süzgeçleri de uygulanır)' : ''}`);
    this.list(A, idx.slice(0, MAX_ROWS));
  }
  status(t) { this.root.querySelector('.pk-count').textContent = t; }
  list(A, idx) {
    this.shown = idx;
    const ul = this.root.querySelector('.plist');
    if (!A) { ul.innerHTML = ''; return; }
    const C = A.C, sz = (m) => (m >= 1000 ? `${fmt(m / 1000, m >= 1e4 ? 0 : 1)} km` : `${fmt(m)} m`);
    ul.innerHTML = idx.map((i, k) => {
      const s = A.sentry.get(C.des[i]), D = A.diam(i) * 1000, cls = (ACLS.find(([x]) => x === C.cls[i]) || [0, C.cls[i] || '—'])[1];
      return `<li><button type="button" class="prow${this.sel === C.des[i] ? ' on' : ''}" data-row="${k}"><span class="pn">${esc(A.label(i))}${C.pha[i] ? '<span class="badge warn">PHA</span>' : ''}${s ? '<span class="badge bad">Sentry</span>' : ''}</span><span class="pm">${C.D[i] > 0 ? '' : '≈ '}${sz(D)} · ${esc(cls)} · MOID ${C.moid[i] != null ? fmt(C.moid[i], 4) + ' AB' : '—'}${s ? ` · P ${(+s.ip).toExponential(1).replace('.', ',')}` : ''}</span></button></li>`;
    }).join('');
  }
  pickOf(i) {
    const A = this.getAsts(), C = A.C, s = A.sentry.get(C.des[i]) || null; this.sel = C.des[i];
    return { i, des: C.des[i], name: A.label(i), D: A.diam(i) * 1000, Dmeas: C.D[i] > 0, H: C.H[i], alb: C.alb[i], cls: C.cls[i], clsTr: CLASS_TR[C.cls[i]] || C.cls[i], pha: !!C.pha[i],
      a: C.a[i], e: C.e[i], inc: C.i[i], moid: C.moid[i], spec: C.spec[i], sentry: s };
  }
}
