# Kendi uydum

Yapımcı masasının **Uydum** sekmesi, kullanıcının kendi uydusunun 3B modelini ya da CAD çiziminin dışa aktarımını fragmana ekler. Uydu, fragmanın açılışından hemen sonra gelen "Uydum" bölümünde park yörüngesinde araçtan ayrılır, kamera da ona döner.

## Akış

1. **Kullanım şartı:** onay kutusu işaretlenmeden dosya düğmesi ve bırakma alanı kapalıdır. Onay (sürüm, zaman, metnin SHA-256 özeti) modelle birlikte saklanır.
2. **Dosya:** CAD çıktısı (STL, OBJ) ya da GLB (glTF ikili); en çok 40 MB ve 1,5 milyon üçgen. Görsel (PNG, JPEG) kabul edilmez.
   - CAD programlarından (SolidWorks, Fusion 360, FreeCAD…) STL ya da OBJ olarak dışa aktarılır.
   - Model birimi önemli değildir: model, girilen gerçek boya (en uzun kenar, 0,1–120 m) ölçeklenir.
   - STL'de yüz normalleri geometriden yeniden hesaplanır, çünkü CAD çıktılarında çoğu zaman sıfır ya da yanlıştır.
   - Renksiz STL ve OBJ çift yüzlü, mat bir malzemeyle çizilir; renk listeden seçilir.
3. **Ayarlar:** ad (bölüm kartında büyük harfle), boy, renk, "Fragmanda göster", modeli değiştir, kaldır. Sekmede modelin dönen bir önizlemesi vardır.

## Fragmanda

- **Çekim** (`cinema.js`, `sat-deploy`): yörüngeye girişten +180 s ile +600 s arasındaki park yörüngesi süresini kapsar. Uydu +215 s'de ayrılır; park yörüngesi çekimi ondan sonra başlar. Uydu yoksa çekim listesi değişmez.
- **Ayrılmadan önce:** uydu aracın gövde x ekseni yönünde, yanına bağlıdır.
- **Ayrılınca:** 0,35 m/s'lik yan itişle uzaklaşır. Konumu, aracın yörünge çerçevesinde (LVLH) Clohessy–Wiltshire göreli hareketiyle hesaplanır. Böylece iki cismin ortak bozucuları (J2 vb.) birbirini götürür ve uydu araca göre doğru süzülür. Ay'a transfer yakışından sonra uydu çizilmez.
- **Kamera** (`RIG.sat`): uydunun yörünge çerçevesinde döner. Temel yön, yörünge normali ile Güneş yönünün ortasıdır, yani uydu aydınlık taraftan görülür. Uzaklık uydu boyuna göre ayarlanır. Bu bölümde kurgu kamerası seçilemez.
- **Konum hesabı:** kamera ve sahne, konumu aynı karenin araç durumundan hesaplar. Böylece hızlandırılmış zamanda bir kare gecikme olmaz.

## Saklama, arşiv ve paylaşım

- **Saklama:** model ve onay kullanıcının tarayıcısında, IndexedDB'de (`ls19-uydum`) durur. Ayrı pencerede açılan masa ile LS19 sekmesi değişiklikleri BroadcastChannel ile duyurur.
- **Arşive yükleme:** iki durumda olur: fragman üretildiğinde (video dışa aktarımı) ya da uydulu bir paylaşım bağlantısı oluşturulduğunda. Kullanım şartı bu ikisini kapsar.
  - Tarayıcı model dosyasını ve bir `meta.json` kaydını (ad, boy, renk, biçim, onay, kurgu) `arsiv/<model özeti>/` altına Vercel Blob'a doğrudan yükler (40 MB'a dek).
  - `api/arsiv.js` yalnız kısa ömürlü yükleme anahtarı verir. Kurallar: yol kalıbı, güncel şart sürümü, biçime göre içerik türü ve boyut, rastgele sonek (üzerine yazılamaz), aynı köken.
