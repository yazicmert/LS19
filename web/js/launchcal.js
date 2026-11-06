// Fırlatma takvimi (Canlı Gökyüzü): saatin altında sonraki 3 fırlatma ve geri sayım; "Tümü" Fırlatmalar sekmesini açar (launchpanel.js:
// Yaklaşan · Geçmiş · İstatistik). Veri: launches.js (launchdata.js biçimi). Zaman ve durum biçimleri (whenText, cdText, statusChip) panelle ortak.
// Geri sayım gerçek saate göredir (gökyüzü saati hızlandırılsa da fırlatma gerçek dünyadadır). Kaynak verisi (roket, görev, yer adları)
// çevrilmez: translate="no".
import { nextLaunches, countdown, precRank, CREDITS } from './launchdata.js';
import { LaunchPanel } from './launchpanel.js';
import { $, mk } from './uiutil.js';
import { LOC, DAY, MONTHS, t } from './i18n.js';

// durum: etiket, açıklama, renk sınıfı
const STATUS = {
  go: ['Kesin', 'T-0 resmî ya da güvenilir kaynaklarca doğrulandı', 'ok'],
  tbc: ['Teyit bekliyor', 'Tarih belli ama resmî doğrulama bekleniyor', 'warn'],
  tbd: ['Belirsiz', 'Tarih ve saat henüz kesin değil', 'dim'],
  bekleme: ['Bekletiliyor', 'Geri sayım durduruldu', 'warn'],
  ucusta: ['Uçuşta', 'Fırlatıldı, uçuş sürüyor', 'ok'],
  basarili: ['Başarılı', 'Fırlatma başarılı', 'ok'],
  basarisiz: ['Başarısız', 'Fırlatma başarısız', 'bad'],
  kismi: ['Kısmen başarısız', 'Fırlatma kısmen başarısız', 'bad'],
};
const pad2 = (n) => String(n).padStart(2, '0');
const noTr = (el) => { el.setAttribute('translate', 'no'); return el; };
const place = (l) => (l.yer || l.rampa || '').split(',')[0].trim();
const hm = (ms) => new Date(ms).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
function dayLabel(ms, now) {
  const d = new Date(ms), dd = Math.round((new Date(d.toDateString()) - new Date(new Date(now).toDateString())) / 86400000);
  return dd === 0 ? t('Bugün') : dd === 1 ? t('Yarın') : dd === -1 ? t('Dün') : d.toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' });
}
// T-0 zamanı, kesinliğe göre: saniye/dakika -> gün + saat; saat -> "≈"; gün/hafta -> yalnız gün; ay/çeyrek/yıl -> kaba tarih
export function whenText(l, now = Date.now()) {
  const d = new Date(l.net), r = precRank(l.kesinlik);
  if (r <= precRank('dk')) return `${dayLabel(l.net, now)} ${hm(l.net)}`;
  if (l.kesinlik === 'sa') return `${dayLabel(l.net, now)} ≈${hm(l.net)}`;
  if (l.kesinlik === 'gun') return dayLabel(l.net, now);
  if (l.kesinlik === 'hafta') return '~' + dayLabel(l.net, now);
  if (l.kesinlik === 'ay') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (l.kesinlik === 'ceyrek') return t('{0}. çeyrek {1}', Math.floor(d.getUTCMonth() / 3) + 1, d.getUTCFullYear());
  return String(d.getUTCFullYear());
}
// geri sayım: "T− 05:12:33", bir günden uzunsa "T− 2g 05:12"; saat kesinliğinde başında "≈"; kesinlik günden kabaysa null
export function cdText(l, now = Date.now()) {
  const c = countdown(l, now); if (!c) return null;
  const d = Math.floor(c.s / 86400), h = Math.floor((c.s % 86400) / 3600), m = Math.floor((c.s % 3600) / 60), s = c.s % 60;
  return `${c.yaklasik ? '≈' : ''}T${c.isaret} ${d ? `${d}${DAY} ${pad2(h)}:${pad2(m)}` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`}`;
}
export function statusChip(code) {
  const [lab, tip, cls] = STATUS[code] || STATUS.tbd;
  const c = mk('span', 'lc-chip ' + cls, lab); c.title = tip; return c;
}

export class LaunchCal {
  constructor({ launches, sats, follow, openTab }) {
    Object.assign(this, { launches, sats, follow, openTab });
    this.box = $('#skyLaunches'); this.cdEls = []; this.lastSec = -1; this.headId = null;
    this.panel = new LaunchPanel({ launches, sats, follow });             // Fırlatmalar sekmesi (Yaklaşan · Geçmiş · İstatistik)
    launches.onChange = () => this.render();
    if (sats) { const prev = sats.onData; sats.onData = () => { if (prev) prev(); this.panel.satsChanged(); }; }   // katalog eşleşmeleri uydu verisiyle değişir
    this.render();
  }
  render() { this.renderHud(); this.panel.render(); }
  // "Tümü": sekmeyi Yaklaşan görünümünde aç
  showAll() { this.panel.setView('yak'); this.openTab(); }

  // ---------------------------------------------------------------- saatin altındaki takvim
  renderHud() {
    const B = this.box; if (!B) return;
    const L = this.launches, cat = L.cat, now = Date.now();
    const head = mk('div', 'lc-head');
    const all = mk('button', 'xs', 'Tümü'); all.type = 'button'; all.title = 'Yaklaşan ve son fırlatmaların listesi';
    all.addEventListener('click', () => this.showAll());
    head.append(mk('span', 'k', 'Fırlatma takvimi'), all);
    this.cdEls = []; this.headId = null;
    const rows = [];
    if (!cat) rows.push(mk('div', 'lc-note', L.err ? 'Fırlatma takvimi alınamadı' : 'Fırlatma takvimi yükleniyor…'));
    else {
      const next = nextLaunches(cat, now, 3);
      this.headId = next.length ? next[0].id : null;
      if (!next.length) rows.push(mk('div', 'lc-note', 'Yaklaşan fırlatma bilgisi yok'));
      for (const l of next) {
        const r = mk('div', 'lc-row'), cdt = cdText(l, now);
        const cd = mk('span', 'lc-cd', cdt || whenText(l, now));
        const name = noTr(mk('span', 'lc-name')); name.append(mk('b', null, l.roket), ` · ${l.gorev}`);
        const sub = mk('span', 'lc-sub');                                  // saat önde: uzun rampa adı kırpılsa da görünür kalsın
        if (cdt) sub.append(mk('span', null, whenText(l, now)), ' · ');
        sub.append(noTr(mk('span', null, place(l))));
        r.append(cd, name, statusChip(l.durum), sub);
        r.title = [l.roket, l.gorev, l.saglayici, [l.rampa, l.yer].filter(Boolean).join(', ')].filter(Boolean).join('\n');
        if (cdt) this.cdEls.push([cd, l]);
        rows.push(r);
      }
      if (cat.kod === 'rll') rows.push(noTr(mk('div', 'lc-note', CREDITS.rll.t)));        // RocketLaunch.Live koşulu: verinin yanında
    }
    B.replaceChildren(head, ...rows);
  }
  // HUD yenilemesinde (≈200 ms) çağrılır: yalnız saniye değişince geri sayım metinleri; ilk fırlatma listeden düşünce takvim kayar
  tick() {
    const now = Date.now(), sec = Math.floor(now / 1000);
    if (sec === this.lastSec) return; this.lastSec = sec;
    for (const [el, l] of this.cdEls) { const s = cdText(l, now); if (s && el.textContent !== s) el.textContent = s; }
    this.panel.tick();
    if (this.launches.cat && sec % 30 === 0) {
      const first = nextLaunches(this.launches.cat, now, 1)[0];
      if ((first ? first.id : null) !== this.headId) this.render();
    }
  }
}
