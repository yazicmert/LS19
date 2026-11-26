# lookstar19: yol haritası

lookstar19, LS19 simülasyonunun çevresinde kurulacak, teknik içeriği yoğun, ticari olmayan bir uzay kütüphanesi:

- açık uzay verileri (NASA, JPL, ESA ve öbür kamu kaynakları) işlenip anlaşılır hale getirilir;
- topluluk teknik makale yazar ve paylaşır;
- fırlatmalar takip edilir, canlı yayınlara yönlendirilir;
- katkılar puan kazandırır, puanlar görev patch'leri açar (tarihî görevlerin lisanslı gerçek patch'leri ya da lookstar19 tasarımları);
- gerçek şekil modelleri ve Blender'la modellenmiş asteroitler 3B arşivde sergilenir.

Bu belge kararları, aşamaları ve her aşamanın "bitti" ölçütünü tutar. Karar değiştikçe güncellenir.

## Alınan kararlar

| Konu | Karar |
|---|---|
| Site adı | **lookstar19** |
| Alan adı | `lookstar19.org` |
| Giriş | GitHub, Google ve e-posta (parolasız: tek kullanımlık bağlantı e-postayla gelir) |
| Makaleler | Herkese açık yayınlanır; **her makale** önce onaydan geçer |
| İlk görev dizisi | Tarihî görevler. Görevin lisansı doğrulanmış gerçek patch'i varsa ödül o; yoksa (lisans doğrulanamadı ya da görevin patch'i hiç yok) lookstar19 o görev için esinlenme bir patch çizdirir |
| Sonraki diziler | Gelecek LS19 görevleri; patch'lerin hepsi lookstar19'a özel çizdirilir |
| Gerçek görev patch'leri | Lisansı doğrulananlar kütüphanede, görev sayfalarında bilgi olarak da yer alır |
| Patch'in iki biçimi | Koleksiyonda büyük haliyle görevin hikâyesiyle sergilenir; profilde, yorumlarda ve makalelerde küçük rozet olarak görünür |
| Patch teslim biçimi | Her patch için vektör (SVG) ana dosya ve en az 1024×1024 PNG; rozet boyutları (64 ve 128 piksel) bunlardan otomatik üretilir |

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

- `lookstar19.org` alan adını almak (önce boşta olduğu doğrulanır); Vercel'e bağlamak; e-posta gönderimi için alan adının SPF/DKIM kayıtları.
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
  - E-posta parolasız: kullanıcı adresini yazar, tek kullanımlık ve süreli (ör. 15 dk) bir giriş bağlantısı gelir. Parola saklanmaz. Bunun için `lookstar19.org` adresinden gönderen bir e-posta servisi gerekir; bağlantı isteğine adres ve IP başına sınır konur.
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
- **Patch'ler ve görev dizileri:**
  - patch'ler görev dizileri halinde açılır: bir dizinin kilometre taşlarını geçen o görevin patch'ini kazanır;
  - **ilk dizi: tarihî görevler** (aşağıda "İlk görev dizisi");
  - sonraki diziler gelecek LS19 görevleri (ör. "Ay iniş", "asteroit saptırma", "L2 halo"); bunların patch'lerinin hepsi lookstar19'a özel çizilir;
  - **koleksiyon:** patch büyük haliyle, görevin hikâyesi ve kazanma tarihiyle sergilenir; kazanılmamışlar silik görünür;
  - **rozet:** aynı patch'in küçük hali; profilde, yorumlarda ve makale imzasında görünür; kullanıcı vitrinde hangilerini göstereceğini seçer.
- **Patch kaydı:** her patch'in ad, görev, hikâye, kazanma koşulu, kaynak türü (gerçek ve lisanslı / lookstar19 esinlenme / lookstar19 özgün), lisans ve atıf, çizim tarihi bilgisi tutulur. Dosyalar sürümlü (depo ya da Blob).
- **Teslim:** SVG ana dosya ve en az 1024×1024 PNG; 64 ve 128 piksellik rozetler otomatik üretilir.
- **Bitti sayılır:** ilk görev dizisi ve patch'leri yayında; puan kuralları ve kazanma koşulları herkese açık sayfada yazılı.

### İlk görev dizisi: tarihî görevler

- **Gerçek patch:** görevin patch'i varsa ve lisansı ödül/rozet olarak kullanmaya izin veriyorsa, ödül o patch'tir. Kaynağı ve lisansı patch'in kaydında ve sayfasında yazar.
- **Esinlenme patch:** lisans doğrulanamazsa ya da görevin patch'i hiç yoksa, lookstar19 o görev için kendi patch'ini çizdirir; bir oyunun gerçek araçlardan esinlenip markasız kendi araçlarını yapması gibi. Tarihî görevlerin bir kısmının resmî patch'i hiç yoktu: ilk Mercury uçuşları, Sputnik, Vostok. Çizim kuralları:
  - görev, olgularıyla tanınır: araç silueti, hedef (Ay, yörünge, gezegen), mürettebat sayısı, yıl, önemli an;
  - kurum logoları ve mühürleri (NASA, ESA, Roscosmos vb.), şirket markaları ve gerçek patch'in ayırt edici çizimi kullanılmaz; tasarım gerçek patch'le karıştırılmayacak kadar farklı ve özgün olur;
  - görevin adı olgu olarak yazılabilir (ör. "Apollo 11"); her esinlenme patch'in sayfasında "lookstar19 tasarımı; resmî görev patch'i değildir" yazar.
- **Dizi önerisi:** LS19'da karşılığı olan görevlerle başlamak. Kilometre taşı hem sitede (okuma ya da yazma katkısı) hem simülasyonda olabilir:
  - Sputnik 1, Vostok 1, Mercury (Friendship 7): yörünge çağının başlangıcı;
  - Apollo 8, Apollo 11, Apollo 13: LS19 Ay görevi ("Apollo 11 inişini LS19'da tamamla");
  - Voyager 1, Viking 1, Hubble;
  - DART: LS19 asteroit saptırma deneyi;
  - JWST: LS19 Lagrange deneyi (L2).
- **Lisans doğrulama süreci:** her gerçek patch için kaynak, lisans metni ve kullanım koşulu bir kayıtta tutulur; belirsizse esinlenme patch'e geçilir.

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

1. **İlk görev dizisinin kesin listesi ve kilometre taşları:** yukarıdaki öneri üzerinden.
2. **Esinlenme patch'lerin çizimi:** kim çizecek; çizimler bir tasarım dili (renk paleti, biçim, yazı) altında birlikte mi tasarlanacak?
