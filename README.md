# LS19 · Look Star 19

Tarayıcıda gerçek zamanlı çalışan bir uzay simülasyonu. Dünya park yörüngesinden Apollo 11 iniş bölgesine kadar tüm Ay görevini fizik motoruyla uçurur, Güneş sistemini canlı N-cisim efemerisiyle hesaplar, Dünya ve Ay çevresindeki gerçek uyduları ve ~53.000 asteroidi canlı gösterir. Saptırma laboratuvarında bir asteroide uygulanan itkinin Dünya yakın geçişini ne kadar değiştirdiğini hesaplar.

*A real-time, browser-based space simulator: live N-body ephemeris (DE440-initialised), an Earth-to-Moon mission with LLO/halo/NRHO staging flown by a closed-loop autopilot, ~16,600 live satellites (CelesTrak + SGP4), ~53,000 asteroids (JPL SBDB), and an asteroid-deflection physics engine (kinetic impactor or continuous force, B-plane analysis, validated against JPL close-approach data).*

![İç Güneş sistemi: ~53.000 asteroit](docs/b0_hero.png)

| | |
|---|---|
| ![Saptırma laboratuvarı: Apophis 2029](docs/b2_lab.png) | ![Asteroit katmanı](docs/b1_solar_ui.png) |
| ![Canlı uydular](docs/s1_sats.png) | ![Uydu bilgi kartı](docs/p2_pick.png) |

## Özellikler

