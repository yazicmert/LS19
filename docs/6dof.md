# 6 serbestlik dereceli (rijit cisim) dinamik: tasarım, doğrulama ve sınırlar

Bu belge, aracın yönelimini **gerçek bir rijit cisim dinamiğine** taşıyan değişikliği anlatır: dönme artık komuta hız sınırıyla "ışınlanan" bir kinematik durum değil; denetleyici tork ister, aktüatörler (gimbal ve RCS)
sınırlı yetkiyle tork üretir, Euler denklemleri dönmeyi ilerletir ve itki **gerçek (gimbal sapmalı) eksen boyunca** uygulanır. Öteleme önceki gibi N-cisim çekiminde nokta kütle olarak ilerler; yani model "3 öteleme + 3 dönme" =
6 serbestlik derecelidir.
Kod: `web/js/rigidbody.js` (kütle özellikleri, Euler + kuaterniyon), `web/js/attctl.js` (denetleyici ve aktüatörler, `Dyn6`), `web/js/engine.js` (`Propagator.stepDyn`), `web/js/mission.js` (hizalama, ayrılma), `web/js/telemetry.js`
ve `web/js/controlpanel.js` (panel), `web/js/scene.js` (RCS ve gimbal görselleri). Test: `web/test/test_dynamics6.js` (58 sınama). Önceki kinematik model ve bulunan tutarsızlıklar: [yonelim.md](yonelim.md);
başka açık kaynak projelerden alınan fikirler ve lisans notları: [6dof_arastirma.md](6dof_arastirma.md).

## 1. Neden

Kinematik yönelim ([yonelim.md](yonelim.md)) 360° döngü ve görüntü ↔ fizik uyumsuzluğunu giderdi ama dönmenin kendisi fiziksel değildi: dönme hızı yapay bir sınırdı, RCS, gimbal, eylemsizlik ve kütle merkezi yoktu, itki ekseni komutu
birinci derece gecikmeyle izliyordu. Sonuçları şunlardı: yakıt harcamayan bedava dönme, yakıt azalınca değişmeyen çeviklik, kademe ayrılırken hiç devrilmeyen kademeler, yakışta sistematik yön hatası olmaması. 6-DOF modelde bunların hepsi
ölçülebilir ve sınanabilir hâle gelir.

## 2. Model

### 2.1 Durum ve denklemler

- **Öteleme:** değişmedi. Kütle merkezi, N-cisim çözücüde (`engine.js`, DOPRI5) nokta kütle olarak ilerler; itki, o adımdaki gerçek itki ekseni boyunca uygulanır.
- **Dönme:** gövde açısal hızı ω (gövde çerçevesi), kuaterniyon q (gövde → ICRF, `[x, y, z, w]`), gövde z ekseni itki ekseni (motor çanı −z):

  `I·ω̇ = τ − ω × (I·ω)` (Euler, I köşegen: eksen simetrik yığın) ve `q̇ = ½ q ⊗ [ω, 0]`.

  RK4 ile her denetim periyodunda (iniş aracı ve Ay yörünge kademesi 0,05 s, TLI yığını 0,1 s) ilerletilir; tork bir periyot boyunca sabittir (sıfırıncı derece tutucu). Adım ortası itki ekseni için iki yarım adım atılır ve Simpson
  ortalaması alınır. Kuaterniyon her adımda yeniden normlanır.
- **Toplam tork:** τ = RCS (saf tork çiftleri) + ana motor (τ = r × F, r: kütle merkezinden itki çizgisine; gimbal, motor sapması ve kütle merkezi ofseti dahil) + gravite gradyanı (3μ/r³ · r̂ × I r̂; çok küçük, ama modelde).

### 2.2 Kütle özellikleri (`massProps`)

