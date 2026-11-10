# Araç modelleri: NASA 3D Resources'taki resmî Apollo modelleri

Aracın üç görsel modeli (iniş aracı, Ay yörünge kademesi, TLI kademesi) önceden bu projede betikle üretilmiş **temsili** gövdelerdi. Artık NASA'nın yayımladığı **resmî Apollo modellerinden** türetilir:
[NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) (NASA'nın 3B model deposu). Dönüştürme betiği `tools/apollo_modelleri.mjs`; çıktılar `web/models/lander.glb`, `orb.glb`, `stage.glb`.
Kod: `web/js/scene.js` (`prepModel`, yığın yerleşimi, alev ve RCS konumları).

## 1. Kaynaklar ve lisans

| Dosya | Kademe | NASA modeli | Ne yapıldı |
|---|---|---|---|
| `lander.glb` | iniş aracı | *Apollo Lunar Module* (LM) | Draco açıldı, ağlar birleştirildi, 97.588 → 60.835 üçgene sadeleştirildi, dokular WebP ≤ 1024 px, meshopt + niceleme (589 kB); ayak tabanı y = −2,9 m, ayaktan tepeye 4 m |
| `orb.glb` | Ay yörünge kademesi | *Apollo Soyuz* modelindeki Apollo komuta/hizmet modülünün **hizmet modülü** (SPS motor çanı, RCS blokları, yakıt tankı bölmeleri) | komuta modülü ve Soyuz/yerleştirme modülü düzlemle kesilip atıldı, kesit **kapakla** kapatıldı; 12.874 üçgen, 71 kB |
| `stage.glb` | TLI kademesi | *Saturn V* modelindeki **S-IVB** ve araç aygıt birimi (IU) | S-IVB çevresi düzlemle iki yerden kesilip kapatıldı; 6.622 üçgen, 45 kB |

- **Lisans:** NASA 3D Resources içeriği telifsizdir (NASA yapımı içerik, kamu malı). Yalnız **NASA logosu ve amblemi** (ve benzeri işaretler) NASA'nın kullanım kurallarına tabidir; modellerin dokularında ABD bayrağı ve yazılar gibi
  işaretler bulunur, bunlar projede NASA'nın onayı ya da bağlılık anlamı taşımaz. Kaynak modeller depoya eklenmedi (yalnız türetilmiş, küçültülmüş GLB'ler var). Aynı kaynak uydu modelleri için de kullanılır (`web/models/sats/`, `tools/uydu_modelleri.mjs`).
