# LS19 (Look Star 19) — Canlı Uzay Simülasyonu

Dünya park yörüngesinden Apollo 11 iniş bölgesine kadar tüm görev tarayıcıda, gerçek zamanlı çalışan fizik motoruyla uçar.
Güneş sistemi de canlı hesaplanır: Dünya ve Ay kendi eksenleri etrafında döner, ortak kütle merkezleri etrafında dolanır.
Görev modülerdir: Dünya park yörüngesi ve Ay'daki bekleme yörüngesi (alçak dairesel LLO ya da halo/NRHO) seçilebilir,
tasarım her seçim için en az Δv'li yörüngeyi kurar. Dünya ve Ay çevresindeki gerçek uydular ve ~53.000 asteroit canlı gösterilir;
saptırma laboratuvarı bir asteroide uygulanan itkinin Dünya yakın geçişini ne kadar değiştirdiğini fizik motoruyla hesaplar.

## Açma
- `baslat.command` dosyasına çift tıkla (ilk seferde macOS "tanımlanmamış geliştirici" uyarısı verirse: sağ tık → Aç).
  Bu, `sunucu.py`'yi başlatır: sitenin dosyaları + canlı veri (CelesTrak, JPL Horizons, JPL SBDB, Sentry) için yerel vekil ve önbellek.
