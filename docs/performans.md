# Performans denetimi: veri senkronizasyonu, veri görüntüleme, çizim ve açılış

Bu belge, "tüm kodu incele; veri senkronizasyonu ve veri görüntüleme yavaşlığa sebep olmasın" isteğiyle yapılan denetimin bulgularını, düzeltmelerini ve **ölçülen** etkilerini toplar. Görünüm ve fizik davranışı değişmeden kalmalıydı: her düzeltme ya birebir aynı çıktıyı üretir (testle kanıtlı) ya da görüntüyü ekran görüntüsüyle karşılaştırılarak doğrulandı (§6).

## 1. Yöntem ve sınırlar

- Ölçümler Playwright + başsız Chromium ile yapıldı (GPU yok: SwiftShader yazılım çizimi). Bu ortamda **ana iş parçacığının JS süreleri, DOM yazımları, çizim çağrısı ve üçgen sayıları, görev (long task) süreleri güvenilirdir; GPU süreleri değildir.** Gerçek bir ekran kartında GPU işi (doku yükleme, gölgelendirici, doldurma oranı) ayrıca gelir; burada ölçülen kazançlar GPU'nun işini azaltan değişiklikler için "yapılan iş" (çağrı, üçgen) olarak verilir.
- Üç ölçüm türü: (1) **kare başına JS** — ısınmış JIT ile `world.update`, `ui.hud` ve satır işlevleri sıkı döngüde çağrılıp süre ölçüldü (özet tablo profilleyicisiz; işlev bazlı dökümler CDP `Profiler` ile, bu yüzden toplamlara birebir uymaz); (2) **çizim yükü** — `renderer.info` (çağrı, üçgen, geometri, program); (3) **açılış** — `PerformanceObserver('longtask')`, yükleme çubuğu iletileri, kaynak zamanlaması.
- Önce/sonra aynı betiklerle, birbirinin yanında iki statik sunucudan (önceki ağaç ve çalışma ağacı) alındı. Aşağıdaki sayılar tek makinede tek koşudur; büyüklük sırası ve yön için okunmalıdır.

## 2. Veri akışı (worker ↔ arayüz): bulgular

| Konu | Bulgu | Karar |
|---|---|---|
| Durum iletisi | Fizik worker'ı 60 Hz `setInterval` ile ~1,3–2,3 KB'lık `state` iletisi gönderir; iz noktaları ve olaylar aynı iletide gruplanır. Ana iş parçacığı **kendi** `LiveEphemeris`ini aynı çekirdeklerle kurar (deterministik): efemeris iletiyle taşınmaz, ileti küçük kalır | Mimari doğru; değişmedi |
| İleti işleyicisi | Her iletide `$('#chkNbody')` DOM sorgusu (saniyede ~60 kez) | Öğe bir kez alınır |
| Arka plan sekmesi | Fizik worker'ı gizli sekmede de tam hızda (otomatik zaman hızında ~%70 bir çekirdek) koşuyordu; kimse izlemiyor | Sekme gizlenince görev duraklar, dönünce sürer (kullanıcı kendisi duraklattıysa dokunulmaz); `?bg=1` ile kapatılır |
| Optimal iniş yeniden planı | İniş başına ~45 SOCP çözümü (her biri ~50 ms) worker'da; çözüm eşzamanlıdır | **Değiştirilmedi**: belirleyicilik için eşzamanlı olması şart (aynı girdi → aynı yol); ana iş parçacığını etkilemez, yalnız o anki ileti ~50 ms gecikir |
| Nominal Δv | Varsayılan açılış (optimal iniş + iki kademe) her seferinde ~5 sn CPU'luk ayrı bir worker'ı yeniden uçuruyordu (46 MB efemeris + tam görev + SOCP) | Tüm profiller × tüm güdüm/araç birleşimleri önceden hesaplandı (§5.3) |
| Çekirdekleri worker'lara paylaştırmak | Worker'lar DE440 dosyalarını (46 MB) kendileri alır (HTTP önbelleğinden) | **Yapılmadı**: iş zaten worker iş parçacığında (ana iş parçacığını tutmaz) ve önbellekten gelir; `SharedArrayBuffer` çapraz kökenli yalıtım başlıkları ister (statik barındırmada yok); kopya + aktarım bellekte kazandırmaz |

