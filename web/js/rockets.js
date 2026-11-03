// Ay görevinin fırlatma aracı (roket) seçimi: saf veri + park yörüngesindeki kullanılabilir yakıtın türetilmesi (DOM yok; Node'da sınanır: test/test_rockets.js).
//
// Simülasyon Dünya park yörüngesinde başlar: roketten kalan, TLI'ı (Ay'a aktarma yakışını) yapan ÜST KADEMEDİR. Her roket için:
//   stage: üst kademenin kuru kütlesi (kg), tank yakıtı (kg), vakum itkisi (kN), vakum Isp (s), motor sayısı; ölçüler (m) 3B çizim için
//   ref:   yayımlanmış başarım: TLI (C3 ≈ −2 km²/s²) ya da GTO yükü (kg). Park yörüngesindeki toplam kütle bundan roket denklemiyle türetilir:
//            M_park = (m_kuru + P_ref) · exp(Δv_ref / (Isp g0))          (Δv_ref: 200 km dairesel park yörüngesinden TLI ya da GTO'ya, dürtüsel)
//          Park yörüngesine konan kütle roketin alt kademelerince belirlenir; yük hafifse fark üst kademede yakıt olarak kalır (1:1 takas):
//            yakıt_park = min(tank, M_park − m_kuru − yük)
//          Denetim: Apollo 17 yüküyle S-IVB park yörüngesinde ~71 t yakıtla kalır ve TLI'da tükenir (gerçek: ~70 t, yakış 5,9 dk; burada ~4,8 dk).
//          SLS'te türetilmiş TLI kapasitesi 25,2 t'dur (yayımlanan 27 t: ICPS gerçekte 200 km dairesel değil, daha yüksek eliptik yörüngeden başlar).
// Rampalar Florida'dadır (KSC / Cape Canaveral, birbirine ~10 km): görev tasarımı LC-39B koordinatlarını kullanır, 28,6°+ eğimli park yörüngesi hepsi için geçerlidir.
// Kaynaklar: NASA SLS bilgi notu (27 t TLI), Wikipedia (ICPS/DCSS, S-IVB, J-2, Centaur, Vulcan, Falcon 9) ve SpaceX Capabilities & Services.
// SpaceX ve ULA kademe kuru kütlelerini yayımlamaz: 'tahmin' işaretli değerler ikincil kaynaklardandır (sonuç yakıta ±%3 kadar yansır).

export const G0 = 9.80665;
export const MU_E = 398600.4418;                          // km³/s²
const R_PARK_REF = 6378.137 + 200;                        // başarım tablolarının park yörüngesi (200 km dairesel)
const vc = Math.sqrt(MU_E / R_PARK_REF);
// TLI: C3 = −2 km²/s² (ULA/NASA tanımı); GTO: 200 × 35 786 km (eğim değişimi yok sayılır: Florida GTO'su ~27°, ikinci yakış eğimi değiştirmez)
export const DV_REF = {
  TLI: Math.sqrt(2 * MU_E / R_PARK_REF - 2) - vc,
  GTO: Math.sqrt(MU_E * (2 / R_PARK_REF - 2 / (R_PARK_REF + 6378.137 + 35786))) - vc,
};

