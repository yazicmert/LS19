# Ağır varlıklar: git dışında, GitHub Release'te

Dokular, efemeris parçaları, 3B modeller ve tam JPL çekirdekleri git deposunda tutulmaz. Bunlar `varliklar` etiketli GitHub Release'te birkaç `.tar` paketi olarak durur. Depoda yalnız bildirim kalır: `varliklar.json`, her paketin adını ve içindeki her dosyanın SHA-256 özetini yazar. Araç: `tools/varliklar.mjs` (bağımlılık yok; Node ≥ 20 ve `tar`).

## Neden

İkili dosyalar git geçmişinde sonsuza kadar kalır: bir dokunun her yeni sürümü ve her yeni model, depoyu ve her klonu kalıcı olarak büyütür. Release'teki paketler geçmişe yazılmaz. Depoya giren tek şey birkaç kilobaytlık bildirim değişikliğidir. 3B model otomasyonu için ön koşul budur: her yeni model yeni bir paket ve bildirimde birkaç satır olur.

Not: Taşımadan önceki git geçmişi olduğu gibi kalır (GitHub'daki depo boyutu küçülmez). Geçmişi yeniden yazmak (`main`'de zorla gönderme) kazancına göre çok yıkıcıdır. Amaç büyümeyi durdurmaktır.

## Paketler

| Paket | İçerik | Siteye gider |
| --- | --- | --- |
| `doku` | `web/textures/**` (WebP, KTX2, JPG/PNG yedekleri) | evet |
| `efemeris` | `web/data/eph/v1/*.bin` (`index.json` git'te) | evet |
| `uydu` | `web/models/sats/*.glb.gz` | evet |
| `asteroit` | `web/models/ast/*.glb`, `web/models/ast/damit/*.bin.gz` (katalog JSON'ları git'te) | evet |
| `cekirdek` | `web/data/de440s.bsp`, `web/data/moon_pa_de440_200625.bpc` | hayır (testler ve araçlar) |

Paket adı içerikten türetilir (`doku-c2696adccfe6.tar`). Bir kez yüklenen paket değişmez; içerik değişince yeni adla yeni paket yüklenir.

Uydu modelleri gzip'li saklanır ve sunulur (`.glb.gz`). Meshopt verisi gzip ile yaklaşık %60 küçülür; örneğin TDRS 1,7 MB'tan 0,7 MB'a iner. Tarayıcı dosyayı `DecompressionStream` ile açar (`js/satmodels.js fetchGlb`). Sunucu dosyayı kendisi açıp gönderirse ilk iki bayt `1f 8b` olmaz ve gövde doğrudan GLB olarak okunur. Dokulu asteroit modellerinde gzip kazancı yok (%2); onlar `.glb` kalır.

## Kim indirir

- **Vercel derlemesi:** `node tools/varliklar.mjs indir --site`, sonra küçültme (`vercel.json buildCommand`).
- **CI:** `denetim.yml` ve `gecmis.yml` testlerden önce bütün paketleri indirir (`cekirdek` dahil).
- **Yerel geliştirme:** `npm run varliklar`. `npm test` varlıklar eksikse bunu söyleyip durur.
- **Yalnız Python ile çalıştırma:** `sunucu.py` ilk açılışta siteye giden paketleri indirir. Docker imajı bunları derleme sırasında indirir (`sunucu.py --varliklar`).

Önce `https://github.com/<depo>/releases/download/varliklar/<paket>` denenir. Olmazsa GitHub API'sinin varlık adresi kullanılır (`GITHUB_TOKEN` varsa onunla). Açılan her dosya bildirimdeki özetle doğrulanır.

## Yeni ya da değişen varlık

```bash
# 1) dosyaları yerine koy (ör. tools/uydu_modelleri.mjs çıktısı web/models/sats/<anahtar>.glb)
node tools/varliklar.mjs paketle                     # .glb → .glb.gz, bildirimi yazar, paketleri .varliklar/ içine üretir
GITHUB_TOKEN=… node tools/varliklar.mjs yukle         # Release'te olmayan paketleri yükler
git add varliklar.json && git commit                  # depoya yalnız bildirim girer
```

`.github/workflows/varliklar.yml` bildirim değişince çalışır. Paketleri Release'e yükler; dosyalar git'te değilse yalnız denetler. Ardından siteye giden paketleri Release'ten indirip doğrular.
