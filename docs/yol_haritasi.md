# lookstar19: yol haritası

lookstar19, LS19 simülasyonunun çevresinde kurulacak, teknik içeriği yoğun, ticari olmayan bir uzay kütüphanesi:

- açık uzay verileri (NASA, JPL, ESA ve öbür kamu kaynakları) işlenip anlaşılır hale getirilir;
- topluluk teknik makale yazar ve paylaşır;
- fırlatmalar takip edilir, canlı yayınlara yönlendirilir;
- katkılar puan kazandırır, puanlar lookstar19'a özel görev patch'leri açar;
- gerçek şekil modelleri ve Blender'la modellenmiş asteroitler 3B arşivde sergilenir.

Bu belge kararları, aşamaları ve her aşamanın "bitti" ölçütünü tutar. Karar değiştikçe güncellenir.

## Alınan kararlar

| Konu | Karar |
|---|---|
| Site adı | **lookstar19** |
| Alan adı | `lookstar19` (uzantı henüz seçilmedi: aşağıda "Açık kararlar") |
| Giriş | GitHub, Google ve e-posta |
| Makaleler | Herkese açık yayınlanır; **her makale** önce onaydan geçer |
| Patch'ler | Ödül patch'lerinin hepsi lookstar19'a özel, gelecek LS19 görevlerine göre çizdirilir; gerçek görev patch'i ödül olarak kullanılmaz |
| Patch'in iki biçimi | Koleksiyonda büyük haliyle görevin hikâyesiyle sergilenir; profilde, yorumlarda ve makalelerde küçük rozet olarak görünür |

## İlkeler

- **Kaynak ve lisans her sayfada.** Her veri, görsel ve modelin kaynağı ve lisansı sayfasında yazar. Lisansı doğrulanamayan içerik yayına girmez.
- **Onay izlenimi yok.** NASA içeriğinin çoğu kamu malıdır, ama NASA logosu ve mührü izinsiz kullanılamaz ve site herhangi bir kurumun onayını almış gibi görünmemelidir. Şirket görselleri (SpaceX, Rocket Lab vb.) o şirketlerin fikri mülküdür. Her kaynağın kuralı tek tek doğrulanıp lisans sayfasına yazılır.
- **Ham veri değil, işlenmiş veri.** Her veri kümesi için açıklama, etkileşimli grafik ve indirilebilir işlenmiş çıktı.
- **İki dil.** Türkçe ve İngilizce; LS19'un çeviri altyapısı ve denetimi (`tools/i18n_cikar.mjs`) kullanılır.
- **Simülasyonla bağlı.** Her asteroit, fırlatma ve görev sayfasında "LS19'da aç" bağlantısı.
- **Ticari değil.** Reklam, ücretli üyelik ya da satış yok.

## Bugün elimizde olanlar

- **Veri hattı (`api/`):**
  - CelesTrak uydu katalogları (`gp.js`, `supgp.js`);
  - JPL SBDB, Sentry ve Horizons (`sbdb.js`, `sentry.js`, `horizons.js`);
  - GCAT fırlatma arşivi (J. McDowell, CC BY 4.0; `tools/firlatma_db.mjs`);
  - Launch Library 2 fırlatma takvimi, yedeği RocketLaunch.Live (`launches.js`);
  - NASA GIBS Dünya görüntüleri.
- **3B modeller:** NASA 3D Resources uydu ve araç modelleri, `models/ast` asteroit modelleri, ~3.900 DAMIT şekil modeli. Model tarama ve dönüştürme otomasyonu (`docs/model_otomasyonu.md`).
- **Altyapı:** Vercel'de yayın ve sunucu işlevleri, Vercel Blob depolama ("Uydum" arşivi, `api/arsiv.js`), test ve CI (`denetim`), performans ölçüm düzeni (`docs/performans.md`).

## Aşamalar

Süreler kabaca tahmindir (hobi temposu).

### Faz 0: Temel ve kararlar (1–2 hafta)

