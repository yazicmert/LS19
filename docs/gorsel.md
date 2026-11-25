# Dünya ve Ay görselliği

Bu belge altı iyileştirmeyi anlatır: fiziksel atmosfer, Ay kabartma gölgeleri, görev gününün bulutları, mevsimsel Dünya, Dünya ışığı ile dolunay parlaması, mercek parlaması ile pozlama uyarlaması. Gölgelendiriciler `web/js/bodyshaders.js` içinde, sahne bağlantısı `web/js/scene.js` içindedir. Testler `web/test/test_gorsel.js` dosyasındadır; altı bölüm ve her biri için sayısal ölçüt vardır.

Her biri adres parametresiyle kapatılabilir. Karşılaştırma ve sorun ayıklama için: `?bulut=0`, `?mevsim=0`, `?poz=0`.

## 1. Atmosfer: tek saçılma (Rayleigh + Mie)

Eski sahte kenar pusu (kenara doğru artan sabit mavi) kaldırıldı. Yerine Dünya'nın çevresinde 80 km kalınlığında bir kabuk geldi (`FS_ATM`). Bu kabukta göz ışını boyunca 16 adım, her adımda Güneş'e doğru 4 adım yürünür.

| Değer | |
| --- | --- |
| Rayleigh saçılma katsayısı | (5,8; 13,5; 33,1) × 10⁻³ /km, ölçek yüksekliği 8 km |
| Mie saçılma katsayısı | 21 × 10⁻³ /km (sönüm × 1,1), ölçek yüksekliği 1,2 km, g = 0,76 |
| Karışım | önçarpımlı: saçılan ışık eklenir, yüzey geçirgenlikle puslanır |

Sonuç: öğlen gökyüzü mavi; gün batımı kızıl (öğlene göre R/B oranı 3 katından fazla); gece 0; kenar, merkezin en az 1,5 katı parlak. Kamera atmosferin içindeyken kabuğun arka yüzü çizilir.

## 2. Ay: kabartma gölgeleri

Gece–gündüz sınırında kraterler ve dağlar gölge düşürür. LOLA yükseklik alanında, her pikselden Güneş yönüne 12 adım yürünür (2,2 km × 1,45ᵏ). Yürürken Ay'ın eğriliği de hesaba katılır (s²/2R). Yolda bir tepe Güneş'in yüksekliğini aşarsa piksel gölgede kalır. Hesap yalnız alçak Güneş'te (yükseklik açısının sinüsü ≤ 0,5) yapılır. Çok yakında söner; orada ince arazi kendi kabartmasıyla gölgelenir.

Aynı yürüyüş gece yüzünde de yapılır: Güneş ufkun altındayken yalnız ufku Güneş'ten alçak kalan tepeler aydınlanır. Ay'da en yüksek kabartma (~21 km) ufku en çok ~9° alçaltır; yükseklik sinüsü −0,16'nın (−9,2°) altında her yer gölgededir. Önceden gece yüzünde normal haritasıyla Güneş'e eğilen yüzler 25°–30° derinde bile aydınlanıyordu. Bu yüzden Ay'a yaklaşma çekiminde karanlık yüzeyde dağınık parlak lekeler görünüyordu.

## 3. Görev gününün bulutları

**Kaynak:** NASA GIBS, `VIIRS_NOAA20_CorrectedReflectance_TrueColor` (kamu malı). Görevin kalkış günü kullanılır; gün bugün ya da gelecekteyse dün kullanılır, çünkü günlük mozaik ertesi gün tamamlanır. `web/js/bulutlar.js` 512 px parçaları birleştirir:

- masaüstünde seviye 3: 10 × 5 parça, 5120 × 2560;
- düşük bellekte seviye 2: 2560 × 1280.

Parçaların %60'ından azı inerse mozaik kullanılmaz ve durağan bulut dokusu kalır.

