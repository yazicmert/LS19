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

## 5. `scene.js`'in bölünmesi

`scene.js` 1.448 satırdı. Çizim, kamera, kalkış sahnesi, gök cisimleri ve yüzey karoları aynı dosyadaydı. Altı adımda bölündü; her adımda testler yeniden çalıştırıldı.

- `World` sınıfı ve dışa açık arayüzü (`app.js`'in kullandığı yöntemler) aynı kaldı.
- Ayrılan yöntem grupları `mixin(World, …)` ile prototipe eklenir.
- Kaynağı okuyan sözleşme testleri parçaları tek metin olarak görür (`test/scenesrc.js`).

| Modül | Satır | İçerik |
|---|---|---|
| `scene.js` | 677 | `World`: kurulum, yükleme, araç ve kademe modelleri, kare güncellemesi, çizgiler, sinematik kip |
| `bodyshaders.js` | 151 | Dünya, Ay ve atmosfer gölgelendiricileri |
| `scenegeom.js` | ~85 | küre geometrisi, yönelim matrisleri, ışıltı/halka dokuları, konik örnekleme, `mixin` |
| `ascentview.js` | 218 | kalkış sahnesi: roket, rampa, gökyüzü, alev ışığı, bulut, ayrılan kademeler, yayın kamerası |
| `camerarig.js` | 134 | kamera kiplerinin pozları, yumuşak geçiş, otomatik kamera |
| `skyview.js` | 181 | Canlı Gökyüzü, gezegenler, Dünya–Ay kütle merkezi, gezegen seçme |
| `surfaceview.js` | 70 | yüzey karo katmanları, kaplama düğmesi, iniş arazisi yerleşimi |

`PLANETS` tablosu `planets.js`'e taşındı (gezegen verisinin geri kalanıyla birlikte).

Her adımdan sonra bir ad çözümleme denetimi çalıştırıldı: her parça, özgün `scene.js`'in üst düzey adlarından kullandıklarını ya içe aktarıyor ya da tanımlıyor. Ardından kaynağı okuyan 9 test ve ön yükleme listesi denetlendi. Sonda tarayıcıda şunlar çalıştırıldı:
- tam laboratuvar akışı (`tools/lab_deneme.mjs`),
- kalkış yayını çekimleri,
- yüzey karosu akışı.

## 6. `app.js` ve `ui.js`'in bölünmesi

**`app.js`** (778 → 618 satır) uygulamanın bileşim kökü: parçaları modül düzeyindeki ortak durumla (`DESIGN`, `latest`, `MODE`…) birbirine bağlıyor. Körlemesine bölmek bu bağımlılığı uzun parametre listelerine taşırdı. Bu yüzden yalnız kendi içinde tutarlı ve dış arayüzü küçük olan üç parça ayrıldı. Her birinin dokunduğu ortak durum ESLint `no-undef` ile çıkarıldı ve açıkça (getter'larla) verildi:

| Modül | Satır | Arayüz |
|---|---|---|
| `windowscan.js` | 81 | `WindowScanner`: `day()`, `scan(N)`, `cancel()`: günlük fırlatma penceresi ve pencere taraması |
| `profilecompare.js` | 30 | `ProfileCompare`: `run()`, `refresh()`, `cancel()`: profil karşılaştırması |
| `canvasinput.js` | 93 | `attachCanvasInput(canvas, ctx)`: kamera sürükleme ve yakınlaşma, ipucu, tıklayarak seçme ve bilgi kartı |

Klavye kısayolları `app.js`'te kaldı (uygulama çapında komut haritası).

**`ui.js`** (703 → 367 satır) `scene.js` gibi `mixin` ile bölündü. `UI` sınıfının arayüzü değişmedi:

| Modül | Satır | İçerik |
|---|---|---|
| `pickcard.js` | 77 | tıklanan cismin bilgi kartı |
| `satpanel.js` | 70 | Uydular sekmesi |
| `flighttools.js` | 148 | Yörünge ve Canlı efemeris sekmeleri |
| `linechart.js` | 71 | görev grafikleri |
| `uiutil.js` | 8 | ortak küçük yardımcılar (`$`, `setText`, `setWidth`, `utcShort`) |

`mixin` artık kendi modülünde (`mixin.js`). Hem `World` hem `UI` onu kullanıyor.

**ESLint ile ek temizlik:**
- `no-undef` tüm `web/js`'te temiz. Tek uyarı `conic.js`'teki `typeof process` korumalı Node denetimi; bu kasıtlı.
- `no-unused-vars` ile bölünen dosyalarda kullanılmayan **111 içe aktarma** kaldırıldı.
- Bu, bölmede gözden kaçan bir eksik içe aktarmayı da yakaladı (`surfaceview.js`: `add is not defined`). Hatayı ilk tarayıcı testi göstermişti.

## 7. Kalıcı denetim ve ortak durum

**ESLint artık deponun parçası.** Yapılandırma `eslint.config.mjs`'te.
- Kurallar: tanımsız ad hatadır (`no-undef`); kullanılmayan değişken ve içe aktarma hatadır (`no-unused-vars`, `_` önekli adlar hariç).
- Ortamlar: site kodu tarayıcı + worker'da, API işlevleri ve testler Node'da çalışır. Playwright araçlarında ikisi birlikte geçerli, çünkü `page.evaluate` gövdeleri tarayıcıda koşar.
- `npm run lint` denetimi çalıştırır.
- `npm test` artık tüm testleri koşar (önceden yalnız iki testi koşuyordu); hızlı alt küme `npm run test:quick`'te.
- `.github/workflows/denetim.yml` her PR'da ve main'e her gönderimde lint ve testleri çalıştırır. Yalnız denetler, hiçbir şey yazmaz.
- Vercel yayında `npm ci` ile geliştirme bağımlılıklarını kurar (2026-11): yalnız esbuild (küçültme) ve espree (küçültme denetimi) kullanılır; `tools/kucult.mjs` yayımlanacak kopyayı küçültür, depodaki kaynak değişmez. API işlevleri bu paketleri içe aktarmaz.

İlk çalıştırmada 46 bulgu çıktı, hepsi giderildi:
- **Ölü kod:**
  - `ascentsim.solve3`: dördüncü bir Gauss çözücü, hiç çağrılmıyordu.
  - `design.js`'teki `STRICT_PERIGEE`: atanıyor ama hiç okunmuyordu.
  - `cinema.js`'teki `… ? tau : tau` ifadesi: anlamsızdı.
  - `post.js`: kullanılmayan `RenderPass` içe aktarması.
  - Kullanılmayan yerel değişkenler: `worker.js` `LIVE`, `deflect.js` `st`, `halo.js` `fa`/`fb` ve diğerleri.
- **`conic.js`:** Node denetimi `globalThis.process?.versions?.node` biçimine geçti.
- **Testler ve araçlar:** kullanılmayan bağlar `_` önekiyle işaretlendi. Test mantığı değişmedi; yan etkili çağrılar korundu.

**Ortak durum tek nesnede (`appstate.js`).**
- `app.js`'in modül düzeyindeki 13 ortak değişkeni artık belgeli `S` nesnesinde: `K`, `DESIGN`, `START_MS`, `MODE`, `VIEW`, `latest`, `designing`, `running` ve Canlı Gökyüzü katmanları.
- Zamanlayıcı ve sayaç gibi yerel defter tutma `app.js`'te kaldı.
- Ayrılan modüller (`windowscan`, `profilecompare`, `canvasinput`) artık getter çantası almıyor, `S`'yi doğrudan okuyor. Böylece kimin hangi duruma bağlı olduğu içe aktarmalardan görünüyor.
- Değişiklik 217 başvuruyu mekanik olarak `S.` altına taşıdı. Yalnız kod kısımları dönüştürüldü (dizgiler ve yorumlar korundu); nesne kısaltmaları (`{ designing }` → `{ designing: S.designing }`) `node --check` ile tek tek bulundu.

## 8. Yeniden denetim (main üzerinde, tüm adımlardan sonra)

Aynı araçlar güncel main'de baştan çalıştırıldı.

| Ölçüt | İlk denetim | Yeniden denetim | Sonra |
|---|---|---|---|
| Birebir kopya (jscpd, `web/js` + `api` + `tools`) | %1,95, 62 klon | %0,59, 20 klon | %0,39, 13 klon |
| Kullanılmayan dosya (knip) | 0 | 0 | 0 |
| Kullanılmayan dışa aktarım (knip) | 98 | 2 ölü + 83 yalnız içeride | 0 |
| ESLint | denetim yoktu | temiz | temiz |

**Giderilen tekrarlar:**
- `earth.js`'teki kendi `mm` kopyası → `vec3.mm`.
- Görev ve Canlı Gökyüzü kare yerleşimi (kamera, Güneş, Dünya/Ay, yüzey, arazi) → `World.placeFrame`.
- Ay yolu → `World.drawMoonPath`.
- Üç katmandaki aynı ekran etiketi yerleştirici → `screenlabel.js`.
- `$` (10 dosyada) ve `mk` (5 dosyada) DOM yardımcıları → `uiutil.js`.
- `design.js`'teki iki kez yazılmış yükseltme zinciri denetimi → `raiseChainFor`.

**Dışa aktarımlar:**
- Yalnız kendi dosyasında kullanılan 82 adın `export`'u knip ile kaldırıldı.
- Ölü olanlar silindi: `passes.F_E`, `vec3.D2R`, `rigidbody.D2R`.

**Bulunan ve düzeltilen tuzak:** knip'in dışa aktarım düzelticisi `earth.npbFast`'i de "kullanılmıyor" saydı.
- Ama `earth.js` modülü, `live.js`'te `engine.liveProvider(L, EO, …)` çağrısına değer olarak geçiriliyor ve `npbFast` orada çalışma anında çağrılıyor.
- Bunu ne knip ne ESLint statik olarak görebilir. Tam test koşusu yakaladı (`EO.npbFast is not a function`).
- Ardından değer olarak geçirilen tüm modüller (`earth`, `engine`, `mission`, `telemetry`, `cinema`) tarandı. Kaldırılan her ad, kod tabanındaki her `.ad` erişimine karşı denetlendi. Başka kayıp yok; `npbFast` dışa aktarımda kaldı.

**Bilerek bırakılan benzerlikler:**
- `engine.js`'in iki adım döngüsü: sıcak yol, itki yönü farklı.
- Uydu ve asteroit katmanlarının worker iletisi ve seçme döngüleri: farklı çekim parametresi ve çerçeve. Birleştirmek ortak bir nokta katmanı sınıfı ister.
- `astui`/`deflectui`'deki kısa içe aktarma blokları.
- Araç betiklerindeki 8 satırlık GLB yükleyici: yalnız elle çalıştırılan betikler.

**Doğrulama:**
- `npm run lint` temiz, `npm test` tüm testler geçti.
- `test_terrain` sözleşmesi ortak `placeFrame`'e göre güncellendi.
- Tarayıcı akışları yeniden çalıştırıldı.

## 9. Sonraki temel işleri (öneri)

| Öncelik | İş | Neden |
|---|---|---|
| 1 | Uydu ve asteroit katmanları için ortak bir nokta katmanı tabanı | İki katmanda benzer worker iletişimi, seçme ve etiket mantığı |
| 2 | Araç betiklerindeki ortak GLB dönüştürme kodu (`tools/*_modelleri.mjs`, 4 kopya) | Aynı 8 satırlık yükleyici dört betikte |