- Alan adının uzantısını seçip almak; Vercel'e bağlamak.
- Depo yapısı: site ve simülasyon aynı depoda, site `site/` klasöründe. Ortak veri işlevleri (`api/`) ve çeviri altyapısı paylaşılır.
- Bilgi mimarisi: Ana sayfa · Kütüphane · Veri Atölyesi · Fırlatmalar · Makaleler · 3B Arşiv · Patch'ler · Simülasyon.
- Tasarım dili: renkler, yazı tipleri, bileşenler; LS19 arayüzüyle aynı aile.
- Lisans ve kaynak sayfası; kullanım şartları ve gizlilik metninin ilk hali.
- **Bitti sayılır:** site iskeleti alan adında yayında; lisans ve kaynak sayfası yazılı.

### Faz 1: Lansman sitesi, yalnız okuma (3–4 hafta)

- **Ana sayfa:** LS19 tanıtımı, simülasyondan canlı görüntü, "Simülasyonu aç".
- **Kütüphane v1:** var olan verilerden otomatik üretilen sayfalar.
  - Asteroitler: önce öne çıkan birkaç yüz cisim (yörünge, boyut, Sentry riski, 3B model).
  - Görevler ve araçlar: NASA modelleri ve teknik özellikleri.
- **Fırlatma takvimi:** geri sayım ve resmi yayın bağlantısı. Yayın kopyalanmaz; resmi kanala yönlendirilir ya da resmi oynatıcıyla yerleştirilir.
- Statik sayfa üretimi: arama motorlarında bulunsun, hızlı açılsın.
- **Bitti sayılır:** iki dil; telefonda düzgün; her sayfada kaynak atfı; performans bütçesi ölçülmüş.

### Faz 2: Fırlatma merkezi (2–3 hafta)

- **Fırlatma sayfaları:** canlı yayın yönlendirmesi; roket, rampa ve görev özeti; "kalkışı LS19'da izle".
- **Arşiv:** GCAT'ten geçmiş fırlatmalar; ülke, roket ve yıla göre süzme.
- **Takip:** takvime eklenebilir abonelik (ICS) ve RSS; hesap gerektirmez.
- **Bitti sayılır:** yaklaşan fırlatmalar otomatik güncellenir; kaynak API'lerin istek sınırları aşılmaz (önbellek).

### Faz 3: Veri Atölyesi (ilk sürüm 4 hafta, sonra sürekli)

- **Veri sayfası şablonu:** kaynak, lisans, güncelleme sıklığı, işleme adımları, etkileşimli grafik, işlenmiş çıktıyı indir (CSV/JSON).
- **İşleme hattı:** zamanlanmış GitHub Actions işleri (model otomasyonundaki düzen); çıktılar Blob'a ya da sürüm paketine.
- **İlk veri kümeleri:**
  - NEO yakın geçişleri ve Sentry çarpma riski;
  - uydu kalabalığı ve yeniden girişler;
  - NASA Exoplanet Archive;
  - NTRS teknik raporları (makalelere kaynak olarak da kullanılır).
- **Bitti sayılır:** dört veri sayfası yayında; işleme hattı zamanında çalışır, başarısız olunca bildirir.

### Faz 4: Hesaplar, makaleler ve onay (6–8 hafta)

- **Giriş:** GitHub, Google ve e-posta.
  - E-posta için parolasız, tek kullanımlık bağlantı önerilir: parola saklanmaz, sızma riski azalır. Bunun için bir e-posta gönderme servisi gerekir.
- **Veritabanı:** Vercel'e bağlı Postgres (öneri); ayrı sunucu işletmek gerekmez.
- **Makale editörü:** Markdown, LaTeX formülleri, kaynakça, şekil yükleme (Blob); varsayılan lisans CC BY 4.0.
- **Onay akışı (her makale):**
  - durumlar: taslak → onay bekliyor → yayında; ya da düzeltme istendi / reddedildi (gerekçeyle);
  - onay ölçütleri yazılı ve herkese açık: teknik doğruluk, kaynak gösterme, özgünlük, üslup;
  - ilk dönemde onaylayan yalnız sen. Sonra, puanı yüksek ve güvenilir üyeler "hakem" rolü alabilir; son söz yine sende.
  - yayındaki makalede bildirme düğmesi; onaylı makale sonradan düzenlenirse değişiklik yeniden onaya düşer.
