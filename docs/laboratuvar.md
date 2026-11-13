# Laboratuvar: deney merkezi, Ay görevi ve asteroit saptırma

Laboratuvar "ya şöyle olsaydı?" denemelerinin yeridir: bir şeyi ayarla, dene, sonucu gör. Başta yalnız asteroit saptırma buradaydı; Ay görevi üst çubukta ayrı bir dal olarak duruyor, Laboratuvar'daki "Ay görevi" kartı da kullanıcıyı Laboratuvar'dan çıkarıp o dala götürüyordu (aynı şey iki yerde). Ay görevinde profil, tarih, araç ve iniş güdümü seçilip Δv sonuçları karşılaştırıldığı için o da bir deneydir: artık Laboratuvar'ın içindedir ve üst çubuk iki dala indi. Bu belge yapıyı anlatır.

Eski saptırma sekmesinin sorunları (tek sayfada hedef, tarama, tablo, kütle, itki, tarih, yön alt alta; 368 px'lik panelde 5 sekmeli dar çubuk; "0 yakın geçiş" boş tablosu) §4'teki dört adımla çözüldü.

## 1. Gezinme ağacı

```
LS19
├─ Canlı Gökyüzü       gözlem: gerçek veri, gerçek saat (Takip · Uydular · Asteroitler · Çarpma)
└─ Laboratuvar         deney: "ya şöyle olsaydı?"
    ├─ Görev tasarımı
    │   └─ Ay görevi            görev motoru: Görev → Araç ve güdüm → Uçuş → Sonuç
    └─ Gezegen savunması
        ├─ Asteroit saptırma    gökyüzü motoru: Hedef → Yakın geçiş → İtki → Sonuç
        └─ Çarpma riski         Canlı Gökyüzü ▸ Çarpma sekmesine kısayol
```

- İki dal üst çubukta eşit düğmelerdir (klavye: **M** ikisi arasında geçer; Laboratuvar'a dönünce açık deney korunur). Telefonda yalnız etkin düğmenin yazısı görünür.
- **Canlı Gökyüzü gözlem içindir** (gerçek veri, gerçek saat); **Laboratuvar deney içindir** (hedef seç, ayar değiştir, sonucu gör).
- **Varsayılan açılış Laboratuvar › Ay görevi**: ilk izlenim (görev, iniş, sinematik gösterim) eskisiyle aynıdır. Son açılan alan ve deney `localStorage`'da hatırlanır (`ls19.mode`, `ls19.exp`).
- Deneyde başlığın solundaki **‹ Laboratuvar** düğmesi ya da **Esc** ana sayfaya döner (önce açık bilgi kartı ya da menü kapanır). **K** Ay görevinin Kontrol sekmesini açar.
- Adresler: `?mode=lab` (ana sayfa), `?mode=lab&exp=ay`, `?mode=lab&exp=saptirma`, `?mode=sky`. Eski bağlantılar çalışır: `?mode=mission` ve Ay görevi sekmeleri (`?tab=gorev|kontrol|dv|grafik|yorunge|efemeris`) Laboratuvar › Ay görevi'ni, `?tab=saptirma` Asteroit saptırma'yı, Canlı Gökyüzü sekmeleri (`?tab=takip|uydular|asteroit|carpma`) Canlı Gökyüzü'nü açar. Çözüm saf bir işlevdedir (`labui.js` › `resolveView`), Node'da sınanır.

## 2. Mimari: iki motor, iki görünüm, deney kaydı

Görev motoru (fizik worker'ı, görev saati, görev efemerisi) ve gökyüzü motoru (gerçek saat, DE440 efemerisi, uydu/asteroit katmanları) birbirinden bağımsızdır; bu yapı **değişmedi**: fizik, tasarım, güdüm ve efemeris koduna dokunulmadı. Değişen yalnız hangi ekranda hangi motorun çalıştığıdır.

Eskiden görünümden motora eşleme sabitti (`view === 'mission' ? 'mission' : 'sky'`: Laboratuvar her zaman gökyüzü motorunu kullanıyordu). Şimdi **her deney kullandığı motoru kendisi bildirir** (`js/labui.js`):

```js
export const EXPERIMENTS = {
  ay:       { title: 'Ay görevi',         engine: 'mission', phoneOpen: false },
  saptirma: { title: 'Asteroit saptırma', engine: 'sky',     phoneOpen: true  },
};
engineFor(view, exp, cur)   // 'sky' → 'sky'; Laboratuvar'da deneyin motoru; ana sayfa (ya da bilinmeyen) → cur (motor değişmez)
```

- `app.js`'te `MODE` çalışan motoru (`mission` | `sky`), `VIEW` görünümü (`sky` | `lab`), `labui.page` açık deneyi tutar. `syncWorkspace()` motoru yalnız gerekince değiştirir (`switchEngine`); Laboratuvar ana sayfası ↔ Canlı Gökyüzü geçişi gökyüzü motorunu yeniden kurmaz.
- **Ana sayfa bir menüdür, motoru değiştirmez**: Ay görevinden ana sayfaya dönünce görev sahnesi ve görev çubuğu kalır; saptırmadan dönünce gökyüzü sahnesi ve zaman/kamera çubuğu.
- Görünürlük: `body[data-mode]` görünümü, `body[data-engine]` motoru, `body[data-exp]` deneyi taşır. Öğelerin `data-for` listesi (boşlukla ayrılmış) şunları alır: `sky`, `lab` (tüm Laboratuvar), `lab@mission` / `lab@sky` (Laboratuvar'da, o motor çalışırken). CSS'te üç kural vardır (`style.css`, "çalışma alanları"):

| Öğe | `data-for` | Ne zaman görünür |
|---|---|---|
| `#skyHud`, `#skyPanel` | `sky` | Canlı Gökyüzü |
| `#labPanel` | `lab` | Laboratuvar'ın her sayfası |
| `#hud`, `#manual`, `#controls` (görev çubuğu) | `lab@mission` | Ay görevi (ve ondan dönülen ana sayfa) |
| `#skyControls` (zaman/kamera) | `sky lab@sky` | Canlı Gökyüzü, saptırma (ve ondan dönülen ana sayfa) |

- **Tek panel**: Ay görevi (eski `#panel`) Laboratuvar panelinin `#lab-ay` sayfasıdır (`.labpage.labtabs`: adım çubuğu sabit, sayfalar kendi içinde kayar). Başlık, geri düğmesi ve telefon davranışı her deneyde aynıdır. `ui.setTab` sekmeyi kendi grubunda değiştirir (sekme sayfasının ebeveyni: `#skyPanel`, `#lab-ay` ya da iç içe `#tab-ucus`); iç sayfa açılınca onu taşıyan adım da açılır. `ui.tab` görünen **yaprak** sayfadır (kare başına güncellenen Kontrol, Yörünge, Efemeris, Grafik buna bakar), saptırma adımlarıyla karışmaz.

| Dosya | İş |
|---|---|
| `js/labui.js` | Deney kaydı (`EXPERIMENTS`), `engineFor`, `resolveView` (saf), deney merkezi (ağaç), başlık/geri düğmesi |
| `js/app.js` | `setWorkspace(view, push, exp)` / `syncWorkspace()`: motor seçimi, `body` öznitelikleri, adres ve `localStorage` |
| `js/ui.js` | Ay görevi sayfaları (yapılandırma, çizelge, Kontrol, Grafik, Yörünge, Efemeris, Δv), HUD, iç içe sekmeler; fizik worker'ıyla konuşma değişmedi |
| `js/ayui.js` | Ay görevi deneyinin dört adımı: adım özetleri, tamam/yeni işaretleri, sonuç kartı, adımlar arası düğmeler. Yalnız durumu okur; worker'a komut göndermez |
| `js/aytext.js` | Saf yardımcılar (DOM yok): adım özetleri, sonuç yargısı (temasın başarısı `mission.js` › `touchdown()` kararıdır, burada yeniden hesaplanmaz) |
| `js/deflectui.js` | Saptırma deneyi: 4 adım, grafikler, 3B yollar (hesap `deflectwork.js`'te, değişmedi) |
| `js/labtext.js` | Saf yardımcılar (DOM yok): düz dille biçim, itki zamanı seçenekleri, sonuç yargısı, adım özetleri, bağlantı ve geçmiş, belirsizlik metni |
| `js/uncert.js` | Saf belirsizlik hesabı: kütle/β modeli, JPL kovaryansı → B-düzlemi, tohumlu Monte Carlo |
| `js/astui.js` | Yalnız asteroit kataloğu ve bilgi kartı; saptırmaya geçişi `openLab` ile yapar |

## 3. Ay görevi deneyi: dört adım

Saptırma deneyiyle aynı dil: numaralı adımlar, her adımın tek satırlık özeti, adımlar arası "Devam" düğmeleri. Farkı: Ay görevinde her zaman kurulu bir görev vardır (açılışta hazır tasarım yüklenir), bu yüzden adımlar kilitli değildir; adım çubuğu panelin üstünde sekme gibi durur ve uçuş aletleri büyük olduğu için akordeon yerine sayfa kullanılır. Etkin adım düğmesi genişler ki özeti okunsun; ötekilerin tam özeti üzerine gelince görünür.

| Adım | İçerik | Özet örneği |
|---|---|---|
| **1 Görev** | Profil, görev tarihi (Bugün / Apollo 11 / Ekim 2026), **Tasarla**, tasarım bilgisi; yörünge ayrıntıları (park ve Ay bekleme yörüngesi) "gelişmiş" altında katlı | `Apollo · 13 Eki 2026` |
| **2 Araç ve güdüm** | Araç kartları (İki kademe / Tek kademe; değişince görev önbellekteki tasarımla yeniden kurulur) ve iniş güdümü kartları (Optimal dengeli / serbest, ZEM/ZEV; uçuşta da değişir). Bunlar görev çubuğundaki **Uçuş ▾** menüsüyle aynı düğmelerdir (`data-vehicle`, `data-landing`): biri değişince öteki de değişir. Konik çözücü yüklenemezse not çıkar | `İki kademe · Optimal` |
| **3 Uçuş** | Alet sekmeleri: **Çizelge** (görev çizelgesi + olay günlüğü; olaya tıkla → atla), **Kontrol** (K), **Grafik**, **Yörünge**, **Efemeris**. Oynatma görev çubuğundadır (Başlat, zaman hızı, kamera, sinematik) | `Hazır: Başlat`, `T+1g 04:12`, `Uçuş bitti` |
| **4 Sonuç** | Sonuç kartı (İniş başarılı / Sert temas / Görev sona erdi; temas ölçüleri: iniş yerine uzaklık, dikey ve yatay hız, kalan yakıt, kullanılan Δv, nominale göre fark), **Başka profille dene**, **Güdümü değiştir**, **Baştan uçur**; altında Δv bütçesi ve profil karşılaştırması | `İniş ✓ · 304 kg yakıt` |

- İniş olunca 4. adımın numarası "yeni sonuç" diye işaretlenir; adım açılınca işaret kalkar.
- Sonuç kartındaki Δv toplamları Δv tablosuyla aynı tanımdır (yalnız nominali ve gerçekleşeni bilinen manevralar).
- Güvenli temas sınırları (dikey < 3 m/s, yatay < 1,22 m/s: Apollo LM iniş takımı tasarım sınırları 10 ft/s ve 4 ft/s) `mission.js`'tedir; `test_ayexp.js` metindeki sayıların oradakilerle aynı kaldığını denetler.
- Eski sekme kimlikleri korunur: `?tab=gorev` 1. adımı, `?tab=kontrol|grafik|yorunge|efemeris` Uçuş adımını o aletle, `?tab=dv` Sonuç adımını açar.

## 4. Saptırma deneyi: dört adım

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

Çarpma sekmesindeki sanal çarpıcılar (Sentry) için "Laboratuvarda dene" düğmesi senaryoyu **Çarpacak olsaydı** olarak önceden seçer. Kuvvet modeli: Güneş, gezegenler, Ay, Plüton (DE440s), Güneş 1PN, yakın geçişte Dünya J2 ve JPL çözümünün kütleçekimsel olmayan parametreleri (Yarkovsky A2; hedef kartında gösterilir, katalog öğeleriyle çalışan hedeflerde yoktur). `test_deflect.js`: Apophis 2029 JPL CAD ile 1 km, 2051 %0,1 ve 5 dk içinde.

### Belirsizlik: olasılıklı sonuç

Karar kartı nominal çözümü söyler; altındaki **belirsizlik kutusu** aynı denemenin olasılığını verir (`uncert.js`, saf; `test/test_uncert.js`):

- **İtkinin belirsizliği:** hız değişimi Δv log-normal kabul edilir. Kinetik çarpmada Δv = β·m·U/(M+m) olduğundan iki kaynak vardır: momentum artış çarpanı β (1σ %28; DART'ta β 2,2–4,9, Dimorphos'un bilinmeyen yoğunluğuna göre: Cheng vd. 2023) ve asteroidin kütlesi. Kütlenin belirsizliği verinin türüne göre seçilir: ölçülmüş GM (SBDB σ'sı), ölçülmüş çap (SBDB σ'sı, yoksa %10) ile tahmini yoğunluk (1σ %35; ölçülmüşse %16), yalnız mutlak parlaklık (albedo bilinmiyor: çapta 1σ %42, kütlede ~×2,9). Sürekli itkide yalnız kütle.
- **Yörünge belirsizliği:** JPL SBDB kovaryansı (`cov=mat`, kuyrukluyıldız öğeleri e, q, tp, Ω, ω, i) Kartezyen duruma (sayısal Jacobian), kovaryans devrinden yakın geçişe durum geçiş matrisiyle, oradan B-düzlemine taşınır: Σ_B = (J·Φ·Jx)·C·(J·Φ·Jx)ᵀ. Kütleçekimsel olmayan parametrelerin sütunları atılır. Doğrusal taşıma 150 örneklenmiş yörüngenin tam tümlemesiyle sınandı (Apophis 2029, büyük eksen %5, açı 0,1° içinde).
- **Monte Carlo:** 4.000 tohumlu örnek; geçiş noktası = nominal + yörünge hatası + k·kayma (k = Δv/Δv₀). *Gerçek yörünge*: itkisiz ve itkili çarpma olasılığı; *çarpacak olsaydı*: ıskalama olasılığı ve **%95 güvenle** kurtarmak için gereken Δv ile çarpıcı kütlesi (Δv_req·e^{1,645σ}). Yeşil ≥ %95, sarı %50–95, kırmızı < %50.
- B-düzlemi grafiğinde turuncu kalın çizgi kaymanın %5–95 aralığı, elipsler yörünge belirsizliği (1σ ve 3σ).

Sınır: depodaki deneme yanıtı (`test/fixtures/sbdb_99942.json`) kovaryans içermez; kovaryans biçimi JPL SBDB API belgesine göre okunur (`covFromSbdb`: `labels`, tam ya da alt üçgen `data`, `epoch`, `elements`) ve bozuksa yalnız itkinin belirsizliği hesaplanır. Gerçek JPL yanıtıyla bu oturumda denenemedi (ağ izni).

### Paylaşılabilir bağlantı ve "Denemelerim"

Her hesap, deneyin tüm ayarlarını adres çubuğuna yazar; **Bağlantıyı kopyala** bu adresi verir. Bağlantıyı açan kişide hedef kendiliğinden seçilir, aynı aralık taranır, aynı günün yakın geçişi ve aynı itki kurulur ve sonuç hesaplanır (katalog yüklenince). Parametreler (`labtext.js` › `linkFromState` / `stateFromLink`; bozuk ya da tanınmayan değerler atılır):

| Parametre | Anlamı |
|---|---|
| `hedef` | SBDB tanımı (`99942`, `2024 YR4`) |
| `bas`, `yil` | tarama başlangıcı (YYYY-AA-GG) ve süresi (1–120 yıl) |
| `gecis` | yakın geçişin günü (UTC) |
| `yontem` | `kin` (kinetik: `m`, `U`, `beta`) ya da `sur` (sürekli: `F`, `gun`) |
| `itki`, `yon`, `senaryo` | itki günü, yön (`along`, `anti`, `best`, `radial`, `normal`), `gercek` ya da `varsayim` (çarpacak olsaydı) |
| `D`, `rho` | yalnız kullanıcı çapı/yoğunluğu değiştirdiyse |

Örnek: `?mode=lab&exp=saptirma&hedef=99942&gecis=2029-04-13&yontem=kin&m=5000&U=6.1&beta=3.6&itki=2027-04-13&yon=along&senaryo=varsayim`. Başka bir deneye geçilince bu parametreler adresten silinir (`app.js` › `syncWorkspace`).

**Denemelerim**, bu tarayıcıda hesaplanan son 30 denemeyi (`localStorage` › `ls19.dfHist`) hedef, geçiş, itki, önceden uyarı süresi, kayma / gereken kayma ve kararla listeler; satıra dokununca deneme yeniden kurulup hesaplanır. **CSV indir** tabloyu (bağlantılarıyla) tablolama programlarına verir.

## 5. Telefon düzeni

Ana sayfa ya da saptırma açılınca panel kendiliğinden açılır (deney ana içeriktir); Ay görevinde açılmaz (3B uçuş ana içeriktir; görev çubuğundaki panel düğmesi açar/kapar, deney ağaçtan seçilirse panel açık kalır). Saptırmada "3B'de göster" paneli kapatır ki 3B görünüm örtülmesin; zaman/kamera çubuğundaki panel düğmesi geri açar. Adımlar tam genişlik, yatay taşma yoktur (tarayıcı denemesinde denetlenir).

## 6. Doğrulama

- `node test/test_ayexp.js` — Ay görevi deneyi: adım özetleri, sonuç yargısı (başarılı, sert temas, atmosfere giriş), güvenli temas sınırlarının `mission.js` ile aynılığı, arayüz sözleşmesi (dört adım ve aletler, eski sekme kimlikleri, panel ↔ menü araç/güdüm düğmeleri, `ayui.js` worker'a komut göndermez).
- `node test/test_lab.js` — saf yardımcılar (itki zamanı seçenekleri, sonuç yargısı her senaryo için, metinler) ve arayüz sözleşmesi (JS'nin başvurduğu her kimlik index.html'de var, iki alan, deney kaydı ↔ ağaç ↔ sayfa uyumu, `data-for` kuralları, görünüm → motor eşlemesi, eski/yeni adresler, simgeler, erişilebilirlik öznitelikleri).
- `node tools/lab_deneme.mjs` — başsız Chromium'da tam akış: iki dallı gezinme, deney → motor geçişleri (ana sayfa motoru değiştirmez; Ay görevi görev motorunu, saptırma gökyüzü motorunu açar), Ay görevinin dört adımı (Devam düğmeleri, panelden güdüm seçimi menüyle eşlenir, Uçuş aletleri, K, inişe atlayıp sonuç kartı, Baştan uçur, `?tab=dv`), Esc/M/K kısayolları, Betulia boş durumu, Apophis 2029 (4 yakın geçiş, ilki 13 Nisan 2029, 38.013 km), itki, "çarpacak olsaydı", 3B yollar, çapraz bağlantılar, eski/yeni adres parametreleri (`?mode=mission`, `?tab=kontrol`), telefon (390×844; varsayılan açılışta panel kapalı). `api/*` istekleri gerçek bulut işlevleriyle `web/test/fixtures` yanıtlarından karşılanır: internet gerekmez.

**Sınırlar:** tarayıcı denemesi yazılım çizimiyle (SwiftShader) ve sahte kaynak verisiyle yapıldı; ayrıntı (tam duyarlıklı JPL çözümü) yalnız Apophis için var, öteki hedefler katalog öğeleriyle çalışır. Gerçek JPL sunucusuyla, gerçek GPU'yla ve gerçek bir telefonda denenmedi.

## 7. Yeni deney eklemek

1. `index.html`'de `#labPanel` içine `<div id="lab-<ad>" class="labpage" hidden>…</div>` ekleyin (sekmeli bir deneyse `class="labpage labtabs"`, içinde `nav.tabs` ve `.tabpage`'ler).
2. Merkez ağacına (`#lab-home`) bir dal ekleyin: `<button class="exp" data-exp="<ad>">`. Başka bir alana kısayolsa `data-go="…"` ve `labui.js`'te karşılığı.
3. `labui.js`'te `EXPERIMENTS`'e `<ad>: { title, engine: 'mission' | 'sky', phoneOpen }` ekleyin. Motor değişimi, adres (`?mode=lab&exp=<ad>`), görünürlük ve telefon davranışı buradan gelir; `app.js`'e dokunmak gerekmez.
4. Yalnız bu deneyde görünmesi gereken bir çubuk ya da gösterge varsa `data-for="lab@<motor>"` verin.
5. Karar/biçim mantığını `labtext.js`'e (Node'da sınanır), arayüzü ayrı bir modüle koyun; `node test/test_preload.js --print` ile `modulepreload` listesini yenileyin; `test_lab.js` kayıt/ağaç/sayfa tutarlılığını kendiliğinden denetler.

Mevcut kodla eklenmeye aday deneyler: **Lagrange noktaları ve halo yörüngeler** (`cr3bp.js`, `halo.js`; görev motoru), **İniş güdümü karşılaştırması** (`pdg.js`: aynı başlangıçtan Optimal ve ZEM/ZEV).