Yığın üstten alta iniş aracı / (Ay yörünge kademesi) / TLI kademesi olarak dizilir (aralarında 0,15 m boşluk); her kademe iki bileşendir: **kuru gövde** (kütle merkezi kademenin kuru kütle merkezinde olan düzgün silindir) ve **yakıt sütunu** (tankın
kıçına çökmüş düzgün silindir; boyu kalan yakıtla orantılı kısalır). Yığının kütle merkezi ve eylemsizlik tensörü (kütle merkezinde) paralel eksen teoremiyle toplanır; yakıt azaldıkça, kademe atıldıkça ve RCS yakıtı harcandıkça her adım
yeniden hesaplanır. Gimbal kolu ℓ = kütle merkezi − gimbal noktası (gimbal torku = T·ℓ·tan δ).

Kademe rolleri (`ROLES`): iniş aracı, Ay yörünge kademesi, TLI kademesi. Değerler **temsilidir** (belirli bir aracın verisi değildir):

| | iniş aracı | Ay yörünge kademesi | TLI kademesi |
|---|---|---|---|
| gövde (boy × yarıçap) | 4,0 × 1,6 m | 3,4 × 1,45 m | 16 × 1,5 m |
| RCS: itici itkisi · çift/eksen · kol (x, y, z) | 0,45 kN · 1 · 1,5 m | 0,45 kN · 1 · 2,0, 2,0, 1,5 m | 0,45 kN · 2 · 8, 8, 1,6 m |
| RCS: Isp · en küçük darbe · yakıt bütçesi | 285 s · 14 ms · 36 kg | 285 s · 14 ms · 36 kg | 280 s · 20 ms · 60 kg |
| TVC gimbal: açı · hız · gecikme | ±5° · 25°/s · 0,06 s | ±5° · 25°/s · 0,06 s | ±5° · 5°/s · 0,2 s |
| azami dönme hızı: iniş/elle · seyir | 15 · 4 °/s | 8 · 3 °/s | 2 · 1,5 °/s |
| sabit bozucular: kütle merkezi ofseti · motor sapması | 12, 8 mm · 1,0, 0,7 mrad | 12, 8 mm · 0,8, 0,6 mrad | 20, 15 mm · 0,8, 0,6 mrad |

Örnek: dolu iniş aracı I = 4630 kg·m², RCS tork yetkisi 2·n·F·kol = 1350 N·m → 16,7 °/s² açısal ivme; TLI yığında (I ≈ 4·10⁵ kg·m²) 14,4 kN·m / 4·10⁵ → ~2 °/s².

### 2.3 Aktüatörler

- **Gimbal (TVC):** açı sınırı, hız sınırı ve birinci derece gecikme (τ_g). Kırpma (trim) integratörü gimbal biriminde tutulur: kütle merkezi ofseti ve motor sapmasının sabit torkunu sıfırlar, doymada dondurulur
  (anti-windup), yakışlar arasında korunur ve motor kapalıyken gimbal bu konuma getirilir (ateşlemede sıçrama olmaz). Kararlı durumda gimbal = c/ℓ − sapma (itki çizgisi kütle merkezinden geçer); testte kuramla aynı.
- **RCS:** eksen başına tork çiftleri (yetki 2·n·F·kol). Darbe sıklığı modülasyonu (PFM): istenen tork darbesi bir biriktiriciye eklenir; birikim en küçük darbeyi (τ_maks·t_min) aşınca ateşlenir ve verilen darbe birikimden düşer. Böylece
  ortalama tork komutla aynıdır, röle gibi sınır çevrimi (titreme) ve boşa yakıt oluşmaz. Yakıt ṁ = |τ|/(kol·Isp·g₀) kademenin **kuru kütlesinden düşer** (RCS yakıtı kuru kütlenin parçasıdır); bütçe biterse RCS yetkisi sıfırdır.
  İticiler saf tork üretir: RCS'nin kütle merkezine net kuvveti modellenmez.

### 2.4 Denetleyici (`Dyn6.plan`)

1. **Hedef: itki vektörü.** İtki, gövde ekseninden gimbal + sapma kadar kaçıktır; komut "itki çerçevesine" alınır (`toThrustFrame`), bu yüzden kütle merkezi ofseti ve sapma yakışta sistematik yön hatası bırakmaz (bu olmadan MCC-1 yüksekti
   ve TLI zamanlaması kayıyordu). Yakıştan önceki hizalama `aim` bayrağıyla itki vektörünü hedefler: ateşlemede yönelim sıçraması yoktur.