- **Profil:** makaleler, katkılar, rozetler, patch koleksiyonu.
- **Yasal ve güvenlik:** KVKK/GDPR uyumlu gizlilik metni, hesap silme ve veri indirme; yükleme denetimi; istek sınırı; istenmeyen içerik süzgeci.
- **Bitti sayılır:** üç giriş yöntemi çalışıyor; bir makale yazılıp onaylanıp yayınlanabiliyor; reddedilen yazar gerekçeyi görüyor.

### Faz 5: Puanlar, rozetler ve patch koleksiyonu (3–4 hafta)

- **Puan, başkalarının onayladığı katkıdan gelir:** onaylanan makale; "yararlı" bulunan yorum; kabul edilen veri düzeltmesi ya da model katkısı. Tıklama ya da okuma puan getirmez. Günlük üst sınır olur; hileli puan geri alınabilir.
- **Patch'ler (hepsi lookstar19'a özel):**
  - her patch bir gelecek LS19 görevine bağlıdır (ör. "Ay iniş", "asteroit saptırma", "L2 halo");
  - patch'ler görev dizileri halinde açılır: bir dizinin kilometre taşlarını geçen o görevin patch'ini kazanır;
  - **koleksiyon:** patch büyük haliyle, görevin hikâyesi ve kazanma tarihiyle sergilenir; kazanılmamışlar silik görünür;
  - **rozet:** aynı patch'in küçük hali; profilde, yorumlarda ve makale imzasında görünür; kullanıcı vitrinde hangilerini göstereceğini seçer.
- **Patch üretim hattı:** çizim teslim biçimi (aşağıda "Açık kararlar"), dosyalar depoda ya da Blob'da sürümlü. Her patch'in kaydında ad, görev, hikâye, kazanma koşulu ve çizim tarihi tutulur.
- **Bitti sayılır:** ilk görev dizisi ve patch'leri yayında; puan kuralları ve kazanma koşulları herkese açık sayfada yazılı.

### Faz 6: 3B Arşiv (ilk sürüm 3 hafta, sonra sürekli)

- **Gerçek şekil modelleri:** DAMIT, PDS ve NASA kaynakları (Bennu, Ryugu, Eros, Itokawa…). Tarayıcıda görüntüleyici, ölçek, dönme ekseni, indirme.
- **Blender'la modellenenler:** şekli bilinmeyen ama teknik özellikleri (boyut, dönme, yansıtma) bilinen asteroitler.
  - Her zaman "temsilî model" etiketiyle; hangi verilerden üretildiği yazılı;
  - üretim betiği depoda durur, böylece model yeniden üretilebilir (`tools/asteroit_modelleri.py` düzeninde).
- **Topluluk model katkısı:** gönderim, inceleme, yayın (Uydum'daki yükleme denetimi yeniden kullanılır).
- **Bitti sayılır:** öne çıkan asteroitlerin hepsinin model sayfası var; gerçek ile temsilî model ayrımı her sayfada açık.

## Her fazda sürecek işler

- performans bütçesi ve ölçüm;
- erişilebilirlik;
- güvenlik: yükleme denetimi, istek sınırı, bağımlılık güncellemeleri;
- yedekleme (veritabanı ve Blob);
- kaynak API'lerinin istek sınırlarına ve kullanım şartlarına uyum.

## Açık kararlar

1. **Alan adının uzantısı:** `.com`, `.org` ya da `.space` (ticari olmayan bir kütüphane için `.org` iyi uyar). Önce hangilerinin boşta olduğuna bakmak gerekiyor.
2. **E-posta girişi:** parolasız tek kullanımlık bağlantı (önerilen) mı, parola mı?
3. **Gerçek görev patch'leri:** ödül değiller. Kütüphanede, görev sayfalarında bilgi olarak (lisansı doğrulananlar) yer alsınlar mı, yoksa hiç olmasınlar mı?
4. **Patch çizim teslim biçimi:** önerim, her patch için vektör (SVG) ana dosya ve en az 1024×1024 PNG. Rozet boyutları (ör. 64 ve 128 piksel) bunlardan otomatik üretilir.
5. **İlk görev dizisi:** hangi gelecek LS19 görevleriyle başlanacak.
