# Sinematik gösterim ("fragman" kipi) ve araç görünümü

Bu belge iki şeyi anlatır: (1) görevi NASA fragmanları gibi baştan sona gösteren **Sinematik** kip, (2) hem sinematik kipte hem normal görünümde araç ve çevresinin daha iyi görünmesini sağlayan **ışık, malzeme ve efekt** işleri.
Kod: `web/js/cinema.js` (yönetmen), `web/js/cinemaui.js` + `web/css/cinema.css` (bindirmeler), `web/js/post.js` (son işlem), `web/js/fx.js` (plüm, parçacık, ortam ışığı), `web/js/scene.js` (sahne). Test: `cd web && node test/test_cinema.js`.

**Sinematik kip bir video değil, gerçek simülasyonun kendisidir:** görev baştan kurulur ve fizik motoruyla (N-cisim, 6-DOF, optimal iniş) gerçekten uçurulur; yönetmen yalnız **kamerayı**, **zaman hızını** ve **bindirmeleri** yönetir. Hiçbir konum, yakış ya da kademe ayrılması taklit değildir.

## 1. Kullanım

| Eylem | Nasıl |
|---|---|
| Başlat | alt çubukta **film simgesi** düğmesi, `C` tuşu ya da adreste `?cine=1` (sayı süre ölçeğidir: `?cine=0.5` iki kat hızlı) |
| Çık | `Esc` ya da sağ üstteki **Çık** düğmesi (fare oynayınca belirir); kamera, otomatik zaman hızı ve oynatma durumu eski haline döner |
| Duraklat / sürdür | `Boşluk` |
| Sonraki çekim | `→` |
| Yeniden izle | gösterim bitince `R` |

Gösterim yaklaşık **2 dakika** sürer (Apollo profilinde ~134 s anma süre; halo profillerinde uzun yolculuk nedeniyle 2,5–3 dakikayı bulabilir). Gerçek bir ekran kartında kare hızı düşerse kalite kendiliğinden azalır (bkz. §5).

## 2. Çekim listesi

Çekimler görev planındaki olaylara (INS, TLI, SEP, MCC, LOI, DOI, SEP2, PDI, INDI) ve araç durumuna bağlıdır; altı profilin ve tek/iki kademeli aracın hepsi için aynı kod listeyi plandan kurar (`buildShots`, testte doğrulanır). Sayılar Apollo profili, iki kademe içindir.