2. **Frenleme eğrisi.** Hata açısı θ'dan dönme hızı komutu: ω_c = √(2·α_B·(θ − θ_lin/2)) (θ_lin içinde doğrusal), α_B = (frenleme payı) × eldeki açısal ivme; en çok ω_maks (iniş fazları ve elle uçuş: `PDI, YAKLASMA, SON_INIS, INDI`) ya da
   seyir hızı (hizalama: RCS yakıtı ∝ I·ω). Motor açıkken pitch/yaw yetkisi esas olarak gimbaldir; RCS yalnız doyma artığını alır (iniş fazlarında RCS'nin tamamı hesaba katılır).
3. **Hız döngüsü.** τ = I·K_ω·(ω_c − ω) + ω × Iω (jiroskopik terim giderilir).
4. **Tahsis.** Motor açıkken yunuslama/sapma torku gimbale (açı ve hız sınırlı), doyma artığı ve yuvarlanma RCS'ye; motor kapalıyken üç eksen RCS ile.
5. **Yarı-durağan tutma (hold).** İtkisiz süzülürken komut ölü bant (0,5°) içinde ve yavaş (< 0,5°/s) ise dönme dinamiği simüle edilmez (3 günlük süzülmede 0,05 s adım kullanılamaz): yönelim komuta oturur, açısal hız komutun dönme hızıdır.
   Dönmeler (komut sıçraması), yakışlar, iniş ve elle uçuş gerçek dinamikle koşar. Tutma modunda sınır çevrimi ve tutma yakıtı **modellenmez** (sınır).
6. **Denetimsiz kip.** RCS yakıtı bitmiş ve gimbal yoksa araç torksuz serbest döner (10 s adımlar); telemetri bunu kırmızı uyarıyla bildirir.

### 2.5 Ayrılan kademeler

Her ayrılan kademe **kendi rijit cismidir**: ayrıldığı andaki yönelim ve açısal hızı (araçtan devralınan + 0,5°/s enine **ayrılma devrilmesi**) ile, kendi kütle özellikleriyle torksuz serbest döner (`freeRot`, Euler denklemleri); araç da açısal
momentumun korunumu için karşı yönde küçük bir devrilme alır. Ayrılma itkisi (0,5 m/s) kademenin kendi ekseni boyuncadır. Kademe asimetrik (Ix = Iy ≠ Iz) olduğundan serbest dönme simetrik topaç dinamiğidir (bağımsız kapalı çözümle sınanır).

### 2.6 Arayüz

- **Sahne:** araç yönelimi fizikten gelen q'dur (fark 0); aktif kademenin motor alevi gimbal açısıyla döner; RCS iticileri fizikteki görev oranlarıyla (x.att.duty) birebir yanar (12 jet: eksen başına iki işaret × iki konum); ayrılan kademeler kendi
  serbest dönme yönelimleriyle çizilir.
- **Kontrol paneli → "Yönelim ve kontrol (6-DOF)":** kip, itki ekseni hatası, açısal hız (p·q·r), gimbal, tork, RCS görev oranı, RCS yakıtı, eylemsizlik, açısal ivme yetkisi, kütle merkezi–gimbal kolu. Uyarılar: denetimsiz dönme (kırmızı), RCS
  yakıtı < %20 (sarı), itki ekseni hatası ≥ 10° ve **≥ 8 s kesintisiz** sürerse (sarı; geçici gecikme sayılmaz).

## 3. Doğrulama

### 3.1 Birim ve bütünleşik sınamalar (`node test/test_dynamics6.js`, 58 sınama, ~25 s)

- **Kütle özellikleri:** kütle merkezi ve eylemsizlik tensörü, bağımsız kaba kuvvet (bileşen başına 38.400 hücre) ile 5 yapılandırmada (tek, iki, üç kademe; farklı yakıt dolulukları) bağıl fark ≤ 6,1·10⁻⁵, kütle merkezi farkı < 0,01 mm; çarpım (köşegen dışı) terimleri ~0.
- **Rijit cisim integratörü:** sabit tork (ω = τt/I ve açı kesin, 10⁻¹²); torksuz simetrik topaç (kapalı çözüm, ≤ 2·10⁻¹¹ rad/s); asimetrik gövdede ara eksen devrilmesi: açısal momentum 10⁻¹⁰, enerji 10⁻¹², |q| 10⁻¹⁶; **RK4
  yakınsama derecesi 4,01**; q̇ = ½ q ⊗ ω tutarlılığı 10⁻⁸; `freeRot` 1 saatte 2·10⁻⁷ rad.
- **Gravite gradyanı:** çubuk gövdenin yerel dikeyde salınım dönemi, bağımsız kuram 2π/(n√(3(I_t−I_z)/I_t)) ile **%0,031** uyumlu (3763,5 s ↔ 3762,3 s).
- **Denetleyici:** eksen kaydırma süresi, zaman-eniyi alt sınırın (θ/ω_s + ω_s/α) **1,00–1,04 katı** (fizikten hızlı olamaz, verimsiz de değil); hız sınırı, RCS tork yetkisi ve aşımsız oturma (0,5° bandından sonra < 1°); RCS yakıtı Σ|τ|h/(kol·Isp·g₀) ile
  birebir ve kuru kütleden düşer; açısal momentum bilançosu ∫R(q)τ dt = ΔL (4·10⁻⁷; tutma kipine geçişte yok sayılan ≤ 0,3°/s kalan hız kadar sapma sınırlıdır); gimbal açı/hız sınırı (5°, 25°/s) ve itki geometrisi r × F bağımsız hesapla;
  kırpma gimbali kuramla aynı (0,671°, −0,445°); RCS bitince torksuz serbest dönme; büyük yığın daha yavaş; seyir/çevik hız sınırı.
- **Propagator:** süzülmede yönelimsiz ile birebir; 60 s yakışta Δv = roket denklemi (Δv 278,683 m/s, 6 hane); yön farkı 0,005°; denetim periyodu 0,2 → 0,0125 s inceltilince konum hatası dt ile azalır (6,0 → 0,6 m, ZOH gecikmesi ~dt/2 olduğu için
  birinci mertebeden; RCS darbeleri ayrık karar olduğundan kesin bir yakınsama derecesi beklenmez).
- **Tam görev:** Apollo, NRHO ve L1; tek/iki kademe; üç güdüm: yumuşak temas, ateşlemede itki vektörü hizası, ω/gimbal/RCS torku sınırları, RCS bütçesi ≤ %70, q ↔ ω tutarlılığı (ardışık adımlarda q'nun gerçek dönme hızı ↔ bildirilen ω,
  ≥ 5.700 örnek, uyumsuz 0), ayrılan kademelerin serbest dönmesi (36 saat sonra |L| ve enerji 10⁻⁸ içinde). **Elle uçuş:** itkisiz 180° dönüş 13,1 s (≤ 15°/s), itkili dönüşte Δv önce ters (−21,8 m/s), sonra ileri.
- Gönderilen **nominal Δv verisi** (`data/designs_default.json`, 6 profil) güncel kodla uçulan bozulmasız görevle birebir aynı (< 0,01 m/s); kod değişince `node test/make_designs.js` ile yenilenir.

### 3.2 Tam görev matrisi

Altı profil (Apollo, Apollo 11, NRHO, L2, L1, yörünge yükseltmeli) × iki araç (tek, iki kademe) × üç güdüm (ZEM/ZEV, dengeli, serbest) = **36 görevin hepsi yumuşak temasla biter** (dikey −1,06…−1,07 m/s; yatay ≤ 0,50 m/s: ZEM/ZEV ≤ 0,14,
dengeli ≤ 0,13, serbest ≤ 0,50). Her görev Node'da 0,5–4 s'de uçulur (20–34 bin denetim adımı).

| | tek kademe | iki kademe |
|---|---|---|
| RCS yakıtı (iniş kademesi, bütçe 36 kg) | 6,6–16,5 kg | 2,1–5,0 kg |
| RCS yakıtı (Ay yörünge kademesi, bütçe 36 kg) | — | 4,5–13,3 kg |
| RCS yakıtı (TLI yığını, bütçe 60 kg) | 0,5–5,4 kg | 0,5–5,4 kg |
| azami açısal hız (sınır 15°/s, iniş) | 15,0–15,3°/s | 15,0–17,0°/s |

Yakışlar (TLI, MCC, NRI, SK, DEP, LOI, DOI) ateşlemede itki vektörü hizasıyla başlar (hata 0,00°); PDI'da önceki ters yönelimle sürüldüğünden 0,3–6,2°. Kalan yakıt (kg, tek → iki kademe, ZEM/ZEV · dengeli · serbest): Apollo 191 · 204 · 239 → 302 · 311 · 334,
NRHO 61 · 74 · 107 → 154 · 164 · 190.

**Kinematik modele göre değişenler** (`attitude: 'kin'` ile karşılaştırma): MCC-1 6,8 → 7,9 m/s (RCS kütle kaybı ve ofsetli itki), PDI Δv ~+1 m/s; serbest güdümde yatay temas hızı iki modelde de 0,2–0,5 m/s; yönelim dönüşleri artık RCS yakıtı harcar. RCS yakıtı kuru
kütlenin parçası olduğundan harcandıkça araç hafifler ve ana motorun Δv kapasitesi artar (≈ +1 m/s / kg RCS; Apollo'da iniş sonunda +8,0 m/s): Δv payı (kalan − gerekli) bozulmasız uçuşta artık sabit değil, RCS tüketimiyle orantılı artar
(testte sınırlandırılır). Yönelimsiz (3-DOF) uçuşta pay hâlâ tam sabittir.

### 3.3 Tarayıcı (Chromium)

İki kademeli araç + dengeli güdüm ve tek kademeli araç + ZEM/ZEV; TLI yakışı ile PDI−330 s → temas boyunca **her kare** kaydedildi (tek: 119, iki kademe: 138 iniş karesi + TLI): sahne araç yönelimi fizik q'suyla aynı (1e-9 içinde, uyumsuz kare 0);
aktif kademenin alevi fizikteki gimbal yönünden en çok 1,2·10⁻⁶° sapar; yanan RCS jeti sayısı fizikteki görev oranlarından beklenenle her karede aynı (RCS yanan 14 + 16 kare); iniş boyunca azami dönme hızı 9,7°/s (ZEM/ZEV) ve 14,7°/s (dengeli); kontrol
panelinin yönelim bölümü canlı güncellenir (kip, hata, ω, gimbal doyması, RCS yakıtı 36,0 → 29,4 kg); ayrılan kademelerin model yönelimi fizikteki enkaz q'suyla aynıdır ve serbest döner (TLI kademesi iniş boyunca 424 s'de 152°, ortalama 0,36°/s);
sayfa hatası yok. Ekran görüntüleri tarayıcı koşusunda alındı (PDI frenlemesi, son iniş, temas).

## 4. Geliştirme sırasında bulunan sorunlar ve çözümleri

| Sorun | Neden | Çözüm |
|---|---|---|
| RCS'de sınır çevrimi: 200 s'de 17 kg yakıt | röle (aç/kapa) ve en küçük darbe | darbe sıklığı modülasyonu (biriktirici); eşik = en küçük darbe (0,5× eşik Nyquist titremesi yapıyordu) |
| tutma ↔ dinamik arasında gidip gelme | tutma kipi kapanma hızını açısal hız yapıyordu | açısal hız = komutun dönme hızı, yönelim komuta oturur |
| düşük itkide gimbal sınırda dönüyordu | frenleme eğrisi RCS yetkisinin tamamını varsayıyordu | gimbal ve RCS payları ayrı (TVC %70, RCS destek %30; iniş fazlarında RCS %100), gimbal 25°/s, gecikme 0,06 s |
| yakışta sistematik yön hatası (MCC-1 yüksek, TLI zamanlaması kayık) | itki vektörü gövde ekseninden kırpma + sapma kadar kaçık | itki vektörü hedeflenir; ateşleme öncesi `aim` ile sıçrama yok |
| komut hızı ileri beslemesi güdüm gürültüsünü büyütüyordu | iniş güdümünün komutu gürültülü | süzgeçli (2 s) ileri besleme yalnız yakış ve seyirde |
| halo/L1 iki kademe: RCS bütçesi bitti, araç 180° yanlış | bütçe küçük, seyir dönmeleri hızlı | bütçeler 36/36/60 kg, seyir dönme hızı sınırı, serbest dönüşte büyük adım |
| RCS yakıtı bitince iniş ya da yönelim kontrolü yok | gimbalsiz serbest kip | torksuz serbest dönme + kırmızı uyarı |
| nominal veride sahte "itki ekseni sapması" uyarısı | geçici gecikme tek örnekte uyarı veriyordu | hata ≥ 10° ve ≥ 8 s kesintisiz sürerse uyarı (`errT`) |

## 5. Sınırlar (dürüstçe)

- **Öteleme nokta kütledir.** RCS iticileri saf tork çiftidir (kütle merkezine net kuvvet yok); gimbalin yan kuvveti ötelemeye zaten işler. Yakıt çalkantısı (slosh), yapısal esneklik, itici arızaları, itki ve Isp dağılımı yoktur.
- **Algılayıcı ve kestirim yok:** denetleyici gerçek durumu mükemmel bilir (jiroskop, yıldız izleyici, gürültü, gecikme modeli yok).
- **Yarı-durağan tutma:** itkisiz süzülürken ölü bant içindeki sınır çevrimi ve tutma yakıtı simüle edilmez; tutma kipine geçişte ≤ 0,3°/s kalan hız yok sayılır. Uzun süzülmede RCS yakıtı bu yüzden gerçekte biraz daha çok harcanırdı.
- **Parametreler temsilidir:** gövde, RCS, gimbal ve denetim değerleri belirli bir aracı temsil etmez; testler fizik ilişkilerini (korunum, kuram, sınırlar) sınar, bir aracın uçuş verisini değil.
- **Dönme hızı sınırı bir komut sınırıdır:** hız döngüsünün izleme gecikmesi nedeniyle gerçek hız geçici olarak sınırın ~%15'i kadar aşabilir (örnek: 17°/s).
- **Güdüm yönelim gecikmesinden habersizdir.** Dengeli optimal güdümde iniş yumuşaktır (yaklaşma ve son iniş eksen hatası rms 3–6°, son inişte en çok ~25°); klasik ZEM/ZEV'in yaklaşma → son iniş geçişinde komut kısa sürede ~40°'ye sıçrar, araç son ~250 m'de
  ±30–40° salınır (hata rms 4–6°, en çok 40°) ve yine yumuşak temasla biter. Serbest (saf yakıt-optimal) modda kapıda ~70° dönülür; bu güdümün doğasıdır. İniş fazlarında RCS tam yetkiyle kullanılır (yönelim hatası rms 7–9° → 4–6°, RCS yakıtı ~%17 artar);
  daha agresif ayar (ω_maks 25°/s, frenleme payı 0,8, K_ω 4) hatayı 3–5°'ye indirir ama RCS yakıtını 1,5–2 katına çıkardığı için seçilmedi. Yaklaşma süresi (ZEM kalan süre alt sınırı) ve son iniş kazançları ya da eğim sınırını değiştirmek belirgin kazanç vermedi
  (eğim sınırını 25°'ye indirmek yatay temas hızını 0,5–1,1 m/s'ye çıkarır, 20°'de iniş çarpar: yaklaşma yayı ~40° eğim ister).
- **Temas:** bacak ve zemin modeli yoktur; temasta araç yerel dikeye oturtulur (kinematik olay; temas öncesi itki ekseni dikeyden ≤ ~2° sapar, görsel düzeltme bu kadardır).
- **Kinematik model** (`Mission({ attitude: 'kin' })`) hafif seçenek ve çapraz kontrol olarak korunur (`test_attitude.js`); Python uyumluluk kipinde (`compat`) yönelim kapalıdır.
