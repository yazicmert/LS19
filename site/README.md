# lookstar19

lookstar19.org: LS19 simülasyonunun yanındaki, ticari olmayan, kaynaklı uzay kütüphanesi. Next.js (App Router), İngilizce ve Türkçe.
Tasarım kuralları: `DESIGN.md`. Ürün kaydı: depo kökündeki `PRODUCT.md`. Yol haritası: `docs/yol_haritasi.md`.

## Yerelde

```bash
npm ci
npm run build      # önce scripts/modeller.mjs: 33 GLB modeli sürüm paketinden (sha256 denetimli)
npx next start
```

`npm run dev` geliştirme sunucusu. `npm run veri` asteroit verisini yeniler (`data/asteroids.json`; sonra commit).

## Veri

| Kaynak | Ne | Güvenilirlik bilgisi |
|---|---|---|
| JPL SBDB API | yörünge elementleri, fiziksel veri | her elementin 1σ belirsizliği; çözüm no ve tarihi, gözlem sayısı (optik, radar), gözlem aralığı, artık RMS, belirsizlik parametresi U |
| JPL CAD API | Dünya'ya 0,2 au'dan yakın geçişler, 1900–2200 | nominal uzaklık ve 3σ aralığı, zaman belirsizliği (3σ) |
| JPL Sentry API | çarpma riski (yalnız NEO) | listede (olasılık, Palermo, Torino, olası çarpma sayısı, hesap tarihi), listeden çıkarılmış (tarih) ya da hiç listelenmemiş |
| Launch Library 2 | yaklaşan fırlatmalar (ISR, 30 dk) | zaman yalnız kaynağın kesinliğinde (ay, çeyrek, saat, dakika); geri sayım yalnız saati bilinen fırlatmaya; kaynak kaydının güncellenme zamanı |

`scripts/asteroitler.mjs` yazmadan önce her kaydı doğrular (`lib/jpl.js`: q = a(1−e), Kepler dönemi, 3σ aralığı, Sentry özeti) ve önceki
dosyayla karşılaştırır: aynı çözümde element kayması, cisim kaybı ya da %0,1'den büyük yarı büyük eksen değişimi yazmayı durdurur.
`.github/workflows/site-veri.yml` her pazartesi yeniler; alınma tarihinden fazlası değiştiyse değişiklik raporuyla PR açar
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