- **Ay görevi:** KSC fırlatma fazlaması, park yörüngesi, TLI, rota düzeltmeleri, LOI ya da halo/NRHO girişi, istasyon tutma, LLO, DOI, motorlu iniş ve temas — otopilotla ya da elle. Dünya park yörüngesi ve Ay bekleme yörüngesi seçilebilir; tasarım her seçim için en az Δv'li yolu kurar.
- **Canlı efemeris:** JPL DE440s ile başlatılan N-cisim entegrasyonu, Ay'ın dönme dinamiği, IAU 2006/2000A Dünya yönelimi.
- **Canlı uydular:** CelesTrak aktif uydular (~16.600), SGP4; Ay çevresinde LRO, Danuri, Chandrayaan-2, ARTEMIS, CAPSTONE (JPL Horizons).
- **Canlı asteroitler:** Dünya'ya yakın tüm asteroitler, büyük ana kuşak asteroitleri ve Jüpiter Truvalıları (JPL SBDB); PHA ve Sentry risk listesi ayrı renkte. Tıklayınca bilgi kartı (çap, albedo, dönme, yörünge, MOID, sonraki yakın geçiş, çarpma olasılığı, keşif), yörünge çizgisi ve yakından kaya modeli.
- **Saptırma fizik motoru:** asteroit, Güneş + 8 gezegen + Ay + Plüton çekimi (DE440 konumları) ve Güneş'in genel görelilik düzeltmesiyle tümlenir; yakın geçişler bulunur, kaçırma B-düzleminde (Öpik–Valsecchi ξ, ζ) ölçülür. Kinetik çarpıcı (Δv = β·m·U/(M+m)) ya da sürekli kuvvet (N × süre); durum geçiş matrisiyle doğrusal duyarlılık, en etkili itki yönü, önceden uyarı süresi eğrisi, Dünya'yı ıskalatmak için gereken Δv / çarpıcı kütlesi / kuvvet.
- **İki çalışma alanı:** üstteki anahtarla (ya da `M` tuşu) **Ay Görevi** (değiştirilebilir, koşturulabilir fizik motoru, görev saati) ile **Canlı Gökyüzü** (gerçek saat, uydular, asteroitler, saptırma) arasında geçilir; ikisi ayrı saat, ayrı efemeris ve ayrı kamerayla çalışır.
- **Canlı uydu takibi:** gerçek saatte (×1–×3600 hızlandırılabilir) takip listesi; anlık irtifa, hız, yer izi noktası, Güneş/gölge, gözlemciden yükseklik. Yer izi (geçmiş/gelecek) ve kapsama dairesi Dünya üzerinde çizilir.
- **Geçiş tahmini:** gözlemci konumu (şehir listesi ya da tarayıcı konumu) için 3 günlük geçişler: doğuş/en yüksek/batış, yön, çıplak gözle görünürlük (uydu Güneş'te, gökyüzü karanlık), gökyüzü (kutup) çizimi; **Gözlemci** kamerası yerden gökyüzüne bakar ve geçişte uyduyu izler; görünür geçişten 5 dk önce bildirim. Skyfield ile karşılaştırmada zamanlar 1 s, açılar 0,01° içinde.
- **Operatör verisi:** ISS, Starlink, OneWeb, GPS, GLONASS, Planet, Intelsat, SES, Kuiper için CelesTrak Supplemental GP (operatörlerin kendi yörünge çözümleri) normal GP'nin yerine kullanılır.
- **Otomatik güncelleme:** 10 dakikada bir sürüm denetimi; değişen veri sayfa yenilenmeden yüklenir. Kaynak kurallarına uyulur (CelesTrak en sık 2 saatte bir, JPL SBDB/Sentry günlük).

### Doğrulama

| Sınama | Sonuç |
|---|---|
| Apophis, 13 Nisan 2029 yakın geçişi | 38.013 km — JPL CAD 38.011,5 km (fark ~2 km, zaman farkı < 1 s) |
| 1 cm/s itki: doğrusal (STM) ve tam tümleme | Δζ 2276,6 / 2276,5 km |
| DART/Dimorphos | başa baş Δv 2,99 mm/s; ölçülen 2,70 mm/s → periyot −32,8 dk (gözlenen −33,0 ± 1,0 dk) |
| ISS geçişleri, İstanbul (3 gün) | Skyfield'a göre en büyük fark 0,6 s ve 0,007° |
| Ay görevi profilleri (13 Ekim 2026) | Apollo 5937,8 m/s · NRHO 9:2 6686,1 m/s · L1 6499,2 · L2 7025,1 — hepsi temasla biter |

## Çalıştırma (yerel)

Gereken: Python 3 (yalnız standart kütüphane) ve güncel bir tarayıcı.

```bash
cd web
python3 sunucu.py          # macOS'ta baslat.command'a çift tıklamak da olur
# tarayıcıda: http://localhost:8765
```

`sunucu.py` sitenin dosyalarını sunar; CelesTrak (GP ve Supplemental GP), JPL Horizons, JPL SBDB ve Sentry için yerel vekil, önbellek ve 10 dakikalık arka plan güncellemesi görevi görür. Ayrıntılar: [web/BENIOKU.md](web/BENIOKU.md).

## Vercel'de yayınlama

Depo Vercel'e olduğu gibi bağlanabilir; ayar gerekmez (`vercel.json` hazır):

1. Vercel → **Add New… → Project** → GitHub'dan `LS19` deposunu seç → **Deploy**.
2. Site `web/` klasöründen statik olarak sunulur; canlı veri vekili `api/` klasöründeki sunucusuz işlevlerdir (`/api/gp`, `/api/asteroids`, `/api/sbdb`, `/api/sentry`, `/api/horizons`, `/api/surum`).

Notlar:

- **Blender dosyası sorun olmaz:** `ROCSIM.blend` depoda yoktur (GitHub sınırını aşar, `.gitignore`); `scripts/` içindeki Blender betikleri ve `kernels/`, `pylib/` gibi klasörler `.vercelignore` ile yayına alınmaz.
- **Güncelleme bulutta:** Hobby planında cron en sık günde bir çalışabildiği için zamanlayıcı kullanılmaz. Tarayıcı 10 dakikada bir `/api/surum`'u sorar; veri istekleri kaynağın izinli aralığına göre bir sürüm anahtarı taşır ve Vercel CDN yanıtı o süre boyunca paylaşımlı önbellekte tutar. Böylece ziyaretçi sayısından bağımsız olarak CelesTrak'a 2 saatte, JPL'e günde CDN bölgesi başına bir istek gider.
- **Boyut:** Sayfa ilk açılışta ~90 MB indirir (JPL çekirdekleri ve 8k dokular; sonra tarayıcı önbelleğinde). Hobby planının aylık 100 GB aktarımı yaklaşık 1.000 ilk ziyarete yeter.
- **CelesTrak ve bulut:** CelesTrak Vercel'in IP'lerini engelleyebiliyor (403). Tarayıcı bu durumda GP verisini CelesTrak'tan doğrudan alır (CORS açık, 2 saat tarayıcı önbelleği). Supplemental GP'de CORS olmadığından bulutta ek bir kopya gerekir: `docs/celestrak-data.yml` iş akışı 2 saatte bir CelesTrak'tan GP ve Supplemental GP'yi çekip deponun `data` dalına (geçmişsiz) yazar; bulut işlevleri ve tarayıcı CelesTrak'a ulaşamazsa bu kopyayı kullanır. Etkinleştirmek için dosyayı GitHub'da `.github/workflows/` altına taşıyın (Actions açık olmalı). `data` dalı Vercel'de yayına alınmaz (`vercel.json` → `git.deploymentEnabled`).

## Testler (Node 20+)

```bash
cd web
node test/test_deflect.js      # Apophis 2029 (JPL CAD ile), STM/tam tümleme uyumu, DART
node test/test_api.js          # bulut işlevleri (taklit veriyle), yerel sunucuyla aynı biçim, GitHub kopyasına düşme
node test/test_passes.js       # ISS geçişleri, Skyfield sonuçlarıyla
node test/test_cr3bp.js        # halo/NRHO aileleri
node test/test_profiles.js     # tüm görev profillerini tasarlayıp uçurur (birkaç dakika)
```

## Klasörler

| Yol | İçerik |
|---|---|
| `web/` | Tarayıcı simülasyonu (Three.js, Web Worker'lar), `sunucu.py`, testler |
| `web/js/` | `engine.js` fizik · `ephem.js`/`live.js` efemeris · `cr3bp.js`/`halo.js` halo yörüngeleri · `design.js` görev tasarımı · `mission.js` otopilot · `sats.js`/`satlayer.js` uydular · `asteroids.js`/`astwork.js` asteroitler · `deflect.js`/`deflectwork.js`/`astui.js` saptırma · `passes.js`/`tracker.js`/`skyui.js` canlı takip ve geçişler · `updater.js` güncelleme · `scene.js`/`ui.js` görüntü ve arayüz |
| `api/` | Vercel sunucusuz işlevleri (canlı veri vekili) |
| `scripts/` | Blender sürümü (Adım 1–5): görev motoru ve sahne betikleri |
| `kernels/` | JPL DE440s, Ay yönelim çekirdeği, efemeris tablosu |

## Veri kaynakları ve lisanslar

- Kod: MIT (bkz. [LICENSE](LICENSE)).
- JPL DE440s ve Ay yönelim çekirdekleri: NASA/JPL NAIF.
- Canlı veri: [CelesTrak](https://celestrak.org) GP, [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/), [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_query.html), [JPL Sentry](https://cneos.jpl.nasa.gov/sentry/), JPL CAD.
- Gezegen dokuları: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0); Ay rengi ve yükseklik: NASA SVS CGI Moon Kit (LROC/LOLA).
- Kütüphaneler: [three.js](https://threejs.org) (MIT), [satellite.js](https://github.com/shashwatak/satellite-js) (MIT), jplephem (MIT).