- **Arşiv kapalıyken:** kayıt tarayıcıda bekler ve sonraki açılışta yeniden denenir. Uydum sekmesi durumu gösterir: arşivde (arşiv kimliğiyle), bekliyor ya da henüz gerekmedi.
- **Paylaşım:** bağlantı `#…&uydu=<base64url JSON>` taşır: model adresi, ad, boy, renk, biçim. Bağlantıyı açan tarayıcı modeli bu adresten indirir.
  - Adres yalnız `https://<depo>.public.blob.vercel-storage.com/arsiv/<16 onaltılık>/model….<uzantı>` olabilir; boyut sınırı 40 MB.
  - Arşiv kapalıysa bağlantı uydusuz gider ve masa bunu söyler.
- **Arşivden kaldırma:** kullanıcı `github.com/yazicmert/LS19/issues` adresinde arşiv kimliğini yazar. Dosyalar Vercel panelinde, Storage › Blob › `arsiv/<kimlik>/` altında silinir.

### Arşivi açmak (bir kez)

1. Vercel › proje (ls19web) › **Storage** › **Create** › **Blob**: erişimi **Public** seçerek oluştur ve depoyu projeye bağla. `BLOB_READ_WRITE_TOKEN` kendiliğinden eklenir. Private depo olmaz: paylaşım bağlantısı modeli herkese açık adresten indirir. Erişim sonradan değiştirilemez; yanlış seçildiyse depo silinip yeniden oluşturulur.
2. Vercel › proje › **Settings** › **Environment Variables**: `LS19_ARSIV` = `1` (Production).
3. Yeniden dağıt: Deployments › son Production dağıtımı › **Redeploy**. Ortam değişkenleri yalnız bağlandıktan sonraki dağıtıma girer.
4. `https://ls19web.vercel.app/api/arsiv` adresi `"acik":true` döndürmeli. Döndürmüyorsa `denetim` alanı nedeni söyler:
   - `LS19_ARSIV: false`: değişken yok, Production'a eklenmemiş ya da değeri 1 değil.
   - `anahtar: "yok"`: depo bu dağıtımda bağlı değil; yeniden dağıt.
   - `anahtar: "oidc"`: depo okuma-yazma anahtarı vermeden (yalnız `BLOB_STORE_ID`) bağlanmış; bu kip henüz desteklenmiyor.
   - `ortam`: yanıtın hangi dağıtımdan geldiği (production / preview).

Yerel sunucuda (`web/sunucu.py`) arşiv yoktur: `/api/arsiv` her zaman kapalıdır.

> Kullanım şartı metni (`web/js/usersart.js`, `SART_METNI`) bir taslaktır. Yayına almadan önce bir hukukçuya okutulması önerilir. Metin değişirse `SART_SURUM` artırılır. Arşiv yalnız güncel sürümle onaylanmış modelleri kabul eder; eski onaylı modellerde şartın yeniden onaylanması gerekir.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `web/js/usersart.js` | şart metni ve sürümü, biçimler, arşiv yolu ve adres denetimi (tarayıcı ve sunucu ortak) |
| `web/js/usersat.js` | IndexedDB kaydı, süzgeç, arşive yükleme, paylaşım bağlantısı, Clohessy–Wiltshire ve LVLH (three.js içe aktarmaz) |
| `api/arsiv.js` | arşiv ucu: yükleme anahtarı ve kurallar (Vercel Blob, `@vercel/blob`) |
| `web/lib/vercel-blob-client.esm.js` | tarayıcı yükleme istemcisi (`tools/blob_paketle.mjs` üretir) |
| `web/js/usermodel.js` | GLB/STL/OBJ çözme, ölçekleme, boyama, sahnedeki uydu (three.js) |
| `web/js/usersatui.js` | masanın Uydum sekmesi |
| `web/lib/addons/loaders/STLLoader.js`, `OBJLoader.js` | three.js r170 yükleyicileri (MIT) |

Testler: `web/test/test_producer.js` (9. bölüm).
