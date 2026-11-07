// Fırlatmaların yükleri (saf; tarayıcı ve Node: test/test_payloads.js): uydu, uzay aracı, kapsül, gezgin — amacı, araştırma alanı, sahibi,
// bugünkü durumu (yörüngede / atmosfere girdi / Mars yüzeyinde…) ve yörüngesi. Veri: data/payloads/<yıl>.json (tools/firlatma_db.mjs; GCAT —
// J. C. McDowell, planet4589.org/space/gcat, CC-BY-4.0). Kayıt alanları: p (COSPAR parça), n (NORAD), ad, ad2 (öteki adlar), k (amaç: GCAT
// Category, "/" ile en çok iki, "?" belirsiz), d (araştırma alanı: Discipline), pr (program), s (sınıf), o (sahip dizini -> org [kısa ad, tam ad,
// ülke]), kg, st/sb/sd (durum kodu, gökcismi ya da bağlı araç, tarih), ak (etkin uydu listesinde), pe/ap/inc (km, °; yg: güncel, yoksa ilk yörünge),
// te (görev sonu), r (F: yük erken arızalandı, N: denenemedi), c (McDowell'in notu, İngilizce), we/wt (en/tr Vikipedi maddesi; Wikidata eşlemesi).
// Vikipedi özeti çalışırken Vikipedi'nin REST arayüzünden alınır (CC BY-SA 4.0; kaynak bağıyla gösterilir).

// GCAT Category -> amaç
export const PURPOSE = {
  AST: 'Astronomi', BIO: 'Biyoloji ve yaşam bilimleri', CAL: 'Kalibrasyon (radar ve atmosfer yoğunluğu)', COM: 'İletişim', EDU: 'Eğitim',
  EOSCI: 'Yer bilimi ölçümleri', EW: 'Füze erken uyarı', GEOD: 'Jeodezi', IMG: 'Yer görüntüleme', 'IMG-R': 'Radarla yer görüntüleme',
  INF: 'Altyapı (dağıtıcı, taşıyıcı yapı)', MET: 'Meteoroloji', 'MET-RO': 'Meteoroloji (GPS radyo örtülmesi)', MGRAV: 'Mikroçekim deneyleri',
  MISC: 'Diğer', NAV: 'Seyrüsefer, konum ve zaman', PLAN: 'Gezegen ve derin uzay keşfi', RB: 'Roket kademesi', RV: 'Atmosfere giriş aracı',
  SCI: 'Bilimsel araştırma', SIG: 'Sinyal istihbaratı', SS: 'İnsanlı uçuş ve kargo', TARG: 'Hedef (füze savunması, uydusavar denemesi)',
  TECH: 'Teknoloji ve eğitim', WEAPON: 'Silah denemesi',
};
// GCAT Discipline -> araştırma alanı (bilim yükleri)
export const DISCIPLINE = {
  AIS: 'gemi izleme (AIS)', ALT: 'radar altimetre', ATM: 'atmosfer bilimi', AUR: 'kutup ışıkları', BIO: 'biyoloji', CR: 'kozmik ışınlar',
  ENV: 'uzay ortamına dayanım', ESCI: 'yer bilimleri', F: 'elektromanyetik alanlar', GEOD: 'jeodezi', GRA: 'gama ışını astronomisi', IMG: 'görüntüleme',
  ION: 'iyonosfer', IRA: 'kızılötesi astronomi', M: 'mikroçekimde insan', MG: 'mikroçekim deneyleri', MM: 'mikrometeoritler', OA: 'optik astronomi',
  P: 'yüklü parçacıklar', PHY: 'temel fizik', PL: 'gezegen bilimi', RFA: 'radyo astronomi', SMA: 'milimetre altı astronomi', SOL: 'Güneş fiziği',
  SX: 'Güneş X-ışınları', TECH: 'teknoloji deneyleri', UVA: 'morötesi astronomi', XNAV: 'X-ışınıyla seyrüsefer', XRA: 'X-ışını astronomisi',
};
export const CLASS = { A: 'Amatör, akademik', B: 'Ticari', C: 'Sivil (kamu)', D: 'Askerî' };
// arama süzgeci: fırlatmanın ana yükünün (en ağır yük) amacına göre gruplar: [kod, ad, GCAT kategorileri, kısa ad (liste satırı)]
export const GROUPS = [
  ['ins', 'İnsanlı uçuş ve kargo', ['SS'], 'İnsanlı, kargo'],
  ['gez', 'Gezegen ve derin uzay', ['PLAN'], 'Derin uzay'],
  ['bil', 'Bilim ve astronomi', ['SCI', 'AST', 'BIO', 'MGRAV'], 'Bilim'],
  ['yer', 'Yer gözlemi ve meteoroloji', ['IMG', 'IMG-R', 'EOSCI', 'GEOD', 'MET', 'MET-RO'], 'Yer gözlemi'],
  ['com', 'İletişim', ['COM'], 'İletişim'],
  ['nav', 'Seyrüsefer', ['NAV'], 'Seyrüsefer'],
  ['ask', 'Askerî ve istihbarat', ['SIG', 'EW', 'WEAPON', 'TARG'], 'Askerî'],
  ['tek', 'Teknoloji', ['TECH', 'CAL', 'EDU', 'INF', 'MISC', 'RV', 'RB'], 'Teknoloji'],
];
const GROUP_OF = new Map(GROUPS.flatMap(([g, , ks]) => ks.map((k) => [k, g])));
export const groupOf = (k) => GROUP_OF.get(String(k || '').split('/')[0].replace('?', '')) || '';
export const groupName = (g, kisa = false) => (GROUPS.find((x) => x[0] === g) || ['', '', [], ''])[kisa ? 3 : 1];

