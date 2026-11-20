# Kendi uydum

Yapımcı masasının **Uydum** sekmesi, kullanıcının kendi uydusunun 3B modelini ya da CAD çiziminin dışa aktarımını fragmana ekler. Uydu, fragmanın açılışından hemen sonra gelen "Uydum" bölümünde park yörüngesinde araçtan ayrılır, kamera da ona döner.

## Akış

1. **Kullanım şartı:** onay kutusu işaretlenmeden dosya düğmesi ve bırakma alanı kapalıdır. Onay (sürüm, zaman, metnin SHA-256 özeti) modelle birlikte saklanır.
2. **Dosya:** GLB (glTF ikili), STL ya da OBJ; en çok 40 MB ve 1,5 milyon üçgen.
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

## Saklama ve arşiv

- **Saklama:** model ve onay yalnız kullanıcının tarayıcısında, IndexedDB'de (`ls19-uydum`) durur. Paylaşım bağlantısına girmez; bağlantıyı açan kişi uyduyu görmez.
- **Pencereler arası:** ayrı pencerede açılan masa ile LS19 sekmesi değişiklikleri BroadcastChannel ile duyurur.
- **Arşiv kaydı:** video dışa aktarıldığında kayda üretim zamanı (`uretim`) eklenir. Kullanım şartı, fragman üretilen modellerin LS19 arşivinde saklanma iznini şimdiden alır.
- **Arşive gönderim:** henüz yok. Sunucu ve depolama gerektirdiği için LS19 web sitesiyle gelecek. O zaman `uretim` kaydı olan modeller, onay kaydıyla birlikte gönderilecek.

> Kullanım şartı metni (`web/js/usersat.js`, `SART_METNI`) bir taslaktır. Yayına almadan önce bir hukukçuya okutulması önerilir. Arşivden kaldırma için bir iletişim yolu da eklenmeli. Metin değişirse `SART_SURUM` artırılır.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `web/js/usersat.js` | şart metni ve sürümü, IndexedDB kaydı, süzgeç, Clohessy–Wiltshire ve LVLH (three.js içe aktarmaz) |
| `web/js/usermodel.js` | GLB/STL/OBJ çözme, ölçekleme, boyama, sahnedeki uydu (three.js) |
| `web/js/usersatui.js` | masanın Uydum sekmesi |
| `web/lib/addons/loaders/STLLoader.js`, `OBJLoader.js` | three.js r170 yükleyicileri (MIT) |

Testler: `web/test/test_producer.js` (9. bölüm).