export const ROCKETS = {
  GENEL: {
    name: 'Genel TLI kademesi', short: 'Genel', year: '—', pad: 'KSC LC-39B', status: 'Örnek',
    note: 'Varsayılan: yakıtı göreve göre boyutlanan küçük hidrolox kademe (hazır tasarımlar bununla).',
    stage: { name: 'TLI kademesi', dry: 2300, T: 100, isp: 450, engines: 1, prop: 'LH2/LOX' },
    model: 'generic', sized: true,
    ascent: { tIns: 540, lv: 'generic', events: [{ t: 160, cut: 30.5, name: '1. kademe ayrıldı' }, { t: 200, part: 'fairing', name: 'Burun kaportası atıldı' }], approx: true },
    stageNote: 'Temsilî TLI kademesi (gerçek bir rokete ait değil; yakıtı göreve göre boyutlanır)',
  },
  SATURN_V: {
    name: 'Saturn V', short: 'Saturn V', year: '1967–1973', pad: 'KSC LC-39A', status: 'Tarihî (Apollo)',
    note: 'Apollo görevlerinde TLI\'ı S-IVB yaptı (J-2 motoru yeniden ateşlendi). Kuru kütleye araç aygıt birimi (IU, 2.041 kg) dahil.',
    stage: { name: 'S-IVB + IU', dry: 13500 + 2041, tank: 106400, T: 1033.1, isp: 421, engines: 1, prop: 'LH2/LOX', engine: 'J-2' },
    ref: { kind: 'TLI', P: 46768, src: 'Apollo 17 TLI yükü: CSM 30.320 kg + LM 16.448 kg (NASA PDS)' },
    model: 'sivb',
    // Apollo 11 uçuş günlüğü: S-IC/S-II ayrılması T+2:42, S-II/S-IVB T+9:09, yörüngeye giriş T+11:49
    ascent: { tIns: 709, lv: 'saturnv', events: [{ t: 162, cut: 42.1, name: 'S-IC ayrıldı' }, { t: 549, cut: 67.0, name: 'S-II ayrıldı' }],
      src: { t: 'Apollo 11 Flight Journal — Day 1: Launch and Reaching Earth Orbit', u: 'https://www.nasa.gov/history/afj/ap11fj/01launch.html' } },
    stageNote: 'S-IVB + IU — Saturn V\'nin 3. kademesi (S-IC ve S-II kalkışta ayrıldı; yörüngeye yalnız bu kademe ulaşır)',
  },
  SLS1: {
    name: 'SLS Block 1', short: 'SLS', year: '2022–', pad: 'KSC LC-39B', status: 'Etkin (Artemis)',
    note: 'Artemis I–III: TLI\'ı ICPS (Delta IV 5 m ikinci kademesinden türetilmiş) yapar, RL10B-2 motoru.',
    stage: { name: 'ICPS', dry: 3800, tank: 32748 - 3800, T: 110.1, isp: 462, engines: 1, prop: 'LH2/LOX', engine: 'RL10B-2',
      dims: { D: 5.1, L: 13.7, bell: { exitD: 2.15, len: 4.15 } } },
    ref: { kind: 'TLI', P: 27000, src: 'NASA SLS bilgi notu: Block 1 mürettebatlı yapılandırma > 27 t TLI' },
    model: 'icps',
    // Artemis I: SRB ayrılması T+2:12, fırlatma iptal sistemi T+3:15, çekirdek kademe ayrılması T+8:16 (NASA basın kiti)
    ascent: { tIns: 496, lv: 'sls', events: [{ t: 132, part: 'booster', name: 'Katı yakıtlı iticiler ayrıldı' }, { t: 195, part: 'las', name: 'Fırlatma iptal sistemi atıldı' },
      { t: 496, cut: 74.6, name: 'Çekirdek kademe ayrıldı' }], src: { t: 'NASA — Artemis I Press Kit (görev zaman çizelgesi)', u: 'https://www.nasa.gov/artemis-i-press-kit/' } },
    stageNote: 'ICPS — SLS\'in üst kademesi (çekirdek kademe ve katı iticiler kalkışta ayrıldı)',
  },
  F9: {
    name: 'Falcon 9 Block 5', short: 'Falcon 9', year: '2018–', pad: 'CCSFS SLC-40', status: 'Etkin (CLPS: IM-1, IM-2, Blue Ghost)',
    note: 'Birinci kademe gemiye iner. TLI yayımlanmadığından park kütlesi GTO yükünden türetilir. Kademe kuru kütlesi tahmindir.',
    stage: { name: 'Falcon 9 ikinci kademe', dry: 4000, dryEst: true, tank: 107500, T: 981, isp: 348, engines: 1, prop: 'RP-1/LOX', engine: 'Merlin 1D Vakum',
      dims: { D: 3.66, L: 13.8, bell: { exitD: 3.3, len: 4.4 } } },
    ref: { kind: 'GTO', P: 5500, src: 'GTO 5,5 t (birinci kademe kurtarılır; SpaceX 8,3 t harcanabilir)' },
    model: 'f9s2',
    // tipik Falcon 9 zaman çizelgesi (SpaceX yayınları): MECO ~T+2:30, ayrılma ~T+2:33, kaporta ~T+3:30, SECO-1 ~T+8:40
    ascent: { tIns: 520, lv: 'f9', events: [{ t: 153, cut: 47.9, name: '1. kademe ayrıldı' }, { t: 210, part: 'fairing', name: 'Burun kaportası atıldı' }], approx: true,
      src: { t: 'SpaceX — Falcon 9', u: 'https://www.spacex.com/vehicles/falcon-9/' } },
    stageNote: 'Falcon 9 ikinci kademesi (birinci kademe kalkışta ayrılıp geri indi)',
  },
  FH: {
    name: 'Falcon Heavy', short: 'Falcon Heavy', year: '2018–', pad: 'KSC LC-39A', status: 'Etkin',
    note: 'Yan iticiler kurtarılır. İkinci kademe Falcon 9 ile aynı; park kütlesi GTO yükünden türetilir.',
    stage: { name: 'Falcon ikinci kademe', dry: 4000, dryEst: true, tank: 107500, T: 981, isp: 348, engines: 1, prop: 'RP-1/LOX', engine: 'Merlin 1D Vakum',
      dims: { D: 3.66, L: 13.8, bell: { exitD: 3.3, len: 4.4 } } },
    ref: { kind: 'GTO', P: 8000, src: 'GTO ~8 t (yan iticiler kurtarılır; 26,7 t tümü harcanabilir)' },
    model: 'f9s2',
    // tipik Falcon Heavy zaman çizelgesi: yan iticiler ~T+2:33, merkez çekirdek ~T+3:07, kaporta ~T+3:35, SECO-1 ~T+8:30
    ascent: { tIns: 510, lv: 'fh', events: [{ t: 153, part: 'booster', name: 'Yan iticiler ayrıldı' }, { t: 187, cut: 47.9, name: 'Merkez çekirdek ayrıldı' }, { t: 215, part: 'fairing', name: 'Burun kaportası atıldı' }], approx: true,
      src: { t: 'SpaceX — Falcon Heavy', u: 'https://www.spacex.com/vehicles/falcon-heavy/' } },
    stageNote: 'Falcon Heavy ikinci kademesi (yan iticiler ve merkez çekirdek kalkışta ayrıldı)',
  },
  VULCAN: {
    name: 'Vulcan Centaur VC2S', short: 'Vulcan', year: '2024–', pad: 'CCSFS SLC-41', status: 'Etkin (Peregrine)',
    note: 'Centaur V: iki RL10C motoru, 5,4 m çaplı paslanmaz çelik balon tanklar. Kuru kütle ikincil kaynaktan.',
    stage: { name: 'Centaur V', dry: 7100, dryEst: true, tank: 53600 - 7100, T: 2 * 101.8, isp: 453.8, engines: 2, prop: 'LH2/LOX', engine: '2 × RL10C-1-1',
      dims: { D: 5.4, L: 11.7, bell: { exitD: 1.45, len: 2.2 } } },
    ref: { kind: 'TLI', P: 6200, src: 'VC2 TLI 6,2 t (ULA başarım tablosu, ikincil)' },
    model: 'centaur',
    // yaklaşık Vulcan VC2S zaman çizelgesi (Cert-1): katı iticiler ~T+1:41, kaporta ~T+3:45, 1. kademe ayrılması ~T+5:05
    ascent: { tIns: 690, lv: 'vulcan', events: [{ t: 101, part: 'booster', name: 'Katı yakıtlı iticiler ayrıldı' }, { t: 225, part: 'fairing', name: 'Burun kaportası atıldı' }, { t: 305, cut: 38.5, name: '1. kademe ayrıldı' }], approx: true,
      src: { t: 'ULA — Vulcan', u: 'https://www.ulalaunch.com/rockets/vulcan-centaur' } },
    stageNote: 'Centaur V — Vulcan\'ın üst kademesi (birinci kademe ve katı iticiler kalkışta ayrıldı)',
  },
};
export const ROCKET_IDS = Object.keys(ROCKETS);
export const DEFAULT_ROCKET = 'GENEL';
export const rocketOf = (id) => ROCKETS[id] || ROCKETS[DEFAULT_ROCKET];

