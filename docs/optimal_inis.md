# Optimal iniş güdümü: kaynaklar, formülasyon ve doğrulama

LS19'un motorlu inişi isteğe bağlı olarak **yakıt-optimal güdümle** uçurulur (`web/js/pdg.js`, `web/js/conic.js`; menü: *Uçuş ▾ → İniş güdümü*).
Yaklaşım Behçet Açıkmeşe ve çalışma arkadaşlarının **kayıpsız dışbükeyleştirme** (lossless convexification, LCvx) çizgisindendir: nonkonveks itki kısıtı
dışbükey bir gevşetmeyle değiştirilir, gevşetme eniyi çözümde sıkıdır, problem ikinci derece koni programı (SOCP) olarak yinelemesiz çözülür.
Bu belge neyin okunduğunu, neyin yazıldığını ve neyin hangi düzeyde doğrulandığını açıkça söyler.

## 1. Okunan kaynaklar ve doğrulama düzeyi

**Makalelerin tam metnine bu ortamdan erişilemedi.** arXiv, NTRS, yayıncı siteleri (Springer, ScienceDirect, Wiley, AIAA), UW ve yazar sayfaları ağ çıkış politikasıyla kapalıdır ve
dolaşılmadı. Okunabilenler GitHub üzerindeki kod ve defterlerdir. Formülasyon, makalelerden bildiğim biçimiyle yazıldı ve aşağıdaki bağımsız kaynaklarla **sayısal olarak** sınandı.

