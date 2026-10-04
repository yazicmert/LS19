# Araç yönelimi: fizik motorunun taşıdığı durum, kademe görselleri ve bulunan tutarsızlıklar

Bu belge iki rapor edilen sorunun incelemesini ve düzeltmesini anlatır: *"Aya inerken araç bir anlık 360° döngü atıyor"* ve *"Dünya'dan çıkarken ayrılan ilk kademe Ay'a inerken yeniden beliriyor"*.
Kod: `web/js/attitude.js` (yönelim modeli), `web/js/engine.js` (`Propagator`), `web/js/mission.js` (hizalama, güdüm düzeltmeleri, enkaz), `web/js/scene.js` (çizim). Test: `web/test/test_attitude.js`.

> **Güncelleme:** Bu belge, yönelimin fizik motoruna alındığı **kinematik** model ve bulunan tutarsızlıklar içindir (`Mission({ attitude: 'kin' })`; hız sınırlı, torksuz). Varsayılan model artık gerçek **6 serbestlik dereceli rijit cisim dinamiğidir**
> (RCS, gimbal, eylemsizlik, Euler denklemleri): [6dof.md](6dof.md). §1'deki bulgular ve §2.2–2.4'teki düzeltmeler (yakış öncesi hizalama, güdüm düzeltmeleri, kademe görselleri) her iki model için de geçerlidir; §2.1 ve §4 kinematik modeli anlatır.
> İniş görüntüsünün ikinci turu (Ay yörüngesinde takla, gimbal girdabı, itki komutunun sürekliliği, kamera çerçevesi): [6dof.md §5](6dof.md). Araç modelleri artık NASA'nın resmî Apollo modellerinden türetilir: [modeller.md](modeller.md).

## 1. Bulgular

### 1.1 Fizik motorunun yönelimi yoktu; görüntü kendi yönelimini uyduruyordu

`engine.js` bir **nokta kütle** modelidir (konum, hız, kütle: 3 serbestlik derecesi). `Propagator.step(h, kumanda)` her adımda kumandanın verdiği yönde (birim vektör) itki uygular; yönelim durumu yoktur,
yani itki yönü komutla *anında* aynıdır. Sahne (`scene.js`) araç yönelimini ise fizikten bağımsız, kendi kuralıyla buluyordu: yakışta itki yönü, süzülmede merkez cisme göre ileri yön, inişte yerel dikey;
gövde x ekseni merkez cisme göre *yer vektöründen* türetiliyor, hedef yönelime gerçek zamanlı küresel ara değerle (itkide 6 rad/s ≈ 344°/s, itkisizde 1,2 rad/s) gidiliyordu. Fizik ve görüntü aynı yönelimi hiç paylaşmıyordu.

### 1.2 "360° döngü": üç ayrı hata

Eski görüntü hattı Node'da kare kare yeniden üretildi (Apollo, ZEM/ZEV, tek kademe; PDI'dan 400 s önce temastan 5 s sonraya, 1/60 s kare, otomatik zaman hızı):

| Belirti | Neden | Ölçüm |
|---|---|---|
| PDI'da araç yarım tur çevriliyor | Süzülme yönelimi "ileri", yakış yönelimi "ters"; PDI'da komut 180° sıçrıyor, görüntü bunu 344°/s ile kapatıyor (fizik anında uyguluyor) | PDI'dan 0,4 s önce 1 s içinde 179° |
| Düşeye yakın itkide araç ekseni etrafında dönüyor | Gövde x ekseni "yer vektörü" ile z ekseni (≈ yerel dikey) neredeyse paralel: `bodyMatrix` tekil, yuvarlanma açısı sıçrıyor | 0,1 km irtifada yuvarlanma 100–180° / s (eksen kayması 0°) |
| Kapıda (256 m) araç ~1 s baş aşağı sallanıyor | Eski ZEM/ZEV son iniş yasası, istenen ivmenin dikey bileşeni ≤ 0 iken yatış sınırlayıcısıyla yatay bileşenin işaretini çeviriyordu: itki dikeyden **140°** (aşağı) gaz düşerek ~1 s, sonra 40° | 169–180° / s |
| Toplam | | PDI−400 s → temas: **1210° (3,36 tur)** dönüş; yaklaşık 0,5 tur gerekirdi |

