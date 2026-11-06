// Canlı Gökyüzü çalışma alanının arayüzü: gerçek saat, üst bilgi kartı, zaman denetimleri, Takip sekmesi (izleme listesi,
// gözlemci, yaklaşan geçişler, gökyüzü çizimi, bildirimler). Ay görevinin fizik motorundan tamamen bağımsızdır.
import * as P from './passes.js';
import { CITIES } from './tracker.js';
import { fmt } from './format.js';
import { $, mk } from './uiutil.js';
import { applyIcons } from './icons.js';
import { ns, ew, compass16, LOC, t, UNIT } from './i18n.js';

const hm = (ms, sec = false) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const day = (ms) => { const d = new Date(ms), n = new Date(); const dd = Math.round((new Date(d.toDateString()) - new Date(n.toDateString())) / 86400000);
  return dd === 0 ? t('Bugün') : dd === 1 ? t('Yarın') : d.toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' }); };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
// takip listesi boşken tek dokunuşla eklenebilen uydular (NORAD, ad)
const SUGGEST = [[25544, 'ISS'], [48274, 'Tiangong'], [20580, 'Hubble']];
const REDUCED = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- gerçek saat (hızlandırılabilir)
export class SkyClock {
  constructor() { this.live(); }
  nowMs() { return this.paused ? this.baseMs : this.baseMs + (performance.now() - this.baseReal) * this.rate; }
  rebase() { this.baseMs = this.nowMs(); this.baseReal = performance.now(); }
  setRate(r) { this.rebase(); this.rate = r; this.paused = false; }
  pause(on) { this.rebase(); this.paused = on; }
  live() { this.baseMs = Date.now(); this.baseReal = performance.now(); this.rate = 1; this.paused = false; }
  shift(ms) { this.rebase(); this.baseMs += ms; }
  jump(ms) { this.baseMs = ms; this.baseReal = performance.now(); }
  isLive() { return !this.paused && this.rate === 1 && Math.abs(this.nowMs() - Date.now()) < 3000; }
}

export class SkyUI {
  constructor({ clock, tracker, sats, asts, setSkyCam, lookAt, follow }) {
    Object.assign(this, { clock, tracker, sats, asts, setSkyCam, lookAt, follow });
    this.selPass = null; this.lastList = 0;
    // zaman denetimleri
    $('#skyNow').addEventListener('click', () => { clock.live(); this.syncClock(); });
    $('#skyPause').addEventListener('click', () => { clock.pause(!clock.paused); this.syncClock(); });
    document.querySelectorAll('#skyControls [data-rate]').forEach((b) => b.addEventListener('click', () => { clock.setRate(+b.dataset.rate); this.syncClock(); }));
    $('#skyBack').addEventListener('click', () => { clock.shift(-3600e3); this.syncClock(); });
    $('#skyFwd').addEventListener('click', () => { clock.shift(3600e3); this.syncClock(); });
    $('#skyBackD').addEventListener('click', () => { clock.shift(-86400e3); this.syncClock(); });
    $('#skyFwdD').addEventListener('click', () => { clock.shift(86400e3); this.syncClock(); });
    document.querySelectorAll('[data-skycam]').forEach((b) => b.addEventListener('click', () => this.setSkyCam(b.dataset.skycam)));
    // gözlemci: şehir adının kendisi seçim kutusu; "Özel konum…" seçilince enlem/boylam/yükseklik alanları açılır
    const sel = $('#obsCity');
    for (const c of CITIES) { const o = mk('option', null, c.name); o.value = c.name; sel.appendChild(o); }
    const oc = mk('option', null, 'Özel konum…'); oc.value = '_'; sel.appendChild(oc);
    this.customOpen = false;
    sel.addEventListener('change', () => {
      if (sel.value === '_') { this.customOpen = true; $('#obsCustom').hidden = false; $('#obsLat').focus(); return; }
      const c = CITIES.find((x) => x.name === sel.value);
      if (c) { this.customOpen = false; tracker.setObserver(c); }
    });
    for (const id of ['#obsLat', '#obsLon', '#obsH']) {
      $(id).addEventListener('change', () => tracker.setObserver({ name: 'Özel konum', lat: +$('#obsLat').value, lon: +$('#obsLon').value, h: (+$('#obsH').value || 0) / 1000 }));
      $(id).addEventListener('keydown', (e) => e.stopPropagation());
    }
    $('#obsGeo').addEventListener('click', () => {
      if (!navigator.geolocation) { this.toast('Tarayıcı konum bilgisini desteklemiyor.'); return; }
      $('#obsGeo').disabled = true;
      navigator.geolocation.getCurrentPosition((p) => {
        $('#obsGeo').disabled = false; this.customOpen = false;
        tracker.setObserver({ name: 'Konumum', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), h: Math.max(0, (p.coords.altitude || 0) / 1000) });
      }, (e) => { $('#obsGeo').disabled = false; this.toast('Konum alınamadı: ' + e.message); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });
    // izleme listesine ekle: yazdıkça öneriler; Enter ilk öneriyi ekler, Esc temizler
    let tmr = null;
    const add = $('#watchAdd');
    add.addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.searchAdd(e.target.value), 150); });
    add.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const first = $('#watchResults li:not(.dim)'); if (first) first.click(); }
      else if (e.key === 'Escape') { add.value = ''; $('#watchResults').replaceChildren(); }
    });
    // geçiş süzgeci (Görünür | Tümü) ve bildirim
    this.visOnly = true;
    document.querySelectorAll('#passFilter [data-vis]').forEach((b) => b.addEventListener('click', () => { this.visOnly = b.dataset.vis === '1'; this.syncPassControls(); this.renderPasses(); }));
    $('#passNotify').addEventListener('click', async () => {
      const on = !tracker.notify;
      if (on && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (err) { /* eski tarayıcı */ }
      }
      if (on && 'Notification' in window && Notification.permission === 'denied') this.toast('Tarayıcı bildirimleri engelli; hatırlatmalar yalnız sayfa içinde görünecek.');
      else if (on) this.toast('Görünür geçişlerden 5 dakika önce haber verilecek (sayfa açıkken).');
      tracker.setNotify(on); this.syncPassControls();
    });
    this.syncPassControls();
    tracker.onChange = () => this.render();
    tracker.onToast = (m) => this.toast(m);
    this.syncClock(); this.render();
  }
  toast(msg) {
    const box = $('#toasts'), d = mk('div', 'toast', msg); box.appendChild(d);
    setTimeout(() => d.classList.add('out'), 7000); setTimeout(() => d.remove(), 7600);
  }
  syncClock() {
    const c = this.clock;
    document.querySelectorAll('#skyControls [data-rate]').forEach((b) => b.classList.toggle('on', !c.paused && +b.dataset.rate === c.rate));
    $('#skyPause').classList.toggle('on', c.paused);
    $('#skyPause').setAttribute('aria-pressed', c.paused ? 'true' : 'false');
    $('#skyPause').querySelector('span').textContent = c.paused ? 'Devam' : 'Duraklat';
  }
  searchAdd(q) {
    const L = this.sats, ul = $('#watchResults'); ul.replaceChildren();
    if (!q || !L.search) return;
    for (const i of L.search(q)) {
      const id = +L.ids[i], have = this.tracker.has(id), li = mk('li');
      const nm = mk('span', 'tk-rname', L.names[i]); nm.setAttribute('translate', 'no');
      li.append(nm, mk('span', 'k', have ? 'listede' : `#${id}`));
      if (have) li.classList.add('dim');
      else li.addEventListener('click', () => { this.tracker.add(id); ul.replaceChildren(); $('#watchAdd').value = ''; this.tracker.computePasses(true); });
      ul.appendChild(li);
    }
  }
  syncPassControls() {
    document.querySelectorAll('#passFilter [data-vis]').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.vis === '1') === this.visOnly ? 'true' : 'false'));
    $('#passNotify').setAttribute('aria-pressed', this.tracker.notify ? 'true' : 'false');
  }
  setCamButtons(mode) { document.querySelectorAll('[data-skycam]').forEach((b) => b.classList.toggle('on', b.dataset.skycam === mode)); }

  // ---------------------------------------------------------------- her kare (sık) : üst kart ve liste değerleri
  hud(t, ms) {
    const c = this.clock, live = c.isLive();
    $('#liveBadge').classList.toggle('off', !live);
    $('#liveBadge').lastChild.textContent = live ? 'CANLI' : c.paused ? 'DURAKLATILDI' : c.rate !== 1 ? `×${fmt(c.rate, 0)} HIZLI` : 'GEÇMİŞ/GELECEK';
    const d = new Date(ms);
    $('#skyLocal').textContent = d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#skyDate').textContent = d.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#skyUtc').textContent = 'UTC ' + d.toISOString().slice(0, 19).replace('T', ' ');
    const off = ms - Date.now();
    $('#skyOffset').textContent = Math.abs(off) < 3000 ? '' : `gerçek zamandan ${off > 0 ? 'ileri' : 'geri'}: ${fmtDelta(Math.abs(off))}`;
    const o = this.tracker.observer, sunEl = P.lookAngles(o, P.eciToEcf(P.sunEci(ms), P.gmst(ms))).el;
    $('#skyObs').textContent = `${o.name} · ${fmt(o.lat, 3)}°, ${fmt(o.lon, 3)}°`;
    $('#skySun').textContent = `Güneş ${fmt(sunEl, 1)}° · ${sunEl > 0 ? 'gündüz' : sunEl > -6 ? 'sivil alacakaranlık' : sunEl > -12 ? 'denizci alacakaranlığı' : sunEl > -18 ? 'astronomik alacakaranlık' : 'gece'}`;
    const np = this.tracker.nextPass(true), el = $('#skyNext');
    if (np) {
      const tl = np.visFrom || np.rise.ms, dt = tl - Date.now();
      el.replaceChildren(mk('div', 'k', 'Sonraki görünür geçiş'), mk('b', null, np.name),
        mk('div', null, dt > 0 ? `${day(tl)} ${hm(tl)} · ${fmtDelta(dt)} sonra · en yüksek ${fmt(np.max.el, 0)}° ${P.compass(np.max.az)}` : `ŞİMDİ gökte · en yüksek ${fmt(np.max.el, 0)}° ${P.compass(np.max.az)}`));
    } else el.replaceChildren(mk('div', 'k', 'Sonraki görünür geçiş'), mk('div', null, this.tracker.passes.length ? '3 gün içinde çıplak gözle görünen geçiş yok' : 'hesaplanıyor…'));
    $('#skyCounts').textContent = `${fmt(this.sats.n || 0, 0)} uydu · ${fmt(this.asts.n || 0, 0)} asteroit`;
    if (performance.now() - this.lastList > 1000) { this.lastList = performance.now(); this.renderWatchValues(ms); }
  }

  // ---------------------------------------------------------------- Takip sekmesi
  // Sade düzen: konum kartı · takip listesi (boşken tek dokunuşla öneriler) · geçiş kartları (seçilen geçişin ayrıntısı ve gökyüzü
  // çizimi yalnız o kartın altında açılır). Hareket: basınca hafif küçülme (CSS), ayrıntı 200 ms ease-out ile açılır; azaltılmış
  // hareket tercihinde yalnız saydamlık.
  render() {
    const T = this.tracker, o = T.observer;
    // konum
    const sel = $('#obsCity'), isCity = CITIES.some((c) => c.name === o.name);
    let cur = sel.querySelector('option[value="__cur"]');
    if (isCity) { if (cur) cur.remove(); sel.value = o.name; }
    else { if (!cur) { cur = mk('option'); cur.value = '__cur'; sel.prepend(cur); } cur.textContent = o.name; sel.value = '__cur'; }
    $('#obsCustom').hidden = !(this.customOpen || o.name === 'Özel konum');
    $('#obsLat').value = o.lat; $('#obsLon').value = o.lon; $('#obsH').value = Math.round((o.h || 0) * 1000);
    $('#obsInfo').textContent = `${fmt(Math.abs(o.lat), 3)}° ${ns(o.lat)} · ${fmt(Math.abs(o.lon), 3)}° ${ew(o.lon)} · ${fmt((o.h || 0) * 1000, 0)} m`;
    // takip listesi
    const ul = $('#watchList'); ul.replaceChildren();
    $('#watchCount').textContent = T.watch.length ? String(T.watch.length) : '';
    if (!T.watch.length) {
      const li = mk('li', 'tk-empty');
      li.appendChild(mk('p', null, 'Henüz takip ettiğin uydu yok. Ara ya da bir uydunun kartındaki “Takibe al” ile ekle.'));
      const chips = mk('div', 'tk-chips');
      for (const [id, nm] of SUGGEST) {
        const b = mk('button', 'tk-chip'); b.type = 'button'; b.title = `${nm} (#${id}) takip listesine ekle`;
        b.innerHTML = '<i data-icon="plus"></i>'; const sp = mk('span', null, nm); sp.setAttribute('translate', 'no'); b.appendChild(sp);
        b.addEventListener('click', () => { T.add(id); T.computePasses(true); });
        chips.appendChild(b);
      }
      li.appendChild(chips); applyIcons(li); ul.appendChild(li);
    }
    for (const id of T.watch) {
      const li = mk('li', 'witem'); li.dataset.id = id;
      const top = mk('div', 'wtop'), dot = mk('span', 'wdot'); dot.style.background = hex(T.colorOf(id));
      const nm = mk('b', 'wname', T.name(id)); nm.setAttribute('translate', 'no');
      const rm = mk('button', 'tk-x'); rm.type = 'button'; rm.title = 'Takip listesinden çıkar'; rm.setAttribute('aria-label', 'Takip listesinden çıkar');
      rm.innerHTML = '<i data-icon="x"></i>'; rm.addEventListener('click', () => T.remove(id));
      top.append(dot, nm, mk('span', 'k', `#${id}`), rm);
      const vals = mk('div', 'wvals'); vals.textContent = '…';
      const acts = mk('div', 'wacts');
      const btn = (label, title, fn, on) => { const b = mk('button', 'xs' + (on ? ' on' : ''), label); b.type = 'button'; b.title = title; b.addEventListener('click', fn); acts.appendChild(b); return b; };
      btn('İzle', 'Kamerayı uyduya kilitle', () => this.follow(id));
      btn('Gökte', 'Gözlemci kamerasıyla gökyüzünde uyduya bak', () => this.lookAt(id));
      btn('Yer izi', 'Yer izi ve kapsama dairesini aç/kapa', () => T.toggleTrack(id), T.trackOn.has(id)).setAttribute('aria-pressed', T.trackOn.has(id) ? 'true' : 'false');
      li.append(top, vals, acts); applyIcons(li); ul.appendChild(li);
    }
    this.renderWatchValues(this.clock.nowMs());
    this.renderPasses();
  }
  renderWatchValues(ms) {
    const T = this.tracker;
    document.querySelectorAll('#watchList .witem').forEach((li) => {
      const id = +li.dataset.id, s = T.state(id, ms), v = li.querySelector('.wvals'); if (!v) return;
      v.classList.toggle('msg', !s);                                      // açıklama metni sayı yazı tipiyle değil
      if (!s) { v.textContent = this.sats.byId ? 'Yörünge verisi yok (liste güncel değil ya da uydu artık aktif değil)' : 'veri bekleniyor…'; return; }
      const up = s.el > 0;
      v.replaceChildren(
        mk('span', 'tk-num', `${fmt(s.alt, 0)} km · ${fmt(s.speed, 2)} km/s`),
        mk('span', 'tag ' + (up ? 'up' : 'down'), up ? `Gökte ${fmt(s.el, 0)}° ${P.compass(s.az)}` : 'Ufkun altında'),
        mk('span', 'tag ' + (s.sunlit ? 'sun' : 'shadow'), s.sunlit ? 'Güneşte' : 'Gölgede'));
      v.title = `${fmt(Math.abs(s.lat), 1)}°${ns(s.lat)} ${fmt(Math.abs(s.lon), 1)}°${ew(s.lon)}`;
    });
  }
  renderPasses(animateKey = null) {
    const T = this.tracker, ul = $('#passList'), now = Date.now(); ul.replaceChildren();
    const all = T.passes.filter((p) => p.kind === 'sabit' || p.set.ms > now);
    const list = all.filter((p) => p.kind === 'sabit' || !this.visOnly || p.visible).slice(0, 40);
    if (!list.length) {
      const li = mk('li', 'tk-empty');
      if (!T.watch.length) li.appendChild(mk('p', null, 'Geçişleri görmek için takip listesine uydu ekle.'));
      else if (!this.sats.byId) li.appendChild(mk('p', null, 'Uydu verisi bekleniyor…'));
      else if (T.passBusy && !all.length) li.appendChild(mk('p', null, 'Geçişler hesaplanıyor…'));
      else if (this.visOnly && all.length) {
        li.appendChild(mk('p', null, '3 gün içinde çıplak gözle görünen geçiş yok.'));
        const b = mk('button', 'xs', 'Tüm geçişleri göster'); b.type = 'button';
        b.addEventListener('click', () => { this.visOnly = false; this.syncPassControls(); this.renderPasses(); });
        li.appendChild(b);
      } else li.appendChild(mk('p', null, '3 gün içinde geçiş yok.'));
      ul.appendChild(li);
    }
    for (const p of list) {
      const li = mk('li', 'tk-pass'), dot = mk('span', 'wdot'); dot.style.background = hex(T.colorOf(p.id));
      const main = mk('span', 'tk-pmain'), nm = mk('b', null, p.name); nm.setAttribute('translate', 'no');
      if (p.kind === 'sabit') {                                          // yer sabit: geçiş yok, sürekli aynı yerde (ya da hiç görünmez)
        const row = mk('div', 'tk-prow static');
        main.append(nm, mk('span', 'tk-pmeta', p.always ? `sürekli gökte · ${fmt(p.el, 1)}° ${P.compass(p.az)}` : 'bu konumdan görünmez (yer sabit)'));
        row.append(dot, main); li.appendChild(row); ul.appendChild(li); continue;
      }
      const key = p.id + ':' + p.rise.ms, on = this.selPass === key;
      const row = mk('button', 'tk-prow'); row.type = 'button'; row.setAttribute('aria-expanded', on ? 'true' : 'false');
      main.append(nm, mk('span', 'tk-pmeta', `${day(p.rise.ms)} ${hm(p.rise.ms)} · en yüksek ${fmt(p.max.el, 0)}° · ${P.compass(p.rise.az)} → ${P.compass(p.set.az)}`));
      const badge = mk('span', 'tag ' + (p.visible ? 'vis' : p.kind === 'gölgede' ? 'shadow' : 'day'), p.visible ? 'Görünür' : p.kind === 'gölgede' ? 'Gölgede' : 'Gündüz');
      row.append(dot, main, badge);
      row.addEventListener('click', () => { this.selPass = on ? null : key; this.renderPasses(on ? null : key); });
      li.appendChild(row);
      if (on) {
        li.classList.add('on');
        const det = this.passDetail(p); li.appendChild(det);
        if (animateKey === key && !REDUCED()) det.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      }
      ul.appendChild(li);
    }
  }
  // seçilen geçişin ayrıntısı: zamanlar, görünürlük, gökyüzü çizimi ve "Geçişe git"
  passDetail(p) {
    const box = mk('div', 'tk-pdet'), dl = mk('dl', 'tk-dl');
    const row = (k, v) => dl.append(mk('dt', null, k), mk('dd', null, v));
    row('Doğuş', `${hm(p.rise.ms, true)} · ${P.compass(p.rise.az)} (${fmt(p.rise.az, 0)}°)`);
    row('En yüksek', `${hm(p.max.ms, true)} · ${fmt(p.max.el, 1)}° · ${P.compass(p.max.az)} · uzaklık ${fmt(p.max.range, 0)} km`);
    row('Batış', `${hm(p.set.ms, true)} · ${P.compass(p.set.az)} (${fmt(p.set.az, 0)}°)`);
    row('Süre', `${Math.floor(p.duration / 60)} ${UNIT.min} ${Math.round(p.duration % 60)} s`);
    const vis = mk('p', 'tk-vis' + (p.visible ? ' yes' : ''), p.visible ? `çıplak gözle görünür: ${hm(p.visFrom)}–${hm(p.visTo)} (uydu Güneş'te, gökyüzü karanlık)` : p.kind === 'gölgede' ? "uydu Dünya'nın gölgesinde (görünmez)" : 'gökyüzü aydınlık (gündüz ya da alacakaranlık)');
    const cv = mk('canvas', 'tk-sky'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Geçişin gökyüzündeki yolu');
    const go = mk('button', 'primary tk-go'); go.type = 'button'; go.innerHTML = '<i data-icon="telescope"></i>'; go.appendChild(mk('span', null, 'Geçişe git ve gökte izle'));
    go.addEventListener('click', () => { this.clock.jump(p.rise.ms - 60000); this.clock.setRate(1); this.syncClock(); this.lookAt(p.id); });
    box.append(dl, vis, cv, go); applyIcons(box);
    requestAnimationFrame(() => this.drawSky(p, cv));                  // boyut yerleşimden sonra belli olur
    return box;
  }
  // gökyüzü (kutup) çizimi: merkez başucu, kenar ufuk; K yukarıda, D sağda (harita gibi)
  drawSky(p, c) {
    const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h || !p) return;
    c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 18;
    const XY = (az, el) => { const r = R * (90 - el) / 90, a = az * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    g.fillStyle = 'rgba(94, 231, 255, 0.035)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.lineWidth = 1;
    for (const e of [0, 30, 60]) { g.strokeStyle = e ? '#1d2636' : '#2a3547'; g.beginPath(); g.arc(cx, cy, R * (90 - e) / 90, 0, 7); g.stroke(); }
    g.strokeStyle = '#1d2636';
    for (let a = 0; a < 360; a += 90) { const q = XY(a, 0); g.beginPath(); g.moveTo(cx, cy); g.lineTo(q[0], q[1]); g.stroke(); }
    g.fillStyle = '#8591a3'; g.font = '10.5px "Roboto Mono", ui-monospace, monospace'; g.textAlign = 'center';
    for (const az of [0, 90, 180, 270]) { const q = XY(az, -8); g.fillText(compass16(az), q[0], q[1] + 4); }
    g.textAlign = 'left'; g.fillStyle = '#5b6779'; g.fillText('30°', cx + 3, cy - R * 60 / 90 - 3); g.fillText('60°', cx + 3, cy - R * 30 / 90 - 3);
    // yol: görünür kısım parlak, Güneş'teki gündüz kısmı soluk, gölgedeki kısım koyu
    g.lineCap = 'round';
    for (let k = 1; k < p.path.length; k++) {
      const a = p.path[k - 1], b = p.path[k], A = XY(a.az, Math.max(0, a.el)), B = XY(b.az, Math.max(0, b.el));
      g.strokeStyle = b.vis ? '#5ee7ff' : b.sunlit ? '#64748b' : '#334155'; g.lineWidth = b.vis ? 2.5 : 1.75;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    }
    const dotAt = (ms, lbl, col, r) => { const q = p.path.reduce((best, x) => (Math.abs(x.ms - ms) < Math.abs(best.ms - ms) ? x : best), p.path[0]); const [x, y] = XY(q.az, Math.max(0, q.el));
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#e2e8f0'; g.textAlign = x > cx + R * 0.45 ? 'right' : 'left'; g.fillText(lbl, x + (x > cx + R * 0.45 ? -7 : 7), y - 6); };
    dotAt(p.rise.ms, hm(p.rise.ms), '#8591a3', 3); dotAt(p.set.ms, hm(p.set.ms), '#8591a3', 3); dotAt(p.max.ms, `${hm(p.max.ms)} · ${Math.round(p.max.el)}°`, '#5ee7ff', 4);
  }
}
function fmtDelta(ms) {
  const s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} ${UNIT.d} ${h} ${UNIT.h}` : h ? `${h} ${UNIT.h} ${m} ${UNIT.min}` : m ? `${m} ${UNIT.min}` : `${s % 60} s`;
}