- **Temsili kalan kısımlar (dürüstçe):**
  - S-IVB'nin kendi motoru (J-2) Saturn V modelinde yoktur; kademenin kıç ucuna aynı modelin **F-1 motor çanı ölçeklenerek** (≈ 1,8 m çap, 2,3 m boy) konuldu. J-2 değildir, yalnız bir motor çanı görünümü verir.
  - Yığın düzeni (üstten alta iniş aracı / Ay yörünge kademesi / TLI kademesi) fizik modelindeki rijit cisim yığınıdır ([6dof.md](6dof.md), `ROLES`); gerçek Apollo düzeni (komuta modülü, LM'in uzay aracı–LM adaptöründe taşınması) değildir.
  - Görsel boyutlar fizikteki kademe rollerinin boyutlarından ayrıdır: iniş aracı 4,0 m (fizik 4,0 m), hizmet modülü gövdesi ≈ 4,4 m (fizik 3,4 m), S-IVB gövdesi 7,5 m + motor çanı 1,5 m = 9 m (fizik 16 m). Eylemsizlik ve kütle merkezi fizik rollerinden hesaplanır; model yalnız görüntü ve alev/RCS yerleşimi içindir.
    Kademe kütleleri, itkileri ve Isp değerleri belirli bir aracın verisi değildir.
  - Atılan komuta modülünün ve Soyuz'un yeri boş bırakılmıştır; Ay yörünge kademesi yalnız hizmet modülüdür.

## 2. Dönüştürme (`tools/apollo_modelleri.mjs`)

Betik bağımsız bir Node programıdır (`@gltf-transform`, `meshoptimizer`, `sharp`; kullanım ve kurulum satırı dosyanın başındadır) ve kaynak GLB'lerden üç çıktıyı **bayt bayt aynı** yeniden üretir.

1. **Okuma:** Draco sıkıştırması açılır; düğüm dönüşümleri köşelere işlenir (`flatten` + `join` + `weld`), malzeme başına tek ağ kalır.
2. **Ağ kesme (`sliceDoc`):** eksen hizalı düzlemde üçgenler kesilir (köşe konumu, normal ve doku koordinatı kesişimde doğrusal ara değerlenir); kesilen yüzün çevresi 72 açı diliminde dıştan taranır,
   boş dilimler komşulardan ara değerlenir ve kesit eksenden bir üçgen yelpazesiyle **kapatılır** (kapak malzemesi çift yüzlüdür).
   Hizmet modülü için düzlem komuta modülünün altındadır, S-IVB için iki düzlem (alt ve üst).
3. **Yerleştirme:** düzgün ölçek ve ötelemeyle araç çerçevesine taşınır (glTF Y-yukarı; itki ekseni +Y, motor çanı −Y); her kademenin başlangıç noktası fizik modelindeki gibidir
   (iniş aracı: ayak tabanı −2,9 m; Ay yörünge kademesi ve TLI kademesi: üst yüz y = 0).
4. **Küçültme:** `meshoptimizer` ile sadeleştirme (sınır köşeleri kilitli), dokular WebP, `EXT_meshopt_compression` + niceleme. `GLTFLoader` için `MeshoptDecoder` gerekir (`scene.js`).
5. **Yerleşim sayıları:** sahne düğümünün `extras` alanına yazılır, `GLTFLoader` bunu `scene.userData` olarak okur: `exitZ`/`exitR` (motor çanı çıkışının z'si ve yarıçapı: alev buradan başlar), `rcsZ`/`rcsR` (RCS iticileri halkası),
   `len` (kademe boyu: altındaki kademe bu kadar aşağıya oturur). Modelin dosyasını değiştirmek yığın, alev ve RCS konumlarını da değiştirir; sahnede ayrıca kod değişikliği gerekmez. Dosyalar yüklenemezse sahne basit yedek geometri çizer
   (`prepModel`; yörünge kademesinde önceki betikle üretilmiş gövde).

## 3. Sahnede

- Yığın (üstten alta): LM / hizmet modülü / S-IVB. LM ile hizmet modülü arasındaki boşluk fizik modelindeki gibi 0,15 m'dir; TLI kademesi `3,05 m + len` (len = 4,55 m) aşağıya yerleşir. SPS çanı (6,19 m) `len`'den uzundur: ucu S-IVB'nin içine ~1,6 m girer (S-IVB'nin üst yüzü kapalıdır, çan görünmez).
- Motor plümü (`fx.js`, vakumda genişleyen HDR kabuk) çıkış yarıçapından ve çıkış z'sinden başlar, gimbal açısıyla döner; RCS plümleri `rcsZ`/`rcsR` halkasından fizikteki görev oranıyla yanar. Gaz değişimi sahnede yumuşatılır (plümün boyu ve ışıması ani basamak yapmaz).
- **Görünüm:** kaynak modellerdeki Maya "blinn" malzemeleri metalik içermez; `scene.js` içindeki tabloyla malzeme adına göre metalik/pürüzlülük verilir (altın folyo, gri metal, beyaz boya…), dolaylı ışık (Dünya/Ay yansıması), her zaman açık kendi gölgesi, yeni motor plümü ve ayrılma/toz efektleri için bkz. [sinematik.md §5](sinematik.md).
- Ayrılan kademeler aynı modellerin kopyalarıdır ve ayrıldıkları yönelimle serbest dönerler ([6dof.md](6dof.md) §2.5).
- Model boyutları: toplam üçgen ~80 bin, indirme ~0,7 MB (ilk açılışta yüklenir; `scene.js` yükleme sayacında).

## 4. Yeniden üretme

```
mkdir m && cd m && npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf meshoptimizer sharp
# NASA/NASA-3D-Resources deposundan ("3D Models/Apollo Lunar Module", "…/Apollo Soyuz", "…/Saturn V") GLB'leri raw_lm.glb, raw_apollosoyuz.glb, raw_saturnv.glb adıyla kopyalayın
cp <depo>/tools/apollo_modelleri.mjs . && node apollo_modelleri.mjs      # → out/lander.glb, out/orb.glb, out/stage.glb  (yalnız birini üretmek için: lm | orb | stage)
```

Betikteki sabitler (ölçekler, kesme düzlemlerinin yerleri, F-1 çanının boyutu) kaynak modellerin birimlerinden elle ölçülmüş değerlerdir; yorumlarında hangi model ölçüsüne dayandıkları yazılıdır.

## 5. Kennedy Uzay Merkezi yapıları (kalkış sahnesi)

NASA 3D Resources'taki rampa çevresi modelleri araştırıldı: *Vehicle Assembly Building (VAB)*, *Crawler* (paletli taşıyıcı), *Gantry* (Mekik dönemi LC-39 sabit/döner servis kulesi), *Mobile Launcher* (SLS ML-1; zaten `web/models/rockets/ml.glb`).
Kalkış sahnesine ikisi eklendi (`tools/ksc_modelleri.mjs` → `web/models/ksc/`; yerleşim `web/js/kscmodels.js`):

| Dosya | NASA modeli | Ne yapıldı | Sahnede |
|---|---|---|---|
| `vab.glb` | *Vehicle Assembly Building (VAB)* | yalnız yüksek bölme gövdesi alındı (modeldeki temsili kontrol merkezi, tanklar ve su kulesi atıldı); 160 m × 157 m × 137 m'ye ölçeklendi, metalik = 0; 1.548 üçgen, 41 kB | gerçek yerinde (rampaya 12 km'den yakınsa: LC-39A/B, SLC-40/41): OSM'deki VAB yüksek bölme çokgenine oturur, kapılar doğu–batı; OSM'deki aynı bina çizilmez (alçak bölme ve kontrol merkezi OSM'den kalır) |
| `crawler.glb` | *Crawler* | 40 m boya ölçeklendi, kaba sadeleştirme (`simplifySloppy`, 279.800 → 38.864 üçgen), metalik = 0; 151 kB | LC-39B kalkışında (ve SLS'in rampasında) OSM'deki *Crawlerway*'in iki şeridinin ortasında, rampadan 900 m uzakta, yol yönünde park hâlinde |

- **Temsili kalan kısımlar (dürüstçe):** VAB modeli biçimlendirilmiştir; kısa kenarı gerçeğe oturması için tek eksende %27 genişletildi (o eksende kapı ve bayrak dokuları biraz geniş). Crawler'ın park yeri gerçek bir kalkıştaki konumu değil, güvenli uzaklıkta temsili bir yerdir.
- *Gantry* (Mekik dönemi servis yapısı) eklenmedi: LC-39A'nın bugünkü kulesi (FSS) prosedürel kafes kule ve OSM'den gelir, LC-39B'de 2011'den beri servis kulesi yoktur. *Mobile Launcher (pad only)* ise SLS'in ML-1'iyle aynı kaynaktır.
- Google 3B karolar açıkken bu modeller de gizlenir (gerçek yapılar fotogrametride vardır). Kabartma (yükselti) gelince zemine oturur.

```
# aynı paketlerle; NASA-3D-Resources'tan "Vehicle Assembly Building (VAB).glb" → raw_vab.glb, "Crawler.glb" → raw_crawler.glb
cp <depo>/tools/ksc_modelleri.mjs . && node ksc_modelleri.mjs      # → out/ksc/vab.glb, out/ksc/crawler.glb (bayt bayt aynı)
```