Dengeli/serbest optimal modlarda 140° sorunu yoktu ama kapıda (120 m) plan ile son iniş yasası arasında 30–70° komut sıçraması vardı.

### 1.3 "İlk kademe yeniden beliriyor"

Ayrılan kademe her zaman **TLI kademesi modeliyle** (`stage.glb`) çiziliyordu; iki kademeli inişte Ay yörünge kademesi PDI'dan önce ayrılınca da (`SEP2`) TLI kademesi modeli araçtan çıkıyor, araç modeli ise değişmiyordu.
Uzaktaki enkazın işaretçisinin etiketi de sabit "TLI kademesi" yazıyordu (iniş sırasında Ay yörünge kademesinin enkazı için de). Ayrıca yalnız tek enkaz izleniyordu (ikincisi birincinin yerine geçiyordu). Fizik tarafında TLI kademesinin enkazı doğruydu: Ay yakınında araca 1000 km'den, inişte 19.000 km'den daha yakın değildir.

## 2. Çözüm

### 2.1 Fizik motorunda yönelim durumu (`attitude.js`, `Propagator`)

- Durum: kuaterniyon q (gövde → ICRF); **itki ekseni gövde +z**, motor çanı −z. Komut: istenen itki yönü.
- Komuta dönme hızı = min(ω_maks, θ/τ): θ komutla eksen arası açı; iniş aracı sınıfında ω_maks = 15°/s, τ = 0,8 s; büyük itkılı (≥ 50 kN) TLI kademesinde 2°/s (`STAGES`'te kademeye `slew` (°/s) yazılarak değiştirilir).
  θ ≤ 0,5° ise eksen komuta tam oturur (kayan komutları izleyen yakışlarda kalıcı gecikme olmaz). Büyük bir dönme sürerken adım ≤ 1 s (kare kare örnekleme).
- Dönme **en kısa yayladır** (eksen = a × c; tam ters komutta gövde y ekseni: yunuslama). Yuvarlanma yalnız eksen kaymasından doğar, **sıçramaz**: testte her adımda "dönme açısı − eksen kayması" ≤ 1e-15 rad (tam tur ve düşey geçişi dahil).
- **İtki gerçek eksen boyunca** uygulanır (adım ortası ekseni). Yönelim komutla hizalıysa sonuç eski modelle aynıdır (testte iki durum 6e-16 km fark).
- Yönelim seçeneğe bağlıdır (`Mission({ attitude })`; Python uyumluluk kipinde (`compat`) kapalı).

### 2.2 Görev: yakış öncesi hizalama (`mission.js`)

- Süzülürken komut: **ileri yön** (merkez cisme göre hız yönü). Her yakıştan 180 s önce yönelim yakış yönüne çevrilir (RAISE, TLI, MCC/SK/DEP, NRI, LOI, DOI); DOI sonrası **ters yön** (motor ileri) PDI'ya kadar sürdürülür,
  böylece PDI'da çevirme gerekmez (Apollo LM'de olduğu gibi).
- MCC hedeflemesi ateşlemedeki *öngörülen* durumdan, ateşlemeden 180 s önce yapılır (itkisiz süzülme deterministiktir); durum öngörüden sapmışsa (bozulma, elle uçuş) ateşlemede yeniden hedeflenir.
- Yakış başlangıcındaki yönelim hatası (testte): TLI 0,34°, MCC/NRI/SK/DEP 0,00°, LOI 0,002°, DOI 0,01°, PDI 1–5°. TLI/MCC/NRI/SK/DEP/DOI Δv'leri eski modelle ≤ 0,004 m/s farklıdır; yalnız PDI'nın Δv'si değişti (aşağıdaki güdüm düzeltmeleri).
- Temasta araç bacakları üstünde dik durur (kinematik olay). Elle uçuşta seçili yön moduna (ileri, geri, normal…) itkisiz de dönülür.

