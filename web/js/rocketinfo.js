// Roket bilgi kartları: tarihçe, teknik özellikler, kademeler ve yakıtlar, Ay ile ilgili görevler — her bilgi kaynak numarasıyla (src: ROCKET_INFO[id].sources dizinleri).
// Saf veri (DOM yok; Node'da sınanır: test/test_rocketinfo.js). Tarihler UTC/yerel takvim günü; "planlanıyor" kayıtları 3 Kasım 2026 itibarıyla.
// Model: 'glb' resmî NASA 3D Resources modeli (tools/roket_modelleri.mjs), 'proc' yayımlanmış ölçülerden çizim (rocketmodels.js makeLaunchVehicle).

export const ROCKET_INFO = {
  SATURN_V: {
    maker: 'NASA Marshall Uzay Uçuş Merkezi (tasarım); S-IC Boeing, S-II North American Aviation, S-IVB Douglas, alet birimi IBM', country: 'ABD',
    status: 'Emekli (1967–1973)',
    specs: [
      ['Boy', '110,6 m', [1, 2]], ['Çap', '10,1 m', [1, 2]], ['Kalkış kütlesi', '≈ 2.800–2.970 t (kaynaklar ayrışır)', [1, 2]],
      ['Kalkış itkisi', '≈ 33.900 kN (5 × F-1)', [1]], ['LEO yükü', '≈ 140 t (S-IVB ve kalan yakıt dahil)', [2]],
      ['Ay yükü (TLI)', 'Apollo 17: 46,8 t (CSM 30.320 kg + LM 16.448 kg)', [3, 4]], ['Uçuş', '13 (1967–1973)', [1, 2]],
    ],
    stages: [
      { name: 'S-IC (1. kademe)', engines: '5 × F-1', prop: 'RP-1 (gazyağı) / sıvı oksijen', note: 'Yaklaşık 2,7 dakika yanar (Apollo 11: ~67 km irtifada ayrıldı).', src: [1] },
      { name: 'S-II (2. kademe)', engines: '5 × J-2', prop: 'Sıvı hidrojen / sıvı oksijen', note: '', src: [1] },
      { name: 'S-IVB (3. kademe)', engines: '1 × J-2 (yeniden ateşlenebilir)', prop: 'Sıvı hidrojen / sıvı oksijen', note: 'Yörüngeye girişi tamamlar, park yörüngesinden sonra yeniden ateşlenip TLI\'ı yapar.', src: [1, 5] },
    ],
    history: [
      ['Apollo programı için Wernher von Braun yönetimindeki Marshall Uzay Uçuş Merkezi\'nde geliştirildi; kademeleri farklı yükleniciler üretti.', [1]],
      ['İlk uçuşu insansız Apollo 4 (9 Kasım 1967), son uçuşu Skylab istasyonunu yörüngeye koyan SA-513 oldu (14 Mayıs 1973). 13 uçuşun hepsinde yük yörüngeye ulaştı; Apollo 6\'da titreşim (pogo) ve motor kapanmaları yaşandı.', [1, 2]],
      ['İnsanları alçak Dünya yörüngesinin ötesine taşıyan ilk roket oldu (Apollo 8); Apollo 11–17 arasında altı insanlı Ay inişinin hepsi Saturn V ile fırlatıldı.', [1]],
    ],
    missions: [
      { date: '1968-12-21', name: 'Apollo 8', result: 'Başarılı', note: 'İlk insanlı Ay yörüngesi (10 tur).', src: [1] },
      { date: '1969-05-18', name: 'Apollo 10', result: 'Başarılı', note: 'Ay yörüngesinde iniş provası (LM 15,6 km\'ye indi).', src: [1] },
      { date: '1969-07-16', name: 'Apollo 11', result: 'Başarılı', note: 'İlk insanlı Ay inişi, 20 Temmuz 1969, Huzur Denizi.', src: [1] },
      { date: '1969-11-14', name: 'Apollo 12', result: 'Başarılı', note: 'Kalkışta iki yıldırım çarptı; Fırtınalar Okyanusu\'na hassas iniş.', src: [1] },
      { date: '1970-04-11', name: 'Apollo 13', result: 'Kısmi', note: 'Hizmet modülünde oksijen tankı patladı; iniş iptal, mürettebat güvenle döndü.', src: [1] },
      { date: '1971-01-31', name: 'Apollo 14', result: 'Başarılı', note: 'Fra Mauro.', src: [1] },
      { date: '1971-07-26', name: 'Apollo 15', result: 'Başarılı', note: 'Hadley–Apennine; ilk Ay aracı (LRV).', src: [1] },
      { date: '1972-04-16', name: 'Apollo 16', result: 'Başarılı', note: 'Descartes yaylası.', src: [1] },
      { date: '1972-12-07', name: 'Apollo 17', result: 'Başarılı', note: 'Taurus–Littrow; son insanlı Ay inişi, ilk gece fırlatması.', src: [1, 3] },
    ],
    model: { kind: 'glb', file: 'models/rockets/saturnv.glb', credit: 'NASA 3D Resources ("Saturn V")', src: [6] },
    sources: [
      { t: 'Saturn V — Wikipedia', u: 'https://en.wikipedia.org/wiki/Saturn_V' },
      { t: 'Saturn V teknik özet — OrbitCodex', u: 'https://orbitcodex.com/launch-vehicles/saturn-v' },
      { t: 'Apollo 17 CSM (NASA PDS Geosciences)', u: 'https://pds-geosciences.wustl.edu/lunar/urn-nasa-pds-apollodoc/document_a17/instrument_hosts/a17c_csm.txt' },
      { t: 'Apollo 17 LM (NASA PDS Geosciences)', u: 'https://pds-geosciences.wustl.edu/lunar/urn-nasa-pds-a17tg_traverse_gravity/document/a17l_lm.txt' },
      { t: 'S-IVB — Wikipedia', u: 'https://en.wikipedia.org/wiki/S-IVB' },
      { t: 'NASA 3D Resources', u: 'https://github.com/nasa/NASA-3D-Resources' },
    ],
  },
  SLS1: {
    maker: 'NASA (Marshall); çekirdek kademe Boeing, RS-25 Aerojet Rocketdyne (L3Harris), katı yakıtlı iticiler Northrop Grumman, ICPS ULA/Boeing', country: 'ABD',
    status: 'Etkin (Artemis)',
    specs: [
      ['Boy', '98 m (Orion dahil 322 ft)', [1, 2]], ['Çekirdek çapı', '8,4 m', [3]], ['Kalkış kütlesi', '≈ 2.610 t', [2, 3]],
      ['Kalkış itkisi', '8,8 milyon lbf (≈ 39.100 kN)', [1, 2]], ['LEO yükü', '95 t', [3]], ['Ay yükü (TLI)', '> 27 t (mürettebatlı yapılandırma)', [1]],
    ],
    stages: [
      { name: 'Katı yakıtlı iticiler', engines: '2 × beş segmentli SRB', prop: 'Katı yakıt (PBAN bağlayıcılı amonyum perklorat / alüminyum)', note: 'Uzay Mekiği iticilerinden türetildi; ilk ~2 dakikada itkinin çoğunu verir.', src: [1, 3] },
      { name: 'Çekirdek kademe', engines: '4 × RS-25', prop: 'Sıvı hidrojen / sıvı oksijen', note: 'Motorlar Uzay Mekiği programından.', src: [1, 3] },
      { name: 'ICPS (üst kademe)', engines: '1 × RL10B-2', prop: 'Sıvı hidrojen / sıvı oksijen', note: 'Delta IV 5 m ikinci kademesinden türetildi; perije yükseltme ve TLI yakışlarını yapar.', src: [4] },
    ],
    history: [
      ['Constellation programının iptalinden sonra 2010 NASA Yetkilendirme Yasası\'yla Uzay Mekiği donanımından türetilen ağır roket olarak geliştirildi.', [3]],
      ['İlk uçuşu Artemis I (16 Kasım 2022, KSC LC-39B): insansız Orion Ay çevresinde uzak yörüngeye gidip döndü.', [3]],
      ['Artemis II (1 Nisan 2026) dört astronotu 1972\'den beri ilk kez Ay\'ın yakınına götürdü; Orion 6 Nisan\'da Ay\'ın yanından geçti, 10 Nisan\'da Pasifik\'e indi.', [5, 6]],
    ],
    missions: [
      { date: '2022-11-16', name: 'Artemis I', result: 'Başarılı', note: 'İnsansız Orion, uzak geri yörünge (DRO), 25,5 günlük uçuş.', src: [3] },
      { date: '2026-04-01', name: 'Artemis II', result: 'Başarılı', note: 'Wiseman, Glover, Koch, Hansen; Ay yakın geçişi (6 Nisan 2026), Apollo 13\'ün Dünya\'dan uzaklık rekorunu aştı.', src: [5, 6] },
    ],
    model: { kind: 'proc', key: 'sls', credit: 'Yayımlanmış ölçülerden çizim; parça yükseklikleri NASA 3D Resources SLS Block 1 modelinden (o model tank kabuklarını içermez)', src: [1, 7] },
    sources: [
      { t: 'NASA SLS bilgi notu (Haziran 2023)', u: 'https://www.nasa.gov/wp-content/uploads/2023/07/0080-sls-fact-sheet-jun2023-508-1.pdf' },
      { t: 'NASA ASCEND 2024 SLS sunumu (NTRS)', u: 'https://ntrs.nasa.gov/api/citations/20240009183/downloads/Final%20-%20ASCEND%202024%20Presentation.pdf' },
      { t: 'Space Launch System — Wikipedia', u: 'https://en.wikipedia.org/wiki/Space_Launch_System' },
      { t: 'Delta Cryogenic Second Stage / ICPS — Wikipedia', u: 'https://en.wikipedia.org/wiki/Delta_Cryogenic_Second_Stage' },
      { t: 'NASA: Artemis II 6. gün, Ay yakın geçişi', u: 'https://www.nasa.gov/blogs/missions/2026/04/06/artemis-ii-flight-day-6-crew-wraps-historic-lunar-flyby/' },
      { t: 'ScienceDaily: NASA launches Artemis II', u: 'https://www.sciencedaily.com/releases/2026/04/260402004721.htm' },
      { t: 'NASA 3D Resources', u: 'https://github.com/nasa/NASA-3D-Resources' },
    ],
  },
  F9: {
    maker: 'SpaceX', country: 'ABD', status: 'Etkin (en sık uçan roket)',
    specs: [
      ['Boy', '70 m', [1, 2]], ['Çap', '3,7 m', [1, 2]], ['Kalkış kütlesi', '549 t', [1, 2]], ['Kalkış itkisi', '≈ 7.607 kN (9 × Merlin 1D)', [2]],
      ['LEO yükü', '22,8 t (harcanabilir)', [1, 2]], ['GTO yükü', '8,3 t (harcanabilir); ~5,5 t (birinci kademe kurtarılırsa)', [3, 4]],
      ['İlk uçuş', '4 Haziran 2010 (Block 5: 11 Mayıs 2018)', [2]],
    ],
    stages: [
      { name: '1. kademe', engines: '9 × Merlin 1D', prop: 'RP-1 (gazyağı) / sıvı oksijen', note: 'Yeniden kullanılabilir: ızgara kanatları ve iniş bacaklarıyla gemiye ya da kara pistine geri iner.', src: [1, 2] },
      { name: '2. kademe', engines: '1 × Merlin 1D Vakum', prop: 'RP-1 / sıvı oksijen', note: 'Harcanabilir; birden çok kez ateşlenebilir. Ay görevlerinde aracı doğrudan Ay\'a aktarma yörüngesine bırakır.', src: [1] },
    ],
    history: [
      ['SpaceX\'in Falcon 9\'u 2010\'da ilk kez uçtu; 2015\'te yörünge sınıfı bir roketin birinci kademesini ilk kez dikey olarak geri indirdi.', [2]],
      ['Block 5 sürümü (2018) hızlı yeniden kullanım için tasarlandı; 2026\'da yılda ~140 Falcon 9 fırlatması bekleniyor.', [2, 5]],
      ['NASA\'nın Ticari Ay Yükü Hizmetleri (CLPS) programındaki iniş araçlarının çoğunu Ay\'a gönderdi.', [6, 7]],
    ],
    missions: [
      { date: '2019-02-22', name: 'Beresheet (SpaceIL)', result: 'İniş başarısız', note: 'Ortak fırlatma; 11 Nisan 2019\'da iniş sırasında düştü.', src: [2] },
      { date: '2022-08-04', name: 'Danuri / KPLO (KARI)', result: 'Başarılı', note: 'Güney Kore\'nin Ay yörünge aracı.', src: [2] },
      { date: '2024-02-15', name: 'IM-1 Odysseus (Intuitive Machines)', result: 'Kısmi', note: '22 Şubat 2024\'te güney kutup bölgesine indi ama yan yattı; 1972\'den beri ilk ABD Ay inişi.', src: [6] },
      { date: '2025-01-15', name: 'Blue Ghost M1 (Firefly) + Hakuto-R M2', result: 'Başarılı / başarısız', note: 'Blue Ghost 2 Mart 2025\'te Kriz Denizi\'ne başarıyla indi; Resilience Haziran 2025\'te düştü.', src: [7] },
      { date: '2025-02-26', name: 'IM-2 Athena (Intuitive Machines)', result: 'Kısmi', note: '6 Mart 2025\'te Mons Mouton yakınında bir kratere yan yatarak indi; görev bir gün içinde bitti.', src: [7, 8] },
    ],
    model: { kind: 'proc', key: 'f9', credit: 'Yayımlanmış ölçülerden çizim (resmî kamu malı model yok)', src: [1] },
    sources: [
      { t: 'SpaceX — Falcon 9', u: 'https://www.spacex.com/vehicles/falcon-9/' },
      { t: 'Falcon 9 Block 5 — Wikipedia', u: 'https://en.wikipedia.org/wiki/Falcon_9_Block_5' },
      { t: 'SpaceX Capabilities & Services', u: 'https://spacex.com/media/Capabilities&Services.pdf' },
      { t: 'r/SpaceX wiki: Payload by Configuration', u: 'https://www.reddit.com/r/SpaceX/wiki/payload' },
      { t: 'SpaceNexus: Falcon 9 (2026 fırlatma beklentisi)', u: 'https://spacenexus.us/blog/falcon-9-workhorse-rocket-changed-spaceflight' },
      { t: 'NASA CLPS (Ticari Ay Yükü Hizmetleri)', u: 'https://www.nasa.gov/commercial-lunar-payload-services/' },
      { t: 'Sky & Telescope: Athena lands, then dies', u: 'https://skyandtelescope.org/astronomy-news/intuitive-machines-athena-lands-on-the-moon-then-dies/' },
      { t: 'SpacePolicyOnline: IM-2 mission ends', u: 'https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/' },
    ],
  },
  FH: {
    maker: 'SpaceX', country: 'ABD', status: 'Etkin',
    specs: [
      ['Boy', '70 m', [1]], ['Genişlik', '12,2 m (çekirdek 3,66 m)', [1]], ['Kalkış kütlesi', '1.420,8 t', [1]], ['Kalkış itkisi', '≈ 22.819 kN (27 × Merlin 1D)', [1]],
      ['LEO yükü', '63,8 t (harcanabilir)', [1]], ['GTO yükü', '26,7 t (harcanabilir)', [1]], ['İlk uçuş', '6 Şubat 2018', [1]],
    ],
    stages: [
      { name: 'Yan iticiler', engines: '2 × (9 × Merlin 1D)', prop: 'RP-1 / sıvı oksijen', note: 'Falcon 9 birinci kademesinden türetildi; genellikle aynı anda karaya geri iner.', src: [1, 2] },
      { name: 'Merkez çekirdek', engines: '9 × Merlin 1D', prop: 'RP-1 / sıvı oksijen', note: 'Güçlendirilmiş Falcon 9 birinci kademesi.', src: [1] },
      { name: '2. kademe', engines: '1 × Merlin 1D Vakum', prop: 'RP-1 / sıvı oksijen', note: 'Falcon 9 ile aynı.', src: [1] },
    ],
    history: [
      ['Üç Falcon 9 birinci kademesinin yan yana bağlanmasıyla oluşur; ilk uçuşunda (6 Şubat 2018) bir Tesla Roadster\'ı Güneş yörüngesine gönderdi, iki yan itici aynı anda indi.', [1, 2]],
      ['NASA\'nın Psyche (2023) ve Europa Clipper (2024) gezegenler arası sondalarını fırlattı.', [2]],
      ['Astrobotic\'in Griffin Ay iniş aracı (Griffin Mission One) Falcon Heavy ile fırlatılmak üzere planlanıyor (2026 sonu, tarih kesin değil).', [3]],
    ],
    missions: [
      { date: '2018-02-06', name: 'Test uçuşu (Tesla Roadster)', result: 'Başarılı', note: 'Merkez çekirdek gemiye inemedi.', src: [2] },
      { date: '2023-10-13', name: 'Psyche (NASA)', result: 'Başarılı', note: 'Metal zengini asteroit 16 Psyche\'ye.', src: [2] },
      { date: '2024-10-14', name: 'Europa Clipper (NASA)', result: 'Başarılı', note: 'Jüpiter\'in uydusu Europa\'ya.', src: [2] },
      { date: 'planlanıyor', name: 'Griffin Mission One (Astrobotic, CLPS)', result: 'Planlanıyor', note: 'Ay güney kutbuna iniş; NET 2026 sonu.', src: [3] },
    ],
    model: { kind: 'proc', key: 'fh', credit: 'Yayımlanmış ölçülerden çizim (resmî kamu malı model yok)', src: [1] },
    sources: [
      { t: 'SpaceX — Falcon Heavy', u: 'https://www.spacex.com/vehicles/falcon-heavy/' },
      { t: 'Falcon Heavy — Wikipedia', u: 'https://en.wikipedia.org/wiki/Falcon_Heavy' },
      { t: 'Griffin Mission One — Wikipedia', u: 'https://en.wikipedia.org/wiki/Griffin_Mission_One' },
    ],
  },
  VULCAN: {
    maker: 'United Launch Alliance (ULA); BE-4 Blue Origin, GEM 63XL Northrop Grumman', country: 'ABD', status: 'Etkin; Şubat 2026 itici anomalisinden sonra uçuşlar inceleme için durduruldu',
    specs: [
      ['Boy', '61,6 m (uzun kaporta ile 67,3 m)', [1, 2]], ['Çap', '5,4 m', [1, 2]], ['Kalkış kütlesi', '546,7 t', [2]],
      ['1. kademe itkisi', '2 × 2.447 kN (BE-4) + 0–6 katı itici', [2]], ['LEO yükü', '27,2 t (VC6: altı itici)', [1, 2]], ['Ay yükü (TLI)', 'VC2: 6,2 t; VC6: ~12,1 t', [1]],
      ['İlk uçuş', '8 Ocak 2024 (Cert-1)', [1, 3]],
    ],
    stages: [
      { name: 'Katı yakıtlı iticiler', engines: '0, 2, 4 ya da 6 × GEM 63XL', prop: 'Katı yakıt (HTPB)', note: 'Yapılandırma adı itici sayısını söyler: VC2S = 2 itici, standart kaporta.', src: [1, 2] },
      { name: '1. kademe', engines: '2 × BE-4', prop: 'Sıvı metan (LNG) / sıvı oksijen', note: 'Atlas V\'nin Rus RD-180 motorunun yerine geçen Amerikan motoru.', src: [1, 2] },
      { name: 'Centaur V (üst kademe)', engines: '2 × RL10C', prop: 'Sıvı hidrojen / sıvı oksijen', note: '5,4 m çaplı paslanmaz çelik balon tanklar.', src: [4] },
    ],
    history: [
      ['ULA, Atlas V ve Delta IV\'ün yerine geçmesi ve Rus yapımı RD-180 motoruna bağımlılığı bitirmesi için Vulcan\'ı geliştirdi; BE-4 motorundaki gecikmeler ilk uçuşu 2024\'e kaydırdı.', [1]],
      ['İlk uçuşta (Cert-1, 8 Ocak 2024) Astrobotic\'in Peregrine Ay iniş aracını fırlattı; roket kusursuz çalıştı, ancak Peregrine yakıt sızıntısı yüzünden Ay\'a inemedi ve 18 Ocak 2024\'te Dünya atmosferinde yandı.', [3, 5]],
      ['Cert-2\'de (4 Ekim 2024) bir katı iticinin nozulu koptu, roket yine yörüngeye ulaştı. Mart 2025\'te Uzay Kuvvetleri sertifikası aldı. 12 Şubat 2026\'daki USSF-87 uçuşunda ikinci bir itici nozul arızası yaşandı; uçuşlar inceleme için durduruldu.', [6, 7, 8]],
    ],
    missions: [
      { date: '2024-01-08', name: 'Peregrine Mission One (Astrobotic, CLPS)', result: 'Roket başarılı / iniş yok', note: 'İniş aracında yakıt sızıntısı; 18 Ocak 2024\'te atmosfere girdi.', src: [3, 5] },
      { date: '2024-10-04', name: 'Cert-2', result: 'Başarılı (anomali)', note: 'Katı itici nozul kaybı; yörüngeye ulaştı.', src: [6] },
      { date: '2026-02-12', name: 'USSF-87', result: 'Başarılı (anomali)', note: 'İkinci itici nozul arızası; fırlatmalar durduruldu.', src: [7, 8] },
    ],
    model: { kind: 'proc', key: 'vulcan', credit: 'Yayımlanmış ölçülerden çizim (resmî kamu malı model yok)', src: [2] },
    sources: [
      { t: 'Vulcan Centaur — Wikipedia', u: 'https://en.wikipedia.org/wiki/Vulcan_Centaur' },
      { t: 'ULA — Vulcan', u: 'https://www.ulalaunch.com/rockets/vulcan-centaur' },
      { t: 'SpacePolicyOnline: İlk ABD Ay iniş aracı yolda (Peregrine)', u: 'https://spacepolicyonline.com/?p=67796' },
      { t: 'Centaur (rocket stage) — Wikipedia', u: 'https://en.wikipedia.org/wiki/Centaur_(rocket_stage)' },
      { t: 'List of Vulcan launches — Wikipedia', u: 'https://en.wikipedia.org/wiki/List_of_Vulcan_launches' },
      { t: 'Aviation Week: Vulcan Cert-2 nozzle issue', u: 'https://aviationweek.com/space/launch-vehicles-propulsion/ulas-vulcan-nails-cert-2-orbit-despite-srb-nozzle-issue' },
      { t: 'The Register: Booster nozzle anomaly (Şubat 2026)', u: 'https://www.theregister.com/2026/02/13/ula_vulcan_centaur_anomaly/' },
      { t: 'Spaceflight Now: SRB test, anomaly investigation (Mayıs 2026)', u: 'https://spaceflightnow.com/2026/05/14/ula-confirms-successful-solid-rocket-booster-test-as-vulcan-anomaly-investigation-continues/' },
    ],
  },
};
