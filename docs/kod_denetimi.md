# Kod denetimi: tekrarlar, gereksiz uzunluk ve ölü kod

Amaç: yeni katlar eklemeden önce temeli kontrol etmek. Aynı işi birden çok yerde yapan kodu tek kaynağa topladık, kullanılmayan kodu sildik. Fizik ve davranış korundu. Her adımın doğrulaması aşağıda.

## 1. Yöntem

| Araç | Ne buldu |
|---|---|
| **jscpd 4** (birebir kopya, ≥ 50 belirteç) | 18.885 satırda %1,95 birebir kopya, 62 klon. Kod yoğun tek satırlarla yazıldığı için asıl tekrar anlamsaldır, bu oran onu az gösterir |
| **knip** (kullanılmayan dosya ve dışa aktarım; giriş noktaları: `app.js`, 8 worker/dinamik modül, testler, araçlar, `api/`) | 98 kullanılmayan dışa aktarım. Bunların 9'u dosya içinde de kullanılmıyor, yani ölü kod |
| **grep ile tanım taraması** | Aynı adlı yardımcıların (`dot`, `cross`, `norm`, `unit`…), Butcher tablolarının, Gauss çözücülerinin, WGS-84 sabitlerinin kaç dosyada yeniden tanımlandığı |
| **içerik özeti** (`git hash-object`) | Depoda aynı ikili dosyanın iki kopyası |

## 2. Bulgular ve yapılanlar

| # | Tekrar | Nerede | Yapılan |
|---|---|---|---|
| 1 | 3B vektör/matris yardımcıları (`add`, `sub`, `scale`, `dot`, `cross`, `norm`, `unit`, `mv`, `mtv`, `mT`) | engine, ascent, attctl, attitude, deflect, pdg, rigidbody, ephem, ui: **9 dosya** | `js/vec3.js` tek kaynak; `engine.js` yeniden dışa aktarır (`E.dot` vb. aynı) |
| 2 | Dormand–Prince 5(4) Butcher tablosu | engine, ephem, deflect, cr3bp, halo: **5 kopya** | `js/dopri.js` (tablo + genel uyarlanır adım). cr3bp ve halo ortak adımı kullanır; engine (r/v ayrık, değişken kütle), ephem (FSAL + yoğun çıktı) ve deflect (STM) hız için kendi döngülerini korur, yalnız tabloyu alır |
| 3 | Kısmi pivotlu Gauss çözücü | cr3bp (`solveN`), halo (`solveN`), design (`solve`): **3 kopya** | `js/linalg.js` |
| 4 | WGS-84 sabitleri, Dünya dönüş hızı, μ⊕ | ascent, ascentplay, ascentsim, pads, passes, telemetry, rockets: **7 dosya**. **İki farklı ω** vardı (7,2921159e-5 ve 7,2921150e-5) | `js/geo.js`: `WGS84_*`, `OMEGA_E`, `MU_E`, `ecfFromGeodetic`, `geodeticFromEcf`, `geodetic` |
| 5 | Kaba irtifa formülü `\|r\| − R(1 − f sin²φ)` | ui (2 kez), cinema | `geo.ellipsoidAlt`: gerçek elipsoid üstü yükseklik. Rampada ~12 m sapma giderildi |
| 6 | Jeodezik → ECF dönüşümü | ascent (yerel), passes | `geo.ecfFromGeodetic` |
| 7 | `fmtDur` (görev süresi biçimi) | ui, cinema: aynı işlev iki kez | `format.js` |
| 8 | GMST ve ekinoks denklemi | earth.js içinde 2 + 3 kez | tek tanım (`gmst06`, `eqEquinox`) |
| 9 | Kuaterniyon çarpımı | ascentplay (yerel `qmul`), attitude (`qMul`) | `attitude.qMul` |
| 10 | Aynı JPL çekirdekleri | `kernels/` ve `web/data/`: de440s.bsp, moon_pa…bpc, rocsim_eph json, **45 MB** | `kernels/` kopyaları silindi; orada yalnız `web/data/`'da olmayan Ay çerçeve tanımı (`.tf`) kaldı |

