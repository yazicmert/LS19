// Kısaltma sözlüğü: panellerdeki durağan açıklama metinlerinde (not, adım alt yazısı, başlık, etiket) her bölümde bir kısaltmanın ilk geçtiği yer
// dokunulabilir olur (abbr.gl). Dokununca kısa tanım çıkar; masaüstünde fareyle üstüne gelince de (title). Çeviriden sonra çalışır (i18n DOM'u çevirmiş olur):
// İngilizcede İngilizce kısaltmalar ve tanımlar. Her kare yazılan alanlara (kimlikli öğeler, tablolar) dokunulmaz: yeniden yazılınca sarmalama kaybolurdu.
import { isEn, t } from './i18n.js';

const TR = {
  'Δv': 'Hız değişimi: bir manevranın gerektirdiği itki, yani yakıtın ölçüsü (m/s).',
  TLI: 'Ay\'a aktarma yakışı (Trans-Lunar Injection): aracı Dünya yörüngesinden Ay\'a gönderen motor ateşlemesi.',
  LOI: 'Ay yörüngesine giriş yakışı: Ay\'a varan aracı yavaşlatıp Ay yörüngesine oturtur.',
  DOI: 'Alçalma yörüngesine geçiş yakışı: inişten önce yörüngenin en alçak noktasını iniş yerine yaklaştırır.',
  PDI: 'Motorlu inişin başlangıcı (Powered Descent Initiation).',
  MCC: 'Rota düzeltme yakışı (Mid-Course Correction): yoldaki küçük sapmaları giderir.',
  LLO: 'Alçak Ay yörüngesi (Low Lunar Orbit).',
  NRHO: 'Yakın doğrusal halo yörüngesi: Ay\'ın çevresinde, Artemis\'in Gateway istasyonu için seçilen uzun, uzun süreli kararlı yörünge.',
  Isp: 'Özgül itki: motorun yakıt verimi (saniye). Yüksekse aynı yakıtla daha çok Δv elde edilir.',
  C3: 'Fırlatma enerjisi: aracın Dünya\'nın çekiminden çıktığında kalan hızının karesi (km²/s²).',
  CR3BP: 'Kısıtlı üç cisim problemi: birbirinin çevresinde dönen iki büyük cismin (Dünya ve Ay) yanında küçük bir aracın hareket modeli.',
  Jacobi: 'Jacobi sabiti: dönen çerçevede korunan enerji. Aracın girebileceği bölgeleri sınırlar.',
  PHA: 'Potansiyel tehlikeli asteroit: yörüngesi Dünya\'nınkine 0,05 AB\'den çok yaklaşabilen, yaklaşık 140 m\'den büyük asteroit.',
  NEO: 'Dünya\'ya yakın cisim: yörüngesi Güneş\'e 1,3 AB\'den çok yaklaşan asteroit ya da kuyruklu yıldız.',
  SBDB: 'JPL Küçük Cisim Veritabanı: asteroit ve kuyruklu yıldızların yörünge kataloğu.',
  NORAD: 'Uydu katalog numarası: her uyduya fırlatma sırasıyla verilen kalıcı numara.',
  AB: 'Astronomik birim: Dünya ile Güneş arasındaki ortalama uzaklık, yaklaşık 149,6 milyon km.',
  MOID: 'En küçük yörünge kesişim uzaklığı: iki yörüngenin birbirine en çok yaklaştığı uzaklık.',
  GEO: 'Yer eşzamanlı yörünge: 35.786 km yükseklikte, Dünya ile aynı hızla dönen yörünge.',
  LEO: 'Alçak Dünya yörüngesi: yaklaşık 2.000 km\'nin altındaki yörüngeler.',
};
// İngilizcede tanımlar sözlükten (i18n/en.js); astronomik birimin kısaltması AU
const DEF = Object.fromEntries(Object.entries(TR).map(([k, v]) => [isEn && k === 'AB' ? 'AU' : k, t(v)]));
const words = Object.keys(DEF).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Δ sözcük karakteri değil: kısaltmanın önünde/arkasında harf ya da rakam olmasın (TLI-1 gibi tireli adlar da kısaltma sayılmaz)
const RE = new RegExp(`(?<![\\p{L}\\p{N}-])(${words.join('|')})(?![\\p{L}\\p{N}-])`, 'u');
const HOST = 'p.note, .stepsub, h3, summary, label, .fttl';
const SKIP = 'button, select, option, input, textarea, table, abbr, a';

// bölüm: kısaltma her bölümde bir kez işaretlenir (deney sayfası, sekme, adım)
const sectionOf = (el) => el.closest('.tabpage, .step, .labpage, #skyPanel') || document.body;

export function installGlossary(roots) {
  const seen = new Map();
  for (const root of roots) {
    if (!root) continue;
    for (const host of root.querySelectorAll(HOST)) {
      if (host.closest(SKIP) || host.matches('[id]')) continue;
      const sec = sectionOf(host); let done = seen.get(sec); if (!done) seen.set(sec, (done = new Set()));
      const ok = (n) => { for (let e = n.parentElement; e && e !== host; e = e.parentElement) if (e.matches(SKIP) || e.id) return 2; return 1; };     // kimlikli alt öğe: kodla yazılır
      const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, { acceptNode: ok });
      const nodes = []; for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
      for (let node of nodes) {
        for (;;) {
          const m = RE.exec(node.textContent); if (!m) break;
          const key = m[1];
          if (done.has(key)) { node = node.splitText(m.index + key.length); continue; }     // bu bölümde işaretli: sonraki geçişe bak
          done.add(key);
          const after = node.splitText(m.index); node = after.splitText(key.length);
          const ab = document.createElement('abbr'); ab.className = 'gl'; ab.tabIndex = 0; ab.title = DEF[key]; ab.dataset.gl = key; ab.textContent = key;
          after.replaceWith(ab);
        }
      }
    }
  }
}

// dokununca tanım kutusu (tek kutu; dışarı dokununca, kaydırınca ya da Esc ile kapanır)
let tip = null;
const hide = () => { if (tip) tip.hidden = true; };
function show(ab) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'glosstip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip); }
  tip.textContent = ''; const b = document.createElement('b'); b.textContent = ab.dataset.gl; tip.append(b, ' ', DEF[ab.dataset.gl] || '');
  tip.hidden = false;
  const r = ab.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), y = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
document.addEventListener('click', (e) => {
  const ab = e.target.closest && e.target.closest('abbr.gl');
  if (!ab) { hide(); return; }
  e.preventDefault(); e.stopPropagation();                                          // özet satırındaysa bölümü açıp kapamasın; notu genişletmesin
  if (tip && !tip.hidden && tip.dataset.for === ab.dataset.gl) { hide(); return; }
  show(ab); tip.dataset.for = ab.dataset.gl;
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('abbr.gl')) { e.preventDefault(); show(e.target); tip.dataset.for = e.target.dataset.gl; } });
document.addEventListener('scroll', hide, true);
