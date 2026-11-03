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