**Ölü kod** (hiçbir yerde çağrılmıyor; testler ve araçlar dahil): `cr3bp.continueTo` (45 satır), `cr3bp.jacobi`, `halo.toRotating`, `deflect.diameterOf`, `impact.TORINO_TR`, `engine.ephemeris`, `earth.truePole`, `design.HALO_OPTIONS`, `design.__internals`, `design.nelderMead` (zaman dilimli `nelderMeadGen` kullanılıyordu; senkron kopyası atıl).

Sonuç:
- `web/js` 14.710 → 14.612 satır. 4 yeni ortak modül eklendi (~110 satır).
- 28 dosyada 294 satır silindi, 198 satır eklendi.
- Asıl kazanç satır sayısı değil. Bir sabitin, entegratörün ya da formülün artık tek doğru yeri var.

## 3. Doğrulama

- **Başlangıç ölçümü:** değişiklikten önce 44 testin hepsi çalıştırıldı ve çıktıları saklandı.
  - 43 test geçti.
  - `test_ascent` kalkış gökyüzünün yeni uygulamasını eski biçimde arıyordu; denetimi güncellendi.
- **Birebir aynılık:** entegratör, Gauss ve WGS-84 birleştirmelerinden sonra cr3bp, halo, ephem, earth, passes ve deflect testlerinin sayısal çıktıları başlangıçla **bit bit aynı** (yalnız süre satırları farklı).
  - Tablolar kesirli yazımlarıyla aynen taşındı.
  - Hata ölçekleri her çağıranda korundu.
- **Yuvarlama düzeyindeki fark:** `vec3.norm` her yerde `Math.sqrt(x²+y²+z²)`. Yönelim modülleri eskiden `Math.hypot` kullanıyordu.
  - İkisi son bitte farklı olabilir (~1e-16).
  - Bu fark kaotik halo görevlerinde birkaç cm/s nominal Δv kaymasına büyür. Örnek: iniş dikey hızı −1,07 → −1,06 m/s.
  - Fiziksel bir değişiklik değildir. Deponun kuralına göre (`test_dynamics6`: "kod değişince `node test/make_designs.js` ile yenilenir") hazır tasarımlar yeniden üretildi.
- **Ön yükleme listesi:** `index.html` modulepreload listesi modül grafiğinden yeniden üretildi (`test_preload.js`).

## 4. Bilinçli olarak dokunulmayanlar

- **Özel entegratör döngüleri** (engine, ephem, deflect): her biri farklı bir yapıya göre (r/v ayrık, FSAL, 42 boyutlu STM) en iyilenmiş. Genel döngüye çevirmek görevin sıcak yolunu yavaşlatır.
- **`terraingen.js` ↔ `test/fixtures/terrain_ref.js`:** jscpd'nin en büyük klonu. Bilerek bırakıldı: test, üretim kodunu eski başvuru kopyasıyla karşılaştırıyor (test kâhini).
- **`scripts/*.py`:** Blender sürümünün Python kaynakları. JavaScript motorunun başvurusu (`ref_engine.json` bunlardan üretildi); site tarafından kullanılmıyor.
- **`impact.js` R = 6378,135 km:** SGP4'ün WGS-72 değeri. Bilinçli olarak farklı.
- **İç kullanımda olan ama gereksiz yere dışa aktarılan ~90 ad:** zararsız. Davranış kazancı yok, yalnız gürültü azalır. Ayrı bir küçük temizlik olarak bırakıldı.

## 5. Sonraki temel işleri (öneri)

| Öncelik | İş | Neden |
|---|---|---|
| 1 | `scene.js`'i (1.448 satır) bölmek: kalkış sahnesi, yüzey karoları, gezegenler, kamera pozları ayrı modüllere | Tek dosyada çizim, kamera, kalkış, karo ve gezegen sorumlulukları birlikte |
| 2 | `app.js` (778) ve `ui.js` (708): görünüm/durum ayrımı | Laboratuvar deneyim merkezine dönüşürken en çok değişecek dosyalar |
| 3 | Gereksiz dışa aktarımları kaldırmak (knip listesi) | Modüllerin gerçek arayüzü görünür olur |
| 4 | Araç betiklerindeki ortak GLB dönüştürme kodu (`tools/*_modelleri.mjs`, 4 kopya) | Aynı 8 satırlık yükleyici dört betikte |
