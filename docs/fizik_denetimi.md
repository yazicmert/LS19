# Fizik denetimi: Laboratuvar (Ay görevi, asteroit saptırma, yeniden giriş)

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