Mozaik gelirse durağan bulut dokusunun tam çözünürlüklüsü (8192×4096, 6,5 MB) indirilmez. Durağan doku o zaman yalnız veri boşluğunda ve kar/buzda kullanılır; orada önceden küçültülmüş 4096×2048'lik doku yeter. Doku yükseltmesi bulutu en sona bırakır ve mozaiğin sonucunu bekler (`scene.js` `upgradeTextures`). Mozaik gelmezse eskisi gibi indirilir: `bulut=0`, ağ hatası ya da istek hiç yapılmazsa, 20 sn sonra. Ölçüm: `docs/performans.md` §19.

**Bulut maskesi:** gölgelendirici her pikselin "bulutsuz zemin ile beyazın karışımı" olduğunu varsayar ve karışımın α'sını çözer (`cloudAt`). Zemin, mevsimli Blue Marble gündüz dokusudur (sRGB). Böylece çöl ve kara bulut sayılmaz. Veri boşluğunda ve kar/buzda (zemin beyaza yakın, çözüm kararsız) durağan doku kullanılır.

**Bulut gölgesi:** bulutların ~6 km yükseklikte olduğu varsayılır. Zemin, Güneş yönünde 6 km / tan(yükseklik açısı) ötedeki bulutun gölgesinde kalır; uzaklık en çok 60 km. Gölge, doğrudan Güneş ışığını %50 kısar.

## 4. Mevsimsel Dünya

**Kaynak:** NASA GIBS, `VIIRS_NOAA20_L3_SurfaceReflectance_BandsM5-M4-M3_8Day`: 8 günlük, bulutsuz, gerçek renk yüzey yansıması. 500m matrisinin 1. seviyesi kullanılır: 3 × 2 parça, 1280 × 640 (≈ 31 km/px).

**Dönemler:** kalkışı içeren dönem ve ondan önceki 3 dönem (`mevsimDonemleri`). Dönemler her yıl 1 Ocak'tan 8'er gün sayılır. Tarih yayımlanmış verinin dışındaysa:

- 45 güne kadar ilerideki gelecek için güncel dönem kullanılır;
- daha uzak gelecek ve 2018 öncesi tarihler için yayımlanmış son yılın aynı mevsimi kullanılır.

**Oran:** yalnız düşük frekans aktarılır (`mevsimOrani`, iş parçacığında):

```
gündüz = taban × 2^((oran − 0,5) · 12 · geçerlilik · kara)
```

Böylece ayrıntı yüksek çözünürlüklü tabandan, renk ve parlaklık (kar, yeşeren ya da sararan bitki) görev döneminden gelir. Oranın adımları:

- Taban, sahnedeki gündüz dokusunun 1280 × 640'a indirgenmiş hâlidir. Ekran kartında bir kez çizilip okunur; ayrı bir indirme yoktur.
- Algılayıcı farkı (VIIRS ↔ Blue Marble), kara pikselleri üzerinden kanal başına ortancayla ayıklanır.
- 4 dönemin her pikselinde parlaklığa göre alt ortanca seçilir. Tek dönemde görünen bulut ve bulut gölgesi böylece elenir.
- Aralık dışı oranlarda (koyu orman üstüne kar, ~35 kat) üç kanal birlikte kaydırılır, yoksa renk döner (karda yeşil leke).
- Tropiklerde (|enlem| < 30°) parlaklık artışı en çok 1,6 kattır: orada beyaz leke kar değil buluttur.
- Kutup gecesi sınırı yumuşatılır (±6 px).

Oran yalnız karaya uygulanır; kara maskesi tam çözünürlükteki özyansıma haritasından gelir.

## 5. Ay: Dünya ışığı ve dolunay parlaması