// "IMG/TECH?" -> [{ k, ad, belirsiz }]
export function purposes(p) {
  if (!p || !p.k) return [];
  return p.k.split('/').map((s) => { const k = s.replace('?', ''); return { k, ad: PURPOSE[k] || k, belirsiz: s.endsWith('?') }; });
}
export const disciplines = (p) => (p && p.d ? p.d.split('/').map((k) => DISCIPLINE[k] || k) : []);

// gökcisimleri ve özel noktalar (GCAT adları)
export const BODY = {
  Luna: 'Ay', Mars: 'Mars', Venus: 'Venüs', Mercury: 'Merkür', Jupiter: 'Jüpiter', Saturn: 'Satürn', Titan: 'Titan', Ceres: 'Ceres', Ryugu: 'Ryugu',
  Eros: 'Eros', Itokawa: 'Itokawa', Didymos: 'Didymos', '67P/': '67P/Çuryumov–Gerasimenko', '9P/Tempel 1': 'Tempel 1 kuyrukluyıldızı',
  SEL1: 'Güneş–Dünya L1 noktası', SEL2: 'Güneş–Dünya L2 noktası', EML2: 'Dünya–Ay L2 noktası',
};
// durum kodu -> metin şablonu ({0}: gökcismi ya da bağlı araç) ve tür: on (çalışıyor), orbit (yörüngede, etkin değil), deep (derin uzay), down (döndü/yandı), fail
const STATUS = {
  O: ['Yörüngede', 'orbit'], A: ['Yörüngede, {0} aracına bağlı', 'orbit'], K: ['Yörüngede, {0} aracına kenetli', 'orbit'],
  R: ['Atmosfere girip yandı', 'down'], D: ['Denetimli olarak atmosfere indirildi', 'down'], L: ["Dünya'ya döndü", 'down'], C: ["Dünya'ya düştü", 'down'],
  B: ['Yörünge altı uçuş', 'down'], E: ['Parçalandı', 'fail'], X: ['Kayıp, artık izlenmiyor', 'orbit'], F: ['Yörüngeye ulaşamadı (fırlatma başarısız)', 'fail'],
  H: ['Güneş çevresinde yörüngede', 'deep'], Y: ['{0} yörüngesinde', 'deep'], I: ['{0} yüzeyine çarptı', 'deep'], S: ['{0} yüzeyinde, etkin değil', 'deep'],
  W: ['{0} yüzeyinde çalışıyor', 'deep'], T: ['Başka bir gökcisminden yeniden kalktı', 'deep'],
};
const ON_DEEP = { H: 'Güneş çevresinde yörüngede, çalışıyor', Y: '{0} yörüngesinde, çalışıyor' };
// -> { tpl, args, kind, live (Dünya yörüngesinde: 3B'de gösterilebilir), on (etkin) }
export function statusOf(p) {
  const s = STATUS[p.st];
  if (!s) return { tpl: p.sb || '?', args: [], kind: 'orbit', live: false, on: false };
  const body = p.sb ? BODY[p.sb] || p.sb : '';
  let tpl = s[0];
  if (p.st === 'I' && !body) tpl = 'Yüzeye çarptı';
  if ((p.st === 'A' || p.st === 'K') && !body) tpl = p.st === 'A' ? 'Yörüngede, başka bir araca bağlı' : 'Yörüngede, başka bir araca kenetli';
  // kind yeri (renk), on etkinliği gösterir: Dünya yörüngesinde çalışan yeşil; derin uzayda çalışan (Voyager, JWST) mor kalır, metin "çalışıyor" der
  const live = ['O', 'A', 'K'].includes(p.st), on = !!p.ak && (live || ['H', 'Y', 'W'].includes(p.st));
  if (p.st === 'O' && on) tpl = 'Yörüngede, çalışıyor';
  if (on && ON_DEEP[p.st]) tpl = ON_DEEP[p.st];
  return { tpl, args: body ? [body] : [], kind: on && live ? 'on' : s[1], live, on };
}
export const fill = (tpl, args = []) => tpl.replace(/\{(\d+)\}/g, (_, k) => (args[+k] ?? ''));

