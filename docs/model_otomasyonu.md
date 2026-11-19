# 3B model otomasyonu

`.github/workflows/modeller.yml` her ayın 2'sinde (ya da elle, Actions → "3B modelleri güncelle") açık lisanslı kaynakları tarar. LS19'a uyan yeni modelleri ekler ve **inceleme için PR açar**; `main`'e doğrudan yazmaz. Modeller git'e girmez: yeni paketler `varliklar` Release'ine yüklenir, PR yalnız bildirimi (`varliklar.json`) ve kataloğu değiştirir ([varliklar.md](varliklar.md)).

## Kaynaklar

| Kaynak | Lisans | Ne eklenir | Araç |
| --- | --- | --- | --- |
| [DAMIT](https://damit.cuni.cz/projects/damit/) | CC BY 4.0 | LS19'un asteroit kümesindeki (SBDB: Dünya'ya yakınlar, ana kuşak H<13,5, Truvalılar H<13) her asteroidin en iyi ışık eğrisi şekil modeli ve dönme durumu | `tools/model/damit.mjs` |
| [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources) | NASA medya kullanım kuralları (telifsiz) | yörüngedeki bir uyduyla kesin eşleşen uzay aracı modelleri | `tools/model/uydu.mjs` |

**Kapsam dışı:**
- Karışık ya da kısıtlı lisanslı siteler (Sketchfab, ESA modelleri vb.).
- NASA PDS şekil arşivi: portal bot doğrulamasıyla korunuyor; mevcut 33 PDS/Eyes modeli elle eklendi (`tools/asteroit_modelleri.py`).
- NASA Eyes: taranabilir bir dizini yok; elle eklenir (`tools/uydu_modelleri_eyes.txt`).

## DAMIT

DAMIT her ayın 1'inde tam bir döküm yayımlıyor (~4 GB). Araç önce DAMIT'in asteroit tablosundan LS19 kümesindeki asteroitleri bulur. Sonra dökümü diske indirir (kesilirse HTTP Range ile kaldığı yerden) ve **yalnız** o asteroitlerin `shape.txt` ve `spin.txt` dosyalarını çıkarır. Yeni dökümlerde tablo yok: model tablosu ayrı dışa aktarımdan (`exports/table/asteroid_models`) alınır. Seçim ve çıktı biçimi `tools/damit_paketle.py` ile aynıdır:

- Model sıralaması: dışbükey olmayan > kalite > ölçeklenmiş boyut > yeni.
- ≤ 800 üçgen, hacim eşdeğeri yarıçap 1, int16/uint16 nicemleme, 60'lık gzip parçalar.

Fark: sadeleştirme Blender yerine meshoptimizer'la yapılır, böylece CI'da çalışır.

**Tablosuz kip:** DAMIT'in model tablosu dışa aktarımı Kasım 2026'da sunucu hatası (500) veriyordu. Tablo alınamazsa:
- Mevcut modeller (tabloyla seçilmiş) olduğu gibi korunur; yalnız yeni asteroitler eklenir.
- Yeni asteroitlerde model listesi klasörlerden gelir; dönme durumu `spin.txt`'den okunur (λ β P / JD0 φ0).
- Seçim: en yeni model (en büyük kimlik). Kalite bayrağı ve ölçeklenmiş boyut bilinmez.
- "Dışbükey değil" bayrağı geometriden hesaplanır: bir köşe bir yüz düzleminin 0,1 R dışındaysa. Üçgenleme gürültüsü ≤ ~%1,5 R, gerçek oyuklar ≳ %30 R. Tabloyla karşılaştırıldığında yeniden üretilen 136 asteroitte bayrakların %85'i aynıydı; farkın çoğu farklı modelin seçilmesinden.

Tablo yeniden alınabildiğinde tam yeniden üretim yapılır. NASA PDS/Eyes modeli olan asteroitler (`web/models/ast/katalog.json`) atlanır. 4.000'den az model çıkarsa hiçbir şey yazılmaz.

## Uydular

1. NASA 3D Resources'ın dosya listesi kısmi klonla alınır (dosyaların kendisi indirilmez). Her klasörün en küçük `.glb` dosyası adaydır.
2. **Eşleştirme (GCAT satcat, J. McDowell, CC BY 4.0):** Klasör adı ve parantez içindeki kısaltmalar GCAT'taki ad ve program adıyla karşılaştırılır (büyük harf, yalnız harf ve rakam). GCAT'ın diğer adlar alanı kullanılmaz; oradaki kısaltmalar başka nesnelerle çakışıyor. Aday, şu an Dünya yörüngesinde olan bir yük olmalıdır; bunu CelesTrak SATCAT belirler (yörünge merkezi Dünya, düşmemiş), böylece gezegen sondaları elenir. Birden çok nesne eşleşirse hepsi aynı adı taşımalı (ör. MMS 1–4), en çok 8. Başka her durum "belirsiz" sayılır ve eklenmez. Aynı uydunun birden çok model sürümü (A/B/C) varsa yalnız ilki eklenir.
3. **Elle karar:** `tools/model/eslesme.json`: `"<klasör>": [NORAD, …]` eşleştirir, `null` dışlar.
4. **Ölçek:** GCAT'taki uzunluk, çap ve açıklığın en büyüğü (m). Boyut yoksa model eklenmez. Yönelim varsayılandır; gerekirse PR incelemesinde `web/js/satcatalog_oto.js` içinde `rot` eklenir.
5. **Dönüşüm** `tools/uydu_modelleri.mjs` ile aynıdır: Draco çözülür, ≥ 80 bin üçgende sadeleştirilir, dokular ≤ 1024 px WebP yapılır, meshopt ve nicemleme uygulanır. **Boyut sınırı:** gzip'li en çok 1,2 MB. Aşan model 40 bin üçgen / 512 px ile yeniden denenir, yine aşarsa eklenmez.
6. Yeni modeller `web/js/satcatalog_oto.js` dosyasına yazılır. `satcatalog.js` bunu birleştirir; elle yazılan kayıtlar önceliklidir.
7. Her yeni modelin üç açıdan önizlemesi (`tools/model/onizle.mjs`) Release'e yüklenir ve PR'da görünür.

Bir çalıştırmada en çok 20 uydu modeli eklenir; elle çalıştırmada `en_cok` ile değiştirilebilir.

## PR

PR gövdesi, araçların raporundan oluşur:
- eklenenler (ölçek, üçgen ve dosya boyutu);
- eklenemeyenler ve nedenleri;
- eşleşmeyen klasörler;
- önizlemeler.

Testler iş akışında koşar, çünkü `GITHUB_TOKEN` ile açılan PR'da diğer iş akışları tetiklenmez. PR'ın otomatik açılması için depo ayarı gerekir: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". Ayar kapalıysa dal yine gönderilir ve iş özetinde PR açma bağlantısı yazar.

## Yerelde

```bash
npm ci --prefix tools/model
node tools/model/uydu.mjs --kuru            # yalnız rapor: neler eklenirdi
node tools/model/damit.mjs --indir           # ~4 GB akış; yalnız gereken dosyalar diske yazılır (.model-ara/)
node tools/varliklar.mjs paketle && GITHUB_TOKEN=… node tools/varliklar.mjs yukle
```
