# Laboratuvar: deney merkezi ve asteroit saptırma

"Saptırma" eskiden Canlı Gökyüzü paneli içinde uzun bir sekmeydi: hedef arama, tarama, tablo, kütle, itki, tarih, yön ve onay kutusu tek sayfada alt alta dizilir; hangi sırayla ne yapılacağı belli değildi, 368 px'lik panelde 5 sekmeli çubuk dardı (son sekme kırpılabiliyordu) ve yakın geçiş bulunamazsa ("0 yakın geçiş") kullanıcı ne yapacağını bilmeden boş bir tabloya bakıyordu. Bu belge yeni yapıyı anlatır.

## 1. Gezinme ağacı

```
LS19
├─ Ay Görevi           görev tasarımı ve uçuş (fizik motoru, görev saati)
├─ Canlı Gökyüzü       gerçek saat: Takip · Uydular · Asteroitler · Çarpma
└─ Laboratuvar         "ya şöyle olsaydı?" denemeleri
    ├─ Asteroit saptırma    Hedef → Yakın geçiş → İtki → Sonuç
    ├─ Ay görevi            Ay Görevi alanına kısayol (profil, araç, güdüm; Δv bütçesi)
    └─ Çarpma riski         Canlı Gökyüzü ▸ Çarpma sekmesine kısayol
```

- Üç dal üst çubukta eşit düğmelerdir (klavye: **M** üçünde sırayla döner). Telefonda yalnız etkin düğmenin yazısı görünür.
- **Canlı Gökyüzü gözlem içindir** (gerçek veri, gerçek saat); **Laboratuvar deney içindir** (hedef seç, ayar değiştir, sonucu gör). Saptırma bu yüzden Canlı Gökyüzü'nden Laboratuvar'a taşındı; Canlı Gökyüzü'nün sekmeleri 5'ten 4'e indi, çubuk rahatladı.
- Laboratuvar merkezi bir ağaçtır: her dal bir deney (ya da deneyin yaşadığı alana kısayol). Ay görevi hem üst çubukta hem Laboratuvar'ın altında durur; Laboratuvar'daki kart onu doğrudan Görev sekmesinde açar. Yeni deney eklemek §6'dadır.
- Eski bağlantılar çalışır: `?tab=saptirma` Laboratuvar › Asteroit saptırma'yı açar; yeni: `?mode=lab` (merkez), `?mode=lab&exp=saptirma`.

## 2. Mimari: iki motor, üç görünüm