// park yörüngesindeki toplam kütle (kademe + yakıt + yük), kg — yayımlanmış başarımdan
export function parkMass(id) {
  const r = rocketOf(id), s = r.stage;
  if (!r.ref) return null;
  return (s.dry + r.ref.P) * Math.exp(DV_REF[r.ref.kind] * 1000 / (s.isp * G0));
}
// türetilmiş TLI kapasitesi (kg): park kütlesiyle C3 = −2'ye çıkabilen en büyük yük (tank sınırıyla)
export function tliCapacity(id) {
  const r = rocketOf(id), s = r.stage, M = parkMass(id);
  if (M == null) return null;
  const k = Math.exp(DV_REF.TLI * 1000 / (s.isp * G0));
  // M sabit; yük P için yakıt = min(tank, M − kuru − P). TLI koşulu: (kuru + P + yakıt)/(kuru + P) ≥ k
  let P = M / k - s.dry;                                   // tank sınırı yoksa
  if (M - s.dry - P > s.tank) P = s.tank / (k - 1) - s.dry; // tank doluyken
  return P;
}
// yük (kg) için park yörüngesinde üst kademede kalan yakıt (kg); null: roketin yakıtı göreve göre boyutlanır (GENEL)
// yük (kg) için park yörüngesinde üst kademede kalan yakıt (kg); null: roketin yakıtı göreve göre boyutlanır (GENEL).
// dvPen (km/s): başvuru eğiminden farklı park eğiminin ek Δv'si (pads.js incPenalty); üst kademe karşılar → park kütlesi exp(−dvPen/c) ile azalır
export function parkPropellant(id, payload, dvPen = 0) {
  const r = rocketOf(id);
  if (r.sized || !r.ref) return null;
  const M = parkMass(id) * Math.exp(-dvPen * 1000 / (r.stage.isp * G0));
  return Math.max(0, Math.min(r.stage.tank, M - r.stage.dry - payload));
}
// görev tasarımının kademe kaydı (mission.js STAGES[0] biçimi); prop tasarımda belirlenir
export function stageRecord(id) {
  const r = rocketOf(id), s = r.stage;
  return { name: s.name, dry: s.dry, prop: 0, T: s.T, isp: s.isp, thr_min: 1.0, rocket: ROCKETS[id] ? id : DEFAULT_ROCKET };
}