// GCAT vague date ("1958-01-04?", "1969-07", "1970") -> { ms, kesinlik: 'gun'|'ay'|'yil', belirsiz }
export function parseVague(s) {
  const m = /^(\d{4})(?:-(\d\d))?(?:-(\d\d))?(\?)?$/.exec(s || ''); if (!m) return null;
  return { ms: Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1), kesinlik: m[3] ? 'gun' : m[2] ? 'ay' : 'yil', belirsiz: !!m[4] };
}

// yörünge sınıfı (perije/apoje km, eğim °): yaklaşık, GCAT tanımlarına yakın
const MU = 398600.4418, RE = 6378.137;
export function orbitInfo(p) {
  if (p.pe == null || p.ap == null || p.ap < p.pe) return null;
  const a = (p.pe + p.ap) / 2 + RE, e = (p.ap - p.pe) / (2 * a), T = (2 * Math.PI * Math.sqrt(a ** 3 / MU)) / 60, h = (p.pe + p.ap) / 2, inc = p.inc;
  let ad;
  if (p.ap > 300000) ad = "Ay'a uzanan yörünge";
  else if (Math.abs(T - 1436) < 30 && e < 0.05) ad = inc != null && inc > 3 ? 'Eğik yer eşzamanlı (GEO)' : 'Yer eşzamanlı (GEO)';
  else if (e > 0.5 && T > 690 && T < 750 && inc > 62 && inc < 64.5) ad = 'Molniya';
  else if (p.pe < 2000 && p.ap > 30000) ad = 'Yer eşzamanlı aktarma (GTO)';
  else if (e > 0.25) ad = 'Yüksek eliptik (HEO)';
  else if (h < 2000) ad = inc != null && inc >= 95 && inc <= 104 ? 'Alçak, Güneş eşzamanlı' : inc != null && inc >= 85 && inc < 95 ? 'Alçak, kutupsal' : 'Alçak (LEO)';
  else ad = 'Orta (MEO)';
  return { ad, a, e, periyot: T };
}

// GCAT devlet kodu -> ISO 3166 (tarayıcının yerel ülke adları için); ISO olmayanlar elle
const ISO = { UK: 'GB', J: 'JP', D: 'DE', F: 'FR', I: 'IT', E: 'ES', L: 'LU', N: 'NO', S: 'SE', T: 'TH', B: 'BE', P: 'PT', UAE: 'AE', BGN: 'BG', HKUK: 'HK', MYM: 'MM', ESIB: 'ES' };
export const STATE = {
  SU: 'SSCB', CSSR: 'Çekoslovakya', CSFR: 'Çekoslovakya', 'I-ESA': 'ESA', 'I-ESRO': 'ESRO', 'I-ELDO': 'ELDO', 'I-EU': 'Avrupa Birliği', 'I-EUM': 'EUMETSAT',
  'I-EUT': 'Eutelsat', 'I-INT': 'Intelsat', 'I-INM': 'Inmarsat', 'I-ARAB': 'Arabsat', 'I-NATO': 'NATO', 'I-RASC': 'RASCOM',
};
const DN = new Map();
export function stateName(code, lang = 'tr') {
  if (!code) return '';
  if (STATE[code]) return STATE[code];
  if (code.startsWith('I-')) return code.slice(2);
  const iso = ISO[code] || (/^[A-Z]{2}$/.test(code) ? code : null);
  if (iso && typeof Intl !== 'undefined' && Intl.DisplayNames) {
    try { if (!DN.has(lang)) DN.set(lang, new Intl.DisplayNames([lang], { type: 'region' })); return DN.get(lang).of(iso) || code; } catch (e) { /* bilinmeyen kod */ }
  }
  return code;
}

