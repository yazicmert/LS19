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

- İndirme + çözme ana iş parçacığı dışında (`fetch` → `createImageBitmap`; `imageOrientation: 'flipY'`, alfa/renk dönüşümü kapalı: WebGL bu ayarları `ImageBitmap`te yok sayar). Tarayıcı `flipY` seçeneğini uygulamıyorsa (bazı tarayıcılar sessizce yok sayar) bir kez yoklanır ve eski `<img>` yoluna düşülür; yakınlaştıkça gelen NASA parçaları (`tiles.js`) aynı yoklamayı kullanır (eskiden `flipY`'yi yok sayan tarayıcıda parçalar ters çıkabilirdi).
- **GPU yüklemesi yükleme ekranındayken**, doku başına ayrı görevde, aralarına bir boyama girerek (`renderer.initTexture`); yükleme çubuğu akar, ilk çizim kare donmaz. Çözülmüş bitmap yüklendikten sonra kapatılır.
- Bulut ve özyansıma haritaları **tek kanallı (R8)**: gölgelendirici yalnız `.r` okur (testle doğrulanır). GPU belleği 1,06 GB → **0,91 GB**.
- **Düşük bellek katmanı**: `navigator.deviceMemory ≤ 4` ya da mobil kullanıcı aracısında 8192×4096 haritalar 4096×2048'e (ve Ay normal haritası yarıya) küçültülür → **0,28 GB**. `?lowmem=1/0` ile zorlanır. Yakınlaştıkça gelen NASA parçaları ayrıntıyı yine verir. Katman **üç yolda** çalışır: `createImageBitmap(resize…)` ile çözme sırasında; tarayıcı resize seçeneğini yok sayarsa tuvalde küçültme; `<img>` yedek yolunda tuvalde küçültme (bu yol tam da iOS Safari gibi bellek darken kullanılabilir; ilk sürümde katman orada sessizce devre dışıydı, §11).
- Gölgelendiriciler yükleme sırasında önceden derlenir (`compileAsync`; `KHR_parallel_shader_compile` varsa ana iş parçacığını tutmadan). Eşzamanlı hata denetimi paralel derlemeyi engellediğinden derleme sırasında kapatılır, ardından bağlama durumu toplu denetlenir (hata yine konsola düşer). Eklenti yoksa (SwiftShader, bazı tarayıcılar) eşzamanlı `compile` ile yine ilk çizim karesinden önce, yükleme ekranındayken derlenir. Gizli nesnelerin programları da derlendiğinden program sayısı 12 → ~22: ilk kullanımdaki takılma yükleme anına kaydı (bunun maliyeti gerçek GPU'da, paralel derlemeyle, ana iş parçacığını tutmadan ödenir).
- R8 yüklemesi GL hatası verirse (sürücü/tarayıcı `ImageBitmap` → `RED` dönüşümünü reddederse) doku atılıp RGBA olarak yeniden yüklenir: bulut ve okyanus parıltısı sessizce kaybolmaz.
- Bağlam kaybı (`webglcontextlost/restored`): bitmap'ler bırakıldığından yeniden yükleme mümkün değildir; bağlam dönünce sayfa **bir kez** yenilenir. 30 sn içinde ikinci kayıpta döngüye girmez; yükleme katmanı "Grafik bağlamı tekrar kayboldu … Sayfayı yenileyin" iletisi ve **Sayfayı yenile** düğmesiyle kullanıcıya bildirir (sessizce siyah gezegen yerine).

### 5.2 İniş arazisi (`js/terraingen.js`, `js/terrainwork.js`)

Arazi üretimi (263 bin köşe × 7 krater sınıfı, ~0,85 sn) saf sayısal koda (DOM/THREE yok) ayrıldı ve Web Worker'da çalışır; ana iş parçacığı yalnız `BufferGeometry` kurar. Gelene dek aynı öznitelik/malzeme kümesiyle bir **yer tutucu ağ** durur (program önceden derlenir, Ay küresinde delik açılmaz); hazır olunca geometri ve ayrıntı normal haritası yerine geçer. Çıktı eski uygulamayla **bit düzeyinde aynı** (`test_terrain.js` eski kodu referans olarak tutar). Worker açılamazsa aynı kod ana iş parçacığında çalışır.

### 5.3 Hazır nominal Δv ve ertelenen gökyüzü

- `data/designs_default.json` artık her profil için `nominalBy` taşır (`zem+2`, `opt`, `opt+2`, `free`, `free+2`; tek kademe + ZEM zaten `nominal`). Aynı koşu işlevi (`js/nominalrun.js`) hem tarayıcıdaki `nominal.js`'te hem üretici betikte (`node test/make_designs.js --nominal-by`, tasarımlara dokunmaz) kullanılır; test iki birleşimi yeniden uçurup dosyadakiyle bit düzeyinde karşılaştırır. Varsayılan açılış (opt + iki kademe) artık nominal worker'ı çalıştırmaz; önbellek hazır tasarımları da tutar (başka güdüme geçince tekrar hesap yok).
- **Canlı Gökyüzü katmanları** (uydu SGP4 worker'ı + 3B modeller, asteroit kataloğu/DAMIT/worker, takip/asteroit/çarpma arayüzleri, veri güncelleyici ve indirmeleri) açılışta kurulmaz: görev hazır olup arayüz boşa çıkınca (`requestIdleCallback`, en geç 8 sn) ya da gökyüzü çalışma alanı daha önce açılırsa o an kurulur (`?prefetch=1`: hemen). Görev motorunda (Laboratuvar › Ay görevi) uydu/asteroit zaten çizilmez; kaybedilen bir şey yoktur.
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

- **Uyarlanır çözünürlük** (`js/perfgov.js`): kare süresinin medyanı (40 karelik pencere) sürekli > 24 ms ise piksel oranı 0,25'lik kademelerle (en düşük 1) düşer. Kare süresi GPU maliyetini değil ekranın ritmini de yansıttığı ve darboğaz piksel olmayabileceği için üç korumalı: (1) **düşüşün faydası ölçülür**: sonraki pencerede kare süresi ≥ %5 iyileşmediyse darboğaz piksel değildir (yavaş CPU, köşe işi, iOS Düşük Güç Modu'nun 30 Hz sınırı) → eski oran geri verilir ve 5 dk daha düşürülmez; (2) **geri çıkış**: kare süresi ekran ritmine yakınsa bir kademe denenir, deneme yavaşlatırsa o seviye 30 dk "tavan" sayılır, tavan seviyesinde kare süresi ≥ %15 düşerse (hafif sahne, güç tasarrufu kalktı) tavan kalkar; tabanda takılı kalmaz ve salınmaz; (3) 250 ms'den uzun kareler de (çok yavaş cihaz) ölçülür, yalnız > 1,5 sn'lik duraklamalar ölçümü sıfırlar, birkaç kare sıçraması medyanı bozmaz. Nokta katmanlarının (uydu/asteroit) boyutu ekranda sabit kalır. Kapalı: `?adapt=0`, otomasyon (`navigator.webdriver`), sinematik kip (kendi kalitesini yönetir), tasarım ve gizli sekme. **Taban** (`floorRatio`): yüksek yoğunluklu ekranda oran en çok %25 düşer (2× → 1,5×; 1,5× → 1,25×): 1×'e inmek metin ve kenarlarda belirgin pikselleşme yapıyordu. **Akış sırasında ölçüm yok** (`busy`): yakınlaşırken parçalar GPU'ya yüklenip yumuşak geçiş yaparken (`world.tilesBusy`, yüklemeden sonra 400 ms) kısa takılmalar sahnenin kalıcı yükü sayılmaz; aksi halde yüzey tam netleşirken çözünürlük düşerdi.
- **Parça akışı akıcılığı** (`js/tiles.js`): (1) **yumuşak geçiş**: yeni parça, yerinde önceden çizilen kaba görüntüden (en yakın hazır ata parça; yoksa taban 8K doku) 450 ms'de karışarak gelir — gölgelendiricide iki örnek (`parentMap`, `pXf` uv dönüşümü, `tileFade`) karışır, ek çizim ya da derinlik çatışması yok; Landsat/HLS/Kaguya kaplamaları atası yoksa saydamlıkla belirir. Ata, geçiş bitene dek bellekten atılmaz. (2) **kardeşler birlikte**: aynı atanın hazır dört parçası aynı karede açılır (bütçe en çok 3 aşılır), dörtlünün biri net biri bulanık yamalı görüntü kalmaz. (3) **bakılan yer önce**: istek önceliği uzaklık × (1 + 1,5 · ekran merkezinden açı / yarı köşegen). Sınama: `test_tiles.js` (uv dönüşümü 2400 noktada < 1e-15, kardeş açma, busy, taban, bağlantılar); başsız Chromium'da sahte parçalarla geçiş sayıları ve gölgelendirici derlemesi (hata yok).
- Parametreler: `?lowmem=1|0` (düşük bellek dokuları), `?adapt=0` (uyarlanır çözünürlüğü kapat), `?bg=1` (arka planda da sürsün), `?prefetch=1` (gökyüzü katmanlarını hemen kur), `?olcum=1` (cihazda başarım okuması, §13), `?bant=1` (tam çözünürlüğe yükseltmede bantlı doku yüklemesi, deneme, §13).

## 8. Yapılmayanlar ve nedenleri

| Konu | Neden |
|---|---|
| SOCP yeniden planlarını asenkron/ayrı iş parçacığına bölmek | Belirleyicilik: çözümün zamanlaması yola girer; ana iş parçacığını zaten etkilemiyor |
| Dokuları sıkıştırılmış biçime (KTX2/Basis) çevirmek | GPU belleğini ¼–⅙ düşürür ama araç zinciri (kodlayıcı) ve lisans/yeniden üretim yükü ekler; R8 + düşük bellek katmanı bugünkü ihtiyacı karşılıyor |
| Çekirdekleri worker'larla paylaşmak | §2: kazanç küçük, `SharedArrayBuffer` başlık ister |
| Ay ve gezegen küreleri için LOD | Dünya küresi için yapıldı (§13); Ay kabartmalıdır (LOLA yer değiştirmesi köşe ister), gezegenler yalnız Güneş sistemi görünümünde: sonraki tur |
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
node tools/cihaz_emulasyonu.mjs     # telefon / Safari benzeri yedek yollar / R8 reddi / bağlam kaybı / uyarlanır çözünürlük emülasyonu (§11)
```

Betik Playwright + Chromium ister (`npm i -g playwright-core`; tarayıcı yolu `CHROME=` ile verilir) ve varsayılan olarak yazılım çizimiyle (SwiftShader) çalışır, `--gpu` gerçek GPU kullanır. Önce/sonra karşılaştırması için iki ağacı iki kapıdan sunup komutu iki adresle çalıştırın. Testler: `cd web && for t in test/test_*.js; do node $t; done` (34 dosya; `test_profiles.js` ve `test_twostage.js` birkaç dakika sürer).

## 11. Gerçek cihaz yerine emülasyon denetimi ve bulunan zayıflıklar

§1'deki sınır geçerliydi: ölçümler yazılım çizimiyle yapılmıştı ve uyarlanır çözünürlük ile düşük bellek katmanı **gerçek bir ekran kartında ve telefonda denenmemişti**. Bu ortamda gerçek GPU ya da telefon yok. Bu yüzden gerçek cihazlarda karşılaşılabilecek bozulma biçimleri başsız Chromium'da **taklit edildi** (`tools/cihaz_emulasyonu.mjs`) ve mekanizmalar bu koşullarda sınandı. Bu, gerçek cihaz denemesinin yerine geçmez; ne sınandığı (§11.1), emülasyonda ne bulunup düzeltildiği (§11.2) ve neyin hâlâ sınanamadığı (§11.3) ayrı ayrı yazılıdır.

### 11.1 Senaryolar (`node tools/cihaz_emulasyonu.mjs`)

| Senaryo | Taklit edilen | Denetlenen |
|---|---|---|
| `telefon` | Pixel 7 kullanıcı aracısı, 412×915 CSS pikseli, DPR 2,625, dokunmatik, `deviceMemory = 4` | düşük bellek katmanı adres parametresi olmadan açılır; ana haritalar 4096×2048, Ay normal haritası 2880×1440, LOLA yükseklik haritası dokunulmaz; çizim tamponu = CSS × min(DPR, 2) = 824×1830; park görünümü ve panel ekran görüntüsünde gözle denetlendi (Dünya düz, bulut ve parıltı yerinde, panel ekrana sığıyor) |
| `iphone` | iPhone Safari kullanıcı aracısı, 390×844, DPR 3 (`deviceMemory` yok: kullanıcı aracından) | aynı denetimler (780×1688 tampon) |
| `resize-yok` | `createImageBitmap` resize seçeneklerini sessizce yok sayar | düşük bellek katmanı yine etkin (tuvalde küçültme, 4096×2048); görüntü tarayıcının kendi küçültmesiyle aynı |
| `safari` | `imageOrientation: 'flipY'` yok sayılır (yoklama başarısız → `<img>` yolu) | doku ters değil, bulut RGBA, düşük bellek katmanı yine etkin; görüntü bitmap yoluyla aynı |
| `r8-red` | R8 (`RED`) yüklemesi GL hatası verir (sürücü reddi) | doku RGBA olarak yeniden yüklenir; bulut ve okyanus parıltısı yerinde |
| `baglam-kaybi` | `WEBGL_lose_context` ile kayıp + dönüş | ilk kayıpta bir kez yenileme; 30 sn içinde ikinci kayıpta döngü yok, kullanıcıya düğmeli ileti |
| `uyarlanir`, `uyarlanir-2` | SwiftShader = çok yavaş GPU (araç yakın kamerası, 150–250 ms/kare); `navigator.webdriver` gizlenir (denetleyici otomasyonda kapalı) | oran [1, en çok] içinde; tampon = CSS × oran; salınım yok; yarar sağlamayan düşüş geri alınır |

Görüntü denetimleri aynı görünümün (park yörüngesi, aydınlık Dünya yüzü) ekran görüntülerinin piksel farkıyla yapılır; eşikler ortalama |fark| < 3 ve farkı > 24 olan piksel oranı < %3 (R8 senaryosunda < 1).

### 11.2 Emülasyonda bulunan zayıflıklar ve düzeltmeleri

"Önce" = `b613108` (performans denetimi sürümü), aynı senaryolar.

| # | Bulgu | Önce | Düzeltme | Sonra |
|---|---|---|---|---|
| 1 | Düşük bellek katmanı, `createImageBitmap` resize seçeneğini yok sayan tarayıcıda **sessizce devre dışıydı** | `lowMem = true` ama haritalar 8192×4096 (≈0,9 GB) | çözülen bitmap beklenen boyutta değilse tuvalde küçültülür | 4096×2048 / 2880×1440; görüntü başvuruyla aynı (ort. fark 0,14) |
| 2 | Aynı katman `<img>` yedek yolunda hiç çalışmıyordu (bu yol tam da iOS Safari gibi bellek darken kullanılan yol) | `HTMLImageElement` 8192×4096 | tuvalde küçültme (`imageSmoothingQuality = 'high'`) | `HTMLCanvasElement` 4096×2048; görüntü bitmap yoluyla aynı (ort. fark 0,19) |
| 3 | R8 yüklemesi GL hatası verirse (`INVALID_VALUE`) bulut ve okyanus parıltısı **sessizce** kayboluyordu | başvuruya göre piksellerin %4,24'ü farklı | `gl.getError()` denetimi; hata varsa doku atılıp RGBA yüklenir | piksellerin %0,03'ü farklı (gürültü düzeyi) |
| 4 | Bağlam 30 sn içinde ikinci kez kaybolursa (yenileme döngüsünü önlemek için sayfa yenilenmez) kullanıcıya hiçbir şey söylenmiyordu: siyah gezegen | ileti yok | yükleme katmanında "Grafik bağlamı tekrar kayboldu … Sayfayı yenileyin" iletisi ve **Sayfayı yenile** düğmesi | ileti ve düğme görünür; döngü yok |
| 5 | Uyarlanır çözünürlük, darboğaz piksel değilken (CPU/köşe işi, 30 Hz sınırı) kaliteyi **boşuna** düşürüyordu | 150 ms'lik, çözünürlükten bağımsız karelerde 2 → 1,75; kare süresi değişmedi (150 ms), hiç geri dönmedi | düşüşün yararı ölçülür: sonraki pencerede ≥ %5 iyileşme yoksa eski oran geri verilir ve 5 dk daha düşürülmez | 320×240 (DPR 2): 3 dk'da 2 / 1,75 / 1,5 arasında 4 değişiklik, kare süresi hep 150–200 ms, **sonda 2**; ilk koşuda 43. sn'de 1,75, 49. sn'de yarar yok → 2'ye döndü ve değişmedi |
| 6 | Kısmen doldurma oranına bağlı sahnede (1280×720 tampon) düşüş, yarar varsa sürmeli | (yeni denetim) | — | Bir koşuda 2 → 1,75 → 1,5 → 1,25 → 1; kare süresi 233–250 → 167 ms (−%33); tabanda takılı kalıp salınmadı. Aynı senaryonun öteki koşusunda yarar çıkmadı: 2 → 1,75 → 2 geri alındı. SwiftShader'ın darboğazı iki durumun arasında olduğundan sonuç koşudan koşuya değişir; ikisi de tasarlanan davranıştır |
| 7 | 250 ms'den uzun her kare ölçüm penceresini sıfırlıyordu: çok yavaş cihazda pencere hiç dolmayabilirdi | kod incelemesi | yalnız > 1,5 sn'lik duraklamalar sıfırlar | `test_perfgov.js`: 150 ms/piksel² sahnede en düşük orana iner |
| 8 | Geri çıkış kararı doldurma oranını varsayıyordu (süre ≈ oran²); CPU'ya bağlı sahnede yanlış çıkar, hafif sahneye geçince de tavan 30 dk kilitli kalırdı | kod incelemesi + birim testi | deneme yükseltmesi ve geri alma; tavan seviyesinde kare süresi ≥ %15 düşerse tavan kalkar | `test_perfgov.js`: hafif sahneye geçince ~2 dk içinde en yükseğe döner; 25 dk'da ≤ 4 oran değişikliği |
| 9 | `tiles.js` (yakınlaştıkça gelen NASA parçaları) `flipY` yoklamasını kullanmıyordu: seçeneği yok sayan tarayıcıda parçalar ters çıkabilirdi | kod incelemesi | `texload.bitmapSupported()` yoklaması paylaşıldı; başarısızsa `<img>` yolu | `test_texplan.js` sözleşme denetimi |

Not (5. ve 6. satırlar): karelerin 16,7 ms'nin katlarına (vsync) sıçradığı, %10 gürültülü bu aşırı yavaş rejimde (≈6 kare/sn) ≥ %5 yarar şartı tesadüfen de sağlanabilir; bu yüzden geçici bir 1,5'e iniş görülebilir, ama geri alınır ve oran dalgalanması sınırlıdır (`test_perfgov.js`: CPU'ya bağlı 40 ms'lik sahnede 20 dk'da ≤ 10 değişiklik).

### 11.3 Hâlâ sınanamayanlar (gerçek cihaz gerekir)

- **Gerçek GPU kare süreleri, doldurma oranı ve ısıl kısılma.** SwiftShader CPU'da çizer; uyarlanır çözünürlüğün eşikleri (24 ms, 0,25 kademe, ≥ %5 yarar şartı, 40 karelik pencere) mantık olarak sınandı, gerçek GPU'larda **ayarlanmadı**. Bir telefonda uzun oturumda (ısınma) nasıl davrandığı bilinmiyor.
- **Gerçek bellek baskısı.** 4096×2048 katmanın ≈0,28 GB'lık GPU belleği doku boyutlarından **hesaplanmış** değerdir; iOS Safari'nin sekmeyi bellek yüzünden yeniden yüklemesi ya da Android'in sekmeyi öldürmesi bu ortamda görülemez. Bağlam kaybı yalnız `WEBGL_lose_context` ile taklit edildi.
- **R8 `ImageBitmap` yükleme maliyeti.** SwiftShader'da R8 85 ms, RGBA 206 ms ölçüldü; gerçek sürücülerde `ImageBitmap → RED` dönüşümü CPU'ya geri okuma gerektirebilir. Hata verirse RGBA'ya düşülür (§11.2/3), ama **yavaşlık** gerçek cihazda ölçülmeli.
- **Safari ve Firefox'un kendisi.** Yalnız Chromium'da "seçenek yok sayıldı" ve "`<img>` yedek yolu" taklit edildi; Safari'nin `createImageBitmap` seçenek desteği, WebGL bellek sınırı ve `KHR_parallel_shader_compile` yolu (SwiftShader'da eklenti yok, eşzamanlı yol sınandı) gerçek tarayıcıda görülmeli.
- **Düşük bellek buluşsallığı.** `deviceMemory` Safari/Firefox'ta yoktur; iPadOS'un "Macintosh" kullanıcı aracısı mobil sayılmaz ve sekme otomatik düşük bellek katmanına girmez (elle `?lowmem=1`). `deviceMemory` değeri de yuvarlak ve üst sınırlıdır (≤ 4 eşiği iyi bir telefonu da kapsayabilir).
- **iOS Düşük Güç Modu (30 Hz) ve dokunmatik kullanım.** 30 Hz tavanı birim testinde simüle edildi (oran düşmez, düşerse geri alınır); gerçek telefonda parmakla kullanım, düzenin gerçek yoğunlukta okunabilirliği ve sanal klavye gözle denetlenmedi.

### 11.4 Gerçek cihazda nasıl denenir

1. Sayfayı açıp konsoldan (uzaktan hata ayıklama ya da masaüstü tarayıcıda cihaz kipi) şunlara bakın: `LS19.world.lowMem` (düşük bellek katmanı açık mı), `LS19.world.renderer.getPixelRatio()` (uyarlanır oran), `LS19.world.earthU.dayMap.value.userData.size` (Dünya haritası boyutu), `LS19.world.canvas.width/height`.
2. Karşılaştırma için aynı sayfayı `?lowmem=0` ve `?lowmem=1`, ayrıca `?adapt=0` ile açın; uzaktan bakışta bir telefon ekranında fark beklenmez (görülürse not edin); yakınlaştıkça NASA parçaları ayrıntıyı yine verir.
3. Araç yakın kamerasında (iniş kademesi) birkaç dakika bekleyip oranın kademeli düşüp düşmediğini ve **kare akışının gerçekten iyileşip iyileşmediğini** izleyin; iyileşmiyorsa oran geri verilmelidir (§7).
4. Bulutlar ve okyanus parıltısı görünüyor mu, Dünya düz mü (ters değil mi), panel ekrana sığıyor mu, kontrol edin.

## 12. Ağ yükü: parçalı efemeris, WebP dokular, erken indirme ve önbellek

İlk ziyarette en büyük maliyet koddan değil veriden geliyordu: açılışta iki tam JPL çekirdeği (de440s.bsp 32,7 MB + moon_pa_de440_200625.bpc 12,9 MB) ve dokuz ana doku (44,5 MB JPG/PNG) iniyordu. Telefon da aynı 8192×4096 dosyaları indirip cihazda küçültüyordu.

### 12.1 Parçalı JPL çekirdekleri (`js/ephstore.js`, üretici `tools/efemeris_parcala.mjs`)

- Canlı efemeris DE440'ı yalnız **başlangıç anında** okur (N-cisim tümlemesinin girdisi, `ephem.js`); Efemeris sekmesi görev süresince karşılaştırma için okur. Bir görev oturumu bu yüzden 1–2 yılın kaydına ihtiyaç duyar.
- `web/data/eph/v1/`: `index.json` (segment düzeni, yıllık ızgara E0 + k·365,25 gün), `head.bin` (DAF dosya ve özet kayıtları, segment kuyrukları; 6,6 KB), `y0.bin … y300.bin` (o yıla değen Chebyshev kayıtları, ortalama 121 KB). Kayıtlar özgün dosyadaki **yerlerine** yazılır: `SPKKernel`/`PCKKernel` ve `ChebSegment` aynı tamponu okur, katsayılar **bayt bayt aynıdır**.
- Yüklenmemiş bir kayda erişim sessizce sıfır okumaz: `ChebSegment.loaded` denetimi hata atar. Canlı Gökyüzü saati inmemiş bir yıla atlarsa kayıt indirilir ve o arada gökyüzü karesi atlanır.
- Kullananlar: ana iş parçacığı (açılışta görev tarihinin ve bugünün yılı; `startDesign` başka tarihlerde), fizik worker'ı, nominal worker'ı, saptırma worker'ı (yalnız tarama aralığının yılları: 60 yıllık tarama ≈ 7 MB; eskiden her zaman 32,7 MB). Tam dosyalar yalnız Node testleri ve araçlar içindir; dağıtıma girmez (`.vercelignore`).
- `test/test_ephstore.js`: 10.545 durum (14 gövde + Ay yönelimi, 1850–2150, parça sınırları dahil) parçalı depo = tam çekirdek, **fark 0**; `LiveEphemeris` başlangıç durumu iki kaynaktan bayt bayt aynı; yüklenmemiş kayıtta hata.

### 12.2 WebP dokular ve önceden küçültülmüş düşük bellek dosyaları (`tools/doku_webp.py`, `js/texplan.js`)

| Doku | Özgün | WebP | Yöntem | Düşük bellek (`_lo`) |
|---|---|---|---|---|
| earth_clouds | 11,3 MB | 6,3 MB | gri (tek kanal; özgünde R = G = B), kalite 80, PSNR 37,2 dB (kalite 90'da 9,9 MB, 42,2 dB) | 1,8 MB (4096×2048) |
| moon_height | 8,8 MB | 5,3 MB | **kayıpsız** (çözülen pikseller özgünle aynı) | 1,4 MB (1440×720; 16 bit yükseklik alanında 2×2 ortalama, kayıpsız) |
| moon_color | 7,4 MB | 6,1 MB | kalite 90, PSNR 42,1 dB | 1,5 MB |
| earth_day | 4,5 MB | 2,2 MB | kalite 90, PSNR 41,4 dB | 0,7 MB |
| moon_normal | 4,3 MB | 3,4 MB | kalite 92, PSNR 40,2 dB | 1,2 MB (2880×1440) |
| earth_night | 3,1 MB | 1,1 MB | kalite 90, PSNR 41,1 dB | 0,4 MB |
| earth_normal | 2,0 MB | 1,4 MB | **kayıpsız** | — |
| stars | 1,9 MB | 0,5 MB | kalite 90, PSNR 50,7 dB | 0,2 MB |
| earth_spec | 0,25 MB | 0,1 MB | **kayıpsız** | — |
| **Toplam** | **44,5 MB** | **27,3 MB** | | **8,9 MB** |

- Veri haritaları (yükseklik, normal, özyansıma) kayıpsızdır: gölgelendiricinin okuduğu değerler değişmez. Fotoğraf dokularında PSNR ≥ 40 dB (gözle ayırt edilmez; betik eşiği denetler).
- **Bulut haritası kalite 80 (2026-11):** kalite 90'da tek başına tüm doku indirmesinin ~%40'ıydı (9,9 MB + `_lo` 2,7 MB). Kalite 80'de 6,3 MB + 1,8 MB, PSNR 37,2 dB (eşik 36). Bulut yarı saydam ve yumuşak; Dünya'nın gündüz yüzünde orta mesafeden ekran farkı 44,9 dB, yakın planda büyütülmüş kesitte gözle fark yok. KTX2'deki renk dokuları da benzer düzeyde (35–38 dB).
- Düşük bellekli cihaz (`?lowmem`, `deviceMemory ≤ 4`, mobil UA) artık önceden küçültülmüş dosyayı indirir; cihazda yeniden küçültme yapılmaz.
- **Aşamalı yükleme:** ilk yüklemede **her cihaz** `_lo` dosyalarını alır (9,8 MB; ilk görüntü masaüstünde 29 MB yerine bununla gelir). Masaüstü tam çözünürlüğü sonra, düşük öncelikle ve tek tek çözerek indirir (`scene.js upgradeTextures`): Dünya ve yıldızlar ilk görüntüden 1,5 sn sonra, **Ay dokuları kamera Ay'a ~40 Ay yarıçapı yaklaşınca** (Ay'a hiç gitmeyen ziyaretçi 14,5 MB indirmez). Eski doku, kullanan her malzemede ve uniform'da yenisiyle değiştirilip atılır (iniş arazisi Ay renk dokusunu `map` olarak kullanır). Düşük bellekli cihazda ve veri tasarrufu (`Save-Data`) açıkken yükseltme yapılmaz. Yükseltmenin GPU yüklemesi tarayıcı boştayken yapılır (`requestIdleCallback`, en çok 2 sn bekler).
- **Eşzamanlı `gl.getError` yalnız bir kez:** R8 (tek kanal) desteği eskiden her doku yüklemesinde `getError` ile denetleniyordu. Bu çağrı GPU kuyruğunun bitmesini bekler: 8192'lik dokunun yüklemesi ve mip üretimi süresince ana iş parçacığı donar (yazılım GL ölçümünde yükseltme sırasında 4,5 sn). Artık yalnız ilk R8 dokusunda bir kez denetlenir; R8 reddedilirse sonraki R8 dokular baştan RGBA yüklenir. Yükseklik haritası yedek yolda cihazda küçültülmez (paketli 16 bit değeri bayt ortalaması bozar).
- WebP çözülemezse (eski tarayıcı) ya da bellek darken eşzamanlı çözme düşerse: önce aynı dosya, önceki dokular GPU'ya geçtikten sonra bir kez daha çözülür; yine olmazsa özgün JPG/PNG indirilir (gerekirse cihazda küçültülür). Doku sessizce eksik kalmaz.

### 12.2.1 KTX2 (Basis Universal): ekran kartında sıkıştırılmış dokular (`tools/doku_ktx2.mjs`, `js/texload.js`)

WebP indirmeyi küçültür ama ekran kartında doku yine açılmış RGBA8 olarak durur: 8192×4096'lık bir harita mip'leriyle 171 MB. Masaüstünde tam katmanda dokular ~870 MB, telefonda ~250 MB ekran kartı belleği tutuyordu; ayrıca her dokunun mip'leri GPU'da üretiliyordu. KTX2 (Basis Universal, ETC1S) dosyası tarayıcıda bir web işçisinde ekran kartının kendi sıkıştırılmış biçimine çevrilir (masaüstü BC7, telefon ETC2/ETC1) ve öyle kalır; mip'ler dosyadadır.

| Doku | WebP | KTX2 | PSNR (ETC1S / BC1) | `_lo` WebP → KTX2, PSNR | Ekran kartı (mip dahil) |
|---|---|---|---|---|---|
| earth_day | 2,2 MB | 2,7 MB | 34,9 / 34,3 dB | 0,7 → 0,8 MB, 34,7 dB | 171 → 43 MB (BC7) / 21 MB (BC1, ETC1) |
| earth_night | 1,1 MB | 1,1 MB | 37,7 / 37,2 dB | 0,4 → 0,4 MB, 38,3 dB | 171 → 43 / 21 MB |
| moon_color | 6,0 MB | 5,8 MB | 36,9 / 36,6 dB | 1,4 → 1,5 MB, 36,8 dB | 171 → 43 / 21 MB |
| stars | 0,5 MB | 0,9 MB | 46,0 / 44,3 dB | 0,2 → 0,3 MB, 46,3 dB | 171 → 43 / 21 MB |
| earth_normal (4096×2048) | 1,4 MB | 0,2 MB | 42,7 / 42,2 dB | — | 43 → 11 / 5 MB |

PSNR, sitenin kullandığı çeviriciyle (three r170 `basis_transcoder`) çözülen düzey 0'ın kaynakla karşılaştırmasıdır; WebP dokular 41–51 dB'dir (§12.2). Toplam (`test/test_ktx2.js`): ekran kartı belleği masaüstü tam katmanda **871 → 327 MB** (BC7 varsayımıyla; BC7'siz masaüstünde BC1 ile daha az), telefonda **252 → 65 MB**. İndirme hemen hemen aynı: ilk yükleme 9,8 → 8,8 MB, tam katman 30,8 → 30,3 MB (bulut kalite 80'den sonra: ilk yükleme 7,9 MB, tam katman 26,8 MB).

**KTX2'ye geçmeyenler (ölçüme göre):**
- Bulut ve özyansıma (tek kanal, R8): masaüstünde BC7 de 8 bit/piksel, yani bellek kazancı yok; bulut haritası ETC1S'te 28,8 dB'e düşüyor (ince bulut dokusu). WebP R8 kalır.
- Ay normal haritası: ETC1S'te 31,5 dB (`_lo`) / 34,5 dB; Ay'a yakın planda krater gölgelerinde 4×4 blok izi açıkça görünüyor (üç yollu ekran görüntüsü karşılaştırması: tümü WebP / yalnız Ay rengi KTX2 / renk + normal KTX2; blok izi yalnız normal KTX2 olunca çıkıyor). UASTC denendi: 3,5 kat büyük dosyada 37 dB. WebP kalır.
- Ay yükseklik haritası: 16 bit paketli veri, kayıpsız olmalı.

**Yükleme hattı:** `texload.js` WebGL bağlamından desteği okur (`KTX2Loader.detectSupport`) ve `texplan.js` `ktxConfig` ile süzer: renk dokuları sRGB olduğundan seçilen biçimin sRGB türü olmalı (ASTC, BC7, ETC2'de var; BC1/BC3 için `WEBGL_compressed_texture_s3tc_srgb` gerekir; ETC1 ve PVRTC kapatılır). Uygun biçim yoksa, `?ktx=0` verilmişse ya da bir dosya inmez/çözülemezse o doku WebP yolundan yüklenir (sessizce eksik kalmaz). Çevirici işçileri bir `loadTextures` çağrısı boyunca yaşar, sonra atılır (işçinin WASM belleği 8192'lik dokuda ~100 MB'a büyür ve geri verilmez); yükseltmede yenisi kurulur, çevirici HTTP önbelleğinden gelir. Çevirici (0,6 MB) yükleyici kurulunca hemen iner; `<link rel=preload>` kullanılmadı (§12.3'teki büyük preload yanıtı sorunu). GPU'ya yüklendikten sonra çevrilmiş bloklar bırakılır (bitmap'lerdeki gibi). Erken indirme listesi (`index.html`) KTX2 dosyalarını ister.

**Üretim (`node tools/doku_ktx2.mjs`):** Basis Universal'ın resmî, hazır derlenmiş komut satırı aracı (`basisu_st.wasm`, WASI) sabit bir sürümden indirilir, SHA-256 ile denetlenir ve Node'un WASI korumalı alanında çalışır (yalnız doku klasörünü ve geçici klasörü görür). JS kodlayıcı API'si 12 milyon pikselden büyük görüntüyü reddettiği için komut satırı aracı kullanıldı. Karşılaşılan iki sorun: Node 22'nin WASI'si hızlı API çağrısı içinde çöp toplama tetiklenince çöküyor (SIGSEGV); araç kendini `--no-turbo-fast-api-calls` ile yeniden başlatır. 32 bit WASM'ın 4 GB sınırı yıldız haritasını efor 6'da aşıyor; yıldızlar efor 4 ile kodlanır (araç bellek yetmezse bir kez düşük eforla yeniden dener). Her dosya yazılmadan önce başlığı (boyut, tam mip, sRGB bayrağı) ve PSNR eşiği denetlenir. `test/test_ktx2.js` dosyaları, başlıkları, yönelimi (gece haritası çözülür: şehir ışıkları kuzeyde), `ktxConfig` doğruluk tablosunu, boyut/bellek karşılaştırmasını ve yükleme hattı sözleşmelerini denetler.

**Tarayıcı doğrulaması (başsız Chromium, SwiftShader):** KTX2 yolunda beş doku BC7 olarak yüklenir, masaüstü yükseltmesi (Dünya 8192×4096, Ay rengi 8192×4096) çalışır, konsolda uyarı yok; `?ktx=0` WebP yolu değişmeden çalışır. Dünya görünümleri iki yolda gözle ayırt edilemiyor; Ay yakın planı Ay rengi KTX2 iken WebP'ye çok yakın (ekran PSNR 32,9 dB, blok izi yok).

**Sınırlar:** Gerçek ekran kartlarında (özellikle telefonlarda) sınanmadı; SwiftShader yazılım GL'dir. ETC1S kalitesi WebP'nin altındadır (gündüz haritası 34,9 dB'e karşı 41,4 dB); uzaktan ve orta mesafeden fark görülmedi, Dünya'ya yakında zaten yüzey karoları devreye girer. Çevirici ilk açılışa ~0,6 MB ve işçide çevirme süresi ekler.

### 12.2.2 Uydu listesi sütunlu (`api/gp?group=active&fmt=col`, `js/gpdata.js` `ommFromColumns`)

Etkin uydu listesi (CelesTrak OMM JSON, ~16.900 uydu, her biri 17 alanlı nesne) her açılışta iniyordu: ham 7,1 MB, gzip 1,09 MB; tarayıcı 7 MB'lık metni ana iş parçacığında ayrıştırıyordu. Vekil artık `&fmt=col` ile sütunlu verir (`{ n, cols: { ALAN: [değerler] } }`, alan adları bir kez): ham **2,7 MB**, aktarım **0,75 MB** (yerel ölçüm, gerçek liste; −%31). İstemci (`satlayer.js`) sütunları OMM nesnelerine geri açar; GitHub kopyası, doğrudan CelesTrak ve SupGP dizi olarak kalır. Varsayılan biçim değişmedi: dağıtım sırasında açık kalan eski sekmeler `fmt` göndermez ve dizi alır. Bulutta `api/_lib.js` `ommColumns`, yerelde `sunucu.py` `omm_columns` (aynı ham veri için bir kez çevrilir, bellekte tutulur). Testler: gidiş-dönüş kayıpsız (alan sırası dahil), eksik alan, bozuk biçim; vekil sütunlu yanıtı diziyle aynı açılır, gzip en az %20 küçük, GitHub kopyasına düşüşte de sütunlu; `sunucu.py` ile birebir aynı çıktı (`test_gpdata.js`, `test_api.js`).

### 12.2.3 Yayında JS/CSS küçültme (`tools/kucult.mjs`) ve parçalı testler

**Küçültme:** uygulama kodu Türkçe açıklamalarla dolu ve küçültülmeden sunuluyordu (three.module.js zaten küçük). Yayın sırasında esbuild her dosyayı ayrı küçültür (paketleme yok; modül yapısı, sözdizimi ve lisans yorumları korunur, dosya başına kaynak haritası). Ölçüm: 129 JS + 2 CSS dosyası ham 1,77 → 1,10 MB, gzip 638 → 447 KB (−%30); açılıştaki modül grafiğinde aktarım ~190 KB azalır, tarayıcı da daha az metin ayrıştırır.
- Kaynağı metin olarak işçiye gönderen kütüphaneler (`Function.toString` + `Blob`: KTX2Loader, DRACOLoader, meshopt) ve Emscripten çeviricileri küçültülmez.
- Güvenlik ağı: her JS dosyasında dışa aktarılan adlar ve içe aktarılan modüller (dinamik `import()` ve işçi yolları dahil) önce/sonra karşılaştırılır; fark ya da ayrıştırma hatası yayını durdurur. `--yerinde` yalnız Vercel derlemesinde çalışır (depodaki kaynak okunur kalsın).
- Doğrulama: küçültülmüş kopya başsız Chromium'da açıldı. Uydular (16.872), KTX2 dokuları ve tam çözünürlüğe yükseltme çalıştı, konsol temiz. Laboratuvar arayüzü denemesi (`tools/lab_deneme.mjs`) de koşturuldu.
- Çeviri sistemi ekrandaki metin üzerinde çalıştığı için küçültmeden etkilenmez (metin değerleri değişmez).

**Parçalı testler:** `npm test` toplam süreyi en uzun iki testin tek süreçte koşmasıyla belirliyordu (`test_twostage` 136 sn, `test_pdg` 85 sn). İkisi bağımsız birimlere ayrıldı (görev profilleri, bozulma bölümü, çözücü denetimleri); `test/parca.js` birimleri ölçülen sürelerine göre parçalara dengeli dağıtır, `tools/testler.mjs` twostage'i 4, pdg'yi 3 parça hâlinde paralel koşturur (en uzun parça ~37 sn). Parçaların denetimleri birlikte tam testle aynıdır (twostage 26, pdg 49 denetim); parçada hiç birim ya da denetim yoksa süreç başarısız sayılır. Argümansız çalıştırma (`npm run test:seq`, elle) her şeyi koşar.

### 12.3 Erken indirme, yazı tipi ve önbellek

- `index.html` başındaki küçük betik (`#earlyFetch`), modül grafiği inerken ana dokuları **doğrudan `fetch` ile** (`priority: 'low'`: önce JS) indirmeye başlar ve sözleri `window.LS19_EARLY`'de saklar; `texload.js` aynı sözü kullanır (tek istek). İlk sürüm `<link rel=preload as=fetch>` kullanıyordu: Chromium büyük bir preload yanıtını sonraki `fetch()` ile eşlerken ara sıra "Failed to fetch" verdi ve 11,6 MB'lık yedek JPG gereksiz indi (5 ölçümden 2'sinde); bu yüzden dokular için preload bırakıldı, yalnız küçük efemeris dizini (`index.json`, `head.bin`) preload ile gelir. Başarısız bir doku indirmesi bir kez yeniden denenir. Liste ve düşük bellek kuralı `texplan.js` ile aynıdır; `test_texplan.js` 40 durumda (?lowmem, ?ktx=0, deviceMemory, mobil UA) aynı dosyaların istendiğini denetler.
- Google Fonts stil sayfası artık boyamayı bekletmez (`media=print` → yüklenince `all`; `display=swap`).
- `vercel.json`: `/data/eph/*` bir yıl `immutable` (içerik değişirse klasör adı `v1` değişir). Dokular ve modeller 1 gün taze + 30 gün `stale-while-revalidate` (adları sürümsüz: eskiden 30 gün `immutable` idi, bir doku güncellenince ziyaretçi eskisini bir ay görebilirdi).
- `/lib/*` (three.js ve eklentileri, KTX2 çeviricisi, Clarabel) 1 gün taze + 7 gün `stale-while-revalidate` (2026-11): Vercel'in varsayılanı `max-age=0, must-revalidate` idi, yani her ziyarette ~30 kütüphane dosyası sunucuya yeniden sorulur, KTX2 çeviricisi aynı ziyarette iki kez istenirdi (ilk yükleme ve tam çözünürlüğe yükseltme ayrı yükleyici kurar). Uygulama kodu (`/js/`) bilerek kuralsız: eski ve yeni modüller karışırsa sayfa bozulabilir. Kütüphane sürümü yükseltilirken yol değiştirilmeli (ör. `lib/three-r180/`), yoksa ziyaretçi bir güne kadar eski dosyayı görebilir.

### 12.4 Ölçüm (yerel sunucu, başsız Chromium; ilk ziyaret, `?sats=0&ast=0`)

| | Önce | Sonra |
|---|---|---|
| Açılışta inen JPL verisi | 45,6 MB (iki tam dosya; ayrıca fizik worker'ı aynısını ayrı ister) | ~0,5 MB (2 yıllık parça + dizin) |
| Açılışta inen ana dokular, masaüstü | 44,5 MB | 30,8 MB |
| Açılışta inen ana dokular, telefon | 44,5 MB (cihazda küçültülür) | 13,8 MB |
| Toplam açılış (masaüstü / telefon) | ~92 MB / ~92 MB | 35,3 MB / 18,3 MB |
| Saptırma deneyi (60 yıllık tarama) | +32,7 MB | +~7 MB |

**Aşamalı yüklemeden sonra (2026-11):** ilk görüntüden önce inen doku masaüstünde 29,3 → 9,3 MB (yerel ölçümde hazır olma 2,5 sn); ilk 20 saniyede toplam 31,3 → 24,7 MB (Dünya'nın tam çözünürlüğü dahil); Ay'ın tam çözünürlüğü (14,5 MB) yalnız Ay'a yaklaşınca. Telefonda ilk açılış 15,1 → 11,3 MB (Ay yükseklik haritasının `_lo` sürümüyle).

Sınır: ölçüm yerel sunucuda, ağ gecikmesi ve bant genişliği taklit edilmeden yapıldı; gerçek bağlantıda süre kazancı indirilen baytla orantılıdır (ör. 50 Mbit/sn'de ~92 MB ≈ 15 sn → 35 MB ≈ 6 sn masaüstü, 18 MB ≈ 3 sn telefon).

## 13. Kasım 2026: alt ajanlarla başarım turu (web ve telefon)

Ölçümler başsız Chromium'da yazılım çizimiyle (SwiftShader) yapıldı; telefon Pixel 7 profili (412×915, DPR 2,625, `deviceMemory` 4) ve CDP ile 4 kat yavaşlatılmış işlemciyle taklit edildi (bu yavaşlatma iş parçacıklarına ve GPU sürecine uygulanmaz). Dört ölçüm hattı ayrı yürütüldü; her tarayıcı açılışı tek bir kilitten geçti (aynı anda iki ölçüm işlemciyi paylaşmasın). Her düzeltme ikinci bir turda aynı betiklerle, düzeltilmiş dal ile temel dal karşılaştırılarak doğrulandı.

| Bulgu | Ölçülen | Yapılan | Doğrulama |
|---|---|---|---|
| Dünya küresi kabartmasız (`useHeight` 0) ama her uzaklıkta 1024×512 (1,05 M üçgen) çiziliyordu | EARTH 1,12 M, SYSTEM 2,24 M, SOLAR 2,76 M üçgen | Uzaklığa bağlı ayrıntı düzeyi: kaba ağın (256×128) en kötü ekran kiriş hatası (sagitta s = R(1 − cos(√2·π/256)) ≈ 0,96 km, görüntü köşesi büyümesiyle) 0,2 pikselin altındayken kaba ağ, 0,3'ü aşınca ince ağ (histerezis). Park yörüngesi her zaman ince ağda | EARTH 134 bin, SYSTEM 1,26 M, SOLAR 1,78 M; piksel farkı en kötü %0,032 (> 24/255), park yörüngesinde 0; gökyüzü görünümü ve telefon tamponu dahil |
| Gökyüzü katmanları kurulunca (`initSky`) sahneye üçüncü bir yönlü ışık ekleniyor, iniş aracının 4 programı hazır olduktan sonra yeniden derleniyordu | +180–400 ms bağlama beklemesi; telefonda bir koşuda 2,9 sn'lik uzun görev | Uydu dolgu ışığı sahne kurulurken eklenir (`scene.js` `satFill`), `satmodels.js` onu kullanır | `initSky`'dan sonra yeni program 0, bağlama beklemesi 0 ms (masaüstü ve telefon) |
| Lagrange haritası 2D tuvale `requestAnimationFrame` dışında çiziliyordu; görev sonunda Chrome tuval karesini arkadaki WebGL'in GPU işini bekleterek kapatıyor (`SharedContextRateLimiter`), maske piksel yazımı GPU sürecini tutuyordu | Telefon taklidinde 43–55 sn'lik ana iş parçacığı beklemesi, ardından GPU sürecinde 12,7 sn'lik piksel yazımı (yazılım çizimi; gerçek GPU'da birkaç kare beklenir) | Bütün Lagrange çizimleri kare başında (rAF, kare başına tek çizim); yasak bölge `fillRect` dizileriyle (piksel yazımı yok); halo hesabı ayrı iş parçacığında (`lagrangework.js`) | Halo istekleri 55 sn → 0,16–0,36 sn; ana iş parçacığında > 300 ms görev yok; piksel yazımı 0 |
| Masaüstü tam çözünürlüğe yükseltme: dört 8192×4096 doku, her biri tek çağrıda | Çağrı başına 1,3–5,4 sn (yazılım çizimi), yükseltme boyunca 0,6–1,0 kare/sn | `?bant=1` (deneme, varsayılan kapalı): 2 MB'tan büyük sıkıştırılmış seviyeler ~2 MB'lık satır bantlarıyla, her banttan sonra gerçek bir kare beklenerek | Görüntü birebir aynı; en uzun sıkıştırılmış çağrı ≤ 3 ms; yükseltme sırasında 1,08–1,19 kare/sn (gürültünün az üstünde) ama yükseltme 12–20 sn yerine ~60 sn sürer; R8 bulut dokusu hâlâ tek parça (1,7–3,4 sn). Varsayılan yapılmadı: gerçek GPU'da `?olcum=1` ile karşılaştırılmalı |
| Telefon katmanı KTX2 kullanıyor mu? | Evet (`_lo.ktx2`; SwiftShader'da BC7, gerçek Android'de ETC2 beklenir); hazırdan sonra yalnız iki küçük model dokusu (20–34 ms) | — | Telefonun hazırdan sonraki tek bir ölçümünde görülen 2,6–3,0 sn'lik doku yüklemesi yeniden üretilemedi; NASA parça yüklemeleri de açıklamıyor (47 parça, toplam 165 ms; kare başına en çok 48 ms) |
| Ay görevindeyken gizli gökyüzü katmanları | Yüklendikten sonra iş parçacığı trafiği 0, kare başına ~6 µs (telefonda ~30 µs); başlangıçta `initSky` 37–121 ms, veri yükleme kuyruğu telefonda tam katalogla ~2 sn takılma, gizliyken güncelleyici yeniden yüklemeleri (uydular 2 saatte bir) | Değiştirilmedi: `initSky`'ı ertelemek Canlı Gökyüzü'nün ilk açılışını masaüstünde ~1,5 sn, telefonda ~5 sn yavaşlatır (kullanıcı kararı) | — |
| Gölgelendirici hata denetimini kapatmak | Bekleme kaybolmuyor, `getProgramParameter`'a kayıyor; hazırdan sonra yeni program derlenmiyor | Yapılmadı | — |
| Laboratuvar/gökyüzü/sinema modüllerini tembel yüklemek | Açılıştaki 717 KB (gzip, yayın) JS'in 108 KB'ı | Yapılmadı (en küçük kazanç, `app.js` çakışma noktası) | — |

**Cihazda okuma (`?olcum=1`):** sol altta kutu: son 5 sn'nin kare aralıkları (medyan, %95, en uzun, 50 ms'den uzun kare sayısı), açılıştan beri en uzun kare aralığı ve zamanı, son karenin üçgen ve çizim çağrısı sayısı, çizim oranı ve tampon boyutu, doku katmanı (KTX2/WebP, düşük bellek, Dünya haritası boyutu), uzun görevler (tarayıcı destekliyorsa; Safari'de yok), cihaz bilgisi; **Kopyala** JSON verir. Yalnız bu parametreyle tembel yüklenir.

**Hâlâ gerçek cihaz isteyenler:** `?bant=1`'in gerçek GPU'daki etkisi; bulut (R8) yüklemesi; telefonda ısınma ve Safari bellek sınırı.