| # | Çekim | Kamera | Zaman davranışı |
|---|---|---|---|
| 0 | **açılış** "LS19" | Dünya kıyısı: araç görünen diskin kenarında, aydınlık yüz kameraya dönük; yavaş geri çekilme | yavaş (×5…×30) |
| 1 | **park yörüngesi** (geniş) → **yaklaşma** | Dünya etrafında geniş (yörünge elipsi ve araç ışıltısı) → araç çevresinde LVLH, yavaş dönüş | ×~1000 zaman atlaması → ×1'e yavaşlama |
| 2 | **TLI** ateşleme → yakış | gövde çerçevesinde motor yakın planı (el kamerası titreşimi) → aracın arkasından geniş açı | ateşlemeye kadar ×2, ilk 2 s ×1, sonra ×28 (yakış süresi tasarıma bağlı; **TLI motor kesme**'de biter) |
| 3 | **kademe ayrılması** | omuz üstü (Dünya arkada) → ayrılma düzleminde yakın plan | ×600 → ×1; ayrılma anında **parlama + pufları** |
| 4 | **Ay'a yolculuk** | Dünya geri çekilirken omuz üstü → Dünya–Ay sistemi (yörünge izi, Dünya/Ay/araç ışıltıları) → Ay'a yaklaşma | ×10⁴ … 4·10⁴ (kadar fizik yetişir) |
| 5 | **LOI** | Ay'ın üstünden omuz üstü → motor yakın planı → araç çevresi | ateşlemeye ×1,5'a yavaşlar, yakışta ×18 |
| 6 | **Ay yörüngesi** | Ay etrafında geniş: Güneş'in aydınlattığı yüz kameraya dönük (gece yüzü değil), Ay kadrajın sağında (kart solda); anlık yörünge elipsi, araç ışıltısı | ×~2000 (en çok ~2,7 tur gösterilir; kalanı kararma altında geçilir) |
| 7 | **iniş kademesi ayrılır** | araç çevresinde yakın plan, parlama + pufları | ×6 → ×1 → ×19 |
| 8 | **motorlu iniş** → **yaklaşma** | motor yakın planı → araç çevresi (yaklaşma eksenine bağlı) | **irtifaya göre**: 12 km üstü ×60 … 1,6 km ×22 … 250 m ×8 … 25 m ×3 … temas ×1 |
| 9 | **temas** | iniş noktasına bakan **sabit yer kamerası** (tripod; ~118 m uzakta, göz yüksekliği 1,7 m): araç yukarıdan kadraja iner, kadraj ağır ağır yaklaşır (görüş açısı ~21° → ~10°), yüzeye yakın Ay tozu halkası görünür; yaklaşma çekimi aracı kadraja alacak irtifada (34 m) biter | irtifaya göre, temastan sonra 4,5 s |
| 10 | **kapanış** | aracın çevresinde yavaş yükselen kamera; bakış hafifçe sola döndürülür, araç kadrajın sağında kalır (kart solda) | temas özeti: süre, Δv, temas hızı, kalan yakıt (sayılar `number-flow` ile yuvarlanır); kart açılınca veri şeridi söner (aynı değerler kartta) |

Dokuz **bölüm kartı** vardır (`01 / 09` …): sol altta büyük, geniş aralıklı başlık, ince çizgi ve alt yazı; altta **veri şeridi** (görev süresi, aşama, irtifa/hız ya da Dünya–Ay uzaklığı, zaman hızı) ve **zaman çizelgesi** (bölüm işaretleri). Alt yazılardaki sayılar o anki durumdan gelir.

### 2.1 Zaman hızı denetimi

Fizik ayrı bir iş parçacığında (worker) gerçek zamanın `×warp` katıyla ilerler; yönetmen her 30 ms'de `warp` komutu gönderir. Denetim çizimden bağımsız zamanlayıcıyla yürür (kare hızı düşse de çekim süreleri gerçek zamanda kalır).

* **Zaman hedefli çekimler** (yolculuk, park, ayrılma): her çekimin gerçek süresi (`dur`) ve "çekim ilerlemesi τ → benzetim zamanı" **tekdüze monoton kübik eğrisi** (PCHIP, `T`) vardır. `warp = eğri türevi (ileri besleme) + (hedef − gerçek)/0,8 s`; yumuşak artış, anlık azalış (olayı geçmesin). **Yaklaşma sınırlayıcı:** `warp ≤ kalan benzetim süresi / 0,45 s`; worker→arayüz gecikmesi (~0,3 s) yüzünden yüksek hızda hedefi aşmayı önler.
* **Durum güdümlü çekimler** (yakışlar, iniş): plan zamanları gerçek olaylardan sapar (LOI ateşlemesi planın ~60 s önce, temas ~36 s sonra), yakış süreleri tasarıma bağlıdır (TLI 273 s, LOI 168 s, motorlu iniş ~415 s). Bu yüzden zaman hızı **itki durumundan** (`burnT`: yakışın başlamasından beri gerçek saniye) ve **irtifadan** (`x.local`) gelir, çekimler yakış bitince (`thr = 0`) ya da irtifa eşiğinde biter. Yakışta `warp ≤ 90`: hiçbir yakış atlanmaz.
* **Kararma altında yakalama:** fizik çekimin planlı başlangıcının gerisindeyse (ağır hesap duraklaması) kararma altında `×(kalan/0,9 s)` hızla yetişilir, sonra çekim başlar; önceki çekim hedefi aştıysa çekim atlanır. Worker `warp` alt sınırı yavaş çekim için 0,05'e indirildi (arayüz düğmeleri yine ≥ 1 gönderir).

### 2.2 Kamera düzenekleri

`LVLH` (araç çevresinde küresel az/el/uzaklık, yerel dikey çerçevede; iniş evrelerinde yaklaşma eksenine bağlı), `gövde` (motor çıkışına göre metre cinsinden göz/hedef, yönelim 0,35 s zaman sabitiyle yumuşatılır ki RCS titremesi kamerayı sallamasın), `omuz üstü` (kamera Dünya/Ay'ın karşı tarafında: araç ön planda, cisim arkada), `yerden` (iniş yerinin yaklaşma eksenli çerçevesinde sabit gözlemci; aracı izler ya da `fixed` iken sabit bir iniş noktasına bakar, araç kadraja iner; görüş açısı mesafeye göre), `geniş` (Dünya/Ay/Sistem etrafında; ışık yönüne göre bakış, kıyı bileşimi, bakışı yatırma/döndürme). Hepsi `scene.js`'in `CINE` kamera kipinden çağrılır; çekim başına görüş açısı ve (yakışta) hafif titreşim vardır.

## 3. Bindirmeler ve hareket tasarımı

Bindirmeler DOM'dur (canvas'ın üstünde); hareket **yalnız `transform`, `opacity`, `clip-path`** ile ve CSS geçişleriyle yapılır (`transition: all` ve `scale(0)` yok; test eder). Bir kez izlenen, açıklayıcı/pazarlama türü bir gösteri olduğundan süreler 300 ms'den uzundur (kart açılışı ~1 s, letterbox 0,8 s); eğriler: girişlerde güçlü ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, ekrandaki hareketlerde (letterbox) ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)`.

* **Letterbox** 2,39:1: üst/alt çubuklar `translateY` ile kayar (daha geniş pencerede çubuk yok).
* **Bölüm kartı**: başlık soldan sağa `clip-path` ile açılır, ince çizgi `scaleX`, alt yazı 0,4 s gecikmeyle yükselir (kademeli giriş); çıkış tek `opacity` sönmesi.
* **Kararma / ayrılma parlaması**: tam ekran siyah/beyaz katman, `opacity`.
* **Alt karartma** (`.cine-scrim`): alt kenarda siyahtan saydama yumuşak bir geçiş; Ay, Dünya ya da bulut gibi parlak yüzeylerde veri şeridi ve kartlar okunur kalır; yalnız `opacity` ile belirir, kapanış kartında söner.
* **Azaltılmış hareket** (`prefers-reduced-motion`): letterbox kaymaz, başlık silinmez, parlama yok; yalnız sönme kalır; kamera titreşimi kapanır.
* **Dar / dikey ekran (telefon):** veri şeridi 2×2 ızgaraya, bölüm kartları tam genişliğe geçer, kapanış kartı üstte durur; letterbox çubuğu dikey ekranda yüksekliğin en çok %15'i kadardır (resim alanı kalsın); kısa (yatay telefon) ekranda başlıklar yüksekliğe göre ölçeklenir. Kamera tarafında `cineFov`: en-boy oranı 1,4'ün altına indikçe dikey görüş açısı büyütülür (en çok 2,2×), böylece araç dar kadrajda taşmaz.
* Normal arayüz (HUD, panel, alt çubuk) sinematik kipte `opacity` ile kapanır; işaretçiler, etiketler ve yardımcı çizgiler gizlenir (iz çizgileri yalnız geniş çekimlerde).

## 4. Son işlem hattı (yalnız sinematik kip)

`web/js/post.js`, three.js r170 eklentileriyle (`lib/addons/postprocessing`, MIT) ilk kullanımda kurulur (normal görünümün açılışı yavaşlamaz): **HDR sahne (yarı kayan, 4× MSAA ayrı hedef)** → **UnrealBloom** (eşik 2,0: yalnız yansımalar, plüm çekirdeği, Güneş) → **anamorfik çizgi parlama** (yatay geniş, dikey dar ikinci bloom; yalnız çok parlak noktalar) → **OutputPass** (ACES ton eşleme + sRGB) → **film geçişi** (vinyet, kromatik sapma, hafif S eğrisi, sıcak parlak alan/soğuk gölge, hareketli tane). Tüm özel gölgelendiriciler zaten HDR üretir (ton eşleme son geçişte yapılır). Sinematik kipte ek olarak: Güneş ışıltısı HDR büyür, kameradan soğuk bir **dolgu ışığı** gelir (tutulmada biraz güçlenir; gölgedeki gövde silüete dönmesin), pozlama 0,92'dir.

**Kalite kademeleri:** *yüksek* (MSAA + çizgi parlama) → *orta* (MSAA ve çizgi parlama kapalı) → *düşük* (son işlem yok, doğrudan çizim). Gerçek kare süresi (kısıtlanmamış) ~34 ms'yi 2,5 s boyunca aşarsa bir kademe iner ve ekranda bir kart bildirir; piksel oranı en çok 1,5'e (bellek) sınırlanır.

## 5. Görünüm iyileştirmeleri (normal görünümde de)

* **Dolaylı ışık (IBL, earthshine / moonshine):** haritada yalnız bir ışık lekesi vardır (`makeSpaceEnv`, ön filtrelenmiş küp harita); sahne her karede haritayı Dünya'ya ya da Ay'a doğru döndürür ve şiddetini `albedo × Güneş aydınlığı × (araçtan görünen Güneş'in aydınlattığı kesir) × (açısal alanın haritadaki lekeye oranı, sin²)` olarak ölçekler (Dünya albedosu 0,30, Ay 0,12). Sonuç: alçak Dünya yörüngesinde gölge tarafta güçlü mavi dolgu, Ay yörüngesinde sıcak gri, Ay mesafesinde ihmal edilebilir; tutulmada kapanır. Güneş doğrudan `DirectionalLight`'tır (haritada yok). *Yaklaşıktır:* gerçek yansıtma sahne bağımlıdır (bulut, yüzey), burada tek disk ve kesir çarpanı vardır.
* **Malzemeler (PBR):** kaynak NASA modelleri Maya "blinn" malzemeleridir (metalik yok); `scene.js` içindeki tabloyla malzeme adına göre metalik/pürüzlülük verilir (altın folyo ≈ 0,55/0,36, gri metal 0,4/0,4, beyaz boya 0,05/0,45). Test, tablodaki adların GLB'lerde var olduğunu doğrular.
* **Gölge:** araç her zaman kendi üstüne ve yüzeye gölge atar (±35 m kutu, 2048², Güneş yönünde 0,1 km); kamera 1 km'den uzaktaysa gölge haritası yenilenmez.
* **Motor plümü** (`fx.js`): çıkıştan uca genişleyen kabuk (vakum plümü), üstel sönme, eksen boyunca akan gürültü, hafif şok elmasları, sıcak çekirdek → soğuk kenar renk geçişi (HDR; bloom'u besler), çıkışta HDR ışıma sprite'ı, kameraya 12 m'den yakında solma. LH2/LOX (S-IVB) soluk mavi, hipergolik (SPS, iniş motoru) sıcak. Gaz plümün boyunu ve ışımasını değiştirir. RCS iticileri aynı gölgelendiriciyle (kısa, mavi-beyaz), fizikteki görev oranıyla yanar. **Motor ışığı**: etkin motorun çıkışının 1 m altında nokta ışık (iniş aracında bacakları ve zemini turuncu aydınlatır).
* **Okyanus Güneş parıltısı:** Dünya gölgelendiricisinde küçük, parlak bir çekirdek (`cos⁴⁰⁰`) ve ince bir hâle (`cos⁴⁰`); eskiden geniş ve patlak bir leke bloom ile büyüyor, kıyı ayrıntısını siliyordu.
* **Ayrılma:** yeni kademe ayrıldığında ayrılma düzleminde bir parlama ve 70 puf (aracı izleyen eylemsiz çerçevede, 1–2 s).
* **Ay tozu:** iniş motoru yüzeyin 48 m'sinden yakınken plümün yüzeyi vurduğu noktada ince parçacıklar (saniyede ≤ 4200) radyal olarak savrulur; parçacıklar iniş yerine bağlı çerçevede **balistik** (vakumda sürtünme yok, Ay çekimi 1,62 m/s²) uçar, yere düşünce kaybolur. *Sınır:* bu bir **görsel modeldir** (gerçek regolit püskürmesi ya da parçacık fiziği değildir); sayılar ve boyutlar görünüm için seçilmiştir.

## 6. Sınırlar (dürüstçe)

* Plüm renkleri ve parlaklıkları **stilize**dir: gerçekte vakumda hipergolik (SPS/iniş motoru) ve LH2/LOX alevleri neredeyse görünmezdir; burada görünür ve anlaşılır kılmak için ışıtılırlar.
* Fırlatma gösterilmez (görev park yörüngesinden başlar); "fırlatma" planda yalnız zaman bilgisidir.
* Araç yığını fizik yığınıdır (gerçek Apollo düzeni değil; bkz. [modeller.md](modeller.md)); komuta modülü yoktur.
* Gösterim süresi tasarıma bağlıdır; çok uzun yolculuklu profillerde (halo) yolculuk çekimleri fiziğin yetişebildiği hızla (≤ ×40 000) uzar. Hesap duraklamaları (iniş planlaması) çekimi uzatabilir; kararma altında yakalama bunu toparlar.
* Ses yoktur.
* Doğrulama: `node test/test_cinema.js` (çekim listesi altı profil × tek/iki kademe, zaman eğrileri, plüm geometrisi, parçacıklar, CSS kuralları, bağlantılar) ve tarayıcıda (Chromium + SwiftShader, yazılımla çizim ≈ 1 kare/sn) tam gösterim: denetim çizimden bağımsız olduğu için çekim süreleri gerçek zamanda yürür; kare kare görünümler önizleme (`LS19.cinema.preview(çekim, τ)`) ile alınır.