### 2.3 Güdüm düzeltmeleri

- **ZEM/ZEV:** itki asla aşağı yönde değildir (`limitTilt`: dikey bileşen ≤ 0 ise itki dikey ve en küçük gazla). PDI Δv'si 1913 → 1906 m/s, temasta kalan yakıt 186 → 190 kg (Apollo).
- **Son iniş yasası:** PD kazançları kp 0,15 → 0,06, kd 0,8 → 0,5 s⁻¹ (yönelim gecikmesi altında yatay döngü salınım yapmasın; bkz. tarama aşağıda).
- **Optimal plan, dengeli mod:** ikinci işaretleme konisi (`point2`): son 20 s'de itki dikeyden ≤ 15° (bu basamaklı koniler sonradan kalan süreye göre koni çizelgesiyle değiştirildi: [6dof.md §5](6dof.md)). Plan kapıya dikeye yakın varır; son iniş yasasına geçişte 40–70° dönme ve salınım olmaz.
  Bedeli ~7 kg yakıt (Apollo 209 → 202 kg). *Serbest* mod saf yakıt-optimal kalır (kapıda hızla döner, son iniş dönüşü ~170°).

Yönelim gecikmesinin etkisi (Apollo, tek kademe; kalan yakıt kg, eski yönelimsiz modelle karşılaştırma):

| Yönelim modeli | ZEM/ZEV | dengeli | serbest |
|---|---|---|---|
| yönelimsiz (anlık itki yönü), son iniş yasası kp 0,15 / kd 0,8 | 190 | 209 | 238 |
| yönelim (τ = 1,5 s, 10°/s) | 190 | **çarpar** (yatay 2,8 m/s) | **çarpar** (yatay 7 m/s) |
| yönelim (τ = 0,8 s, 15°/s) + son iniş yasası kp 0,06 / kd 0,5 + dengeli için `point2` | 190 | 202 | 236 |

Yönelim gerçekten fiziğin parçası olduğundan, yavaş yönelimde (τ = 1,5 s) eski son iniş yasası kapıdan sonra salınıp yatay hızla çarpıyordu. Bu, görüntü ile fiziğin artık tutarlı olduğunun da kanıtıdır.

### 2.4 Görüntü (`scene.js`, `worker.js`)

- Sahne yönelimi fizikten alır (durum mesajında `q`); ara değer `Mission.stateAt` içinde (kuaterniyon slerp). Tarayıcıda sahne ↔ fizik yönelimi farkı 0'dır (aşağıda).
- Araç modeli aktif kademeye göre değişir: yığın (üstten alta) iniş aracı / Ay yörünge kademesi (iki kademeli iniş aracı) / TLI kademesi; her kademenin kendi motor alevi. Modeller NASA'nın resmî Apollo modellerinden
  türetilir (iniş aracı LM, Ay yörünge kademesi hizmet modülü, TLI kademesi S-IVB; [modeller.md](modeller.md)); dosya yüklenemezse Ay yörünge kademesi için betikle çizilen yedek (`makeOrbitalStage`) kullanılır.
- **Her ayrılan kademe kendi modeliyle, kendi yörüngesinde, kendi işaretçisi ve adlı etiketiyle ve ayrıldığı andaki eylemsiz sabit yönelimiyle** görev boyunca çizilir (`Mission.debris`, durum mesajında `debris`). Ayrılma itkisi (0,5 m/s) kademenin kendi ekseni
  boyunca, araçtan uzağa uygulanır: TLI'da (ileri yönelim) geriye, inişte (ters yönelim) ileriye.
- Otomatik zaman hızı, yönelim dönerken (komutla eksen arası > 8°: yakış öncesi hizalama, yakış sonrası ileri yöne dönüş) en çok ×5'e iner; böylece dönme izlenebilir, ×45'te bir kareye sıkışıp "sıçrama" gibi görünmez.

## 3. Doğrulama

`node test/test_attitude.js` (33 sınama; kinematik model, `attitude: 'kin'`):

