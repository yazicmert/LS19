# lookstar19

lookstar19.org: LS19 simülasyonunun yanındaki, ticari olmayan, kaynaklı uzay kütüphanesi. Next.js (App Router), İngilizce ve Türkçe.
Tasarım kuralları: `DESIGN.md`. Ürün kaydı: depo kökündeki `PRODUCT.md`. Yol haritası: `docs/yol_haritasi.md`.

## Yerelde

```bash
npm ci
npm run build      # önce scripts/modeller.mjs: asteroit ve uydu modelleri sürüm paketlerinden (sha256 denetimli)
npx next start
```

`npm run dev` geliştirme sunucusu. `npm run veri` asteroit verisini yeniler (`data/asteroids.json`; sonra commit).

## Veri

| Kaynak | Ne | Güvenilirlik bilgisi |
|---|---|---|
| JPL SBDB API | yörünge elementleri, fiziksel veri | her elementin 1σ belirsizliği; çözüm no ve tarihi, gözlem sayısı (optik, radar), gözlem aralığı, artık RMS, belirsizlik parametresi U |
| JPL CAD API | Dünya'ya 0,2 au'dan yakın geçişler, 1900–2200 | nominal uzaklık ve 3σ aralığı, zaman belirsizliği (3σ) |
| JPL Sentry API | çarpma riski (yalnız NEO) | listede (olasılık, Palermo, Torino, olası çarpma sayısı, hesap tarihi), listeden çıkarılmış (tarih) ya da hiç listelenmemiş |
| CelesTrak GP (LS19 `data` dalındaki kopya) | 67 uydunun ortalama yörünge elementleri (SGP4) | epok tarihi; yarı büyük eksen, yükseklikler, dönem ve J2 düğüm kayması türetilmiş diye yazılır |
| GCAT (J. McDowell, CC BY 4.0) | uydu kütlesi, boyutları, işletmeci, üretici; fırlatma tarihi, aracı, yeri | katalog tarihi; GCAT kaydı uydunun tamamını anlatmıyorsa (ISS → Zarya) sayfada not |
| GCAT (J. McDowell, CC BY 4.0) — roketler | 2020'den bu yana yörüngeye ulaşmış 119 aracın boyu, çapı, kademeleri (boy, çap, çokluk) ve 1957'den bu yana her yörünge/derin uzay fırlatması | katalog tarihi; 3B görünüm bu ölçülerden çizilir ve öyle yazılır; füzeler ve sondaj roketleri alınmaz |
| GCAT kademe ve motor tabloları + `data/rocket-detail.json` (elle) | kademe kütleleri, itki (vakum, deniz seviyesi), yanma süresi, itki maddeleri, motor Isp'i ve oda sayısı (GCAT, haftalık); 35 roketin (Falcon 9, Falcon Heavy, Electron, Atlas V, Vulcan, Ariane 6, Vega C, H3, PSLV, LVM3, Soyuz-2, New Glenn, Starship ailelerinden) kademelerinde tank düzeni, motor dizilişi, parçalar ve değerler (SpaceX, Rocket Lab, ULA, ArianeGroup/Arianespace, ESA, JAXA, ISRO, Blue Origin belgeleri) | her değer kaynak işaretli, belgeler alınma tarihiyle; kaynakta olmayan iç düzen "şematik" diye yazılır ve genel çizilir; haftalık yenileme elle derlenen dosyaya dokunmaz |
| `data/events.json` (elle) | asteroitlere uzay aracı ziyaretleri, Hubble bakım görevleri, ISS ilk mürettebatı | ajansların görev kayıtlarından derlendi; sayfada "görev kaydı" diye ayrılır; planlananlar işaretli |
| JPL SBDB, CAD, Sentry (canlı) | tüm asteroitler kataloğu (~1,6 milyon): liste `sbdb_query.api`, arama `sbdb.api?sstr=…*`, cisim sayfası istekle üretilir (`/sb/[des]`) | sitenin `/api/sb` ucu JPL'e sorar; yanıt ve sayfa bir gün önbellekte; JPL yanıt vermezse son sayfa sunulur, ilk üretimde hata sayfası |
| CelesTrak GP (canlı, `data` dalındaki 2 saatlik kopya) + GCAT özeti (`data/satcat.json`, haftalık) | tüm uydular kataloğu (etkin küme, ~17 000): sunucu `gp_active.json`'u belleğinde tutar (bir saat; okunamazsa eskisi), `/api/sat` süzer, sıralar ve sayfalar; uydu sayfası istekle üretilir (`/sat/[norad]`, 6 saat ISR; modelli uydu zengin sayfasına yönlenir) | GCAT özeti yalnız etkin kümedeki uyduların GCAT satırları ve başvurdukları fırlatma/kurum/yer satırları; aynı NORAD numarasıyla GCAT kaydı olmayan (~%2) uydunun sayfasında not; kopya okunamazsa son sayfa sunulur, ilk üretimde hata sayfası |
| Launch Library 2 | yaklaşan fırlatmalar (ISR, 30 dk) | zaman yalnız kaynağın kesinliğinde (ay, çeyrek, saat, dakika); geri sayım yalnız saati bilinen fırlatmaya; kaynak kaydının güncellenme zamanı |

