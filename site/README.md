# lookstar19

lookstar19.org: LS19 simülasyonunun yanındaki, ticari olmayan, kaynaklı uzay kütüphanesi. Next.js (App Router), İngilizce ve Türkçe.
Tasarım kuralları: `DESIGN.md`. Ürün kaydı: depo kökündeki `PRODUCT.md`. Yol haritası: `docs/yol_haritasi.md`.

## Yerelde

```bash
npm ci
npm run build      # önce scripts/modeller.mjs: 33 GLB modeli sürüm paketinden (sha256 denetimli)
npx next start
```

`npm run dev` geliştirme sunucusu. `npm run veri` asteroit verisini JPL SBDB'den yeniler (`data/asteroids.json`; sonra commit).

## Vercel

Yeni bir proje (LS19 simülasyonunun projesinden ayrı):

| Ayar | Değer |
|---|---|
| Root Directory | `site` |
| Include files outside the root directory in the Build Step | açık (varsayılan): model betiği depo kökündeki `varliklar.json`'u okur |
| Framework, kurulum, derleme | `site/vercel.json` belirler (Next.js, `npm ci`, `npm run build`) |
| Node.js | 20.9 ya da üstü (22 önerilir) |
| Ortam değişkeni (isteğe bağlı) | `NEXT_PUBLIC_LS19_URL`: LS19'un adresi; yoksa `https://ls19web.vercel.app` |
| Alan adı | `lookstar19.org` (ve `www` → yönlendirme) |

- Son yayından beri `site/` ya da `varliklar.json` değişmediyse derleme atlanır (`ignoreCommand`; ilk yayın her zaman derlenir); `data` dalı yayınlanmaz.
- Fırlatma sayfaları 30 dakikada bir yenilenir (ISR). Launch Library 2 yanıt vermezse yayındaki son sayfa kalır; ilk derlemede yanıt
  yoksa sayfa "veri yok" notuyla çıkar ve ilk başarılı yenilemede dolar.
- Modeller `.next/cache` içinde saklanır: paket her derlemede yeniden inmez.
- Önizleme adreslerinde `robots.txt` taramayı kapatır; yalnız üretim adresi dizinlenir.
- Her yanıtta güvenlik başlıkları (CSP, çerçeveleme yok, nosniff, izinler kapalı): `next.config.mjs`.

## Denetim

`web/test/test_site.js` (depo kökünde `npm test` içinde) veriyi, aramayı, iki dil eşliğini, fırlatma verisinin hata yollarını,
güvenlik başlıklarını ve Vercel ayarını denetler. `.github/workflows/denetim.yml` içindeki `site` işi her PR'da siteyi Vercel'deki gibi derler.