- Dönme matematiği (Rodrigues ile aynı), hız sınırı 15°/s aşılmaz, açı hatası tekdüze azalır (aşım yok), tam ters (180°) komutta tekillik yok, **yuvarlanma sıçramaz** (komut düşeyden ve tam turdan geçerken fark 1e-15 rad).
- Hizalı yönelim itki sonucunu değiştirmez; hizasız ateşlemede itki Δv'si, kayıtlı gerçek eksenlerden beklenenle %0,04 içinde uyuşur ve komutun gerisindedir (5,7°).
- Tam görevler (Apollo ZEM/dengeli/serbest tek kademe, Apollo dengeli/ZEM ve NRHO dengeli iki kademe): kuaterniyonlar birim; açısal hız ≤ kademe sınırı; her adımda dönme = eksen kayması; yakışlar hizalı başlar; itki 2 km altında aşağı yönde değil;
  iniş dönüşü ≤ 400° (dengeli modda son iniş ≤ 60°); temasta dikeyden 0,000°; ayrılan kademeler sırayla (TLI → Ay yörünge) kendi yönelimiyle ve kendi eksenleri boyunca ayrılır.
- Elle uçuş: itkisiz ters yön komutuna ≤ 15°/s ile dönülür; itkili ters yönelimden ileri komuta dönerken Δv önce ters, sonra ileri gelir.

Önce / sonra (Apollo, ZEM/ZEV, tek kademe, PDI−400 s → temas): toplam dönüş **1210° → 189°**; azami açısal hız **344°/s → 15°/s**. Dengeli ve serbest modlarda 209–265° (0,6–0,7 tur).

Tarayıcı (Chromium, iki kademeli araç, dengeli güdüm): hem çalışanın yolladığı durum iletileri hem çizilen kareler kaydedildi (iniş boyunca 11.700, DOI çevresinde 1.764, TLI çevresinde 3.042 ileti).
İletiler arası dönme hızı en çok 15,0°/s (sınır); ardışık iletiler arasındaki en büyük dönme 1,9° (DOI öncesi hizalamanın ilk iletisi; inişte 1,0°), 20°'yi aşan sıçrama yok. DOI'dan ~2 dk önceki 180°'lik ters yöne dönüş 15°/s ile ~12 s sürer,
bu sırada otomatik zaman hızı ×5'e iner. Sahnenin araç yönelimi fizik durumundan 1e-9 içinde aynıdır (kareler). Ayrılmadan sonra TLI yığını görünmez, Ay yörünge kademesi araçta yalnız SEP2'ye dek görünür,
ayrılan iki kademe ayrı enkaz olarak (`0:tli`, `1:orb`) çizilir. Ayrılma anlarında enkaz modeli, bir önceki karedeki yığın kademesinin bulunduğu yerden doğar (TLI kademesi araç orijininden 6,45 m → ilk karede 7,67 m: 3,3 s'lik karede
0,5 m/s ayrılma itkisiyle uyumlu; Ay yörünge kademesi 3,05 m → 3,20 m), yani görüntüde sıçrama yoktur; TLI enkazı SEP2'de araçtan ~19.000 km uzaktadır.

## 4. Sınırlar

Bu (kinematik) model 6 serbestlik dereceli bir rijit cisim **değildir**: dönme momenti, RCS itkiçileri, gimbal, kütle merkezi kayması, yakıt çalkantısı ve ayrılma anındaki devrilme yoktur (bunlar varsayılan 6-DOF modelde vardır: [6dof.md](6dof.md); sınırları §5). Yönelim, hız sınırlı bir **kinematik izleme**dir;
itki ekseninin komuttan gecikmesi ve ateşleme öncesi hizalama modellenir. Kademe değerleri (hız sınırları, enkaz modelleri) temsilidir. Yuvarlanma (itki ekseni etrafında dönüş) serbesttir; güneş paneli ya da iletişim yönelimi modellenmez.
Enkaz kademeler ayrıldığı andaki yönelimini eylemsiz olarak korur (dönme yok). Fizik hâlâ nokta kütledir: yönelim yalnız itki yönünü sınırlar ve görüntüyü belirler.