**Dünya ışığı:** Ay'dan görünen Dünya bir Lambert küresi sayılır. Evre işlevi Φ(α) = (sin α + (π − α) cos α) / π. Burada α, Dünya'da Güneş ile Ay arasındaki açıdır: yeni Ay'da 0 (Ay'dan Dünya dolu görünür), dolunayda π (Dünya karanlık). Işık uzaklığın karesiyle azalır ve rengi mavimsidir. Gerçekte Dünya ışığı güneş ışığının ~10⁻⁴'üdür; ekranda ~100 kat büyütülmüştür (`EARTHSHINE` = 0,03). Normal pozlamada gece yüzü ancak seçilir. Kadrajı gece yüzü doldurunca pozlama uyarlaması (6) açar ve maria ile kraterler görünür.

**Dolunay parlaması** (karşı konum etkisi, Hapke gölge gizlenmesi): B(g) = B0 / (1 + tan(g/2) / h), B0 = 1, h = 0,06. Faz açısı g sıfıra yaklaştıkça yüzey ~1,9 kat parlar, çünkü regolit taneleri kendi gölgelerini örter. Formül, 90°'de değer 1 olacak biçimde ölçeklenmiştir; dörtte bir evre ve yan ışık değişmez.

## 6. Mercek parlaması ve pozlama uyarlaması

**Pozlama** (`web/js/pozlama.js`): ölçüm piksel okumadan, sahnenin geometrisinden yapılır. Dünya, Ay ve araç için iki şey hesaplanır:

- kadrajda kapladıkları pay: görüş alanı ile cismin diski düzlemde iki daire olarak kesiştirilir;
- bu payın aydınlık kısmı: uzaktan diskin evresi, yüzeye yakınken gözün altındaki yerin Güneş yüksekliği.

Kural, gerçek kameradaki parlak nokta öncelikli ölçüm gibidir:

- Belirgin bir aydınlık yüzey (gündüz yüzü, Güneş'teki araç) kadrajdaysa pozlama 1 kalır.
- Kadrajı karanlık yüz dolduruyorsa pozlama açılır, en çok 8 kat. Örnekler: Ay'ın Dünya ışığındaki gecesi, Dünya'nın şehir ışıklı gecesi, gölgedeki araç.
- Kadrajı dolduran çok parlak bir disk (dolunay parlaması, tam Dünya) en çok 0,72'ye kısılır.

Geçiş göz gibidir: karanlığa 1,2 sn, aydınlığa 0,35 sn zaman sabitiyle (logaritmik). Kesmede beklemeden hedefe atlar: bakış 15°'den çok dönerse ya da göz, hedefe uzaklığının %25'inden çok sıçrarsa. Dışa aktarımda sanal saat kullanıldığından aynı kareler aynı pozlamayı verir. Gökyüzü görünümünde pozlama 1'dir.

**Mercek parlaması** (yalnız sinematik kipte, `post.js` `FLARE`). Ton eşlemeden önce HDR'ye eklenir:

- Güneş'ten ekran merkezinden geçen doğru boyunca 6 renkli yansıma "hayaleti";
- merkez çevresinde, yalnız Güneş tarafında, ince kromatik bir hâle yayı;
- Güneş'in çevresinde 6 kollu diyafram dikenleri.

Güneş diskini Dünya ya da Ay örttükçe parlama söner; yumuşak kenar, Güneş'in açısal yarıçapı kadardır. Güneş kadrajdan çıkınca parlama yavaşça kaybolur.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `web/js/bodyshaders.js` | `FS_ATM`, `FS_EARTH` (bulut maskesi, bulut gölgesi, mevsim), `FS_MOON` (kabartma gölgesi, Dünya ışığı, dolunay parlaması), `earthshine()` |
| `web/js/bulutlar.js` | görev gününün VIIRS mozaiği |
| `web/js/mevsim.js`, `web/js/mevsimworker.js` | mevsim dönemleri, oran hesabı (iş parçacığı) |
| `web/js/pozlama.js` | pozlama ölçümü, uyarlama, Güneş görünürlüğü |
| `web/js/post.js` | mercek parlaması geçişi |
| `web/js/scene.js` | `setRealClouds`, `setSeason`, `seasonBase`, `meterFrame` |