## 3. Veri görüntüleme (DOM, sayı biçimleme, grafik)

Arayüz her 100 ms'de onlarca değeri yeniden yazıyordu; ölçülen darboğazlar:

| Bulgu | Düzeltme | Ölçüm (önce → sonra) |
|---|---|---|
| `Number.prototype.toLocaleString('tr-TR', {…})` her çağrıda yeni `Intl.NumberFormat` kurar | `js/format.js`: basamak sayısı başına önbellekli biçimleyici; HUD, kontrol paneli, gökyüzü ve asteroit arayüzleri ve telemetri kullanır | tek biçimleme **27 µs → 0,6 µs** (`test_format.js`: ≥ 5× şartı, ölçülen 44×; metin `toLocaleString` ile aynı) |
| Aynı metni yeniden atamak bile (`textContent = aynı`) düzeni geçersiz kılar; HUD her güncellemede onlarca düğümü yazıp hemen ardından `clientWidth` gibi okumalarla **zorlanan düzen** üretiyordu | `setText/setWidth` (öncekiyle aynıysa yazma), HUD öğeleri bir kez alınır, rozetler yalnız değişince `innerHTML` | `ui.hud`: park **0,52 → 0,06 ms**, LLO 0,20 → 0,02, iniş 0,37 → 0,02; ayrıca eski sürümde HUD yazımları ardından gelen okumalarla 0,17–0,26 ms'lik zorlanan düzen üretiyordu (CPU örnekleyicili ölçüm), şimdi 0 |
| Kontrol paneli ~250 değeri her güncellemede biçimleyip yazıyordu; Δv bütçe tablosu her seferinde yeniden kuruluyordu | Değerler `setText/setW/setBig` ile yalnız değişince yazılır; tablo yalnız JSON imzası değişince kurulur; tuval renkleri 1 sn önbelleklenir | `controlpanel.update` **2,78 → 0,38 ms** |
| Plan listesi (olaylar) her güncellemede baştan kuruluyordu | Artımlı: öğeler bir kez kurulur, yalnız durum sınıfı/metni değişince yazılır; "yapıldı" haritası olay sürümü değişince | `renderPlan` **0,50 → 0,004 ms** |
| Yörünge/efemeris/kuvvet tabloları her güncellemede `replaceChildren` ile yeniden kuruluyordu | Yerinde satır güncelleyici (`fillRows`); kuvvet satırları bir kez kurulur, metin/çubuk genişliği güncellenir | `ephTab` **0,74 → 0,15**, `orbitTab` **0,15 → 0,018 ms** |
| Grafik her karede (işaretçi hareketinde de) yeniden çiziliyordu | Çizim imzası (`n:son nokta:boyut:dpr:imleç:renk`) değişmediyse atlanır; işaretçi çizimleri rAF'a toplanır; tema renkleri 1 sn önbellekte | `LineChart.draw` **0,54 → 0,19 ms** (değişmeyen karede ~0) |
| Gökyüzü: `Tracker` her karede etiket metnini yeniden yazıyordu; 3 günlük geçiş taraması (uydu başına ~90 ms) tek uzun görevdi, veri her geldiğinde zorlanıyordu | Metin yalnız değişince; tarama bir üretece (`findPassesIter`) çevrildi ve ≤ 8 ms'lik dilimlerle çalışır (aralarda tarayıcıya dönülür, yeni hesap eskisini iptal eder) | uzun görev yok: 33 dilim, en uzun 2 ms; sonuç tek seferlikle aynı (`test_passes.js`) |

## 4. Çizim (CPU ve GPU işi)

