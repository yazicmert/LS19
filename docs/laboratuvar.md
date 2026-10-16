# Laboratuvar: mühendislik deneyleri

LS19'un üst düzeyi iki alandır: **Canlı Gökyüzü** (gözlem: gerçek saat, gerçek uydular ve asteroitler) ve **Laboratuvar** (deney: bir hedef seç, modeli kur, sonucu bilimsel çıktılarla incele). Ay görevi artık Laboratuvar'ın bir dalıdır. Bu belge yapıyı, her deneyin girdi/çıktılarını, fizik modellerini, doğrulamalarını ve sınırlarını anlatır.

## 1. Gezinme ağacı

```
LS19
├─ Canlı Gökyüzü                    gerçek saat: Takip · Uydular · Asteroitler · Çarpma
└─ Laboratuvar
    ├─ Görev ve araç tasarımı
    │   ├─ Ay görevi                Dünya'dan Ay yüzeyine tam görev (N-cisim fizik motoru, 3B) — ayrı alan
    │   └─ Ay'a iniş tezgâhı        Araç → Başlangıç koşulu → Güdüm → Sonuç
    ├─ Çarpışma ve çarpma
    │   ├─ Asteroit → Dünya         Çarpan → Çarpma koşulları → Sonuç
    │   ├─ Uydu ↔ uydu / çöp        Birincil → İkincil ya da tarama → Varsayımlar → Sonuç
    │   └─ Uydu yeniden girişi      Nesne → Fiziksel model → Sonuç
    └─ Gezegen savunması
        └─ Asteroit saptırma        Hedef → Yakın geçiş → İtki → Sonuç
```

- Üst çubukta iki düğme vardır (klavye **M**: Canlı Gökyüzü ↔ Laboratuvar). Ay görevi açıkken üst çubukta **Laboratuvar** etkin kalır ve yanında "› Ay görevi" kırıntısı görünür; Laboratuvar'a tıklamak deney merkezine döner.
- Açılış: `?mode=…` verilmişse o; görev adres parametreleri (`cam`, `seek`, `warp`, `play`, `cine`, `profile`, `date`, görev sekmesi) varsa Ay görevi; yoksa son seçilen üst alan (Canlı Gökyüzü / Laboratuvar), o da yoksa **Canlı Gökyüzü**.
- Adresler: `?mode=lab` (merkez), `?mode=lab&exp=inis|carpma|yakin|giris|saptirma`, `?mode=mission` (Ay görevi). Eski `?tab=saptirma` çalışır.

## 2. Mimari