| Kaynak | Nasıl okundu | Alınan / sınanan |
|---|---|---|
| UW-ACL (Açıkmeşe'nin laboratuvarı) `DT-LCvx-Pointing` — "Discrete-time lossless convexification for pointing constraints" (arXiv:2501.06931) | defter ve kod okundu | tam (matris üstelli) ZOH ayrıklaştırma; işaretleme koşulunun ‖u‖ ve σ üzerinden biçimi; ayrık zamanda kayıpsızlığın denetimi (kontrol edilebilirlik), kayıpsızlık boşluğunun izlenmesi |
| UW-ACL `pipg-demo` — PIPG (Yu, Elango, Topcu, Açıkmeşe, *Automatica* 142, 2022) | README ve problem tanımları | birinci derece çözücü alternatifi; **kullanılmadı** (iç nokta çözücü seçildi: doğruluk ve sağlamlık) |
| `ISeralx/tfm-gnc-convex` — Malyuta vd. (*IEEE Control Systems Magazine* 42(5), 2022) Mars 3-DoF karşılaştırmasının yeniden üretimi | defter okundu, CVXPY/Clarabel ile **yeniden çalıştırıldı** | parametreler ve referans sonuç (tf = 75 s, 373,75 kg); ZOH + dönen çerçeve; log-kütle ve ikinci derece Taylor sınırları |
| `CuNO3/gfold-py` (BSD-3) | kod okundu | Açıkmeşe–Carson–Blackmore (2013) kısıt biçimlerinin ikinci bir bağımsız yazımı: itki sınırlarının Taylor biçimi, işaretleme, süzülme konisi, trapez/ZOH |
| `jonnyhyman/G-FOLD-Python` (GPL-3) | yalnız anlamak için okundu; **kod kopyalanmadı** | aynı kısıtların üçüncü yazımı (GPL nedeniyle MIT depoya hiçbir şey alınmadı) |

Ana makaleler (kaynakça; tam metni okunmadı, özetleri ve atıfları web aramasıyla görüldü):

- B. Açıkmeşe, S. R. Ploen, *Convex Programming Approach to Powered Descent Guidance for Mars Landing*, JGCD 30(5), 2007, 1353–1366 (doi:10.2514/1.27553)
- B. Açıkmeşe, L. Blackmore, *Lossless convexification of a class of optimal control problems with non-convex control constraints*, Automatica 47(2), 2011, 341–347
- L. Blackmore, B. Açıkmeşe, D. P. Scharf, *Minimum-Landing-Error Powered-Descent Guidance for Mars Landing Using Convex Optimization*, JGCD 33(4), 2010, 1161–1171 (doi:10.2514/1.47202)
- B. Açıkmeşe, J. M. Carson III, L. Blackmore, *Lossless Convexification of Nonconvex Control Bound and Pointing Constraints of the Soft Landing Optimal Control Problem*, IEEE TCST 21(6), 2013, 2104–2113 (doi:10.1109/TCST.2012.2237346)
- D. P. Scharf, B. Açıkmeşe, D. Dueri, J. Benito, J. Casoliva, *Implementation and Experimental Demonstration of Onboard Powered-Descent Guidance*, JGCD 40(2), 2017 (G-FOLD, Masten Xombie uçuş denemeleri)
- D. Dueri, B. Açıkmeşe, D. P. Scharf, M. W. Harris, *Customized Real-Time Interior-Point Methods for Onboard Powered-Descent Guidance*, JGCD 40(2), 2017 (doi:10.2514/1.G001480)
- D. Malyuta, T. P. Reynolds, M. Szmuk, T. Lew, R. Bonalli, M. Pavone, B. Açıkmeşe, *Convex Optimization for Trajectory Generation*, IEEE CSM 42(5), 2022 (arXiv:2106.09125)
- Klasik: J. L. Meditch, *On the problem of optimal thrust programming for a lunar soft landing*, IEEE Trans. Autom. Control 9(4), 1964 — itki yapısı (en küçük sonra en büyük) 1B sınamada bağımsız olarak yeniden elde edilir.

## 2. Formülasyon

Durum x = [r, v, z], z = ln m. Denetim u = T/m (itki ivmesi), σ = Γ/m (Γ ≥ ‖T‖ gevşetme değişkeni), α = 1/(Isp·g₀):

```
ṙ = v        v̇ = g(r) + u        ż = −α σ                      (g: merkezi çekim; dönen çerçevede ayrıca −Ω×(Ω×r) − 2Ω×v)
‖u‖ ≤ σ                                                       (gevşetme; eniyi çözümde ‖u‖ = σ: "kayıpsız")
ρ1 e^{−z} ≤ σ ≤ ρ2 e^{−z}                                     (ρ1 ≤ ‖T‖ ≤ ρ2; nonkonveks)
  üst sınır: σ ≤ ρ2 e^{−z̄}·(1 − (z − z̄))                     (e^{−z}'nin teğeti: gerçek sınırın altında kalır)
  alt sınır: σ ≥ ρ1 e^{−z̄}·(1 − d + d²/2),  d = z − z̄          (ikinci derece Taylor, dönel koni olarak yazılır)
  z̄ = ln(m₀ − αρ2 t)  (en büyük itkıyla kütle yolu) ya da bir önceki çözümün z'si (ardışık yaklaşım)
ln m_kuru ≤ z_N,   z0(t) ≤ z ≤ z1(t)                         (kuru kütle ve en büyük/en küçük itkıyla kütle zarfı)
n̂·u ≥ cosθ σ        (işaretleme)     ‖(r − r_f)⊥‖ ≤ tanγ n̂·(r − r_f)        (süzülme konisi)
−n̂·v_göreli ≤ vd0 + kd h,   ‖v_yatay‖ ≤ vh0 + kh h             (iniş hızı ve yatay hız koridoru; h = n̂·(r − r_f))
n_k·r_k ≥ R_yüzey (k. düğümde referans yönüne teğet yarı uzay)   (yüzeyin altına inmeme: kürenin dışı için iç yaklaşım)
min Σ σ_k Δt   (= m_N'yi enbüyüt)     ya da   min ‖(r_N − r_f)⊥‖  (en küçük iniş hatası, Blackmore vd. 2010)
```

Sabit son zaman tf için bu bir SOCP'dir. Yakıt, tf'nin tek tepeli bir işlevidir; tf için altın oran araması yapılır (Açıkmeşe & Ploen).

## 3. Bu projedeki uygulama

- **Birimler ve çerçeve:** SI (m, s, kg, N); Ay merkezli eylemsiz çerçeve (ICRF eksenleri). Hedef (iniş yeri ve hızı), iniş anına bağlıdır: r_f = site(t₀ + tf), v_f = ω × r_f − v_kapı·n̂ (Ay'ın dönmesi dahil).
- **Ayrıklaştırma:** u, σ ve g aralıklarda sabit (ZOH); aralık matrisleri matris üstelle **tam** (dönen çerçeve de dahil). Çekim, bir önceki çözümün yolu boyunca yeniden değerlendirilir (sabit nokta; her geçişte hata ~10 kat azalır).
- **Ölçekleme:** konum r_f'e göre ve uzunluk ölçeğine (başlangıç uzaklığı), hız ve ivme tf ile boyutsuzlaştırılır; Clarabel iyi koşullu bir problem görür.
- **Ardışık yaklaşım:** en büyük itkıyla kütle yolu referansı, uzun en küçük itkı yaylarından sonra üst sınırı gereğinden sıkar (1B örnekte %0,24 yakıt); Taylor noktası çözümün kendi kütle yoluna alınınca bu hata kalkar.
- **Gevşek kısıtlar:** işaretleme, süzülme ve hız koridoru isteğe bağlı olarak dolgu değişkenleriyle gevşetilir ve ağır cezalanır; bozulma sonrasında da çözüm bulunur, aşım bildirilir. İtki sınırları, dinamik ve son koşullar sert kalır.
- **Kapalı döngü:** ilk plan PDI'da ~0,7 s'de (49 SOCP), sonra her 10 s'de (son dakikada 4 s) sıcak başlangıçla yeniden çözüm: çekim yolu, Taylor noktası ve kumanda (köşegen ikinci derece düzenleyici; düz yönlerde plan sürüklenmesini önler) önceki plandan alınır; iniş anı sabit tutulur, yalnız koridor aşılırsa uzatılır. Ortalama 45 ms.
- **Kapı:** plan, iniş yerinin 120 m üstündeki kapıya biter (iniş hızı 1 + 0,07·h = 9,4 m/s); ardından eski ZEM güdümündeki son iniş yasası temasa taşır.
- **Kumanda:** ZOH düğümündeki u vektörü, gerçek kütleyle itkiye çevrilir (T = m·‖u‖), en küçük kısmaya ve tam itkıya kırpılır; planlama üst sınırı tam itkının %90'ıdır (kumanda payı).
- **Ön ayarlar:** *dengeli* (son 100 s'de itki dikeyden ≤ 45°; son 200 s'de iniş hızı ≤ vd + 0,06·h, yatay ≤ 1 + 0,15·h) ve *serbest* (işaretleme yok; hız koridoru 0,25 / 0,6, son 120 s).
- **Çözücü:** [Clarabel](https://github.com/oxfordcontrol/Clarabel.rs) (iç nokta, WebAssembly, 268 KB), `cvxjs` 0.1.4 paketinden olduğu gibi (`web/lib/clarabel/`, SHA-256'lı); tarayıcıda Web Worker'da, Node'da aynı ikiliyle koşar.

## 4. Doğrulama (`web/test/test_pdg.js`)

| Sınama | Sonuç |
|---|---|
| Mars, Malyuta vd. 2022 (tez yeniden üretimi), piramit süzülme | tf = 75 s: **373,7550 kg** (referans 373,755); tf = 80 s: 378,6330 (378,633); tf = 70 s: uygun değil (referans da) |
| Aynı formülasyon, koni süzülme: bağımsız CVXPY/Clarabel | 373,8413 / 378,6623 kg (iki uygulama 5·10⁻⁵ kg içinde) |
| Düz Ay (5 yapılandırma), bağımsız CVXPY/Clarabel | en büyük fark 1,4·10⁻⁵ kg |
| 1B dikey iniş, bağımsız yarı-analitik optimum (ρ1 yayı + ρ2 yayı, vuruş, RK4) | yakıt +%0,06 (N = 120; N = 30 → 60 → 120'de fark 0,26 → 0,16 → 0,16 kg); anahtarlama anı 76,2 s = 76,2 s; tf* 121,84 s (121,72 s) |
| Kayıpsızlık ‖u‖ = σ | Mars 7·10⁻¹⁰, Ay 4·10⁻¹⁰ (tüm düğümlerde); tek istisna: eniyi çözüm itkıyı en küçük sınırın altına çekmek isterken ilk düğümlerde gevşetme sıkı olmaz (motor kapatılamıyorsa; yarı sürekli girdi uzantısı uygulanmadı) |
| Ay yörüngesinden iniş planı → gerçek merkezi çekimle bağımsız RK4 | son durum 1,0 m / 0,002 m/s içinde |
| Tam görev, N-cisim motor (J2/C22, Ay dönmesi) | altı profil × üç güdüm: hepsi yumuşak temas; rastgele 10 m/s bozulmalar (iniş sırasında 5/5, PDI'dan önce 5/5) |

## 5. Bulgular

Aynı PDI durumundan (2735 kg, 13,83 km, Apollo profili), kalan yakıt ve toplam motorlu iniş Δv'si:

| Güdüm | Δv (m/s) | kalan yakıt (kg) |
|---|---|---|
| ZEM/ZEV (eski, Apollo benzeri) | 1913 | 186 |
| Optimal, dengeli | 1867 | 209 |
| Optimal, serbest | 1806 | 238 |
| (kuramsal) kısıtsız yakıt-optimal, kapısız | ~1736 | — |

Kısıtsız en iyi çözüm yüzeye yatay bir "sürünme" ile iner (son 10 s'de 85 m irtifada 97 m/s yatay hız) ve gerçekçi değildir; işaretleme ve hız koridoru bu yüzden eklenir. Güvenlik koridoru yakıt öder:
iyi tasarlanmış bir Apollo profili (ZEM/ZEV) bu kısıtlar altındaki optimuma %2–3 yaklaşır; kazanç kısıtlar gevşedikçe büyür. En pahalı kısıt işaretleme açısıdır (tek başına kaldırılınca ~60–70 m/s).

## 6. Sınırlar

- 3 serbestlik dereceli (nokta kütle): yönelim dinamiği, motor ateşleme geçişleri ve arazi yoktur; itki yönü düğüm sınırlarında sıçrar (ZOH).
- Plan nokta kütle çekimiyle kurulur; Ay'ın harmonikleri ve üçüncü cisimler yeniden çözümle düzeltilir (ayrı bir kanıt: bağımsız RK4 ve tam görev testleri).
- Son 120 m optimal değildir (son iniş yasası). Kapalı döngü için biçimsel yakınsama/uygunluk garantisi verilmez; gevşek kısıtlar ve geri düşüş (art arda başarısızlıkta son iniş yasası) sağlamlık içindir.
- Motor kapatılamaz (ρ1 > 0); yarı sürekli girdili (kapalı/[ρ1, ρ2]) kayıpsız dışbükeyleştirme uygulanmadı.
- Makalelerin tam metni okunamadı (bkz. §1); doğrulama bağımsız kod ve sayısal karşılaştırmalara dayanır.