| Bulgu | Düzeltme | Ölçüm (önce → sonra) |
|---|---|---|
| Dünya ve Ay ağları (her biri ~1 milyon üçgen) `frustumCulled = false`: görünmeseler de her karede köşe işlemeye giriyordu | Frustum culling açıldı; Ay'ın sınır küresi LOLA yer değiştirmesi (±11 km) için +15 km genişletildi; iniş arazisi (524 bin üçgen) kamera 25.000 km'den uzaktayken gizlenir ve Ay küresindeki delik de kapatılır | araç kamerası: **191 → 28 çizim çağrısı, 2,77 M → 78 bin üçgen**; Dünya kamerası 2,69 M → 1,12 M; Ay 2,69 M → 1,57 M (arazi dahil) |
| NASA modelleri Maya'dan gelir: iniş aracı **157 küçük ağ**, S-IVB 8 (her biri ayrı çizim çağrısı, gölge geçişinde ikinci kez) | `js/meshmerge.js`: aynı malzemeli statik ağlar tek geometride birleşir (dönüşümler köşelere işlenir; yansıtmalı düğümlerde üçgen sırası çevrilir) | iniş aracı **157 → 12 ağ**, S-IVB 8 → 5; sahnede geometri 188 → ~51 |
| İz çizgileri: her karede 40.000 noktalık dizi-dizisi (`[x,y,z]` × 80 bin) gezilip tüm tampon GPU'ya yükleniyordu; görünmeyen izler de | `js/pointstore.js` düz `Float64Array`; iz yalnız görünürken doldurulur; yalnız dolu aralık yüklenir (`addUpdateRange`); osküle yörünge noktaları ara dizi kurmadan doğrudan tampona yazılır; Ay yolu yalnız görünürken | `world.update`: Dünya kamerası 0,65–0,75 → 0,17–0,24 ms; Ay kamerası 0,50–1,01 → 0,15–0,22 ms; araç kamerası 0,68–1,07 → 0,31–0,35 ms (iz, osküle yörünge, tile ve culling işi dahil) |
| Tile katmanı: her karede düğüm anahtarı olarak metin kurma, kuadağaç gezisi (kamera yüzeyden çok uzaktayken bile), tüm tile'lar için görünürlük döngüsü | Sayısal düğüm anahtarı; uzakta (`baseTexelKm`) gezi atlanır; artımlı görünürlük kümesi; `promote` yalnız hazır doku varken; kapalı katman bir kez gizlenir | tile işi (araç kamerası): park 0,48 → **0,08**, LLO 0,74 → 0,28, iniş 0,50 → 0,35 ms (Ay yakınında kuadağaç gerçekten inceltilir) |
| `sphereGeometry`: 3,1 milyon elemanlı JS dizisine `push`, her köşe için `cos/sin` | Doğrudan tipli dizi (dizin sayısı kesin bilinir), boylam `cos/sin` tablosu | Dünya + atmosfer + Ay ağları **~250 → ~60 ms**, çıktı bayt bayt aynı |
| Tile dokuları: çözülmüş `ImageBitmap` (~1 MB) GPU'ya yüklendikten sonra da bellekte kalıyordu (en çok ~770 parça) | GPU yüklemesinden sonra (`onUpdate`) ve atılırken `close()` | tarayıcı belleğinde parça başına 0,25–1 MB serbest |

## 5. Açılış ve yükleme

Eski akış: 9 büyük harita (8192×4096) `<img>` olarak iner, **ilk çizim karesinde** tek seferde GPU'ya gider (`texImage2D` + mip üretimi, ≈1 GB); aynı karede gölgelendiriciler derlenir; ayrıca arazi ana iş parçacığında üretilir (0,85 sn), 4 worker başlar ve nominal koşu 5 sn CPU yakar. Yükleme çubuğu "Görev kuruluyor" üstünde ~12 sn **donuk** kalıyordu (tek ~9,8 sn'lik görev).

### 5.1 Doku hattı (`js/texload.js`, plan: `js/texplan.js`)

