# Fizik denetimi: Laboratuvar ve Canlı Gökyüzü

Laboratuvarın fizik altyapısındaki formüller ve sabitler birincil kaynaklarla ve mantık denetimleriyle (türetme, birim, süreklilik, büyüklük sırası) karşılaştırıldı. Üç sorun bulundu ve düzeltildi; geri kalan her şey kaynaklarla uyumlu çıktı.

## 1. Düzeltilenler

| # | Sorun | Kanıt | Düzeltme | Etki |
|---|---|---|---|---|
| 1 | **Ay PA → ME dönüşümü ters işaretle uygulanıyordu** (`engine.js` `meMatrix`, `loadEphemeris`; `scripts/rocsim_mission_engine.py`) | NAIF `moon_de440_*.tf`: TKFRAME açıları (3,2,1; 67,8526″ 78,6944″ 0,2785″) ME'den PA'ya dönüşümü tanımlar; PA → ME bunun tersidir. Doğru yönle açısal fark 0,02886° ≈ 875 m (NAIF'in verdiği değer). Skyfield aynı yönle Ay yüzeyindeki noktayı HORIZONS'a 101 m içinde uydurur; ters yön 1,75 km verirdi | ME = R1(−0,2785″)·R2(−78,6944″)·R3(−67,8526″)·PA | ME çerçevesi 0,0577° (Ay yüzeyinde **1,75 km**) yanlıştı: Apollo 11 iniş yeri gerçek yerinden ~1,66 km kayıktı; ME enlem/boylamı (telemetri, Ay dokusu yerleşimi) aynı kadar hatalıydı. Çekim PA çerçevesinde hesaplandığı için doğruydu. Hazır tasarımlar (`designs_default.json`, `design_default.json`) ve Python başvuru matrisleri (`ref_engine.json`) yeniden üretildi |
| 2 | **Vallado üstel atmosfer tablosunda 350 km yoğunluğu 9,158e-12** (`impact.js`) | 300 km satırından (2,418e-11, H = 53,628 km) 350 km'ye: 9,517e-12. 350 km satırından (H = 53,298 km) 400 km'ye ancak 9,518e-12 ile tablodaki 3,725e-12'ye bağlanır. arXiv:1610.02156 (Vallado tablosu): 9,518e-12 | 9,518e-12 (rakam yer değiştirmesi) | 350–400 km'de yoğunluk %3,8 düşüktü ve 400 km'de süreksizdi; ör. 400 km, B* = 1e-4 ömür 3,6 → 3,5 yıl |
| 3 | **İniş aracı yatay temas sınırı 1,5 m/s** (`mission.js` `touchdown`, `telemetry.js`, `aytext.js`) | Apollo LM iniş takımı (NASA TN D-6850, Rogers): tasarım başlangıç koşulları dikey 10 ft/s (3,05 m/s), yatay 5 ft/s; yatay sınır sonra **4 ft/s (1,22 m/s)** olarak güncellendi. 1,5 m/s eski 5 ft/s'ye denk düşer | yatay < 1,22 m/s (dikey < 3 m/s aynı) | Başarı ölçütü gerçek araca uydu; nominal inişler (yatay ~0,01 m/s) etkilenmez |

Ek tutarlılık düzeltmesi (yeniden üretim sırasında testle bulundu): nominal koşu (`nominalrun.js` → `nominal.js` worker'ı ve `make_designs.js`) canlı görevin ayarladığı "Ay çevresi" yarıçapını (halo profillerinde 1,25 × apolün; `Mission.prograde` kullanır) ayarlamıyordu; halo profillerinde hazır nominal Δv canlı uçuştan 0,1–0,2 m/s sapıyordu. Artık aynı.

İniş yeri doğru yere taşınınca dengeli optimal güdümün ZEM/ZEV'e göre yakıt kazancı varsayılan profilde 8 → 4 kg oldu (yörünge yükseltmeli profilde eskiden de 5 kg idi); `test_pdg.js`'teki keyfi "≥ 5 kg" payı, aynı dosyadaki profil denetimleri gibi "dengeli > ZEM" yapıldı.

Doğrulama testi: `test/test_moonframe.js` (PA → ME matrisi Skyfield'ın SPICE TKFRAME uygulamasıyla bit düzeyinde aynı; 875 m; eski uygulamanın 1.750 m sapması; motorun ICRF → ME zinciri).

## 2. Kaynaklarla uyumlu bulunanlar

| Alan | Denetim | Sonuç |
|---|---|---|
| GM değerleri (Güneş, Merkür … Plüton, Dünya, Ay) | JPL Astrodynamic Parameters (DE440) | Aynı |
| Güneş 1PN düzeltmesi: a = GM/(c²r³)[(4GM/r − v²) r + 4(r·v) v] | Moyer; Montenbruck & Gill | Aynı |
| Dünya J2 (gerçek kutupla), Ay J2 + C22 (PA çerçevesi) | Potansiyelin gradyanı | Doğru; C22 terimi 3μR²C22(x²−y²)/r⁵'in türevi |
| Ay çekim alanı: GRAIL GRGM1200A (NASA PDS, `gggrx_1200a_sha.tab`), varsayılan 60. derece (veri 100. dereceye kadar), PA çerçevesi; normalleştirilmiş Cunningham V/W özyinelemesi (`js/moongrav.js`) | Bağımsız Legendre toplamı; potansiyelin sayısal gradyanı; 2. derecede kapalı biçimli J2/C22 (`test/test_moongrav.js`) | Potansiyel 3e-14, ivme 1e-8, 2. derece 5e-5 göreli (C21/S22 ≈ 0 ve sabitlerin küçük farkı). 100 km'de 3–60. derecenin katkısı ~0,2–0,35 mm/s²; 60. derecenin 100. dereceye göre rms farkı 100 km'de 0,013, 15 km'de 0,40 mm/s². 30 km altında ivme 1 km × 0,1° ızgarasından üç doğrusal aradeğerlenir (iniş ~35× hızlı); aradeğerleme hatası en çok 0,002 mm/s² |
| Üçüncü cisim (dolaylı terimli), değişken kütleli itki (aşama kütlesi m − ṁcᵢh) | Standart | Doğru |
| DOPRI5 katsayıları ve hata tahmini (b5 − b4), adım denetimi (üs 1/5) | Dormand–Prince tablosu | Tam eşit (elle hesap) |
| Kepler çözümü, öğe → durum, ekliptik eğikliği 84381,448″ | Standart | Doğru |
| B-düzlemi: Ŝ = ê/e + √(1−1/e²)(ĥ×ê), B = b(Ŝ×ĥ), ζ ekseni, bE = R√(1+2μ/(Rv∞²)), r_p | Öpik/Valsecchi; türetme | Doğru |
| Apophis 2029 yakın geçişi | JPL CAD | 38.013,3 km (JPL 38.011,5; fark 1,8 km); v∞ 5,84 km/s |
| Doğrusal STM ↔ doğrusal olmayan çözüm | — | Δξ 57,4 / 57,6 km, Δζ 2.276,6 / 2.276,5 km |
| Büyüklük sırası: 1 cm/s, 2,3 yıl önce | ≈ 3·Δv·t ≈ 2.180 km | Δζ 2.277 km |
| Kinetik çarpıcı Δv = βmU/(M+m), DART | Thomas vd. 2023 (ΔP = −33,0 ± 1,0 dk) | Model ΔP 32,8 dk |
| H → çap: D = 1329/√p · 10^(−H/5); Ay uzaklığı 384.399 km | Standart | Doğru |
| SGP4 B* yoğunluğu ((q0−s)/(r−s))⁴, s kuralı (156/98 km), da/dt = −Kρ√(μa), ṅ (TLE'de ṅ/2) dönüşümü | Hoots & Roehrich (SPACETRACK #3) | Doğru |
| Yakıt-optimal iniş: z = ln m, σ gevşetmesi, Taylor itki sınırları, dönen çerçeve terimleri | Açıkmeşe & Ploen 2007; Açıkmeşe vd. 2013 | Uyumlu |
| CR3BP denklemleri ve Hessian, μ = 0,01215; Euler denklemleri; kuaterniyon kinematiği | Standart | Doğru |
| Telemetri: Bowring jeodezik, hiperbolik/eliptik zaman, durma yüksekliği v²/2(a−g), askıda kalma gazı, Tsiolkovsky, disk örtülmesi | Standart; Montenbruck & Gill §3.4.2 | Doğru |

## 3. Sınırlar

- NAIF, NTRS ve ALSJ belgeleri bu oturumda doğrudan açılamadı (ağ izni); 1 ve 3 numaralı bulgular arama özetleri, Skyfield kaynak kodu ve HORIZONS'a dayalı testi, sayısal tutarlılık (875 m) ve ikincil kaynaklarla doğrulandı.
- DART'ın β ≈ 3,61 ve Δv_T = 2,70 mm/s değerleri kaynakta doğrulanamadı; yalnız ölçülen periyot değişimi (Thomas vd. 2023) doğrulandı.
- Yarkovsky etkisi, öteki asteroitlerin çekimi ve Ay için B-düzleminde ikinci cisim modelde yoktur (belgelenmiş varsayımlar).

## 4. Canlı Gökyüzü

Canlı Gökyüzü'nün fiziği (Dünya yönelimi, canlı N-cisim efemerisi ve Ay dönmesi, uydular ve geçiş tahmini, gözlemci görünümü, asteroitler, gezegenlerin dönmesi) aynı yöntemle denetlendi.

### 4.1 Düzeltilenler

| # | Sorun | Kanıt | Düzeltme | Etki |
|---|---|---|---|---|
| 4 | **Gözlemci kamerası gözlemciyi elipsoid yerine küre üstüne koyuyordu** (`app.js` `obsPose` → `tracker.obsIcrf`: aynı jeodezik enlemle R = 6378 km'lik küre, dikey = radyal) | Küre ile WGS-84 noktası arası 41° enlemde 23 km (20°: 14 km, 60°: 24,5 km); 580 km'deki ISS'te ≈ 2,3° yön hatası. Geçiş tablosu (`passes.lookAngles`) gerçek elipsoidi kullandığından ekrandaki uydu tablodaki az/el'den sapıyordu; ISS'in 67° geçişinde ölçülen en büyük sapma **1,91°** | `passes.observerFrame`: WGS-84 noktası + jeodezik dikey (elipsoid normali), `earth.js` Dünya yönelimiyle ICRF'ye; `tracker.obsTrue`. Gözlemci kipinde Dünya küresi çizilmediği için görsel yan etkisi yoktur; küre üstündeki işaret (`obsIcrf`) Dünya görünümünde kalır | Kameradan görülen yükseklik geçiş tablosuyla aynı (fark 2e-14°) |
| 5 | **Takip listesi ve "Gökte izle", TEME'yi tarihin gerçek ekvatoru sayıyordu** (`tracker.icrfOf`, `ecfToIcrf`: ekinoks denklemi atlanıyordu) | Vallado: r_TOD = R3(−Eq)·r_TEME; uydu worker'ı (`sats.js`) bunu yapıyordu, takip katmanı yapmıyordu (≤ 1,2″ tutarsızlık) | Dönüşüm `earth.temeToIcrf`'te tek yerde; worker, takip listesi ve "Gökte izle" aynısını kullanır | İki katman aynı çerçevede |
| 6 | `passes.js` açıklaması "nütasyon/kutup hareketi ihmal, < 50 m" diyordu | TEME → PEF için GMST, Vallado'nun SGP4 için önerdiği standart dönüşümdür (nütasyon TEME'nin içinde); gerçek ihmaller UT1 yerine UTC (≤ 0,9 s) ve kutup hareketidir | Açıklama düzeltildi; ihmallerin büyüklüğü yazıldı | Yalnız belge |

Çapraz denetim (`test/test_passes.js`): TEME → ICRF → ITRF (IAU 2006/2000A + ΔT tablosu) ile TEME → PEF (GMST) aynı yer noktasını 44,5 m içinde verir; beklenen değer UT1−UTC ihmalidir: 0,088 s × 465 m/s × (r/R) ≈ 43 m.

### 4.2 Kaynaklarla uyumlu bulunanlar

| Alan | Denetim | Sonuç |
|---|---|---|
| Fukushima–Williams presesyon açıları, IAU 2006 eğikliği, nut06a J2 uyarlaması (0,4697e-6, −2,7774e-6 t) | ERFA `pfw06`, `obl06`, `nut06a` | Katsayılar aynı |
| ERA, GMST06, ekinoks denklemi (en büyük iki tamamlayıcı terim), Ay düğümü Ω | ERFA `era00`, `gmst06`, `ee06a`; IERS 2003 | Aynı (tamamlayıcı terimlerin geri kalanı µas mertebesinde) |
| ΔT tablosu | IERS (UT1−UTC: 2020 −0,18 s, 2024 ≈ 0, 2026 ≈ +0,09 s) | Uyumlu |
| Canlı efemeris: N-cisim + 1PN, Dünya J2 ↔ Ay (tepkili), Ay J2/C22 ↔ Dünya, MacCullagh torku N = 3GM s×(I s)/r⁵ | Standart | Doğru |
| Ay eylemsizlik momentleri: A = C − J2 − 2C22, B = A + 4C22 (C/MR² = 0,393112) | J2 = (C − (A+B)/2)/MR², C22 = (B − A)/4MR² | Doğru |
| 3-1-3 Euler açı hızlarından gövde ω'sı; PA açılarının geri çıkarılması (`paEuler`) | Türetme | Doğru |
| Beşinci derece Hermite ara değeri ve türevleri | Temel fonksiyonlar | Doğru |
| SGP4 → TEME → GCRS (`sats.js`) | Vallado | Doğru |
| Geçiş tahmini: WGS-84, ENU bakış açıları, kapsama açısı λ = acos(R cos e/(R+h)) − e, Almanak Güneş formülü, görünürlük (uydu aydınlık, Güneş < −6°) | Skyfield (7/7 geçiş, 0,6 s, 0,007°) | Uyumlu |
| Asteroitler: SBDB öğelerinden Kepler çözümü, ekliptik → ICRF, GPU'da kısa süreli ileri taşıma r + v·dt − ½GM r/r³ dt² | Standart | Doğru |
| Ay yörüngesindeki uydular: HORIZONS vektörleri (Ay merkezli, ICRF, TDB), Hermite ara değeri, vis-viva periyodu | HORIZONS API parametreleri | Doğru |
| Gezegen kutupları ve dönme fazları (W₀, Ẇ), yarıçaplar | IAU WGCCRE | Aynı |
| Yeniden giriş tahmini (B*, Vallado yoğunluğu) | Bkz. §1 #2 | Düzeltildi |

### 4.2a Yeniden giriş tahmini (`impact.js`): ikinci denetim

Çarpma sekmesinin yörünge bozunması modeli bağımsız referanslarla sınandı (aynı fizik ayrıca yazılıp hareket denklemleri doğrudan ya da 4.000–20.000 noktalı ortalamayla tümlendi). Dört kusur bulundu ve düzeltildi:

| Sorun | Kanıt | Düzeltme |
|---|---|---|
| **`MEAN_MOTION_DOT`'tan sürüklenme genliği dairesel formülle bulunup perije değeri sayılıyordu** | Modelin kendi bozunmasından üretilen ṅ geri verildiğinde B*/ṅ oranı 300 × 2000 km'de 7,95, 250 × 6000 km'de 11,3 (1 olmalı); B* yokken ömür sonsuz çıkıyordu | Genlik, geçmiş eğimiyle aynı yoldan (modelin yörünge ortalamalı da/dt'siyle ölçekleme) bulunur; oran 1,000 / 1,000 / 0,998 |
| **Eksantrik yörüngede sabit 24 noktalı toplama perijedeki sürüklenme tepesini kaçırıyordu** | da/dt yakınsak değerin 250 × 20.000 km'de 0,52'si, GTO'da 0,20'si, 200 × 35.786 km'de 0,14'ü | Nokta sayısı tepenin genişliğine (√(H/ae)) göre seçilir; 400 × 420 km'den 130 × 35.786 km'ye sekiz yörüngede referansla fark ≤ %0,25 |
| **Tümleme (a, e) ile ilerliyordu**: perijeye adım başına −Δa·Δe ikinci derece hatası ekleniyor, adım yalnız perije hızına göre seçiliyordu | 200 × 35.786 km, B* = 10⁻³: model 1.662 gün, ince adımlı referans 6.208 gün (perije 60 km fazla alçalıyordu; gerçek alçalma Δa'nın ~2·10⁻⁴'ü) | Durum (a, perije) olarak ilerletilir; adım a'nın değişimini de sınırlar. Aynı durumda 6.217 gün (%0,14); dört yörüngede fark ≤ %1,2 |
| **15 yıla kadar tahmin "yüksek" güven alabiliyordu** | Geçmiş eğimi zaten yalnız B*'la uyuşan cisimlerde kullanıldığından uyum bağımsız doğrulama değildir; gerçek kayıtta da geçmiş kalibrasyonlu tahminler ötekilerden daha isabetli çıkmadı (§4.2b) | Yüksek: iki kaynak uyumlu ve < 60 gün; orta: uyumlu ve < 25 yıl; gerisi düşük |

Kartezyen denetim (`test/test_impact.js`): iki cisim + sürüklenme ivmesi −½Kρ|v|v, RK4 10 s, 300 × 2000 km, 3 gün: Δa 36,55 km ↔ model 36,12 km, Δe 4,195·10⁻³ ↔ 4,147·10⁻³.

### 4.2b Gerçek yeniden girişler, Güneş çevrimi, Ay–Güneş çekimi

**Gerçek kayıtla karşılaştırma.** Halka açık CelesTrak etkin kataloğunun git geçmişinden (github.com/jtmiclat/celestrak-historical; Tem 2025 – Kas 2026, ~4,5 günde bir, 96 anlık görüntü) etkin listeden çıkmış, son TLE perijesi 120–260 km olan 322 cisim seçildi (Starlink/OneWeb/Kuiper ve istasyon araçları hariç; Jilin, ICEYE, Astrocast, Lemur, NuSat ve küp uydular). "Gerçek" yeniden giriş anı = son TLE çağı + modelin o TLE'den kalan süresi (medyan 2,2 gün, %90'ı < 4,2 gün). Her cismin önceki TLE'lerinden tahmin / gerçek kalan süre oranı:

| Yeniden girişe kalan | n | Medyan | %68 aralığı | 2 kat içinde |
|---|---|---|---|---|
| ~45 gün | 315 | 1,05 | 0,84–1,37 | %96 |
| ~150 gün | 237 | 0,95 | 0,75–1,38 | %97 |
| ~330 gün | 130 | 1,30 | 0,77–1,48 | %95 |
| "yüksek" güven verilenler | 255 | 0,99 | 0,82–1,17 | %99 |

Cisim başına birer girdili bu örnek `web/test/fixtures/reentry_real.json`'dadır (`tools/yeniden_giris_ornegi.mjs` üretir) ve `test_impact.js` her koşuda sınar. Tüm TLE'lerle (12.650 tahmin) medyan 0,89–1,05, %96–97'si 2 kat içinde. 330 gün kala medyan 1,30'dur: tahminlerin yapıldığı Ağu–Ara 2025'ten sonra yoğunluk beklenmedik biçimde arttı (aşağıda), cisimler tahminden erken indi.

**Güneş çevrimi.** Sabit atmosfer yerine F10.7'nin 11 yıllık ortalama biçimi (en az 70, en çok 160 sfu; 25. çevrim en az Aralık 2019) yoğunluğu ölçekler: ln ρ(h, F) = ln ρ_Vallado(h) − (1/T(F) − 1/T(140))·(h − 175)·m(h), T = 900 + 2,5(F − 70) + 1,5·Ap, m = 27 − 0,012(h − 200). Çarpan 400 km'de 0,38–1,83, 600 km'de 0,20–2,81. Denetim: edilgen 509 cismin (480–560 km) B*'ı SGP4'ün atmosferi sabit olduğundan gerçek yoğunluğu izler; Ağu 2025 → Kas 2026 gözlenen yoğunluk oranı 0,88, modelinki 0,74 (580–680 km: 0,76 ↔ 0,69). Arada Eki 2025 – Şub 2026'da yoğunluk 1,3–1,7 katına çıktı; çevrim modeli böyle aylık dalgalanmaları öngöremez. 16 aylık gerçek veride çevrim modeli sabit atmosferden daha iyi çıkmadı (medyan |ln hata| 0,216 ↔ 0,208); etkisi yıllar ölçeğindedir (450 km, B* = 1,5·10⁻⁴: en çok aktivitede başlayan tahmin 7,7 yıl, sabit 4,5, en azda başlayan 2,8) ve o ölçek gerçek kayıtla sınanamadı.

**Geçmiş eğimi.** Theil–Sen eğimi dilimin ortasındaki bozunma hızıdır; bugünkü yörüngenin hızı sayılınca genlik küçük çıkıyor, gerçek veride 60–120 gün kala ömür %40 uzun tahmin ediliyordu. Eğim artık dilim ortasındaki yörüngeye ve o günün aktivitesine bağlanır (modelin kendi ürettiği 301 günlük seriden kalan ömür 677 ↔ 662 gün) ve B* ile geometrik ortalaması kullanılır: gerçek veride yalnız eğim 60–120 / 120–240 / 240–480 gün kala medyan |ln hata| 0,16 / 0,31 / 0,36, yalnız B* 0,19 / 0,20 / 0,26, ikisi birlikte 0,12 / 0,21 / 0,27.

**Ay–Güneş çekimi.** Periyodu ≥ 225 dk olan alçak perijeli yörüngelerde (GTO, Molniya) dış merkezlik ve açısal momentum vektörleri için dörtkutup yaklaşımında yörünge ortalamalı denklemler (Tremaine, Touma & Namouni 2009; Güneş tek, Ay çift ortalama) ve J2'nin düğüm/perije dönmesi sürüklenmeyle birlikte tümlenir (4 günlük adım, 100 yıl ufuk). Doğrudan Kartezyen tümlemeyle (Dünya nokta kütle + J2, Güneş, eğik dairesel yörüngede dolanan Ay; RK4) karşılaştırma: 600 × 35.786 km, i = 28,5°, 1 yıl: perije 58 km oynarken en büyük fark 2,6 km; 900 × 39.400 km, i = 63,4°, 545 gün: perije 900 → 448 km, fark 1,2 km. Örnek: GTO 250 × 35.786 km, B* = 10⁻³: yalnız sürüklenme 70,6 yıl, Ay–Güneş dahil 32,5 yıl.

**Sınırlar.** Birkaç yıldan uzun tahminler gerçek kayıtla sınanamadı (veri 16 ay). Derin uzay yörüngeleri için gerçek yeniden giriş kaydı yok (etkin katalogda bu türden inen cisim bulunmadı); Ay–Güneş modeli ortalamadır (rezonanslar, kısa periyotlu terimler yok) ve bu yörüngeler başlangıç koşullarına çok duyarlıdır: güvenleri hep düşüktür. "Gerçek" yeniden giriş anı son TLE'den modelle tamamlandığı için birkaç günlük bir belirsizlik taşır.

### 4.3 Sınırlar

- Uydu gölgesi silindirik kabul edilir (yarı gölge yok); geçişlerin doğuş/batışı geometrik ufka göredir (kırılma yok: ufukta ≈ 0,57°, birkaç saniye).
- Kutup hareketi ihmal edilir (≤ 15 m).

## 5. Gerçek 3B modeller: asteroitler ve araçlar

### 5.1 Asteroit şekil modelleri (NASA Eyes, dokulu)

Uzay aracıyla görüntülenmiş sekiz asteroit artık NASA Eyes'ın renk ve normal dokulu modelleriyle çizilir (`tools/asteroit_eyes.mjs`): Bennu, Ryugu, Itokawa, Eros, Vesta, Didymos, Psyche ve Gaspra. Modeller önceki PDS modelleriyle aynı sözleşmeye çevrilir: hacim merkezi orijinde, birim hacim-eşdeğeri yarıçap, dönme ekseni glTF +Y. Hacim ve merkez imzalı dörtyüzlülerle hesaplanır.

| Denetim | Sonuç |
|---|---|
| Dönme ekseni, PDS (Gaskell) modeliyle karşılaştırma (24 eksen dönüşü, ortalama en yakın nokta uzaklığı) | Itokawa, Bennu ve Vesta: +Y. Eros'un Eyes modelinde kutup +Z'de (0,027 req uzaklıkla eşleşir); araç çevirir. |
| En büyük eylemsizlik ekseni ile +Y arasındaki açı (∫xxᵀdV, Jacobi) | Bennu 2,4°, Ryugu 0,7°, Itokawa 1,0°, Eros 0,3°, Vesta 0,5°, Didymos 2,5°, Psyche 6,4°, Gaspra 10,7° |
| Normalize boyutlar, PDS ile | Eros 3,884/1,412 (PDS 3,876/1,419), Itokawa 3,472/1,501 (3,469/1,503), Vesta 2,192/1,770 (2,154/1,784) |
| Modelin kendi ölçeği | Bennu 243 m, Didymos 388 m, Itokawa 154 m, Eros 8,39 km, Gaspra 6,08 km, Vesta 261,5 km: literatürle uyumlu |

Yarıçap her zaman katalogdan gelir. Değiştirilen cisimler PDS modelinden hesaplanmış değeri korur. Yeni cisimlerin yarıçapları literatürden alınır: Ryugu 0,448 km (Watanabe vd. 2019), Didymos 0,3805 km (Daly vd. 2023), Psyche 111 km (Shepard vd. 2021), Gaspra 6,1 km (Thomas vd. 1994).

İki model kullanılmadı ya da kapsam dışında kaldı:

- **Apophis.** Eyes modeli gövde çerçevesinde değil: en büyük eylemsizlik ekseni +Y'ye 89,6° açılı ve PDS modeliyle eşleşmiyor. Bu yüzden Brozović vd. 2018 radar modeli kaldı.
- **Psyche.** Henüz ziyaret edilmediği için yüzey dokusu temsilî; şekil radar ve uyarlamalı optikten geliyor.

Psyche ve Gaspra artık katalogda olduğundan DAMIT dizininden çıkarıldı.

Gölgelendirici, normal haritası için teğet çerçevesini türevlerden kurar (three.js getTangentFrame). Türev teğetlerle glTF normal haritasının y bileşeni ters çevrilir; GLTFLoader da aynı işlemi yapar. Işık, asteroitten Güneş'e doğru olan yönden gelir.

### 5.2 Araç (roket) modelleri

Ay görevi araçları zaten resmî NASA 3D Resources modelleridir (`tools/apollo_modelleri.mjs`):

- Apollo LM: iniş aracı.
- Apollo CSM'nin hizmet modülü: Ay yörünge kademesi.
- Saturn V S-IVB ve IU: TLI kademesi.

Diğer resmî kaynaklar araştırıldı:

| Kaynak | Bulunan | Kullanım |
|---|---|---|
| Smithsonian 3D (CC0) | Apollo 11 komuta modülü, Shuttle Discovery | Kullanılan kademelerin taraması yok |
| NASA Science 3D | 3D Resources ile aynı dosyalar | Yeni bir şey yok |
| NASA Eyes | Fırlatma aracı modeli yok | — |
| NASA 3D Resources "SLS Block 1" (.blend, 3,3 M üçgen) | Fırlatma düzeni | Kullanılamaz (aşağıya bakın) |

SLS Block 1 modeli fırlatma düzeninde: ICPS, LVSA kabuğunun; Orion hizmet modülü de panellerin altında. Modelde yalnız dış yüzeyler var, bu yüzden uzayda ayrı kademe olarak kullanılamaz.

### 5.3 Ay görevinde roket seçimi (`web/js/rockets.js`)

Simülasyon Dünya park yörüngesinde başlar. Roket seçimi, Ay'a aktarma yakışını (TLI) yapan **üst kademeyi** belirler: kuru kütle, vakum itkisi, Isp ve park yörüngesinde kalan yakıt.

Park yörüngesindeki yakıt, roketin yayımlanmış başarımından roket denklemiyle türetilir. Park yörüngesine konan toplam kütle alt kademelerce belirlenir; yük hafifse fark üst kademede yakıt olarak kalır:

- M_park = (m_kuru + P_ref) · exp(Δv_ref / (Isp·g0))
- yakıt = min(tank, M_park − m_kuru − yük)
- Δv_ref 200 km dairesel yörüngeden hesaplanır: TLI (C3 = −2 km²/s²) için 3,133 km/s, GTO için 2,455 km/s.

| Roket | TLI kademesi | Kaynak başarım | Türetilen TLI kapasitesi | 3,6 t araçla TLI yakışı |
|---|---|---|---|---|
| Saturn V (tarihî) | S-IVB + IU, J-2 1033 kN, Isp 421 s | Apollo 17 TLI yükü 46,8 t (NASA PDS: CSM + LM) | 46,8 t | ~4,5 dk |
| SLS Block 1 | ICPS, RL10B-2 110 kN, Isp 462 s | NASA: > 27 t TLI | 25,2 t (ICPS tankı sınırlar) | ~12,5 dk |
| Falcon 9 Block 5 | 2. kademe, MVac 981 kN, Isp 348 s | GTO 5,5 t (kurtarmalı) | 3,8 t | ~41 s (kesmede ~13 g) |
| Falcon Heavy | aynı 2. kademe | GTO ~8 t (yan iticiler kurtarılır) | 5,8 t | ~51 s |
| Vulcan Centaur VC2S | Centaur V, 2 × RL10C 204 kN, Isp 453,8 s | VC2 TLI 6,2 t | 6,2 t | ~5 dk |

**Denetimler.**

- Apollo 17 yüküyle S-IVB park yörüngesinde ~71 t yakıtla kalıyor ve TLI'da tükeniyor. Gerçekte ~70 t idi.
- Yayımlanan TLI yükleri park kütlesinden geri elde ediliyor (`test_rockets.js`).
- Denenen birleşimlerin hepsi Ay'a güvenle iniyor: beş roket Apollo profilinde; SLS, Vulcan ve Falcon Heavy NRHO'da; Falcon 9, Falcon Heavy, Saturn V ve SLS yörünge yükseltmeli profilde. Tek istisna Falcon 9 + NRHO: iniş aracı ~4,2 t, Falcon 9'un türetilmiş kapasitesi ~3,8 t. Tasarım bunu anlaşılır bir hatayla söylüyor ve arayüz önceki rokete dönüyor.

**İki düzeltme.**

- **TLI kesme hatası.** Görev, kesmede 0,05 s'lik bir zamanlama hatası modelliyordu. Bu hata 13 g'lik kademede ~6 m/s'lik Δv hatasına dönüşür ve MCC-1 49 m/s çıkar. Gerçek üst kademeler hıza göre kestiği için hata Δv eşdeğerine ölçeklendi: her kademede genel kademeyle aynı Δv hatası (MCC-1 5–10 m/s). Genel kademede davranış değişmedi.
- **Uzun yakışta park eğimi.** ICPS'in ~13 dakikalık yakışında çözülen park düzlemi biraz dönüyor. Eğim KSC enleminin (28,57°) altına inince rampa düzlemden geçmiyor. Gerçek roket seçiliyse tasarım bir sonraki eğimle (30°) yeniden deneniyor.

**Belirsizlikler.**

- SpaceX ve ULA kademe kuru kütlelerini yayımlamıyor: Falcon ikinci kademesi 4,0 t ve Centaur V 7,1 t ikincil kaynaklardan. 1 t'luk hata park yakıtını ~1 t değiştirir.
- Rampalar Florida'da ve birbirine ~10 km uzaklıkta. Tasarım LC-39B koordinatlarını kullanıyor.

**3B modeller.** S-IVB resmî NASA modeli. ICPS, Falcon ikinci kademesi ve Centaur V'nin kamu malı resmî modeli yok; bunlar yayımlanmış ölçülerden dönel yüzeylerle çizildi (`rocketmodels.js`): çap, boy, çan çıkış çapı ve boyu, motor sayısı. Hidrolox alevleri soluk mavi, kerolox alevi turuncu.

### 5.4 Roket bilgi kartları (`rocketinfo.js`, `rocketsheet.js`)

Ay görevinin 2. adımındaki her gerçek roketin kartında bir ⓘ düğmesi var. Düğme bir bilgi kartı açar. Kartın içeriği:

- 3B görünüm (sürükle: döndür, tekerlek ya da iki parmak: yakınlaş; ölçek için 1,8 m'lik insan).
- Teknik özellikler.
- Kademeler ve yakıtlar.
- Tarihçe.
- Ay ve derin uzay görevleri.
- Simülasyondaki TLI kademesinin verisi.
- Numaralı kaynaklar.

Her bilgi bir kaynak numarasına bağlı; `test_rocketinfo.js` her numaranın geçerli olduğunu ve her kaynağın en az bir bilgiye bağlandığını denetliyor. Görev listeleri 3 Kasım 2026 itibarıyla güncel. Örnekler: Artemis II (1 Nisan 2026, Ay yakın geçişi), Vulcan'ın Şubat 2026 itici anomalisinden sonraki duraklaması, Griffin Mission One (planlanıyor).

**3B modeller.**

| Roket | Model | Kaynak |
|---|---|---|
| Saturn V | Resmî NASA 3D Resources modeli, 110,6 m'ye ölçeklenmiş, 227 kB | `tools/roket_modelleri.mjs` |
| SLS Block 1 | Yayımlanmış ölçülerden çizim | NASA 3D Resources'taki `.blend` dosyası tank kabuklarını içermiyor (yalnız besleme boruları, bağlantılar, motorlar ve üst kısım); parça yükseklikleri o modelden alındı |
| Falcon 9, Falcon Heavy, Vulcan | Yayımlanmış ölçülerden çizim | Kamu malı resmî model yok |

Görüntüleyici tembel yükleniyor: kart açılınca ayrı bir WebGL bağlamı oluşuyor, kapanınca serbest bırakılıyor. Böylece ilk açılış yavaşlamıyor.

Saturn V'nin TLI başarımı NASA PDS kaydına göre düzeltildi: Apollo 17'de CSM 30.320 kg + LM 16.448 kg = 46,8 t (önce 48,6 t kullanılıyordu). Park yörüngesindeki S-IVB yakıtı ~71 t çıkıyor; gerçekte ~70 t idi.

## 6. Fırlatma rampası, kalkış maliyeti, pencereler ve hava durumu

### 6.1 Rampalar (`web/data/pads.json`, `web/js/pads.js`)

The Space Devs Launch Library 2'den en az bir yörüngesel fırlatma denemesi olan **193 rampa** derlendi (`tools/rampa_derle.mjs`; `ordering=id` ile kararlı sayfalama). Rampa Ay görevinin 1. adımında seçiliyor ve görev tasarımı KSC yerine seçilen rampanın koordinatlarıyla çalışıyor: fırlatma fırsatı, rampanın hedef yörünge düzleminden geçtiği an.

Gerçek roketler yalnız gerçekte kullandıkları rampalardan seçilebiliyor:

| Roket | Rampalar |
|---|---|
| Saturn V | LC-39A, LC-39B |
| SLS | LC-39B |
| Falcon 9 | SLC-40, LC-39A, SLC-4E |
| Falcon Heavy | LC-39A |
| Vulcan | SLC-41 |

Genel kademe her rampadan fırlayabiliyor. Roket değişince rampa gerekirse roketin ilk gerçek rampasına geçiyor.

### 6.2 Kalkış fiziği

- **Eğim–azimut ilişkisi:** cos i = cos φ · sin A. Doğrudan fırlatmada eğim enlemden küçük olamaz (i ≥ |φ|). Köpek bacağı manevrası modellenmiyor.
- **Dünya dönüşünün katkısı:** rampanın eylemsiz hızının yörünge yönündeki bileşeni ω R cos φ sin A = **V_EQ · cos i** (V_EQ = 465,1 m/s). Katkı enlemden bağımsız, yalnız eğime bağlı.
- **Eğim cezası:** başvuru eğimine (Florida, 28,5°) göre ek Δv = V_EQ (cos 28,5° − cos i). Örnekler: 51,6° → +119,8 m/s; Baykonur 46° → +85,7 m/s; Kourou 5,3° → −54 m/s (kazanç). Gerçek roketlerde bu ek Δv'yi üst kademe karşılıyor sayılıyor ve park yörüngesine ulaşan kütle exp(−Δv / Isp g0) ile azalıyor. Bu birinci derece bir yaklaşım: çıkış kayıpları aynı kabul ediliyor.
- **Menzil güvenliği:** kaynağı olan menzillerde izinli fırlatma azimutları uygulanıyor; izin dışındaki fırsatlar atılıyor ve park eğimi bu aralığa çekiliyor.

| Menzil | İzinli azimut | Kaynak | Park eğimi aralığı |
|---|---|---|---|
| Doğu Menzili (Cape Canaveral / KSC) | 35°–120° | Firefly CCSFS; Wikipedia "Eastern Range" (bazı kaynaklar 37°–114°) | 28,6°–59,7° |
| Batı Menzili (Vandenberg) | 140°–260° | Firefly VSFB | ≥ 58,1° (güneye fırlatma) |
| Kourou | −10,5°–93,5° | İkincil kaynak | ≥ 5,3° |
| Diğer rampalar | Veri yok | — | Yalnız enlem sınırı |

- **Uzun yakış:** eğim KSC enleminin altına inince fırlatma fırsatı bulunamıyor. Bu durumda tasarım bir sonraki park eğimiyle yeniden deniyor (§5.3); bu artık seçili rampada da geçerli.

**Denetimler** (`test_pads.js`):

- Baykonur (46,0°, azimut 86,8°), Kourou ELA-4 (azimut 61,7°) ve Vandenberg SLC-4E (60,1°, azimut 142,6°): cos i = cos φ sin A ilişkisi 0,1° içinde tutuyor ve Ay'a güvenli iniş sağlanıyor.
- Falcon 9 Baykonur'dan seçilince tasarım anlaşılır bir hatayla duruyor.

**Varsayılan rampa düzeltildi:** Eski varsayılan "KSC LC-39B" noktası (28,5729° K, 80,6490° B) gerçek LC-39B'den (LL2: 28,6271° K, 80,6210° B) ~6 km güneydeydi. Varsayılan artık gerçek koordinat; doğrudan fırlatmada en küçük park eğimi 28,7°. Profillerin varsayılan eğimi 28,6° → 28,7° oldu. Hazır tasarımlar (`designs_default.json`; APOLLO kopyası `design_default.json`) `test/make_designs.js` ile yeniden üretildi. Altı profilin hepsi Ay'a iniyor; pencereler aynı kaldı, fırlatma anları birkaç dakika kaydı. Listedeki LC-39B (LL2 4) varsayılanın kendisi olduğu için ayrıca listelenmiyor.

### 6.3 Fırlatma pencereleri tarayıcısı

Sonraki dört pencere tasarlanıyor; her biri bir öncekinin fırlatmasından bir gün sonrasından aranıyor. İniş yerinde uygun güneş açısı gerektiği için pencereler yaklaşık ayda bir.

Tabloda her pencere için şunlar var:

- Fırlatma anı, azimut, eğim, toplam Δv.
- Gereken yakıt: iniş aracı + TLI, tasarım tabanları olmadan; böylece pencereler arasındaki gerçek fark görünüyor.
- En ucuz pencereye göre fark.
- Gerçek roketlerde TLI yakıt payı.
- Hava durumu.

Tarama sırasında ana iş parçacığının efemeris kaynağı değişiyor; sonunda geri yükleniyor.

### 6.4 Hava durumu (`web/js/weather.js`)

Veri Open-Meteo'dan geliyor: 16 güne kadar tahmin, 92 güne kadar geçmiş. İstek ziyaretçinin tarayıcısından gidiyor (anahtarsız, CORS açık); böylece her ziyaretçinin kendi günlük kotası oluyor. Bu bulut ortamının paylaşılan IP'si kotayı doldurduğu için testler örnek yanıtla yapıldı.

Kurallar NASA'nın Artemis I hava kriterleri bilgi notundan ve 45. Hava Filosu fırlatma tahminlerinden. Saatlik model verisiyle **yaklaşık göstergeler**:

| Ölçüt | Uygun değil | Riskli | Not |
|---|---|---|---|
| Yağış | ≥ 0,2 mm/sa | Olasılık ≥ %40 | |
| Yıldırım | WMO 95–99, ±1 saat | CAPE ≥ 1000 J/kg | |
| Kalkış rüzgârı (120 m ya da 10 m esintisi) | ≥ 34 kt | ≥ 25 kt | Artemis I: 132,5 ft'te 29–39 kt |
| Kalın bulut | — | ≥ %90 | Katman kalınlığı modelde yok |
| 250 hPa rüzgârı | — | ≥ 100 kt | |
| Sıcaklık | — | < 5,2°C | 41,4°F, kriyojenik yakıt doldurma |

Hiç veri yoksa sonuç "veri yok" oluyor; yanıltıcı "uygun" ya da "uygun değil" yazılmıyor. Resmî kurallardaki elektrik alanı, anvil ve debris bulutu mesafeleri modelde yok.

### 6.5 Kalkış canlandırması (`ascent.js`, `ascentplay.js`)

Uçuş adımındaki **▶ Kalkışı izle** düğmesi, seçili roketi seçili rampada tam boyuyla gösterir ve yörüngeye girişe kadar oynatır. Bitince görev girişten sürer.

Bu bir **kinematik canlandırma**. Görev fiziği ve Δv hesapları değişmiyor; fizik yine yörüngeye girişte başlıyor.

**Yol:**

- Fırlatma anındaki rampa noktasından giriş noktasına, ikisinin büyük çember düzleminde ilerliyor.
- Açı θ(τ) = θ₁ τⁿ. n, varışta yatay hızın giriş hızına eşit olacağı biçimde seçiliyor; böylece yol dikey yükselişle başlıyor.
- İrtifa h(τ) = h₁ (1 − (1 − τ^1,3)^2,2). Varışta dikey hız 0; birinci kademe ayrılmasında (τ ≈ 0,3) ~76 km (tipik ~70 km).
- Rampa WGS-84 elipsoidinde; rampadayken Dünya ile dönüyor (≈ 408 m/s).
- Sahnede Dünya küre olarak çizildiği için çizim konumu alçak irtifada küre yüzeyine yaslanıyor (20 km'de söner). Telemetri gerçek konumu kullanıyor.

**Denetimler** (`test_ascent.js`, varsayılan tasarımla):

- Rampada jeodezik irtifa 0.
- Girişte konum 8 m içinde birleşiyor; hız büyüklüğü %0,07 içinde.
- Hız yönünde ~0,6° (85 m/s) fark kalıyor: canlandırmadan fiziğe geçerken hız vektörü bu kadar sıçrıyor.

**Kademe ayrılmaları** roketlerin gerçek uçuş zamanlarında oluyor: tasarım fırlatmadan girişe süreyi seçili roketin gerçek giriş zamanından alıyor (`design.js` `ascentTime`: Saturn V 709 s, SLS 496 s, Falcon 9 520 s, Falcon Heavy 510 s, Vulcan 690 s; genel kademe 600 s, hazır tasarımlar değişmez). Canlandırma gerçek zamanlı; görev saati ile roketin uçuş saati aynı (önce her roket 600 s'ye ölçekleniyordu, SLS'te saat %21 kayıyordu):

| Roket | Olaylar | Kaynak |
|---|---|---|
| Saturn V | S-IC T+2:42, S-II T+9:09, giriş T+11:49 | Apollo 11 uçuş günlüğü |
| SLS | SRB T+2:12, LAS T+3:15, çekirdek kademe T+8:16 | Artemis I basın kiti |
| Falcon 9, Falcon Heavy, Vulcan | — | Tipik/yaklaşık zaman çizelgeleri |

Ayrılma, modelde bir kesme düzlemiyle (alt kısım çizilmiyor) ve etiketli parçaların gizlenmesiyle gösteriliyor: iticiler, kaporta, LAS.

Alev rengi birinci kademenin yakıtına göre: gazyağı turuncu, katı yakıt beyaz-sarı. Atmosfer etkileri ve düşen kademeler çizilmiyor.

### 6.6 Günlük fırlatma penceresi ve hava

Ay görevlerinde fırlatma günü kaydırılamıyor: bir günlük erteleme inişi de ~1,3 gün kaydırıyor ve iniş anında Güneş 15,7°'den 32,1°'ye çıkıyor (ölçüm: varsayılan Apollo görevi). Bu, Apollo'nun aydınlatma sınırlarının dışında. Apollo da bu yüzden ertelemede iniş yerini değiştiriyordu.

Gerçek **günlük pencere** fırlatma azimutunun değişmesiyle oluşuyor: aynı gün farklı park eğimleriyle farklı saatlerde fırsat açılıyor, iniş aynı gün kalıyor. Apollo'da azimut 72°–108° arasında değişiyor ve birkaç saatlik bir pencere oluşuyordu.

Ölçüm (13 Ekim 2026, LC-39B, Apollo profili):

| Eğim | Fırlatma (UTC) | Azimut | İniş Güneşi |
|---|---|---|---|
| 28,7° | 12:36 | 88° | 15,7° |
| 30° | 12:00 | 81° | 15,8° |
| 35° | 11:47 | 69° | 17,9° |
| 40° | 03:54 | 61° | 10,6° |
| 45° | 02:59 | 54° | 11,1° |
| 50° | 02:18 | 47° | 12,1° |

Toplam Δv tüm fırsatlarda ~5.910 m/s, birkaç m/s farkla. Gerçek roketlerde fark eğim cezasıyla (§6.2) kalan yakıta yansıyor.

**Günlük fırlatma penceresi (1. adım):**

- Menzilin izin verdiği aralıkta aday eğimler tasarlanıyor: en küçük eğim + 0; 1,3; 3,8; 6,3; 11,3; 16,3; 21,3°.
- ±10 dk içinde aynı fırsata düşenlerden yalnız en az yakıtlısı kalıyor.
- Her fırsatın fırlatma anındaki hava değerlendiriliyor (§6.4).
- **Önerilen fırsat** (`weather.js pickLaunch`): hava "uygun" olanlar arasında en az yakıtlı. Uygun yoksa riskli olanlar arasında en az yakıtlı. Hepsi "uygun değil" ise öneri yapılmıyor ("sonraki pencereyi deneyin"). Hava verisi yoksa en az yakıtlı.
- Satıra tıklayınca görev o eğimle kuruluyor.
- Mevcut görevin havası uygun değilse hava kutusunda günün diğer fırsatlarına geçiş düğmesi çıkıyor.

Örnek hava verisiyle tarayıcı denetimi: 11–13 UTC arası fırtına, 02 UTC'de 40 kt esinti. Önerilen 02:59 (45°) oldu; seçilince görev o fırsatla kuruldu.

### 6.7 Kalkışın fiziksel modeli ve görselliği (§6.5'in yerine)

**Çıkış benzetimi** (`ascentsim.js`):

- Düzlemde nokta kütle; ters kare çekim.
- U.S. Standard Atmosphere 1976 (NASA TM-X-74335); Dünya ile dönen hava; sürüklenme (kütleyle değişen balistik katsayı).
- Kademeler: gerçek yanma süreleri, itki/ağırlık ve kütle oranları. Birinci kademenin itkisi basınç düştükçe artıyor (F-1: 6.770 → 7.770 kN).
- Güdüm:
  - Dikey yükseliş, kısa eğilme, sonra hücum açısı sıfır yerçekimi dönüşü.
  - Üst kademelerde kapalı döngü uç güdüm: a_r = 6 (r₁ − r − v_r τ)/τ² + 2 v_r/τ. Bu, PEG/E-güdümünün düşey kanalı.
- Çözüm: eğilme açısı, birinci kademe ayrılma irtifasına uyacak şekilde; itki ölçeği, giriş hızına uyacak şekilde seçiliyor. İkisi sönümlü Newton ile birlikte çözülüyor.
- Kaynaklar: Wikipedia "Gravity turn"; arXiv 2008.13239; NASA NTRS 20180002035.

**Apollo 11 karşılaştırması** (NASA SP-4029):

| Olay | Model | Gerçek |
|---|---|---|
| S-IC kesme | 66,1 km (kalibre), 2,325 km/s | 66,1 km, 2,393 km/s (−%3) |
| S-II kesme | 198 km, 6,508 km/s | 187,2 km, 6,513 km/s (+%6, −%0,1) |
| Max-Q | T+79 s, 11 km | ~T+83 s |

Altı roketin hepsinde max-Q 53–79 s'de ve 11 km civarında (tipik 10–15 km).

Canlandırmada yol bu benzetimden geliyor: zaman gerçek (tasarımın çıkış süresi roketin giriş zamanı), yay açısı ve irtifa görevin giriş noktasına oturtuluyor.

**Dikey kalkış (düzeltme).** Yol eylemsiz düzlemde çizildiği ve yay açısı giriş noktasına ölçeklendiği (ör. ×0,76) için Dünya dönüşünden gelen yatay hız da ölçekleniyordu; düzleme dik dönüş bileşeni de yoktu. Rampa ise Dünya ile 408 m/s döner: roket rampadan ~100 m/s geri kalıyor, T+13 s'de 290 m irtifadayken rampanın 1,3 km batısında görünüyordu (merdiven çıkar gibi eğik yükseliş). Düzeltme (`ascent.js`): yola c(t) = Δv₀ · t · (1 − s(τ)) eklenir; Δv₀ rampanın hızı ile yolun kalkıştaki yatay hızı arasındaki fark, s düzgün basamak. Kalkışta roket rampanın tam hızını taşır, girişte c = 0 ve c′ = 0 olur, yol görevin giriş durumuna yine oturur. Hız çizilen yolun türevidir (yere göre hız kalkışta 0'dan başlar). Ölçüm (`test_ascent.js`): T+13 s'de rampadan yana 1,8–2,2 m (Saturn V, SLS, genel); girişte konum farkı < 7 m. Son %8'de hız görevin giriş hızıyla yumuşakça birleşiyor; fiziğe geçişte hız sıçraması yok (önce 85 m/s idi).

**Görsellik:**

- **Rampa:** SLS'te NASA 3D Resources **Mobile Launcher** modeli (116 m, platform 48 m; roket ekseni modelden ölçüldü). Diğer roketlerde beton platform ve yıldırım direkleri.
- **Yer (`padground.js`):** rampa çevresinden ufka dek tek ağ: rampa çerçevesinde Dünya eğriliğini izleyen kare ızgara (193 × 193 köşe; köşe aralığı rampada ~1 m, 1650 km'deki kenarda ~200 km, üstel). Görüntü çalışma anında **Esri World Imagery**'den (anahtarsız, atıf ekranda): iç içe yedi seviye z18, 16, 14, 11, 9, 7, 5 (her biri 6 × 6 karo; rampada ≈ 0,5 m/piksel, ufukta ≈ 4 km/piksel). z12 atlanır, çünkü bu bölgelerde Esri'nin geçiş seviyesi farklı tarihli kaynaklardan yamalı. Gölgelendirici her noktada eldeki en ince seviyeyi seçer, seviye kenarlarında yumuşak geçiş yapar. Esri'nin "veri yok" yer tutucusu (düz açık gri karo) içerikten tanınıp saydam bırakılır, orada kaba seviye görünür. Esri alınamazsa **EOX Sentinel-2 cloudless** (CC BY-SA 4.0, z ≤ 15). Kabartma **AWS Terrain Tiles**'tan (Terrarium; z14/11/8/5, 3 × 3 karo). Rampa çevresi (~400 m) düz tutulur, 1,4 km'ye dek yumuşakça gerçek yüksekliğe geçer. Rampadan alçak yerler rampa düzeyine kırpılır, çünkü fizik rampayı küre yüzeyine koyar. Dağlık rampalarda (Xichang 1857 m, Vandenberg) yer kameraları zeminin üstüne kaldırılır. Hava perspektifi: pus alçak katmanda (H ≈ 2 km) yoğun; ışının deniz düzeyi eşdeğeri yolu H·(1 − e^(−h/H))/sin(görüş açısı), sönüm uzunluğu ~22 km. Gece alevin ışığı rampa çevresini aydınlatır. Kalkış sırasında küre parçaları ve taban Dünya küresi gizlenir; zemin 185 km irtifadaki ufka dek uzanır. Kameranın gördüğü yer zeminin dışına taşınca (uzaklaştırılmış görünüm, yüksek irtifada araç üstü) zemin gizlenir, Dünya küresi görünür (`launchcam.js` `groundCovers`): uzaktan kara küre üstünde yüzen kare görünmez. Sınır: düz görüntü çok yatık bakışta (≲ 1°, yerden tele objektif) şeritlenir.
- **İsteğe bağlı Google 3B karolar (`google3d.js`) — açık (`G3D_ENABLED = true`; kalkış çubuğunda "3B şehir" düğmesi; katman yalnız kullanıcının anahtarıyla başlar; gerçek Google karolarıyla henüz denenmedi):** açılınca kullanıcının kendi anahtarıyla rampa çevresi (12 km) Google Photorealistic 3D Tiles ile çizilir (3d-tiles-renderer; yalnız açılınca iner). Karolar ECEF (WGS-84); grup matrisi ECEF → rampa çerçevesi (doğu, yukarı, güney). Karolar elipsoit yüksekliğinde ve geoit farkı bilinmediği için rampa çevresine (45–90 m halkada 36 ışın) aşağı ışın atılır, isabetlerin alt çeyreği (kule ve yapılar karışmasın) y = 0'a oturtulur; ince karolar geldikçe 2,5 s'de bir yinelenir. Yalnız rampa çevresindeki karolar yüklenir (maske küresi); ayrıntı düzeyi kameraya göre. Malzemeler yerinde yamalanır: ışıksız fotoğraf rengi, padground.js ile aynı gece karartması, alev ışığı ve pus; 12 km dışı atılır, padground.js aynı yarıçapın içini boşaltır. Hazır olunca temsilî rampa (beton, çukur, direkler) gizlenir; yer kameraları bina/ağaç tepelerinin de üstüne kaldırılır. Kamera 25 km'nin üstünde karolar kapanır. Doğrulama: gerçek Google karoları anahtar gerektirdiğinden, KSC çevresinde ECEF'te üretilmiş sahte bir 3D Tiles kümesiyle (zemin elipsoidin 7 m üstünde, 100 m kule, binalar, kuzey şeridi) Chromium'da denendi: hizalama +7,02 m buldu, kırpma/delik, temsilî rampanın gizlenmesi ve 25 km kapanışı doğru; Google'a özgü oturum ve atıf kütüphanenin GoogleCloudAuthPlugin'inde.
- **Alev:**
  - Ortam basıncı düştükçe genişliyor ve uzuyor; şok elmasları alçakta belirgin.
  - Rengi o anda yanan kademenin yakıtına göre: gazyağı turuncu, katı yakıt beyaz-sarı, hidrolox soluk mavi, metan mavi-mor. Örneğin Saturn V'de S-IC turuncu, S-II mavi.
- **Gökyüzü:** kameranın bulunduğu yerden (irtifası ve oradaki Güneş yüksekliği): yer kamerası roket 150 km'deyken de gündüz gökyüzü görür, takip uçağı (18 km) lacivert, araç üstü kamera irtifada siyah. Ölçek yüksekliğiyle (~7,5 km) sönüyor. Ufkun ötesinde, derinlik testli kubbe. 2–25 km arasında griye değil laciverde döner (Preetham modeli gözlemciyi yerde varsayar). Tele izleme kameraları parlak alevi ölçer (pozlama 0,16): ufka yakın gökyüzü beyaza doymaz, uzaktaki alev seçilir.
- **Kalkış bulutu:** parçacıklar kameraya dönük küre gibi gölgelenir (gündüz Güneş'e bakan yüz aydınlık); aleve yakın sıcak parçacıklar gölgelenmez. Egzoz sütunu, karede roketin aldığı yol boyunca dağıtılır ve doğduğu ana göre yaşlandırılır: düşük kare hızında ya da hızlandırılmış zamanda iz kesik kesik olmaz.
- **Geri sayım çekimi:** ~2,7 km'den, 120 m yükseklikten yavaşça kayan alçak hava çekimi: roket, gerçek rampa kompleksi ve kıyı birlikte görünür.
- **Ayrılan kademeler:** ayrılma anındaki durumdan balistik düşüyor (çekim, dönen havada sürüklenme β ≈ 2000 kg/m², 4 m/s geriye ayrılma itişi, yavaş takla). Kesme düzlemleri ya da etiketli parçalarla çiziliyor.

**Sınırlar:**

- Kademe kütle oranları ve itki/ağırlık değerleri yaklaşık; itki ölçeği 0,89–1,17 arasında çıkıyor.
- Model yükü gerçek görevden hafif (örneğin SLS'te 3,6 t'luk iniş aracı, Orion 26 t).
- Hava yoğunluğu 86 km üstünde üstel.
- Yer görüntüsü ve kabartma Chromium'da (yazılımsal WebGL) gerçek Esri ve Terrarium karolarıyla denendi: KSC LC-39B (gündüz/gece, yerden, alçak hava çekimi, 11–88 km araç üstü ve takip) ve Xichang (dağlık).

#### 6.7.1 Kalkış kamerası

Kullanıcı kalkışın "yatay gibi" göründüğünü bildirdi. Ölçüm: rampada roket ekseni ile yerel dikey arası **0,0°**; eğilme Apollo 11'e uygun (Saturn V dikeyden T+60 s'de 17°, T+120 s'de 52°). Sorun kameradaydı.

- Kamera roketin 320 m yanına kilitliydi ve onunla birlikte yükseliyordu. Rampa ve ufuk ilk saniyede kadrajdan çıkıyordu; canlandırma ×10 başladığından yunuslama hemen geliyordu.
- Görev yörüngesi çizgileri (anlık yörünge elipsi, turuncu görev izi) roketin içinden yatay geçiyordu.

Düzeltme (`scene.js` `LAUNCH` kipi, `ascentplay.js`):

1. **Yer kamerası.** Rampanın yanında, uçuş yönüne dik, 1,4 km uzakta ve 12 m yükseklikte durur; tele objektifle izler. Kadraj roketin tepesinden rampaya kadar uzanır; roket yükseldikçe en çok 2,5 roket boyu aşağısını kapsar. Dikey kalkış rampaya ve ufka göre görünür, yunuslama yandan izlenir (uçuş yönü kadrajın sağına akar).
2. **Yerden ayrılmaz.** Yer kamerası roketi ufkun altına inene dek yerden izler. Önceki sürümde 1,5–4,5 km irtifada roketin arkasındaki sanal bir takip kamerasına geçiyordu; bu kaldırıldı, yerine gerçek kameralar geldi (6.7.2).
3. **Hız.** Kalkış ×1 hızda başlar; T+20 s'den sonra ×10 olur (kullanıcı hız seçtiyse dokunulmaz).
4. **Kalkışta gizlenenler.** Yörünge çizgileri, "Araç" işareti ve iniş ayağı ofseti (2,9 m) kalkışta yok; roket rampaya oturur.
5. **İrtifa göstergesi.** Rampada 11,6 m gösteriyordu (yaklaşık elipsoid formülü); artık canlandırmanın WGS-84 irtifasını gösterir.

Doğrulama: başsız Chromium'da açılar ölçüldü. T+8 s'de ekran dikeyi ile yerel dikey arası 3°; geçiş sonrası ufuk kadrajda. Gölgelendirici hatası görülmedi.

#### 6.7.2 Yayın kalitesinde kalkış

Hedef: NASA ve SpaceX canlı yayınlarının çekim dili ve ekran düzeni. Yayını "gerçek" gösteren şeylerin çoğu kamera ve grafik dilidir; tam fotoğraf gerçekçiliği (hacimsel duman, küresel aydınlatma) gerçek zamanlı web için hedeflenmedi.

**Kamera kurgusu** (`js/launchcam.js`, saf, `test_launchcam.js` ile sınanır):

| Zaman | Çekim |
|---|---|
| T−10 → T−3 | Geniş rampa çekimi (helikopter): ~2,7 km'den, 120 m yükseklikten, yavaşça kayar |
| T−3 → T+7 | Rampa kamerası: 160 m'den, yerden 3 m; motorlara ve aleve bakar; kalkışın ses basıncıyla sarsılır |
| T+7 → roket 50 km uzaklaşana dek | Yer izleme (tele): rampanın 1,4 km yanında, yerden 12 m; en dar 1° (~2000 mm sınıfı); operatör gecikmesi 0,35 s |
| roket 900 km uzaklaşana dek | Takip uçağı: 18,3 km irtifada, uçuş yönünde 70 km ileride, 40 km yanda; dengeli tele kamera, en dar 0,4° |
| Max-Q, her ayrılma, uzak kameralar roketi göremeyince | Araç üstü kamera: gövdenin yanından aşağı bakar, ayrılan kademe görünür |

Her kamera gerçek bir yerde durur (rampa çerçevesinde sabit, roketle sürüklenmez) ve roketi yalnız görebildiği sürece gösterir: görüş çizgisi Dünya küresine karşı denetlenir (`launchcam.js` `lineOfSight`, ufuk). Kullanıcı Yer ya da Uçak seçtiyse ve o kamera roketi ufukta kaybettiyse araç üstüne geçilir; bantta "yer kamerası aracı ufukta kaybetti" notu görünür. Uzaktaki roket tele kamerada gerçekte olduğu gibi küçük, parlak bir alev noktasıdır (en az 10 piksel). İzleme hatası görüş açısının %18'iyle sınırlıdır: dar açıda ve hızlandırılmış zamanda roket kadrajdan çıkmaz.

- Ayrılmalarda kamera üst kademeye geçer (kesme + 12 m).
- Kalkış ×1 hızda başlar, ayrılmalar ×2 yavaş çekim, arada ×10. Kullanıcı hızı ya da kamerayı seçerse kurgu ona uyar (Kurgu / Yer / Uçak / Araç üstü).
- Sarsıntı deterministiktir (sinüs toplamı). Yer kameralarında kalkıştaki ses basıncı uzaklıkla azalır ve sönümlenir; araç üstünde dinamik basınca bağlıdır.

**Sinematik görünüm (varsayılan):** kalkış açılınca görev panelleri, üst gezinme, alt denetimler ve ekran işaretleri söner; ekranda sahne, alt yayın bandı ve olay alt yazıları kalır (yeni olay ya da Max-Q bandın üstünde ~4 s; açılışta roket ve rampa). Hız ve kamera düğmeleri üstte ince bir şerittir: fare kıpırdayınca ya da tuşa basınca belirir, ~3 s sonra söner. Görüntü atfı lisans gereği sol altta küçük ve hep görünür. "Paneller" düğmesi panelleri geri getirir.

**Telemetri bandı:** aşama, yere göre hız (km/sa), irtifa, T± saati, o anki kamera ve olay zaman çizgisi (Max-Q, ayrılmalar, yörünge). Yayındaki alt şerit gibidir ve ~11 Hz'de güncellenir. T± sol üst göstergedeki görev saatiyle aynıdır; bant kontrol çubuğunun üstünde durur (çubuk atıfla iki satıra sarınca yükselir), olay etiketleri çizginin altında iki sırada, uçlardakiler bandın içine hizalı.

**Gösterge (sol üst):** kalkışta görev aracının değil roketin değerleri: yere göre hız (bantla aynı), yaklaşık kütle (kalkış kütlesi × modelin kütle oranı, `ascentsim.js` `massState`), yanan kademenin kalan yakıtı, itki; Δv kalkışta gösterilmez. UTC başlıkta bir kez yazılır.

**Gökyüzü:** three.js r170'in resmî `Sky` eklentisi (Preetham analitik gün ışığı modeli, Rayleigh + Mie; `lib/addons/objects/Sky.js`, MIT). Sahnenin logaritmik derinliğine uyarlandı:
- Kubbe ufuk uzaklığında kalır; yıldızları örter, Dünya'yı örtmez.
- İrtifayla saydamlaşır: 15 km'de koyu mavi, ~60 km üstünde siyah.
- Güneş'in araca göre yönü güncel efemeristen alınır.

**Alevin ışığı:** nokta ışık alevin altında durur, yakıt rengindedir ve itkiye göre yanar. Gövdeyi, rampayı ve bulutu aydınlatır; gece güçlenir.

**Kalkış bulutu** (`js/launchfx.js`): örneklenmiş, kameraya dönük dörtgenlerle tek çizim çağrısı, en çok 900 parçacık, uzaktan yakına sıralı. Üç kaynak:
- Alev çukurundan iki yana fışkıran sıcak duman
- T−8 s'den itibaren su püskürtme buharı
- Roketin alçakta bıraktığı egzoz sütunu (3 km üstünde incelir)

Renk Güneş yüksekliğine göre gri-beyazdır, aleve yakın kısım turuncudur.

**Değerlendirilen kütüphaneler:**

| Kütüphane | Karar | Neden |
|---|---|---|
| three.js resmî eklentileri (Sky, EffectComposer/UnrealBloom) | Kullanıldı | Sürümle uyumlu, bakımlı, MIT |
| three.quarks (MIT, parçacık sistemi, ~200 KB) | Kullanılmadı | Tek bir bulut etkisi için gereksiz; aynı teknik doğrudan yazıldı |
| pmndrs/postprocessing | Kullanılmadı | Mevcut sinematik hat (`post.js`, resmî eklentiler) yetiyor; ikinci bir son işlem zinciri boyut ve bakım yükü getirirdi |

**Bilinen sınırlar:**
- Duman hacimsel değildir (ışığı kırmaz).
- Rampa yapıları basittir; LC-39 kulesi yok, SLS'te Mobile Launcher var.
- Uzaktaki yer, uydu görüntüsünün çözünürlüğündedir.

## 7. Ay'a yolculuk: DEP → LLO düzeltmeleri ve LOI doğruluğu (`mission.js`)

**DEP → LLO rota düzeltmeleri (halo profilleri).** Halo'dan ayrılış (DEP) yakışından LLO girişine (~3,5 gün) kadar hiç düzeltme yoktu: DEP'ten 1 sa sonra 0,7 m/s hata perilünü 56–144 km'ye (hedef 100), 1,5 m/s 7,5 km'ye götürüyor, 2,5 m/s Ay'a çarptırıyordu. Artık **TCM-1** (DEP + 12 sa), **TCM-2** (LLO − 12 sa) ve **TCM-3** (LLO − 5 sa) var (birbirine 6 sa'ten yakın olan düşer); üçü de DEP gibi LLO varış noktasını (konum + zaman) hedefler. Gereken Δv eşiğin (0,05 / 0,05 / 0,1 m/s, v) altındaysa yakılmaz: Artemis II ilk dış yol düzeltmesini rota zaten doğru olduğu için iptal etti ([NASA, 3 Nisan 2026](https://www.nasa.gov/blogs/missions/2026/04/03/artemis-ii-flight-day-3-outbound-trajectory-correction-burn-update/)). Plan girdileri "Transfer düzeltmesi 1–3"; Δv tablosunda DEP satırı düzeltmeleri de toplar. NRHO'da DEP + 1 sa'te 0,7 / 1,5 / 2,5 m/s (6 yön, 18 koşu): TCM-1 0,66–3,08 m/s yakar, TCM-2/3 gerekmez, LLO girişinde periselen 99,7–99,8 km, 18 inişin hepsi başarılı (kalan yakıt 59–60 kg). Bozulmasız uçuşta üçü de atlanır (Δv değişmez).

**LOI doğruluğu: LOI-1 + LOI-2.** Eski LOI "bulunduğu yarıçapta dairesel" hızı hedefliyordu; yakış periselenden tb/2 önce (~7 km yukarıda) başlayıp radyal hızı erken söndürdüğü için yörünge hedefin üstünde bitiyordu. Apollo 11'de olduğu gibi iki yakışa bölündü (Apollo 11: LOI-1, sonra uzak yüzde perilün yakınında ters yönlü LOI-2, sonuç ~54 × 66 deniz mili; [Apollo Flight Journal, LOI-2](https://www.nasa.gov/history/afj/ap11fj/12day4-loi2.html)):
- **LOI-1** kapalı döngü yörünge hedeflemesidir (kazanılacak hız güdümü: bulunulan noktadan geçen hedef yörüngenin hızı). Ateşleme anı ve hedef, kopya üzerinde uçulan yakışla öngörülür: varış periseleni hedefteyse (Apollo, NRHO) periselende ortalı yakışın osküle periselen hedefi, hedefin altındaysa (L1/L2 halo → LLO transferi hedef noktayı eğik keser: varış periseleni 87–90 km) ateşleme anı düzeltilir.
- **LOI-2**, bir tur içindeki en yakın noktada kısa düzeltme yakışıdır: hız doğrultusundaki anlık Δv Gauss–Newton ile, sonraki turdaki gerçek yükseklik 24 örnekte hedefe en yakın olacak biçimde (en küçük kareler) çözülür; araç zaten hıza ters hizalı süzüldüğünden yakış için dönmez. Hedef zaten 0,2 km içindeyse ya da LLO tek turluksa yakılmaz. DOI zamanlaması LOI-1'in sonundan sayılır (iniş zamanı değişmez).
- **Neden gerçek yükseklik:** Ay'ın J2/C22 alanında osküle periselen/aposelen tur boyunca ~1,5 km oynar (110 km'de gerçek uzaklığı 109,98–110,03 km olan yörüngenin osküle aposeleni 110,5–111,4 km okunur). Bu yüzden `LOI_END` iletisindeki periselen/aposelen, yayınımla öngörülen bir turdaki en yakın/en uzak gerçek yüksekliktir (LOI-2'den önceki değerler osküle değil, yine gerçek yüksekliktir).

| profil (hedef) | önce: LOI sonu | sonra: LOI-1 sonu → LOI sonu (gerçek yükseklik) | LOI-2 Δv | kalan yakıt (tek kademe, ZEM) |
|---|---|---|---|---|
| Apollo (110 km) | 114,7 × 116,5 km | 110,0 × 111,6 → 109,9 × 110,1 km | 0,36 m/s | 190,3 → 193,0 kg (LOI 832,1 → 829,0 m/s) |
| NRHO (100 km) | 102,0 × 103,7 km | 100,1 × 100,6 → 99,9 × 100,2 km | 0,15 m/s | 60,1 → 61,4 kg |
| L2 · L1 (100 km) | — | 100,0 × 100,6 → 100,0 × 100,0 · 100,0 × 100,7 → 100,0 × 100,1 km | 0,13 · 0,16 m/s | 68,6 · 69,6 kg |
| Apollo 11 · yükseltmeli (110 km) | — | 109,9 × 110,1 · 109,9 × 110,1 km | 0,35 · 0,37 m/s | 193,0 · 192,3 kg |

Python uyumluluk kipinde (`compat`) eski tek yakış korunur. **Sınırlar:** yüksek dereceli Ay çekim alanı (maskonlar) yoktur; gerçek Apollo 11 LOI-2 tam dairesel değil, öngörülen bozulmalar (maskonlar) yörüngeyi zamanla dairesele çeksin diye hedeflenmişti (aynı kaynak). Eşikler ve düzeltme zamanları model değeridir (v).