Gökyüzü motoru (gerçek saat, DE440 efemerisi, uydu/asteroit katmanları, kamera) ve görev motoru (fizik worker'ı, görev saati) birbirinden bağımsızdır. Laboratuvar **gökyüzü motorunu paylaşır**: asteroitler ve 3B saptırma yolları aynı sahnede çizilir, zaman/kamera çubuğu aynıdır, ama panel ve sol kart kendisinindir. `app.js`'te `MODE` motoru (`mission` | `sky`), `VIEW` arayüz alanını (`mission` | `sky` | `lab`) tutar; `body[data-mode]` görünümü seçer, `data-for="sky lab"` gibi boşlukla ayrılmış listeler bir öğenin hangi alanlarda göründüğünü söyler. Laboratuvar'a girmek gökyüzü motorunu kurar (ilk seferde), Canlı Gökyüzü'ne dönmek motoru yeniden kurmaz.

| Dosya | İş |
|---|---|
| `js/labui.js` | Deney merkezi (ağaç), başlık/geri düğmesi, kısayol dalları |
| `js/deflectui.js` | Saptırma deneyi: 4 adım, grafikler, 3B yollar (hesap `deflectwork.js`'te, değişmedi) |
| `js/labtext.js` | Saf yardımcılar (DOM yok): düz dille biçim, itki zamanı seçenekleri, sonuç yargısı, adım özetleri |
| `js/astui.js` | Yalnız asteroit kataloğu ve bilgi kartı; saptırmaya geçişi `openLab` ile yapar |

## 3. Saptırma deneyi: dört adım

Her adım katlanabilir bir kutudur: tamamlanınca tek satırlık **özete** iner ("99942 Apophis · Ø 340 m"), yalnız etkin adım açıktır, sonraki adımlar önceki bitene dek kilitlidir. Önceki adıma dönmek için başlığa tıklanır; üstteki bir adımı değiştirmek aşağıdakileri sıfırlar ya da "eski" diye işaretler.

| Adım | Kullanıcı ne yapar | Arayüz ne yapar |
|---|---|---|
| **1 Hedef** | Hızlı seçim çipi (Apophis, Bennu, Didymos, 2024 YR4: her biri neden ilginç olduğunu ipucu olarak taşır) ya da arama | Hedef kartı: sınıf, çap, MOID, Sentry olasılığı. MOID > 0,05 AB ise "yakın geçiş bulunamayabilir; Apophis gibi daha yakın bir hedef deneyin" uyarısı (önceden). Seçilince tarama kendiliğinden başlar |
| **2 Yakın geçiş** | Taranan geçişlerden birini seçer (en yakını önceden seçili ve "en yakın" rozetli) | Her geçiş bir kart: tarih, mesafe, "Ay uzaklığının 0,099 katı", v∞, JPL kataloğuyla uyum (✓). **Boş durum:** "Bu hedef taranan aralıkta Dünya'ya yaklaşmıyor" + **Taramayı 120 yıla uzat** ve **Başka hedef seç** düğmeleri. Tarama aralığı "Tarama aralığı" altında katlı |
| **3 İtki** | Yöntem (Kinetik çarpıcı / Sürekli itki), araç kütlesi ve hız (ya da kuvvet ve süre), **ne zaman** (geçişten 5 yıl / 2 yıl / 1 yıl / 3 ay önce çipleri), senaryo | İtki tarihi yerine "geçişten ne kadar önce" sorulur; tarama başlangıcından önceye düşen seçenekler hiç sunulmaz. **Senaryo:** *Gerçek yörünge* (itki nominal geçişi nasıl değiştirir?) ya da *Çarpacak olsaydı* (B = 0: bu itki Dünya'yı kurtarmaya yeter mi?). Çap, yoğunluk, β, yön, tarih "Gelişmiş"te. Hatalar hesaptan önce düz dille söylenir ("İtki süresi yakın geçişe kadar bitmeli") |
| **4 Sonuç** | Okur; "3B'de göster", "İtkiyi değiştir" | Karar kartı (yeşil/kırmızı/mavi), ölçek çubuğu (çarpacak olsaydı), **"ne kadar gerekir?" cümlesi** ("≈ 261.084 kg'lık bir çarpıcı"), B-düzlemi grafiği, tüm ayrıntılar katlı (tablo, önceden uyarı eğrisi, fizik notu, DART doğrulaması). Ayarlar sonradan değişirse sonuç "eski" olarak işaretlenir ve **Yeniden hesapla** önerilir |

### Sonuç nasıl okunur

| Senaryo | Durum | Karar |
|---|---|---|
| Çarpacak olsaydı | kayma ≥ yakalama yarıçapı (bE) | **Dünya kurtulur**: "… farkla ıskalar" |
| Çarpacak olsaydı | kayma < bE | **Bu itki yetmez**: "%42 sağlandı; daha erken ya da daha güçlü deneyin" |
| Gerçek yörünge | nominal çarpıyor, saptırılmış ıskalıyor | **Çarpma önlendi** |
| Gerçek yörünge | nominal ıskalıyor, saptırılmış çarpıyor | **Saptırma çarpmaya yol açtı** |
| Gerçek yörünge | ikisi de çarpıyor | **Yine çarpar** |
| Gerçek yörünge | ikisi de ıskalıyor | **Dünya'yı ıskalamaya devam eder** (mesafe önce → sonra) |

Çarpma sekmesindeki sanal çarpıcılar (Sentry) için "Laboratuvarda dene" düğmesi senaryoyu **Çarpacak olsaydı** olarak önceden seçer. Fizik değişmedi: hesap, motor ve sayılar eski Saptırma sekmesiyle aynıdır (`test_deflect.js`: Apophis 2029, JPL CAD ile ~2 km).

## 4. Telefon düzeni

Laboratuvar'a girilince panel kendiliğinden açılır (deney ana içeriktir); "3B'de göster" paneli kapatır ki 3B görünüm örtülmesin; zaman/kamera çubuğundaki panel düğmesi geri açar. Adımlar tam genişlik, yatay taşma yoktur (tarayıcı denemesinde denetlenir).

## 5. Doğrulama

- `node test/test_lab.js` — saf yardımcılar (itki zamanı seçenekleri, sonuç yargısı her senaryo için, metinler) ve arayüz sözleşmesi (JS'nin başvurduğu her kimlik index.html'de var, üç alan, ağaç/sayfa uyumu, simgeler, erişilebilirlik öznitelikleri).
- `node tools/lab_deneme.mjs` — başsız Chromium'da tam akış: üç dallı gezinme, Betulia boş durumu, Apophis 2029 (4 yakın geçiş, ilki 13 Nisan 2029, 38.013 km), itki, "çarpacak olsaydı", 3B yollar, çapraz bağlantılar, eski/yeni adres parametreleri, telefon (390×844). `api/*` istekleri gerçek bulut işlevleriyle `web/test/fixtures` yanıtlarından karşılanır: internet gerekmez.

**Sınırlar:** tarayıcı denemesi yazılım çizimiyle (SwiftShader) ve sahte kaynak verisiyle yapıldı; ayrıntı (tam duyarlıklı JPL çözümü) yalnız Apophis için var, öteki hedefler katalog öğeleriyle çalışır. Gerçek JPL sunucusuyla, gerçek GPU'yla ve gerçek bir telefonda denenmedi.

## 6. Yeni deney eklemek

1. `index.html`'de `#labPanel` içine `<div id="lab-<ad>" class="labpage" hidden>…</div>` ekleyin.
2. Merkez ağacına (`#lab-home`) bir dal ekleyin: `<button class="exp" data-exp="<ad>">`. Başka bir alana kısayolsa `data-go="…"` ve `app.js`'teki `LabUI({ openMission, openImpact })` geri çağrısı.
3. `labui.js`'te `LAB_PAGES`'e `<ad>: 'Başlık'` ekleyin.
4. Karar/biçim mantığını `labtext.js`'e (Node'da sınanır), arayüzü ayrı bir modüle koyun; `node test/test_preload.js --print` ile `modulepreload` listesini yenileyin; `test_lab.js` kimlik/ağaç tutarlılığını kendiliğinden denetler.