- İndirme + çözme ana iş parçacığı dışında (`fetch` → `createImageBitmap`; `imageOrientation: 'flipY'`, alfa/renk dönüşümü kapalı: WebGL bu ayarları `ImageBitmap`te yok sayar). Tarayıcı `flipY` seçeneğini uygulamıyorsa (bazı tarayıcılar sessizce yok sayar) bir kez yoklanır ve eski `<img>` yoluna düşülür.
- **GPU yüklemesi yükleme ekranındayken**, doku başına ayrı görevde, aralarına bir boyama girerek (`renderer.initTexture`); yükleme çubuğu akar, ilk çizim kare donmaz. Çözülmüş bitmap yüklendikten sonra kapatılır.
- Bulut ve özyansıma haritaları **tek kanallı (R8)**: gölgelendirici yalnız `.r` okur (testle doğrulanır). GPU belleği 1,06 GB → **0,91 GB**.
- **Düşük bellek katmanı**: `navigator.deviceMemory ≤ 4` ya da mobil kullanıcı aracısında 8192×4096 haritalar 4096×2048'e (ve Ay normal haritası yarıya) çözülürken küçültülür → **0,28 GB**. `?lowmem=1/0` ile zorlanır. Yakınlaştıkça gelen NASA parçaları ayrıntıyı yine verir.
- Gölgelendiriciler yükleme sırasında önceden derlenir (`compileAsync`; `KHR_parallel_shader_compile` varsa ana iş parçacığını tutmadan). Eşzamanlı hata denetimi paralel derlemeyi engellediğinden derleme sırasında kapatılır, ardından bağlama durumu toplu denetlenir (hata yine konsola düşer). Eklenti yoksa (SwiftShader, bazı tarayıcılar) eşzamanlı `compile` ile yine ilk çizim karesinden önce, yükleme ekranındayken derlenir. Gizli nesnelerin programları da derlendiğinden program sayısı 12 → ~22: ilk kullanımdaki takılma yükleme anına kaydı (bunun maliyeti gerçek GPU'da, paralel derlemeyle, ana iş parçacığını tutmadan ödenir).
- Bağlam kaybı (`webglcontextlost/restored`): bitmap'ler bırakıldığından yeniden yükleme mümkün değildir; bağlam dönünce sayfa **bir kez** yenilenir (30 sn içinde ikinci kayıpta döngüye girmez).

### 5.2 İniş arazisi (`js/terraingen.js`, `js/terrainwork.js`)

Arazi üretimi (263 bin köşe × 7 krater sınıfı, ~0,85 sn) saf sayısal koda (DOM/THREE yok) ayrıldı ve Web Worker'da çalışır; ana iş parçacığı yalnız `BufferGeometry` kurar. Gelene dek aynı öznitelik/malzeme kümesiyle bir **yer tutucu ağ** durur (program önceden derlenir, Ay küresinde delik açılmaz); hazır olunca geometri ve ayrıntı normal haritası yerine geçer. Çıktı eski uygulamayla **bit düzeyinde aynı** (`test_terrain.js` eski kodu referans olarak tutar). Worker açılamazsa aynı kod ana iş parçacığında çalışır.

### 5.3 Hazır nominal Δv ve ertelenen gökyüzü

- `data/designs_default.json` artık her profil için `nominalBy` taşır (`zem+2`, `opt`, `opt+2`, `free`, `free+2`; tek kademe + ZEM zaten `nominal`). Aynı koşu işlevi (`js/nominalrun.js`) hem tarayıcıdaki `nominal.js`'te hem üretici betikte (`node test/make_designs.js --nominal-by`, tasarımlara dokunmaz) kullanılır; test iki birleşimi yeniden uçurup dosyadakiyle bit düzeyinde karşılaştırır. Varsayılan açılış (opt + iki kademe) artık nominal worker'ı çalıştırmaz; önbellek hazır tasarımları da tutar (başka güdüme geçince tekrar hesap yok).
- **Canlı Gökyüzü katmanları** (uydu SGP4 worker'ı + 3B modeller, asteroit kataloğu/DAMIT/worker, takip/asteroit/çarpma arayüzleri, veri güncelleyici ve indirmeleri) açılışta kurulmaz: görev hazır olup arayüz boşa çıkınca (`requestIdleCallback`, en geç 8 sn) ya da gökyüzü çalışma alanı daha önce açılırsa o an kurulur (`?prefetch=1`: hemen). Ay görevi alanında uydu/asteroit zaten çizilmez; kaybedilen bir şey yoktur.
- `<link rel="modulepreload">`: 57 modül (ana grafik + yalnız worker'ın kullandıkları) düz liste olarak HTML ayrıştırılırken paralel inmeye başlar (içe aktarma zinciri tek tek keşfedilince her seviye bir ağ gidiş-dönüşüdür). Liste `test_preload.js` ile modül grafiğinden doğrulanır (`--print` yeniden üretir).

### 5.4 Açılış ölçümü (SwiftShader; yön için)

| Ölçüt | Önce | Sonra |
|---|---|---|
| En uzun ana iş parçacığı görevi | 9,76 sn (ilk çizim karesi) | 3,5 sn (en büyük doku yükleme/derleme parçası) — gerçek GPU'da hepsi çok daha kısa |
| Yükleme ekranı | ~12 sn "Görev kuruluyor" üstünde donuk | doku başına ilerler ("earth_day.jpg (GPU)" …) |
| İlk çizim kareleri arası | 1,25–1,57 sn (bir kare 2,4 sn) | **0,63–0,80 sn** (daha az çizim işi) |
| Açılışta başlayan worker'lar | 4 (fizik, uydu, asteroit, nominal) | 2 (fizik, arazi); uydu/asteroit boşta ya da gökyüzü açılınca |
| Nominal koşu (~5 sn CPU, 46 MB) | her açılışta | yok (hazır) |
| Arazi üretimi (ana iş parçacığı) | ~0,85 sn | 0 (worker) |
| Ağ ve yükleme süresi | 14,9 sn | 14,8 sn (bu ortamda GPU işi baskın; gerçek GPU'da doku yükleme ve derleme kısalır) |

## 6. Doğrulama ve yakalanan hata

- **Testler:** 26 mevcut testin hepsi geçer; yedi yeni test: `test_format.js`, `test_meshmerge.js`, `test_terrain.js`, `test_texplan.js`, `test_nominalby.js`, `test_perfgov.js`, `test_preload.js` (ve `test_passes.js` genişletildi).
- **Görsel gerileme:** sekiz sabit görünüm (park, TLI, Güneş sistemi, Ay, Ay yakın, iniş, yüzey, güneş) önce/sonra ekran görüntüsüyle piksel düzeyinde karşılaştırıldı: dört görünüm **bire bir aynı**, kalanlar yalnızca benzetim zamanı sapmasından (≤ %0,1 piksel).
- **Yakalanan hata (düzeltildi):** ilk mesh birleştirme uygulamasında GLB köşeleri nicelemeli olduğundan (Int16/Int8 *normalized*, ara dizili) matris uygulaması değerleri [−1, 1]'e kırpıp iniş aracını ve S-IVB'yi ezmişti; kaba ekran farkı (%0,35) bunu gizledi, iniş karesinde araca bakınca fark edildi. Düzeltme: öznitelikler önce Float32'ye açılır (`floatGeometry`). Aynı hatayı yakalayacak `test_meshmerge.js` eklendi: yapay sahne + gerçek üç GLB'de birleştirme öncesi/sonrası **dünya uzayı büyüklüklerini** (alan, işaretli hacim/sarım, ağırlık merkezi, ikinci moment, normal–yüz uyumu, sınır kutusu) karşılaştırır; eski uygulamayla çalıştırılınca 5 denetim kırmızıya döner. Modeller ayrıca ayrı bir sahnede sabit kamera/ışıkla çizilip önce/sonra kıyaslandı (≤ 6 piksel fark).

## 7. Çalışma zamanı denetleyicileri ve adres parametreleri

- **Uyarlanır çözünürlük** (`js/perfgov.js`): kare süresinin medyanı sürekli > 24 ms ise piksel oranı 0,25'lik kademelerle (en düşük 1) düşer; ekran hızında ve kestirilen yeni süre eşiğin altındaysa geri çıkar. Salınmaz (bekleme süresi her düşüşte iki kat, yükselince yavaşlayan seviye 30 dk "tavan" sayılır). Nokta katmanlarının (uydu/asteroit) boyutu ekranda sabit kalır. Kapalı: `?adapt=0`, otomasyon (`navigator.webdriver`), sinematik kip (kendi kalitesini yönetir), tasarım ve gizli sekme.
- Parametreler: `?lowmem=1|0` (düşük bellek dokuları), `?adapt=0` (uyarlanır çözünürlüğü kapat), `?bg=1` (arka planda da sürsün), `?prefetch=1` (gökyüzü katmanlarını hemen kur).

## 8. Yapılmayanlar ve nedenleri

| Konu | Neden |
|---|---|
| SOCP yeniden planlarını asenkron/ayrı iş parçacığına bölmek | Belirleyicilik: çözümün zamanlaması yola girer; ana iş parçacığını zaten etkilemiyor |
| Dokuları sıkıştırılmış biçime (KTX2/Basis) çevirmek | GPU belleğini ¼–⅙ düşürür ama araç zinciri (kodlayıcı) ve lisans/yeniden üretim yükü ekler; R8 + düşük bellek katmanı bugünkü ihtiyacı karşılıyor |
| Çekirdekleri worker'larla paylaşmak | §2: kazanç küçük, `SharedArrayBuffer` başlık ister |
| Küre ağı için LOD | Frustum culling + arazi gizleme ana kazancı verdi; ağ LOD'u yakın görünümde görünür kalite riski taşır |
| `SatInstancer` (14 bin uydu) kare başına döngüsü | Kod incelemesine göre tahminen ~1–2 ms ve yalnız Canlı Gökyüzü'nde (bu ortamda uydu verisi indirilemediği için ölçülemedi); seçim her karede yenilenmezse model "zıplar" |
| `world.update` içindeki küçük nesne ayırmaları | Kare başına yığın artışı ölçümde ±10 KB (GC payı ~%1–4); okunabilirlik pahasına değmez |

## 9. Kare başına ana iş parçacığı JS süresi (özet)

`node tools/perf_olcum.mjs kare` (ısınmış JIT, `world.update` + `ui.hud`, profilleyicisiz), ms/kare, önce → sonra:

| Senaryo | Araç yakın kamera | Dünya kamerası | Ay kamerası |
|---|---|---|---|
| Park yörüngesi | 1,59 → **0,37** | 0,76 → 0,20 | 0,70 → 0,22 |
| LLO | 0,88 → **0,37** | 0,66 → 0,17 | 1,01 → 0,18 |
| Motorlu iniş | 1,26 → **0,35** | 0,69 → 0,24 | 0,51 → 0,16 |

Yani kare başına JS 2,4–5,7× azaldı ve 16,7 ms'lik kare bütçesinin ~%2'sine indi. Kalan süre ağırlıkla Ay yakınındaki tile güncellemesi, osküle yörünge noktaları ve `world.update` içindeki konum/yönelim işidir. Gerçek kazanç GPU tarafındadır (çizim çağrısı ve üçgen sayısı, §4) ve doldurma oranına bağlı sahnelerde uyarlanır çözünürlük devreye girer (§7).

## 10. Yeniden üretme

```bash
cd web && python3 sunucu.py &                       # ya da: python3 -m http.server 8765
node tools/perf_olcum.mjs yukleme   # açılış zaman çizelgesi, uzun görevler, ilk çizim kareleri
node tools/perf_olcum.mjs cizim     # kamera kiplerine göre çizim çağrısı / üçgen / geometri / program
node tools/perf_olcum.mjs kare      # kare başına JS (world.update + ui.hud)
```

Betik Playwright + Chromium ister (`npm i -g playwright-core`; tarayıcı yolu `CHROME=` ile verilir) ve varsayılan olarak yazılım çizimiyle (SwiftShader) çalışır, `--gpu` gerçek GPU kullanır. Önce/sonra karşılaştırması için iki ağacı iki kapıdan sunup komutu iki adresle çalıştırın. Testler: `cd web && for t in test/test_*.js; do node $t; done` (33 dosya; `test_profiles.js` ve `test_twostage.js` birkaç dakika sürer).