Gökyüzü motoru (gerçek saat, DE440, uydu/asteroit katmanları) ile görev motoru (fizik worker'ı, görev saati) bağımsızdır; Laboratuvar gökyüzü motorunu paylaşır (`MODE` motor: `mission` | `sky`; `VIEW` alan: `mission` | `sky` | `lab`). Deney sayfaları ilk açılışta **tembel yüklenir** (dinamik `import()`): açılış süresine ve `modulepreload` listesine eklenmezler. Uzun hesaplar arayüzü dondurmasın diye **iş parçacığında** (`labwork.js`) koşar; her deneyin kendi kanalı vardır ve "Durdur" yalnız onu sonlandırır.

| Dosya | İş |
|---|---|
| `js/labui.js` | Deney merkezi (ağaç), başlık/geri, tembel yükleme |
| `js/labkit.js` | Ortak arayüz: adım akordeonu, bilimsel sayı biçimi (2,50×10¹⁵), anahtar–değer tablosu (satır ipucunda tanım/formül), çok serili grafik (doğrusal/log eksen, eşik çizgileri), iş parçacığı kanalı |
| `js/targetpick.js` | Hedef seçiciler: `SatPicker`, `AstPicker` (§3) |
| `js/labwork.js` | İş parçacığı: iniş benzetimi (+ konik çözücü), SGP4 yakın geçiş (çift / tarama), yörünge bozunması |
| `js/landlab.js` · `landbench.js` | Ay'a iniş tezgâhı: arayüz · fizik |
| `js/impactlab.js` · `impacteffects.js` | Asteroit → Dünya: arayüz · fizik |
| `js/conjlab.js` · `conjunction.js`, `breakup.js` | Uydu ↔ uydu / çöp: arayüz · yakın geçiş ve Pc · parçalanma |
| `js/reentrylab.js` · `reentry.js` | Yeniden giriş: arayüz · fizik |
| `js/deflectui.js` · `deflect.js`, `deflectwork.js` | Asteroit saptırma (§8) |

Her deney aynı akışı izler: adımlar katlanır kutulardır, tamamlanan adım tek satırlık özete iner, girdiler sonuçtan sonra değişirse sonuç **"eski"** olarak işaretlenir ve yeniden hesap önerilir. Tablolarda satırın üzerine gelince tanım ya da formül görünür.

## 3. Hedef seçiciler: filtre ya da ad

Tüm katalog asla listelenmez: en çok **40 satır** gösterilir, sayaç kaç cismin süzgeçten geçtiğini söyler; ad/numara ya da süzgeçlerle daraltılır.

- **Uydular** (CelesTrak aktif uydular — Canlı Gökyüzü katmanının verisi; SupGP birleştirilmiş): ad ya da NORAD; grup çipleri (İstasyonlar, Starlink, OneWeb, Seyrüsefer, GEO, Diğer); perije ≥, apoje ≤, eğim aralığı, yörünge türü (LEO/MEO/GEO/HEO); sıralama (ad, perije, eğim, veri yaşı). **Çöp bulutları** istek üzerine indirilir: Cosmos 2251 ve Iridium 33 (2009 çarpışması), Fengyun-1C (2007 ASAT), Kosmos 1408 (2021 ASAT). Vekiller bu dört CelesTrak grubuna izin verir (`api/gp.js`, `sunucu.py`).
- **Asteroitler** (JPL SBDB: Dünya'ya yakın tümü + büyük ana kuşak; Sentry listesi): ad/numara/tanım; sınıf çipleri (Atira, Aten, Apollo, Amor, Diğer); "Yalnız PHA", "Yalnız Sentry"; çap aralığı, MOID ≤, H ≤; sıralama (çap, MOID, çarpma olasılığı, ad).

## 4. Ay'a iniş tezgâhı

**Girdiler.** Araç: kalkış kütlesi, yakıt, en büyük itki, Isp, en küçük kısma (hazır: Apollo 11 LM, küçük robotik araç, özel). Başlangıç (PDI): yükseklik, yatay/dikey hız, iniş yerine uzaklık. Güdüm: **ZEM/ZEV** (Apollo E-güdüm ailesi; iki kapı + son iniş, frenleme süresi aranır), **yakıt-optimal** (kayıpsız dışbükeyleştirme + SOCP, 10 s'de bir yeniden çözüm; Açıkmeşe & Ploen 2007), **sabit irtifa frenleme** (hedefsiz), ya da üçünü **karşılaştır**. Gelişmiş: tümleme adımı, temas ölçütü (Apollo LM: dikey 3,05, yatay 1,22 m/s).

**Canlı türetilen büyüklükler.** Kuru kütle, yakıt kesri, egzoz hızı vₑ = Isp·g₀, Δv kapasitesi vₑ ln(m₀/m_kuru), yakıt debisi, tam itkide yanma süresi, itki/ağırlık (dolu/kuru, Ay yüzeyi), **en küçük itki / kuru ağırlık** (> 1 ise boşalan araç askıda kalamaz — uyarı), askıda kalma süresi; başlangıç için yerel dairesel hız, yatay/dairesel oranı, uçuş yolu açısı, özgül enerji, serbest yörüngenin perilune/apolune'u, **ideal Δv** (enerji alt sınırı √(v₀² + 2μ(1/R − 1/r₀))) ve Δv payı (kapasite < ideal ise "fiziksel olarak olanaksız").

**Çıktılar.** Karar (güvenli / sert / yakıt bitti / tamamlanamadı); temas hızları, hedeften sapma, süre; harcanan ve kalan yakıt, askıda kalma payı; harcanan Δv, ideal Δv, **çekim + yönlendirme kaybı**, kalan pay; itki/ağırlık, en büyük ivme (g₀ ve g_Ay), kullanılan kısma aralığı; fazlar; ZEM'de seçilen frenleme süresi, optimal'de plan süresi/yakıtı, yeniden çözüm ve çözücü süresi. Grafikler: yörünge (yükseklik–menzil), hız bileşenleri (log), kısma ve itki yönü, kütle, **faz düzlemi** (son 2,5 km), frenleme süresi araması; karşılaştırmada tablo + üst üste eğriler.

**Model ve doğrulama** (`test_landbench.js`): düzlemsel 3 serbestlik, küresel dönmeyen Ay, RK4. İtkisiz düşüşte enerji korunumu (546,54 = 546,54 m/s), roket denklemi ↔ ∫T/m dt (1926 = 1926 m/s). Apollo 11 LM: ZEM/ZEV 7.070 kg, kayıp 217 m/s; yakıt-optimal 7.002 kg, kayıp 191 m/s; sabit irtifa frenleme 679 m/s kayıpla yakıtı bitirir (yerçekimi kaybı sıralaması beklenen yönde). Δv kapasitesi ideal sınırın altındaki araç her yasada başarısız olur.

## 5. Asteroit → Dünya

**Girdiler.** Çarpan: katalogdan (§3) ya da elle. Katalogdan seçilince sınıf, çap (ölçülmüş ya da H ve albedodan), tayf türü, a/e/i, günberi, MOID (AB ve Ay uzaklığı), **Öpik karşılaşma hızı** v∞ (U² = 3 − 1/a − 2√(a(1−e²)) cos i, Dünya yörünge hızı biriminde; yörüngeler kesişiyor varsayımıyla) ve varsa Sentry (olasılık, Palermo, Torino, yıllar, v∞) gösterilir. Öneriler: çap, tayf türünden yoğunluk (C → gözenekli 1500, S → taşlı 3000, M → demir 8000 kg/m³), hız √(v∞² + 11,19²) (Sentry ya da Öpik). Koşullar: çap, yoğunluk, hız (11,2–72 km/s), giriş açısı (en olası 45°), hedef zemin (sedimanter, kristalen, su + derinlik), gözlemci uzaklığı.

**Çıktılar.** Karar (hava patlaması / parçalanarak çarpma / bütün hâlde çarpma), kinetik enerji (J ve Mt TNT), **ortalama yineleme süresi**. Atmosfere giriş: dayanım Yi, parçalanma parametresi If, parçalanma yüksekliği ve hızı, hava patlaması yüksekliği ya da yere çarpma hızı, atmosferde/yüzeyde bırakılan enerji. Krater: geçici ve son çap/derinlik, basit/karmaşık, kenar yüksekliği, breş merceği, ergiyik hacmi, su katmanı. Gözlemci konumunda: ateş topu yarıçapı, görünen kesir, ışınım enerjisi, akı (Güneş katı), yanık eşikleri; Richter ve etkin büyüklük, Mercalli; ejekta kalınlığı/parça boyu/varış; **hava şoku** aşırı basıncı, rüzgâr, ses düzeyi, varış, hasar; tsunami genliği ve varışı. Küresel: momentum oranı, gün uzunluğu değişimi. Hasar yarıçapları (şok, rüzgâr, ısı, sismik eşikleri). Yalnız H biliniyorsa **çap belirsizliği** tablosu (albedo 0,05 / 0,14 / 0,25). Grafikler: giriş profili, **enerji bırakma eğrisi** dE/dz, aşırı basınç–uzaklık (eşiklerle, log–log), ateş topu ışınımı–uzaklık.

**Model ve doğrulama** (`test_impacteffects.js`): Collins, Melosh & Marcus (2005). Çelyabinsk hava patlaması 30,8 km (gözlenen 29,7 km), kent (40 km) 0,70 kPa → "camlar kırılabilir" (gözlenen yaygın cam hasarı); Tunguska 11,4 km'de 5,3 Mt; Meteor Krateri 1,30 km (gözlenen 1,19 km); Chicxulub karmaşık krater 123 km; sayısal tümleme ↔ kapalı biçim (Eq. 19–20) eşit; enerji dengesi; Mach bölgesi ve sismik geçişlerde süreklilik. Sınır: büyüklük sırası doğruluğu (makalenin uyarıları); varsayımsal senaryodur.

## 6. Uydu ↔ uydu / çöp

**Girdiler.** Birincil cisim (§3); ikincil: **belirli bir cisim** (pencere içindeki tüm yerel en yakın yaklaşmalar) ya da **süzgeçli tarama** (süzgeçten geçen tüm adaylar — ör. bir çöp bulutu ya da Starlink — eşik mesafesi içinde). Pencere (1–72 saat, başlangıç gökyüzü saati), eşik, kaba adım. Varsayımlar: her cisim için 1σ RTN belirsizliği (varsayılan veri yaşıyla büyür: radyal 0,1 + 0,05·gün, iz boyu 0,5 + 1·gün, çapraz 0,1 + 0,05·gün km), sert cisim yarıçapı, kütle, tür (uydu / roket gövdesi).

**Hesap.** SGP4 (TEME). Tarama: apoje/perije süzgeci → kenetli/eş yörüngeli cisimlerin ayıklanması (ör. ISS modülleri) → kaba örnekleme + altın oran ile TCA. Birincilin yayılımı ızgarada önbelleklenir; SGP4 ~1 µs/çağrı, 24 saat × binlerce aday birkaç saniye.

**Çıktılar.** Karar: **Pc** ve risk sınıfı (≥ 10⁻⁴ kırmızı: manevra değerlendirmesi; ≥ 10⁻⁵ sarı). TCA, kaçırma, **RTN bileşenleri**, göreli hız, yaklaşma açısı; birleşik sert cisim yarıçapı, karşılaşma düzleminde σx/σz/ρ, Mahalanobis uzaklığı, Pc (Foster 1992), **en kötü durum Pc** (Alfano 2005) ve kovaryans ölçeği, **seyrelme bölgesi** yorumu. Çarpışsaydı (NASA standart parçalanma modeli): EMR, felaket mi, ≥ 1 m / 10 cm / 1 cm parça sayısı, en büyük parça. Grafikler: karşılaşma düzlemi (1σ/3σ elipsleri, sert cisim dairesi), TCA çevresinde uzaklık, **Pc–belirsizlik ölçeği** (seyrelme eğrisi), N(≥Lc), **Gabbard çizelgesi** (örnek parçaların apoje/perije–periyot dağılımı). "3B'de TCA'ya git" gökyüzü saatini TCA'dan 90 s önceye alır ve birincili izler.

**Doğrulama** (`test_conjunction.js`): Foster ↔ kapalı biçim ve Rice tümlevi, küçük R yaklaşımı, en kötü durum R²/(e d²); doğrusal ve kesişen dairesel yörüngelerde analitik TCA; gerçek GP ile ISS taraması (kenetli modüller ayıklanır); Iridium 33–Kosmos 2251: EMR 42.588 J/g (felaket), model ≥ 10 cm 1.211 parça (kataloglanan ~2.300: modelin bilinen sınırı). Sınır: GP kovaryans taşımaz (belirsizlikler varsayım), SGP4 konumu km düzeyinde hatalıdır; operatörler kovaryanslı özel efemeris (CDM) kullanır.

## 7. Uydu yeniden girişi

**Girdiler.** Nesne: katalogdan (alçak yörünge süzgeci açık) ya da elle (perije, apoje, eğim). Balistik katsayı BC = m/(C_D A): kütle, ortalama kesit alanı, C_D ya da GP'nin B*'ından (BC = 0,157/(2B*)). Atmosfer: Güneş etkinliğine duyarlı (üç F10.7 senaryosu + Ap) ya da durağan (Vallado 2013). Giriş: burun yarıçapı, 120 km'de uçuş yolu açısı.

**Çıktılar.** Yörünge ömrü ve **yeniden giriş tarih penceresi** (düşük/orta/yüksek Güneş etkinliği), şu anki alçalma hızı; 120 km'den balistik giriş: en büyük yavaşlama (g) ve yüksekliği, en büyük durma noktası ısı akısı (Sutton–Graves) ve yüksekliği, toplam ısı yükü, 78 km'ye (geleneksel parçalanma) varış süresi/menzili/hızı, yere ulaşma; **enlem bandı** ve en olası enlemler; kütle verilmişse yere ulaşabilecek kütle (kaba, %10–40). Grafikler: yörünge bozunması (senaryo başına perije/apoje), yeniden giriş enlemi olasılığı, giriş profili, yavaşlama ve ısı akısı–yükseklik.

**Doğrulama** (`test_reentry.js`): dairesel yörüngede analitik ömür (%1 içinde), dairesellenme, Güneş etkinliği etkisi (450 km, BC 100: F10.7 = 70'te 6,2 yıl, 250'de 0,7 yıl), ISS benzeri alçalma 3,1 km/ay; dik girişte Allen–Eggers en büyük yavaşlaması (80,9 ↔ 83,1 g); enlem dağılımı. Sınır: gelecekteki Güneş etkinliği bilinmez (gerçek tahminler bile ±%10–20), sabit BC, dönmeyen atmosfer, tek cisimli giriş. B* bir uydurma terimidir; manevra ve hatayı da emer (ISS'te BC'yi olduğundan büyük verir).

## 8. Asteroit saptırma

Dört adım: **Hedef** (hızlı seçim çipleri ya da arama; MOID > 0,05 AB ise önceden uyarı) → **Yakın geçiş** (N-cisim taraması; boş durumda "120 yıla uzat" / "başka hedef") → **İtki** (kinetik çarpıcı ya da sürekli itki; "geçişten ne kadar önce" çipleri; senaryo: *gerçek yörünge* ya da *çarpacak olsaydı*, B = 0) → **Sonuç** (karar kartı, "ne kadar gerekir" cümlesi, B-düzlemi, ayrıntılar, 3B yollar). Fizik: Güneş + 8 gezegen + Ay + Plüton (DE440) ve genel görelilik düzeltmesiyle DOPRI5; B-düzlemi (Öpik–Valsecchi), STM ve tam tümleme (`test_deflect.js`: Apophis 2029, JPL CAD ile ~2 km).

| Senaryo | Durum | Karar |
|---|---|---|
| Çarpacak olsaydı | kayma ≥ yakalama yarıçapı (bE) | **Dünya kurtulur** |
| Çarpacak olsaydı | kayma < bE | **Bu itki yetmez** (sağlanan oran) |
| Gerçek yörünge | nominal çarpıyor, saptırılmış ıskalıyor | **Çarpma önlendi** |
| Gerçek yörünge | nominal ıskalıyor, saptırılmış çarpıyor | **Saptırma çarpmaya yol açtı** |
| Gerçek yörünge | ikisi de ıskalıyor / çarpıyor | **Iskalamaya devam eder** / **Yine çarpar** |

## 9. Telefon düzeni

Laboratuvar'a girilince panel kendiliğinden açılır; üst çubuk iki düğmeyle 390 px'e sığar (etkin olmayanın yazısı gizlenir). Grafikler panel genişliğine uyar, yatay taşma yoktur; "3B'de göster/git" paneli kapatır.

## 10. Doğrulama

- Fizik: `node test/test_impacteffects.js`, `test_conjunction.js`, `test_reentry.js`, `test_landbench.js`, `test_deflect.js`.
- Arayüz sözleşmesi: `node test/test_lab.js` — iki üst alan ve kırıntı, ağaç/sayfa uyumu, deney modüllerinin tembel yüklenmesi ve `modulepreload` dışında kalması, iş parçacığı işleri, seçici süzgeçleri (≤ 40 satır), çöp gruplarının vekil izin listelerinde olması, açılış kuralı.
- Tarayıcı: `node tools/lab_deneme.mjs [--bolum=saptirma,adres,deneyler,telefon]` — başsız Chromium'da tüm akışlar: iniş (ZEM/ZEV güvenli, üç yasa karşılaştırması: optimal < ZEM yakıtı, kısma uyarısı ve "eski" bandı), çarpma (PHA süzgeci, Apophis, elle Çelyabinsk benzeri hava patlaması 32 km), yakın geçiş (NORAD ile ISS, çöp bulutu yükleme, iş parçacığında tarama, Pc ve 5 grafik, 3B'de TCA), yeniden giriş (B*'dan BC, Güneş senaryoları, 4 grafik), adres parametreleri ve telefon. `api/*` gerçek bulut işlevleriyle `web/test/fixtures` yanıtlarından karşılanır; çöp bulutu için sınamaya özel yapay veri üretilir. İnternet gerekmez.

**Sınırlar:** tarayıcı denemesi yazılım çizimiyle (SwiftShader) ve kopya veriyle yapıldı (GP kopyası 2026-09-28 çağlı); gerçek CelesTrak/JPL sunucusuyla, gerçek GPU'yla ve gerçek telefonda denenmedi.

## 11. Yeni deney eklemek

1. `index.html` → `#labPanel` içine boş `<div id="lab-<ad>" class="labpage" hidden></div>`, `#lab-home` ağacına `<button class="exp" data-exp="<ad>">`.
2. `labui.js` → `LAB_PAGES`'e başlık, `LAZY`'ye `<ad>: () => import('./<modül>.js')`.
3. Modül `export default class { constructor(root, ctx) }` olsun; `labkit.js`'in `stepsHtml`/`Steps`, `numF`, `cardsHtml`/`bindCards`, `kvTable`, `autoPlot` ve (uzun hesap için) `labWork('<kanal>', {kind, …})` araçlarını kullansın; iş türünü `labwork.js`'e ekleyin. Fiziği DOM'suz ayrı bir modüle koyup Node testiyle doğrulayın.
4. `test_lab.js`'teki `EXP_MOD` eşlemesine ekleyin (tembel yükleme ve adım yapısı kendiliğinden denetlenir).