// yük ailesi (görev ya da yük adından): "Starlink Group 15-18" ve "Starlink 32713" -> "starlink", "Glonass-K1 No. 19" -> "glonass-k",
// "Progress MS-35 (96P)" -> "progress ms", "Yaogan 51-07 to 09" -> "yaogan". Rakamlı ilk sözcükte durur, ayraç içini ve genel sözcükleri atar.
// Derleme aracı (tools/firlatma_db.mjs) aile dizinini aynı işlevle kurar; çalışırken canlı fırlatmanın adı bu dizinde aranır.
const GENERIC = new Set(['group', 'no', 'flight', 'mission', 'launch', 'batch', 'fm', 'f', 'block', 'the', 'and', 'to', 'of', 'tbd', 'unknown', 'payload', 'payloads', 'dedicated', 'rideshare', 'satellites']);
export function nameStem(s) {
  const t = String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const out = [];
  for (const tok of t.split(/[\s_/,&+:]+/)) {
    if (!tok) continue;
    const k = tok.search(/\d/), base = (k < 0 ? tok : tok.slice(0, k)).replace(/[-.'#?]+$/, '').replace(/^[-.'#]+/, '');
    if (base && !GENERIC.has(base)) out.push(base);
    if (k >= 0 || out.length >= 3) break;
  }
  const r = out.join(' ');
  return r.length >= 3 ? r : '';
}

// yükleme ve erişim
const cache = new Map();
export function loadPayloads(year, base = 'data/payloads/') {
  const k = base + year;
  if (!cache.has(k)) cache.set(k, fetch(`${base}${year}.json`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k);
}
// bir fırlatmanın yükleri (sahip çözülmüş) ya da veri yoksa null
export function payloadsOf(pd, tag) {
  const L = pd && pd.L && pd.L[tag];
  return L ? L.map((p) => ({ ...p, sahip: p.o != null ? pd.org[p.o] || null : null })) : null;
}
// kalabalık fırlatmalar (Starlink, OneWeb, paylaşımlı uçuşlar): aynı program, amaç ve sahip olanlar tek satırda; az yük varsa hepsi ayrı
export function groupPayloads(list, max = 6) {
  if (list.length <= max) return list.map((p) => ({ one: p }));
  const base = (p) => p.pr || p.ad.replace(/[\s-]*[0-9]+[A-Z]?$/, '').trim() || p.ad;
  const by = new Map(), out = [];
  for (const p of list) {
    const key = `${base(p)}|${p.k || ''}|${p.o ?? ''}`;
    if (!by.has(key)) { const g = { ad: base(p), list: [] }; by.set(key, g); out.push(g); }
    by.get(key).list.push(p);
  }
  return out.map((g) => (g.list.length === 1 ? { one: g.list[0] } : g));
}
// grubun durum özeti: [[tpl, sayı, kind], …] (çoktan aza)
export function statusCounts(list) {
  const m = new Map();
  for (const p of list) {
    const s = statusOf(p), key = s.live ? (s.on ? 'Çalışıyor' : 'Yörüngede, etkin değil') : fill(s.tpl, s.args);
    const e = m.get(key) || [key, 0, s.kind]; e[1]++; m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b[1] - a[1]);
}

// Vikipedi özeti (REST, CORS açık): { baslik, metin, url, dil }
const WIKI = new Map();
export const wikiUrl = (title, lang) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
export function wikiPick(p, lang = 'tr') {
  if (lang === 'tr' && p.wt) return { title: p.wt, lang: 'tr' };
  if (p.we) return { title: p.we, lang: 'en' };
  if (p.wt) return { title: p.wt, lang: 'tr' };
  return null;
}
export function wikiSummary(title, lang, fetchFn = fetch) {
  const k = lang + ':' + title;
  if (!WIKI.has(k)) {
    const u = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    // Wikimedia kuralı: tarayıcıdan gelen istekler kendini Api-User-Agent ile tanıtır (CORS'ta izinli üst bilgi)
    const opt = { headers: { 'Api-User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu; +https://github.com/yazicmert/LS19)' },
      ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(15e3) } : {}) };
    WIKI.set(k, fetchFn(u, opt).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => ({ baslik: j.title || title, metin: String(j.extract || '').trim(), url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || wikiUrl(title, lang), dil: lang }))
      .catch((e) => { WIKI.delete(k); throw e; }));
  }
  return WIKI.get(k);
}