`scripts/asteroitler.mjs` yazmadan önce her kaydı doğrular (`lib/jpl.js`: q = a(1−e), Kepler dönemi, 3σ aralığı, Sentry özeti) ve önceki
dosyayla karşılaştırır: aynı çözümde element kayması, cisim kaybı ya da %0,1'den büyük yarı büyük eksen değişimi yazmayı durdurur.
`scripts/roketler.mjs` roketleri GCAT'ten alır (boy/çap/kademe denetimi, tekil adres). `scripts/uydular.mjs` uydular için aynısını yapar (`lib/sat.js`: GP elementleri, yerberi > 80 km, epok < 30 gün, GCAT ve model eşleşmesi; toplu kayıpta durur). Aynı betik tüm uydular kataloğunun GCAT özetini de yazar (`lib/satcat.js` checkCat: sütunlar, tekil NORAD, GCAT eşleşmesi ≥ %85, fırlatma tablosu; 200'den ve %20'den çok uydu birden çıkarsa durur); iki dosyadan biri geçmezse ikisi de yazılmaz.
`.github/workflows/site-veri.yml` her pazartesi ikisini de yeniler; alınma tarihinden fazlası değiştiyse değişiklik raporuyla PR açar
(yeni yörünge çözümleri, Sentry durum değişimleri kalın). Doğrulama başarısız olursa iş kırmızı olur.

## Vercel

Yeni bir proje (LS19 simülasyonunun projesinden ayrı):

| Ayar | Değer |
|---|---|
| Root Directory | `site` |
| Include files outside the root directory in the Build Step | açık (varsayılan): model betiği depo kökündeki `varliklar.json`'u okur |
| Framework, kurulum, derleme | `site/vercel.json` belirler (Next.js, `npm ci`, `npm run build`) |
| Node.js | 22.x (`package.json` engines; CI ile aynı) |
| Ortam değişkeni (isteğe bağlı) | `NEXT_PUBLIC_LS19_URL`: LS19'un adresi; yoksa `https://ls19web.vercel.app` |
| Alan adı | `lookstar19.org` (ve `www` → yönlendirme) |

- Son yayından beri `site/` ya da `varliklar.json` değişmediyse derleme atlanır (`ignoreCommand`; ilk yayın her zaman derlenir); `data` dalı yayınlanmaz.
- Fırlatma sayfaları 30 dakikada bir yenilenir (ISR). Launch Library 2 yanıt vermezse yayındaki son sayfa kalır; ilk derlemede yanıt
  yoksa sayfa "veri yok" notuyla çıkar ve ilk başarılı yenilemede dolar.
- Modeller `.next/cache` içinde saklanır: paket her derlemede yeniden inmez.
- Önizleme adreslerinde `robots.txt` taramayı kapatır; yalnız üretim adresi dizinlenir.
- Depo kökündeki `.vercelignore` bu projeye de uygulanır: oradaki klasör kuralları köke bağlı yazılmalı (`/scripts/`), yoksa `site/` içindeki aynı adlı klasör de silinir.
- Her yanıtta güvenlik başlıkları (CSP, çerçeveleme yok, nosniff, izinler kapalı): `next.config.mjs`.

## Denetim

`web/test/test_site.js` (depo kökünde `npm test` içinde) veriyi, aramayı, iki dil eşliğini, fırlatma verisinin hata yollarını,
güvenlik başlıklarını ve Vercel ayarını denetler. `.github/workflows/denetim.yml` içindeki `site` işi her PR'da siteyi Vercel'deki gibi derler.
