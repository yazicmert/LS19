// lookstar19 metinleri (İngilizce varsayılan, Türkçe tam) ve biçimlendiriciler. Ses: teknik ve sade; önce sayı ve kaynak.
import { LANGS } from './config.js';

const T = {
  en: {
    langName: 'English',
    other: 'Türkçe',
    circular: 'Circular No.',
    nav: { asteroids: 'Asteroids', launches: 'Launches', sources: 'Sources', ls19: 'Open LS19' },
    skip: 'Skip to content',
    home: {
      title: 'lookstar19 — an open library of space data',
      description: 'Sourced orbital elements, real asteroid shape models and launch tracking, tied to the LS19 physics simulator. Non-commercial.',
      hook: 'An open library of space data, built around a working simulator.',
      sub: 'Every number on this site carries a source line. Every object here can be opened in LS19, a browser physics simulator of Earth–Moon missions, satellites and asteroids.',
      findLabel: 'Find an object',
      findHint: 'e.g. Apophis, 433, Bennu',
      noMatch: (q) => `No object matches “${q}” in this library yet. The 33 objects here are the ones with real shape models.`,
      results: (n) => `${n} ${n === 1 ? 'match' : 'matches'}`,
      openPage: 'Full record',
      modelsTitle: (n) => `${n} asteroids with real shape models`,
      modelsNote: (date) => `Shapes from ground-based radar and spacecraft imaging (NASA PDS Small Bodies Node, NASA Eyes). Orbits and physical data from the JPL Small-Body Database, retrieved ${date}.`,
      allObjects: 'All objects',
      howTitle: 'How this library works',
      how: [
        ['Sourced', 'Each value names where it came from and when it was retrieved. Content whose licence cannot be verified is not published.'],
        ['Processed', 'Public datasets are cleaned, cross-checked and explained. Starting with the data workshop, each processed result will be downloadable.'],
        ['Simulated', 'Objects and launches link to LS19, where the same orbit or flight runs in a real-time physics model.'],
      ],
      nextTitle: 'Planned next',
      next: [
        ['Data workshop', 'near-Earth approaches, satellite crowding and re-entries, exoplanets'],
        ['Reviewed articles', 'technical articles from readers, each reviewed before publication'],
        ['Mission patches', 'earned through reviewed contributions, shown in a collection and as badges'],
      ],
      roadmap: 'Roadmap',
    },
    launch: {
      next: 'Next launch',
      noFuture: 'No upcoming launch is listed right now.',
      unavailable: 'Launch data is unavailable right now. The source (Launch Library 2) limits requests; this page retries every 30 minutes.',
      watch: 'Watch the official stream',
      watchOther: 'Stream',
      noStream: 'No stream announced yet.',
      net: 'NET',
      vehicle: 'Vehicle',
      mission: 'Mission',
      pad: 'Pad',
      status: 'Status',
      orbit: 'Orbit',
      provider: 'Provider',
      all: 'All upcoming launches',
      title: 'Upcoming launches',
      description: 'The next launches worldwide with times in UTC and links to official live streams. Data: The Space Devs, Launch Library 2.',
      lead: 'Times are “no earlier than” (NET) in UTC and move often. Streams open on the provider’s own channel; nothing is re-hosted here.',
      live: 'Live now',
      countdownLabel: 'Time to launch',
      inLS19: 'Watch an ascent in LS19',
      dataNote: 'Data: The Space Devs, Launch Library 2; refreshed every 30 minutes. Times are NET (no earlier than), shown only as precisely as the source states them.',
      updated: (d) => `Source record updated ${d}`,
    },
    ast: {
      title: 'Asteroid library',
      description: '33 asteroids with real shape models from radar and spacecraft imaging, with orbital elements and physical data from JPL SBDB.',
      lead: 'Each object here has a real shape model, derived from radar echoes or spacecraft images. Orbits are osculating elements from the JPL Small-Body Database.',
      cols: { name: 'Object', cls: 'Class', a: 'a (au)', e: 'e', i: 'i (°)', d: 'D (km)', moid: 'MOID (au)', model: 'Shape from' },
      method: { radar: 'Radar', spacecraft: 'Spacecraft' },
      methodLong: { radar: 'Ground-based radar (delay-Doppler)', spacecraft: 'Spacecraft imaging' },
      orbit: 'Orbit',
      epoch: 'Epoch',
      phys: 'Physical',
      model: 'Shape model',
      el: {
        a: 'Semi-major axis', e: 'Eccentricity', i: 'Inclination', om: 'Longitude of ascending node', w: 'Argument of perihelion', ma: 'Mean anomaly',
        q: 'Perihelion distance', ad: 'Aphelion distance', per: 'Orbital period', moid: 'Earth MOID',
        H: 'Absolute magnitude', D: 'Diameter', rot: 'Rotation period', alb: 'Geometric albedo', spec: 'Spectral type',
        dims: 'Extent (x × y × z)', tris: 'Triangles', src: 'Source', method: 'Method',
      },
      unknown: '—',
      flags: { neo: 'NEO', pha: 'Potentially hazardous' },
      openLS19: 'Open in LS19',
      openLS19Note: 'Opens the asteroid-deflection experiment with this object as the target.',
      viewer: (name) => `3D shape model of ${name}. Drag or use the arrow keys to rotate.`,
      viewerLoading: 'Loading shape model…',
      viewerError: 'The shape model could not be loaded.',
      viewerHint: 'Drag to rotate',
      scale: 'Longest extent',
      sources: 'Sources',
      srcOrbit: (date) => `Orbit and physical data: JPL Small-Body Database API, retrieved ${date}.`,
      srcModel: 'Shape model',
      back: 'All 33 objects',
      condition: 'Orbit condition code',
      arc: 'Data arc',
      days: 'days',
      years: 'years',
      hours: 'h',
      km: 'km',
      sigmaNote: 'Values after ± are 1σ uncertainties of the JPL orbit solution.',
      sol: {
        title: 'Orbit solution', id: 'JPL solution', date: 'Solution date', obs: 'Optical observations used', radar: 'Radar (delay / Doppler)',
        arc: 'Observation arc', rms: 'Residual RMS', u: 'Uncertainty parameter U',
        uMeaning: (u) => (u == null ? null : u <= 1 ? 'very well determined' : u <= 4 ? 'well determined' : u <= 6 ? 'moderately uncertain' : 'poorly determined'),
      },
      ca: {
        title: 'Close approaches to Earth',
        lead: (n, max, from, to) => `${n} approaches closer than ${max} au between ${from} and ${to}. Distances are centre to centre; the range is the 3σ interval.`,
        none: (max, from, to) => `No approach closer than ${max} au between ${from} and ${to}.`,
        next: 'Next approaches', noneNext: (to) => `No further approach closer than this before ${to}.`,
        closest: 'Closest in the period', last: 'Most recent',
        cols: { date: 'Date (TDB)', dist: 'Distance (au)', km: 'Distance (km)', ld: 'Lunar distances', range: '3σ ±', v: 'v rel (km/s)', t: 'Time 3σ' },
      },
      risk: {
        title: 'Impact risk',
        listedLead: 'Listed on JPL Sentry, which monitors asteroids with a non-zero probability of hitting Earth. The values below are Sentry’s published summary.',
        ip: 'Cumulative impact probability', oneIn: (n) => `about 1 in ${n}`, psCum: 'Palermo scale, cumulative', psMax: 'Palermo scale, maximum', tsMax: 'Torino scale, maximum',
        nImp: 'Potential impacts', years: 'Years', computed: 'Computed',
        removed: (d) => `Removed from the JPL Sentry risk list on ${d}: further observations ruled out the potential impacts Sentry had found.`,
        none: 'Not on the JPL Sentry risk list: Sentry has found no potential Earth impact for this object in the period it searches (normally the next 100 years).',
      },
      srcCad: (date) => `Close approaches: JPL SBDB Close Approach Data API, retrieved ${date}.`,
      srcSentry: (date) => `Impact risk: JPL Sentry Data API, retrieved ${date}.`,
    },
    src: {
      title: 'Sources and licences',
      description: 'Every dataset, model and stream source used by lookstar19, what it is used for, and its terms.',
      lead: 'lookstar19 is non-commercial and is not affiliated with, or endorsed by, NASA, JPL, ESA or any other agency or company named here. Where a provider publishes terms, the link below is the authority; this page summarises only what we have verified.',
      cols: { source: 'Source', use: 'Used for', terms: 'Terms' },
      rows: [
        ['JPL Small-Body Database API', 'Orbital elements, their 1σ uncertainties and physical data of asteroids', 'Provider’s terms', 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html'],
        ['JPL SBDB Close Approach Data API', 'Close approaches of asteroids to Earth, 1900–2200', 'Provider’s terms', 'https://ssd-api.jpl.nasa.gov/doc/cad.html'],
        ['JPL Sentry Data API', 'Impact risk of near-Earth asteroids', 'Provider’s terms', 'https://ssd-api.jpl.nasa.gov/doc/sentry.html'],
        ['NASA PDS Small Bodies Node: shape models', 'Radar and spacecraft-derived asteroid shapes', 'NASA-produced data: public domain', 'https://sbn.psi.edu/pds/shape-models/'],
        ['NASA Eyes on the Solar System', 'Textured shape models (Bennu, Itokawa, Vesta, Eros, Ryugu, Psyche, Didymos, Gaspra)', 'NASA content: public domain; NASA insignia excluded', 'https://www.nasa.gov/nasa-brand-center/images-and-media/'],
        ['The Space Devs: Launch Library 2', 'Upcoming launches and stream links', 'Provider’s terms', 'https://thespacedevs.com/llapi'],
        ['GCAT, J. McDowell (planet4589.org)', 'Launch history in LS19', 'CC BY 4.0', 'https://planet4589.org/space/gcat/'],
        ['CelesTrak', 'Satellite orbits in LS19', 'Provider’s terms', 'https://celestrak.org/'],
      ],
      noLogo: 'Agency logos, seals and insignia are not used on this site. Mission names appear as facts only.',
      code: 'Site and simulator source code',
    },
    nf: {
      title: 'Not in this circular',
      body: 'There is no page at this address. The library lists 33 asteroids with real shape models; the index below has all of them.',
      home: 'Home',
      index: 'Asteroid index',
    },
    footer: {
      line: 'lookstar19 is a non-commercial library built from public sources. Not affiliated with or endorsed by any agency.',
      built: (date) => `Data retrieved ${date}`,
      repo: 'Source code',
    },
    cls: {},
  },
  tr: {
    langName: 'Türkçe',
    other: 'English',
    circular: 'Sirküler No.',
    nav: { asteroids: 'Asteroitler', launches: 'Fırlatmalar', sources: 'Kaynaklar', ls19: "LS19'u aç" },
    skip: 'İçeriğe geç',
    home: {
      title: 'lookstar19 — açık uzay verisi kütüphanesi',
      description: 'Kaynaklı yörünge elementleri, gerçek asteroit şekil modelleri ve fırlatma takibi; LS19 fizik simülasyonuna bağlı. Ticari değil.',
      hook: 'Çalışan bir simülasyonun çevresinde kurulmuş açık bir uzay verisi kütüphanesi.',
      sub: 'Bu sitedeki her sayının bir kaynak satırı var. Buradaki her cisim, Dünya–Ay görevlerini, uyduları ve asteroitleri tarayıcıda canlandıran fizik simülasyonu LS19’da açılabilir.',
      findLabel: 'Cisim bul',
      findHint: 'ör. Apophis, 433, Bennu',
      noMatch: (q) => `Bu kütüphanede “${q}” ile eşleşen bir cisim henüz yok. Buradaki 33 cisim, gerçek şekil modeli olanlar.`,
      results: (n) => `${n} eşleşme`,
      openPage: 'Tam kayıt',
      modelsTitle: (n) => `Gerçek şekil modeli olan ${n} asteroit`,
      modelsNote: (date) => `Şekiller yer tabanlı radar ve uzay aracı görüntülerinden (NASA PDS Küçük Cisimler Düğümü, NASA Eyes). Yörünge ve fiziksel veri JPL Küçük Cisimler Veritabanı’ndan, ${date} tarihinde alındı.`,
      allObjects: 'Tüm cisimler',
      howTitle: 'Bu kütüphane nasıl çalışır',
      how: [
        ['Kaynaklı', 'Her değer nereden ve ne zaman alındığını söyler. Lisansı doğrulanamayan içerik yayımlanmaz.'],
        ['İşlenmiş', 'Açık veri kümeleri temizlenir, çapraz denetlenir ve açıklanır. Veri atölyesiyle birlikte her işlenmiş sonuç indirilebilir olacak.'],
        ['Simüle edilmiş', 'Cisimler ve fırlatmalar LS19’a bağlanır; aynı yörünge ya da uçuş orada gerçek zamanlı bir fizik modelinde çalışır.'],
      ],
      nextTitle: 'Sırada',
      next: [
        ['Veri atölyesi', 'Dünya’ya yakın geçişler, uydu kalabalığı ve yeniden girişler, ötegezegenler'],
        ['Onaylı makaleler', 'okurların teknik makaleleri, her biri yayından önce incelenir'],
        ['Görev patch’leri', 'onaylanan katkılarla kazanılır; koleksiyonda ve rozet olarak görünür'],
      ],
      roadmap: 'Yol haritası',
    },
    launch: {
      next: 'Sıradaki fırlatma',
      noFuture: 'Şu anda listelenmiş yaklaşan bir fırlatma yok.',
      unavailable: 'Fırlatma verisi şu anda alınamıyor. Kaynak (Launch Library 2) istek sayısını sınırlıyor; bu sayfa 30 dakikada bir yeniden dener.',
      watch: 'Resmî yayını izle',
      watchOther: 'Yayın',
      noStream: 'Henüz yayın duyurulmadı.',
      net: 'En erken',
      vehicle: 'Araç',
      mission: 'Görev',
      pad: 'Rampa',
      status: 'Durum',
      orbit: 'Yörünge',
      provider: 'Fırlatıcı',
      all: 'Tüm yaklaşan fırlatmalar',
      title: 'Yaklaşan fırlatmalar',
      description: 'Dünyadaki sıradaki fırlatmalar; saatler UTC, resmî canlı yayın bağlantılarıyla. Veri: The Space Devs, Launch Library 2.',
      lead: 'Saatler UTC cinsinden “en erken” (NET) zamanlardır ve sık değişir. Yayınlar sağlayıcının kendi kanalında açılır; burada hiçbir yayın yeniden yayımlanmaz.',
      live: 'Şu an canlı',
      countdownLabel: 'Fırlatmaya kalan',
      inLS19: 'LS19’da bir kalkış izle',
      dataNote: 'Veri: The Space Devs, Launch Library 2; 30 dakikada bir yenilenir. Zamanlar NET’tir (en erken); yalnız kaynağın verdiği kesinlikte gösterilir.',
      updated: (d) => `Kaynak kaydı ${d} tarihinde güncellendi`,
    },
    ast: {
      title: 'Asteroit kütüphanesi',
      description: 'Radar ve uzay aracı görüntülerinden gerçek şekil modeli olan 33 asteroit; yörünge elementleri ve fiziksel veri JPL SBDB’den.',
      lead: 'Buradaki her cismin radar yankılarından ya da uzay aracı görüntülerinden çıkarılmış gerçek bir şekil modeli var. Yörüngeler JPL Küçük Cisimler Veritabanı’nın oskülatör elementleridir.',
      cols: { name: 'Cisim', cls: 'Sınıf', a: 'a (AB)', e: 'e', i: 'i (°)', d: 'Çap (km)', moid: 'MOID (AB)', model: 'Şekil' },
      method: { radar: 'Radar', spacecraft: 'Uzay aracı' },
      methodLong: { radar: 'Yer tabanlı radar (gecikme-Doppler)', spacecraft: 'Uzay aracı görüntüleri' },
      orbit: 'Yörünge',
      epoch: 'Epok',
      phys: 'Fiziksel',
      model: 'Şekil modeli',
      el: {
        a: 'Yarı büyük eksen', e: 'Dış merkezlik', i: 'Eğiklik', om: 'Çıkış düğümü boylamı', w: 'Günberi açısı', ma: 'Ortalama anomali',
        q: 'Günberi uzaklığı', ad: 'Günöte uzaklığı', per: 'Yörünge dönemi', moid: 'Dünya MOID',
        H: 'Mutlak kadir', D: 'Çap', rot: 'Dönme süresi', alb: 'Geometrik albedo', spec: 'Tayf türü',
        dims: 'Boyutlar (x × y × z)', tris: 'Üçgen', src: 'Kaynak', method: 'Yöntem',
      },
      unknown: '—',
      flags: { neo: 'NEO', pha: 'Potansiyel tehlikeli' },
      openLS19: 'LS19’da aç',
      openLS19Note: 'Asteroit saptırma deneyini bu cisim hedef olarak açar.',
      viewer: (name) => `${name} için 3B şekil modeli. Döndürmek için sürükleyin ya da ok tuşlarını kullanın.`,
      viewerLoading: 'Şekil modeli yükleniyor…',
      viewerError: 'Şekil modeli yüklenemedi.',
      viewerHint: 'Döndürmek için sürükleyin',
      scale: 'En uzun boyut',
      sources: 'Kaynaklar',
      srcOrbit: (date) => `Yörünge ve fiziksel veri: JPL Küçük Cisimler Veritabanı API’si, ${date} tarihinde alındı.`,
      srcModel: 'Şekil modeli',
      back: 'Tüm 33 cisim',
      condition: 'Yörünge belirsizlik kodu',
      arc: 'Gözlem aralığı',
      days: 'gün',
      years: 'yıl',
      hours: 'sa',
      km: 'km',
      sigmaNote: '± sonrasındaki değerler JPL yörünge çözümünün 1σ belirsizlikleridir.',
      sol: {
        title: 'Yörünge çözümü', id: 'JPL çözümü', date: 'Çözüm tarihi', obs: 'Kullanılan optik gözlem', radar: 'Radar (gecikme / Doppler)',
        arc: 'Gözlem aralığı', rms: 'Artık RMS', u: 'Belirsizlik parametresi U',
        uMeaning: (u) => (u == null ? null : u <= 1 ? 'çok iyi belirlenmiş' : u <= 4 ? 'iyi belirlenmiş' : u <= 6 ? 'orta belirsiz' : 'zayıf belirlenmiş'),
      },
      ca: {
        title: 'Dünya’ya yakın geçişler',
        lead: (n, max, from, to) => `${from} ile ${to} arasında ${max} au’dan yakın ${n} geçiş. Uzaklıklar merkezden merkeze; aralık 3σ aralığıdır.`,
        none: (max, from, to) => `${from} ile ${to} arasında ${max} au’dan yakın geçiş yok.`,
        next: 'Sıradaki geçişler', noneNext: (to) => `${to} öncesinde bu uzaklıktan yakın başka geçiş yok.`,
        closest: 'Dönemin en yakını', last: 'En son',
        cols: { date: 'Tarih (TDB)', dist: 'Uzaklık (au)', km: 'Uzaklık (km)', ld: 'Ay uzaklığı', range: '3σ ±', v: 'Göreli hız (km/s)', t: 'Zaman 3σ' },
      },
      risk: {
        title: 'Çarpma riski',
        listedLead: 'Dünya’ya çarpma olasılığı sıfır olmayan asteroitleri izleyen JPL Sentry listesinde. Aşağıdaki değerler Sentry’nin yayımladığı özettir.',
        ip: 'Toplam çarpma olasılığı', oneIn: (n) => `yaklaşık 1/${n}`, psCum: 'Palermo ölçeği, toplam', psMax: 'Palermo ölçeği, en yüksek', tsMax: 'Torino ölçeği, en yüksek',
        nImp: 'Olası çarpma', years: 'Yıllar', computed: 'Hesap tarihi',
        removed: (d) => `${d} tarihinde JPL Sentry risk listesinden çıkarıldı: yeni gözlemler Sentry’nin bulduğu olası çarpmaları dışladı.`,
        none: 'JPL Sentry risk listesinde değil: Sentry bu cisim için taradığı dönemde (genellikle önümüzdeki 100 yıl) olası bir Dünya çarpması bulmadı.',
      },
      srcCad: (date) => `Yakın geçişler: JPL SBDB Close Approach Data API, alınma ${date}.`,
      srcSentry: (date) => `Çarpma riski: JPL Sentry Data API, alınma ${date}.`,
    },
    src: {
      title: 'Kaynaklar ve lisanslar',
      description: 'lookstar19’un kullandığı her veri kümesi, model ve yayın kaynağı; ne için kullanıldığı ve kullanım şartları.',
      lead: 'lookstar19 ticari değildir; NASA, JPL, ESA ya da burada adı geçen başka bir kurum veya şirketle bağlantısı yoktur ve onlar tarafından onaylanmamıştır. Sağlayıcının yayımladığı şartlar varsa aşağıdaki bağlantı esastır; bu sayfa yalnız doğruladığımızı özetler.',
      cols: { source: 'Kaynak', use: 'Kullanım', terms: 'Şartlar' },
      rows: [
        ['JPL Küçük Cisimler Veritabanı API’si', 'Asteroitlerin yörünge elementleri, 1σ belirsizlikleri ve fiziksel verisi', 'Sağlayıcının şartları', 'https://ssd-api.jpl.nasa.gov/doc/sbdb.html'],
        ['JPL SBDB Yakın Geçiş Verisi API’si', 'Asteroitlerin Dünya’ya yakın geçişleri, 1900–2200', 'Sağlayıcının şartları', 'https://ssd-api.jpl.nasa.gov/doc/cad.html'],
        ['JPL Sentry Veri API’si', 'Dünya’ya yakın asteroitlerin çarpma riski', 'Sağlayıcının şartları', 'https://ssd-api.jpl.nasa.gov/doc/sentry.html'],
        ['NASA PDS Küçük Cisimler Düğümü: şekil modelleri', 'Radar ve uzay aracı kaynaklı asteroit şekilleri', 'NASA yapımı veri: kamu malı', 'https://sbn.psi.edu/pds/shape-models/'],
        ['NASA Eyes on the Solar System', 'Dokulu şekil modelleri (Bennu, Itokawa, Vesta, Eros, Ryugu, Psyche, Didymos, Gaspra)', 'NASA içeriği: kamu malı; NASA amblemleri hariç', 'https://www.nasa.gov/nasa-brand-center/images-and-media/'],
        ['The Space Devs: Launch Library 2', 'Yaklaşan fırlatmalar ve yayın bağlantıları', 'Sağlayıcının şartları', 'https://thespacedevs.com/llapi'],
        ['GCAT, J. McDowell (planet4589.org)', 'LS19’daki fırlatma geçmişi', 'CC BY 4.0', 'https://planet4589.org/space/gcat/'],
        ['CelesTrak', 'LS19’daki uydu yörüngeleri', 'Sağlayıcının şartları', 'https://celestrak.org/'],
      ],
      noLogo: 'Bu sitede kurum logoları, mühürleri ve amblemleri kullanılmaz. Görev adları yalnız olgu olarak geçer.',
      code: 'Site ve simülasyonun kaynak kodu',
    },
    nf: {
      title: 'Bu sirkülerde yok',
      body: 'Bu adreste bir sayfa yok. Kütüphanede gerçek şekil modeli olan 33 asteroit var; hepsi aşağıdaki dizinde.',
      home: 'Ana sayfa',
      index: 'Asteroit dizini',
    },
    footer: {
      line: 'lookstar19, açık kaynaklardan kurulmuş ticari olmayan bir kütüphanedir. Hiçbir kurumla bağlantılı değildir ve onaylanmamıştır.',
      built: (date) => `Veri tarihi ${date}`,
      repo: 'Kaynak kod',
    },
    cls: {
      APO: 'Apollo', ATE: 'Aten', AMO: 'Amor', IEO: 'Atira', MCA: 'Mars geçiren', MBA: 'Ana kuşak', IMB: 'İç ana kuşak', OMB: 'Dış ana kuşak', TJN: 'Truva', CEN: 'Kentaur', TNO: 'Neptün ötesi',
    },
  },
};

export const isLang = (l) => LANGS.includes(l);
export const t = (lang) => T[isLang(lang) ? lang : 'en'];
export const otherLang = (lang) => (lang === 'tr' ? 'en' : 'tr');
const LOC = { en: 'en-GB', tr: 'tr-TR' };

// sayılar: sabit ondalık; Türkçede ondalık virgül
export function num(lang, x, d = 2) {
  if (x == null || !Number.isFinite(x)) return null;
  return new Intl.NumberFormat(LOC[lang] || 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: Math.abs(x) >= 10000 }).format(x);
}
// anlamlı basamakla (çok küçük/büyük değerler: MOID, çap)
export function sig(lang, x, s = 3) {
  if (x == null || !Number.isFinite(x)) return null;
  if (x === 0) return '0';
  const d = Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(x))));
  return num(lang, x, Math.min(d, 8));
}
// belirsizlik: ± 1,97 × 10⁻¹⁰ (küçük ve büyük değerler bilimsel gösterimle; 2 anlamlı basamak)
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sci(lang, x, s = 2) {
  if (x == null || !Number.isFinite(x)) return null;
  if (x === 0) return '0';
  const ex = Math.floor(Math.log10(Math.abs(x)));
  if (ex >= -3 && ex <= 4) return sig(lang, x, s);
  const m = x / 10 ** ex;
  return `${num(lang, m, s - 1)} × 10${String(ex).split('').map((c) => SUP[c]).join('')}`;
}
// CAD zaman belirsizliği "< 00:01", "13:02", "2_09:08" → "< 1 dk", "13 sa 02 dk", "2 g 09 sa 08 dk"
export function tSigma(lang, t) {
  if (!t) return null;
  const U = lang === 'tr' ? { d: 'g', h: 'sa', m: 'dk' } : { d: 'd', h: 'h', m: 'min' };
  const lt = /^</.test(t), m = /(?:(\d+)_)?(\d{1,2}):(\d{2})/.exec(t); if (!m) return t;
  const [, d, h, mi] = m, parts = [];
  if (d) parts.push(`${+d} ${U.d}`);
  if (+h || d) parts.push(`${+h} ${U.h}`);
  parts.push(`${+mi} ${U.m}`);
  return (lt ? '< ' : '') + parts.join(' ');
}
// tarih (UTC): 26 Nov 2026 · 26 Kas 2026
export function date(lang, iso) {
  const d = new Date(iso); if (Number.isNaN(+d)) return null;
  return new Intl.DateTimeFormat(LOC[lang], { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}
export function dateTime(lang, iso) {
  const d = new Date(iso); if (Number.isNaN(+d)) return null;
  return new Intl.DateTimeFormat(LOC[lang], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(d) + ' UTC';
}
// fırlatma tarihi kaynağın kesinliğinde: kesin → "27 Nov 2026, 00:05 UTC"; saat → "27 Nov 2026, ~13:00 UTC"; gün → "27 Nov 2026";
// hafta → "week of 23 Nov 2026"; ay → "December 2026"; çeyrek → "Q4 2026"; yarıyıl → "H1 2027"; yıl → "2027"
export function netLabel(lang, iso, p) {
  const d = new Date(iso); if (Number.isNaN(+d)) return null;
  const k = (p && p.kind) || 'exact', tr = lang === 'tr', y = d.getUTCFullYear();
  if (k === 'exact') return dateTime(lang, iso);
  if (k === 'hour') return `${date(lang, iso)}${tr ? '' : ','} ~${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
  if (k === 'day') return date(lang, iso);
  if (k === 'week') { const s = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString(); return tr ? `${date(lang, s)} haftası` : `week of ${date(lang, s)}`; }
  if (k === 'month') return new Intl.DateTimeFormat(LOC[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  if (k === 'quarter') return tr ? `${y} ${p.part}. çeyrek` : `Q${p.part} ${y}`;
  if (k === 'half') return tr ? `${y} ${p.part === 1 ? 'ilk' : 'ikinci'} yarı` : `H${p.part} ${y}`;
  return String(y);
}
export const clsName = (lang, c) => (lang === 'tr' && T.tr.cls[c.code]) || c.name;
