// Canlı Gökyüzü çalışma alanının arayüzü: gerçek saat, üst bilgi kartı, zaman denetimleri, Takip sekmesi (izleme listesi,
// gözlemci, yaklaşan geçişler, gökyüzü çizimi, bildirimler). Ay görevinin fizik motorundan tamamen bağımsızdır.
import * as P from './passes.js';
import { CITIES } from './tracker.js';
import { fmt } from './format.js';

const $ = (s) => document.querySelector(s);
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hm = (ms, sec = false) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });
const day = (ms) => { const d = new Date(ms), n = new Date(); const dd = Math.round((new Date(d.toDateString()) - new Date(n.toDateString())) / 86400000);
  return dd === 0 ? 'Bugün' : dd === 1 ? 'Yarın' : d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }); };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

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
    // gözlemci
    const sel = $('#obsCity');
    for (const c of CITIES) { const o = mk('option', null, c.name); o.value = c.name; sel.appendChild(o); }
    const oc = mk('option', null, 'Özel konum…'); oc.value = '_'; sel.appendChild(oc);
    sel.addEventListener('change', () => {
      const c = CITIES.find((x) => x.name === sel.value);
      if (c) tracker.setObserver(c); else { $('#obsCustom').hidden = false; }
    });
    for (const id of ['#obsLat', '#obsLon', '#obsH']) {
      $(id).addEventListener('change', () => tracker.setObserver({ name: 'Özel konum', lat: +$('#obsLat').value, lon: +$('#obsLon').value, h: (+$('#obsH').value || 0) / 1000 }));
      $(id).addEventListener('keydown', (e) => e.stopPropagation());
    }
    $('#obsGeo').addEventListener('click', () => {
      if (!navigator.geolocation) { this.toast('Tarayıcı konum bilgisini desteklemiyor.'); return; }
      $('#obsGeo').disabled = true;
      navigator.geolocation.getCurrentPosition((p) => {
        $('#obsGeo').disabled = false;
        tracker.setObserver({ name: 'Konumum', lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), h: Math.max(0, (p.coords.altitude || 0) / 1000) });
      }, (e) => { $('#obsGeo').disabled = false; this.toast('Konum alınamadı: ' + e.message); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });
    // izleme listesine ekle
    let tmr = null;
    $('#watchAdd').addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => this.searchAdd(e.target.value), 150); });
    $('#watchAdd').addEventListener('keydown', (e) => e.stopPropagation());
    // geçiş seçenekleri
    $('#passVisOnly').addEventListener('change', () => this.renderPasses());
    $('#passNotify').checked = tracker.notify;
    $('#passNotify').addEventListener('change', async (e) => {
      if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (err) { /* eski tarayıcı */ }
      }
      if (e.target.checked && 'Notification' in window && Notification.permission === 'denied') this.toast('Tarayıcı bildirimleri engelli; hatırlatmalar yalnız sayfa içinde görünecek.');
      tracker.setNotify(e.target.checked);
    });
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
      const id = +L.ids[i], li = mk('li', null, `${L.names[i]} (${id})`);
      if (this.tracker.has(id)) li.classList.add('dim');
      li.addEventListener('click', () => { this.tracker.add(id); ul.replaceChildren(); $('#watchAdd').value = ''; this.tracker.computePasses(true); });
      ul.appendChild(li);
    }
  }
  setCamButtons(mode) { document.querySelectorAll('[data-skycam]').forEach((b) => b.classList.toggle('on', b.dataset.skycam === mode)); }

  // ---------------------------------------------------------------- her kare (sık) : üst kart ve liste değerleri
  hud(t, ms) {
    const c = this.clock, live = c.isLive();
    $('#liveBadge').classList.toggle('off', !live);
    $('#liveBadge').lastChild.textContent = live ? 'CANLI' : c.paused ? 'DURAKLATILDI' : c.rate !== 1 ? `×${fmt(c.rate, 0)} HIZLI` : 'GEÇMİŞ/GELECEK';
    const d = new Date(ms);
    $('#skyLocal').textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#skyDate').textContent = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  render() {
    const T = this.tracker, o = T.observer;
    const sel = $('#obsCity'); sel.value = CITIES.some((c) => c.name === o.name) ? o.name : '_';
    $('#obsCustom').hidden = sel.value !== '_';
    $('#obsLat').value = o.lat; $('#obsLon').value = o.lon; $('#obsH').value = Math.round((o.h || 0) * 1000);
    $('#obsInfo').textContent = `${o.name}: ${fmt(o.lat, 4)}° ${o.lat >= 0 ? 'K' : 'G'}, ${fmt(Math.abs(o.lon), 4)}° ${o.lon >= 0 ? 'D' : 'B'}, ${fmt((o.h || 0) * 1000, 0)} m`;
    // liste iskeleti
    const ul = $('#watchList'); ul.replaceChildren();
    if (!T.watch.length) ul.appendChild(mk('li', 'empty', 'Liste boş. Aşağıdan uydu ekleyin ya da bir uydunun kartında “Takibe al”a basın.'));
    for (const id of T.watch) {
      const li = mk('li', 'witem'); li.dataset.id = id;
      const top = mk('div', 'wtop'), dot = mk('span', 'wdot'); dot.style.background = hex(T.colorOf(id));
      top.append(dot, mk('b', 'wname', T.name(id)), mk('span', 'k', `#${id}`));
      const vals = mk('div', 'wvals'); vals.textContent = '…';
      const acts = mk('div', 'wacts');
      const btn = (label, title, fn, on) => { const b = mk('button', 'xs' + (on ? ' on' : ''), label); b.title = title; b.addEventListener('click', fn); acts.appendChild(b); return b; };
      btn('İzle', 'Kamerayı uyduya kilitle', () => this.follow(id));
      btn('Gökte', 'Gözlemci kamerasıyla gökyüzünde uyduya bak', () => this.lookAt(id));
      btn('Yer izi', 'Yer izi ve kapsama dairesini aç/kapa', () => T.toggleTrack(id), T.trackOn.has(id));
      btn('Kaldır', 'Takip listesinden çıkar', () => T.remove(id));
      li.append(top, vals, acts); ul.appendChild(li);
    }
    this.renderWatchValues(this.clock.nowMs());
    this.renderPasses();
  }
  renderWatchValues(ms) {
    const T = this.tracker;
    document.querySelectorAll('#watchList .witem').forEach((li) => {
      const id = +li.dataset.id, s = T.state(id, ms), v = li.querySelector('.wvals'); if (!v) return;
      if (!s) { v.textContent = this.sats.byId ? 'Yörünge verisi yok (liste güncel değil ya da uydu artık aktif değil)' : 'veri bekleniyor…'; return; }
      const up = s.el > 0;
      v.replaceChildren(
        mk('span', null, `${fmt(s.alt, 0)} km · ${fmt(s.speed, 2)} km/s`),
        mk('span', null, `${fmt(Math.abs(s.lat), 1)}°${s.lat >= 0 ? 'K' : 'G'} ${fmt(Math.abs(s.lon), 1)}°${s.lon >= 0 ? 'D' : 'B'}`),
        mk('span', 'tag ' + (s.sunlit ? 'sun' : 'shadow'), s.sunlit ? 'Güneşte' : 'Gölgede'),
        mk('span', 'tag ' + (up ? 'up' : 'down'), up ? `Gökte ${fmt(s.el, 0)}° ${P.compass(s.az)}` : 'Ufkun altında'));
    });
  }
  renderPasses() {
    const T = this.tracker, tb = $('#passTable tbody'), visOnly = $('#passVisOnly').checked; tb.replaceChildren();
    const now = Date.now(), list = T.passes.filter((p) => p.kind === 'sabit' || (p.set.ms > now && (!visOnly || p.visible))).slice(0, 40);
    if (!list.length) { const tr = mk('tr'); const td = mk('td', 'k', T.passes.length ? 'Bu filtreyle geçiş yok.' : 'Hesaplanıyor ya da listede uydu yok.'); td.colSpan = 5; tr.appendChild(td); tb.appendChild(tr); }
    for (const p of list) {
      const tr = mk('tr'); tr.tabIndex = 0;
      const dot = mk('span', 'wdot'); dot.style.background = hex(T.colorOf(p.id));
      const n = mk('td'); n.append(dot, document.createTextNode(' ' + p.name));
      if (p.kind === 'sabit') {
        const td = mk('td', null, p.always ? `sürekli gökte · ${fmt(p.el, 1)}° ${P.compass(p.az)}` : 'bu konumdan görünmez (yer sabit)'); td.colSpan = 4;
        tr.append(n, td); tb.appendChild(tr); continue;
      }
      tr.append(n, mk('td', null, `${day(p.rise.ms)} ${hm(p.rise.ms)}`), mk('td', 'num', `${fmt(p.max.el, 0)}°`),
        mk('td', null, `${P.compass(p.rise.az)} → ${P.compass(p.set.az)}`), mk('td', null, ''));
      const badge = mk('span', 'tag ' + (p.visible ? 'vis' : p.kind === 'gölgede' ? 'shadow' : 'day'), p.visible ? 'Görünür' : p.kind === 'gölgede' ? 'Gölgede' : 'Gündüz');
      tr.lastChild.appendChild(badge);
      if (this.selPass === p.id + ':' + p.rise.ms) tr.classList.add('on');
      const pick = () => { this.selPass = p.id + ':' + p.rise.ms; this.showPass(p); this.renderPasses(); };
      tr.addEventListener('click', pick); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      tb.appendChild(tr);
    }
    const cur = T.passes.find((p) => p.rise && this.selPass === p.id + ':' + p.rise.ms);
    if (cur) this.showPass(cur, false); else { $('#passDetail').replaceChildren(); this.drawSky(null); }
  }
  showPass(p, withButtons = true) {
    const el = $('#passDetail'); el.replaceChildren();
    const row = (k, v) => { const d = mk('div'); d.append(mk('span', 'k', k + ' '), mk('span', null, v)); el.appendChild(d); };
    el.appendChild(mk('b', null, `${p.name} · ${day(p.rise.ms)}`));
    row('Doğuş', `${hm(p.rise.ms, true)} · ${P.compass(p.rise.az)} (${fmt(p.rise.az, 0)}°)`);
    row('En yüksek', `${hm(p.max.ms, true)} · ${fmt(p.max.el, 1)}° · ${P.compass(p.max.az)} · uzaklık ${fmt(p.max.range, 0)} km`);
    row('Batış', `${hm(p.set.ms, true)} · ${P.compass(p.set.az)} (${fmt(p.set.az, 0)}°)`);
    row('Süre', `${Math.floor(p.duration / 60)} dk ${Math.round(p.duration % 60)} s`);
    row('Görünürlük', p.visible ? `çıplak gözle görünür: ${hm(p.visFrom)}–${hm(p.visTo)} (uydu Güneş'te, gökyüzü karanlık)` : p.kind === 'gölgede' ? "uydu Dünya'nın gölgesinde (görünmez)" : 'gökyüzü aydınlık (gündüz ya da alacakaranlık)');
    const acts = mk('div', 'daterow');
    const b1 = mk('button', 'sm', 'Geçişe git ve gökte izle');
    b1.addEventListener('click', () => { this.clock.jump(p.rise.ms - 60000); this.clock.setRate(1); this.syncClock(); this.lookAt(p.id); });
    acts.appendChild(b1); el.appendChild(acts);
    this.drawSky(p);
  }
  // gökyüzü (kutup) çizimi: merkez başucu, kenar ufuk; K yukarıda, D sağda (gökyüzüne bakar gibi değil, harita gibi)
  drawSky(p) {
    const c = $('#passSky'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 22;
    const XY = (az, el) => { const r = R * (90 - el) / 90, a = az * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
    g.strokeStyle = '#243044'; g.lineWidth = 1;
    for (const e of [0, 30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - e) / 90, 0, 7); g.stroke(); }
    for (let a = 0; a < 360; a += 45) { const q = XY(a, 0); g.beginPath(); g.moveTo(cx, cy); g.lineTo(q[0], q[1]); g.stroke(); }
    g.fillStyle = '#94a3b8'; g.font = '11px "Roboto Mono", ui-monospace, monospace'; g.textAlign = 'center';
    for (const [a, s] of [[0, 'K'], [90, 'D'], [180, 'G'], [270, 'B']]) { const q = XY(a, -9); g.fillText(s, q[0], q[1] + 4); }
    g.textAlign = 'left'; g.fillText('30°', cx + 3, cy - R * 60 / 90 - 2); g.fillText('60°', cx + 3, cy - R * 30 / 90 - 2);
    if (!p) { g.textAlign = 'center'; g.fillStyle = '#64748b'; g.fillText('Bir geçiş seçin', cx, cy + 4); return; }
    // yol: görünür kısım parlak
    for (let k = 1; k < p.path.length; k++) {
      const a = p.path[k - 1], b = p.path[k], A = XY(a.az, Math.max(0, a.el)), B = XY(b.az, Math.max(0, b.el));
      g.strokeStyle = b.vis ? '#5ee7ff' : b.sunlit ? '#64748b' : '#334155'; g.lineWidth = b.vis ? 3 : 2;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    }
    const dotAt = (ms, lbl, col) => { const q = p.path.reduce((best, x) => (Math.abs(x.ms - ms) < Math.abs(best.ms - ms) ? x : best), p.path[0]); const [x, y] = XY(q.az, Math.max(0, q.el));
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.fillStyle = '#e2e8f0'; g.textAlign = 'left'; g.fillText(lbl, x + 6, y - 5); };
    dotAt(p.rise.ms, hm(p.rise.ms), '#94a3b8'); dotAt(p.max.ms, `${hm(p.max.ms)} · ${Math.round(p.max.el)}°`, '#5ee7ff'); dotAt(p.set.ms, hm(p.set.ms), '#94a3b8');
  }
}
function fmtDelta(ms) {
  const s = Math.round(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} g ${h} sa` : h ? `${h} sa ${m} dk` : m ? `${m} dk` : `${s % 60} s`;
}