- Ya da Terminal'de bu klasörde: `python3 sunucu.py` ve tarayıcıda `http://localhost:8765`.
- Dosyayı doğrudan (file://) açmak çalışmaz. Eski `python3 -m http.server` da site için yeterlidir ama uydular gelmez.
- En hızlı çalışma için Safari ya da Chrome önerilir.
- Adres parametreleri: `?date=1969-07-16`, `?profile=NRHO` (APOLLO, APOLLO11, NRHO, L2, L1), `?sats=0` (uyduları kapat), `?ast=0` (asteroitleri kapat), `?tab=saptirma`.
- Bulutta (Vercel) aynı site `api/` işlevleriyle çalışır; kurulum için depo kökündeki README'ye bakın.

## İki çalışma alanı
- Üstteki anahtar (ya da **M**): **Ay Görevi** — değiştirilebilir, koşturulabilir fizik motoru ve görev saati;
  **Canlı Gökyüzü** — gerçek saat, uydular, asteroitler, saptırma laboratuvarı. İkisi ayrı saat, efemeris ve kamerayla çalışır;
  görev arka planda sürer, uydu ve asteroitler görev alanında çizilmez.

## Canlı Gökyüzü
- Saat: **Şimdi** (N) gerçek zamana döner, **Boşluk** duraklatır, **, .** hızı değiştirir (×1–×3600), ±1 saat düğmeleri.
- Kamera (1–5): Dünya, **Gözlemci** (bulunduğun yerden gökyüzü; sürükle: bak, tekerlek: yakınlaştır), Dünya–Ay, Ay, Güneş sistemi.
- **Takip** sekmesi: gözlemci (şehir ya da "Konumumu kullan"), takip listesi (tarayıcıda saklanır; ISS, Tiangong, Hubble varsayılan),
  her uydu için irtifa, hız, yer izi noktası, Güneş/gölge, gökteki yeri; **İzle** (kamera), **Gökte** (gözlemci kamerası), **Yer izi**
  (yer izi + kapsama dairesi), **Kaldır**. Uydu kartında **Takibe al**.
- Yaklaşan geçişler (3 gün, en yüksek ≥ 10°): doğuş, en yüksek, yön, çıplak gözle görünürlük; satıra tıkla → ayrıntı ve gökyüzü çizimi,
  **Geçişe git ve gökte izle**. "Görünür geçişten 5 dk önce bildir" tarayıcı bildirimi ister (sayfa açıkken çalışır).
- ISS, Starlink, OneWeb, GPS, GLONASS, Planet, Intelsat, SES, Kuiper için operatör verisi (CelesTrak Supplemental GP) kullanılır.

## Görev yapılandırması (Görev sekmesi)
- Profil: Apollo hızlı (LLO 2 tur) · Apollo 11 gibi (LLO 13 tur, park eğimi 32,5°) · Artemis NRHO 9:2 · L2 halo · L1 halo · Özel.
- Dünya park yörüngesi: irtifa (160–1000 km), eğim (28,6–90°), tur.
- Ay bekleme yörüngesi: LLO (irtifa, tur) ya da halo (NRHO 9:2, L2 güney Az 13.000 km, L1 kuzey Az 10.000 km; en az tur);
  halo seçilince iniş, halo'dan LLO'ya iki yakışlı transferle yapılır (ayrılış anı, LLO düzlemi ve varış noktası en az Δv için aranır).
- Tarih seç, **Tasarla**. Varsayılan tarihte (13 Ekim 2026) tüm hazır profiller önceden hesaplanmıştır (anında açılır);
  başka tarihlerde Apollo birkaç saniye, halo profilleri 20–50 saniye sürer.
- Δv sekmesi: manevra bazında nominal/gerçekleşen Δv ve **profil karşılaştırması** (satıra tıkla: o profil yüklenir;
  "Bu tarih için hesapla" seçili tarihte tüm profilleri tasarlar).
- Araç boyutlandırma: iniş aracı ve TLI kademesinin yakıtı profilin Δv bütçesinden hesaplanır.

## Uydular (Uydular sekmesi)
- Dünya: CelesTrak "aktif uydular" (≈16.600), SGP4 ile ayrı iş parçacığında; gruplar (istasyonlar, Starlink, OneWeb, seyrüsefer, GEO, diğer)
  açılıp kapanabilir; ad ya da NORAD no ile ara, seçilen uydunun yörüngesi çizilir. Veri 2 saatte bir yenilenir.
  Uydu noktaları kameraya yaklaştıkça büyür (yakın plan görünümde kaybolmaz).
  Yörünge öğeleri çağından ±30 gün dışında (ör. 1969) gösterilmez.
- Gerçek 3B modeller (NASA 3D Resources): ISS, Hubble, Chandra, GOES, TDRS, Landsat… 50'den fazla uydu. Model yalnız kamera o uyduya
  yaklaşınca (büyüklüğüne göre ~1,5–16 km) indirilir ve çizilir, aynı anda en fazla 3 model; uzaklaşınca kaldırılır. Kartta
  "3B model" satırı ve **3B modeli yakından gör** düğmesi vardır; modeli olmayan uydular yakından temsili modelle gösterilir.
- Ay: LRO, Danuri (KPLO), Chandrayaan-2, ARTEMIS P1/P2, CAPSTONE — JPL Horizons vektörleri, yalnız verisi bulunan tarihlerde.
- Veriler `data/cache/` altında önbelleğe alınır; internet yoksa son kopya kullanılır.

## Otomatik güncelleme (10 dakika)
- Tarayıcı 10 dakikada bir `/api/surum`'u sorar; hangi kaynağın yeni sürümü varsa yalnız o katman yeniden yüklenir (sayfa yenilenmez).
- Yerel sunucu da arka planda 10 dakikada bir denetler ve süresi dolan veriyi önceden indirir.
- Kaynak kuralları korunur: CelesTrak aynı veriyi en sık 2 saatte bir verir (daha sık indireni engeller); JPL SBDB ve Sentry günde bir.
  Uyduların ve asteroitlerin konumları ise sürekli (her karede) hesaplanır.

## Asteroitler (Asteroit sekmesi)
- JPL Small-Body Database: Dünya'ya yakın tüm asteroitler (~42.500), ana kuşak (H < 13,5) ve Jüpiter Truvalıları (H < 13).
- Gruplar: Sentry risk listesi, potansiyel tehlikeli (PHA), NEO, Truvalılar, ana kuşak — açılıp kapanabilir; ad/numara ile ara.
- Güneş sistemi kamerasında hepsi, diğer kameralarda yalnız Dünya'nın 0,05 AB yakınındakiler görünür.
- Tıkla: bilgi kartı (sınıf, çap, albedo, dönme, a/e/i, MOID, uzaklıklar, sonraki yakın geçiş, Sentry olasılığı, keşif);
  **Kamerayla izle** yakından temsili kaya modeli gösterir, **Saptırma analizi** laboratuvarı açar.

## Saptırma laboratuvarı (Saptırma sekmesi)
- Hedef seç → **Tara**: fizik motoru (Güneş, 8 gezegen, Ay, Plüton — JPL DE440 konumları — ve Güneş'in genel görelilik düzeltmesi, DOPRI5)
  seçilen tarihten itibaren Dünya'ya 0,05 AB'den yakın geçişleri bulur (JPL CAD ile eşleşenler ✓ ile işaretlenir).
- Yöntem: **kinetik çarpıcı** (araç kütlesi, çarpma hızı, β → Δv = β·m·U/(M+m)) ya da **sürekli kuvvet** (N × gün, iyon demeti/çekim traktörü gibi).
- Sonuç: Δv, yörünge değişimi (Δa, ΔP), B-düzleminde kayma (ξ, ζ), yakın geçiş mesafesi önce/sonra, yakalama yarıçapı (çekim odaklaması dahil),
  Dünya'yı bir yakalama yarıçapı kaydırmak için gereken Δv / çarpıcı kütlesi / kuvvet; B-düzlemi çizimi, önceden uyarı süresi eğrisi, 3B yollar.
- "Çarpma rotasındaymış gibi" seçeneği gerçek yörüngeyi Dünya merkezine gidiyormuş gibi kabul eder: itki bu çarpışmayı önler mi?
- Doğrulama: Apophis 13 Nisan 2029 yakın geçişi JPL CAD'e göre ~2 km farkla; DART/Dimorphos periyot değişimi.

## Kontroller
- **Boşluk**: başlat/duraklat · **. ,**: zaman hızı ×2 / ÷2 · "Otomatik hız" olaylara yaklaşırken yavaşlatır
- **G**: otopilot aç/kapa · **P**: 2 m/s rastgele bozulma (rota düzeltmeleri telafi eder)
- **M**: çalışma alanı değiştir · **Fare**: uydu, asteroit ya da gezegene gel → ad; tıkla → bilgi kartı
- **Alt çubuk**: Başlat, zaman hızı (− ×N +) görünür; **Kamera ▾** ve **Uçuş ▾** (otopilot, otomatik hız, bozulma, baştan başlat) açılır ağaç menüdedir.
  Canlı Gökyüzü'nde **Hız ▾** (×1…×3600, ±1 sa, ±1 gün) ve **Kamera ▾** (Yerden: Gözlemci · Uzaydan: Dünya, Dünya–Ay, Ay, Güneş sistemi).
  Menüler ok tuşlarıyla gezilir, Esc ya da dışarı tıklama kapatır.
- **1–8**: kamera (Otomatik, Araç, Dünya, Ay, Dünya–Ay, İniş yeri, Kütle merkezi, Güneş sistemi) · fare sürükle: döndür, tekerlek: yakınlaştır
- Otopilot kapalıyken: **W/S** ileri/geri, **A/D** normal/anti-normal, **Q/E** radyal dış/iç, **R** yüzeye göre geri, **H** sabit tut,
  **Shift/Ctrl** itki ±%10, **Z** tam itki, **X** kes, **B** kademe ayır
- Görev çizelgesindeki bir olaya tıkla: görev o ana kadar hızlıca (ekransız) koşulur ve oradan devam eder.
- **Fareyle üzerine gel**: uydu ya da gezegenin adı · **tıkla**: bilgi kartı · **Esc**: kartı kapat
  - Uydu kartı: grup, yörünge türü, irtifa, hız, yer izi, aydınlanma, periyot, eğim, perije/apoje, dış merkezlik, öğelerin yaşı;
    **Yörüngesini göster** ve **Kamerayla izle** (kamera uyduya kilitlenir; birkaç km'ye inince temsili 3B uydu modeli görünür).
  - Gezegen kartı: yarıçap, Güneş'e ve Dünya'ya uzaklık (ışık süresi), yörünge hızı, periyodu, yarı büyük eksen ve e; **Yakınlaş** kamerayı gezegene götürür (gerçek boyutlu küre, Jüpiter bantları, Satürn halkası).
  - Güneş sistemi görünümünde Dünya–Ay'a tıklamak Dünya–Ay kamerasına geçer.

## İçerik
- `js/cr3bp.js` — Dünya–Ay CR3BP: Richardson başlangıcı, diferansiyel düzeltme, halo/NRHO aileleri
- `js/halo.js` — halo yörüngesini tarihe taşıma (nabız atan dönen çerçeve) ve Dünya+Ay+Güneş+Ay J2/C22 modelinde çoklu atış
- `js/design.js` — modüler görev tasarımı (Apollo/LLO ve halo profilleri, TLI, KSC fazlaması, araç boyutlandırma)
- `js/mission.js` — otopilot (TLI, MCC, LOI ya da NRI + istasyon tutma + ayrılış + LLO girişi, DOI, PDI güdümü)
- `js/ephem.js`, `js/earth.js`, `js/jplkernel.js` — canlı N-cisim efemerisi, Dünya yönelimi, JPL çekirdek okuyucu
- `js/engine.js` — fizik motoru · `js/worker.js` fizik iş parçacığı · `js/nominal.js` nominal Δv koşusu
- `js/sats.js`, `js/satlayer.js`, `lib/satellite.esm.js` (satellite.js, MIT) — canlı uydular
- `js/satcatalog.js`, `js/satmodels.js`, `models/sats/` — gerçek 3B uydu modelleri (NASA 3D Resources, kamu malı), `lib/addons/libs/meshopt_decoder.module.js` (MIT)
- `js/treemenu.js` — alt çubuktaki açılır ağaç menüler
- `js/scene.js` Three.js görüntü · `js/ui.js` HUD ve paneller · `js/terrain.js` iniş bölgesi arazisi
- `js/asteroids.js`, `js/astwork.js` — canlı asteroitler · `js/deflect.js` — saptırma fizik motoru · `js/deflectwork.js`, `js/astui.js` — laboratuvar
- `js/updater.js` — 10 dakikalık güncelleme denetimi
- `sunucu.py` — yerel sunucu + veri vekili · `../api/` — aynı vekilin bulut (Vercel) sürümü · `data/designs_default.json` — hazır tasarımlar
