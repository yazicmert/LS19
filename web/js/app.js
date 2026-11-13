// LS19 (Look Star 19) — ana iş parçacığı: yükleme, fizik worker'ı, kamera/klavye, HUD
import * as E from './engine.js';
import { S } from './appstate.js';
import { World } from './scene.js';
import { UI } from './ui.js';
import { makeLive, makeLiveSource, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import * as EO from './earth.js';
import { designMissionAsync, PROFILES, normalizeConfig } from './design.js';
import { RocketSheet } from './rocketsheet.js';
import { LaunchUI } from './launchui.js';
import { WindowScanner } from './windowscan.js';
import { ProfileCompare } from './profilecompare.js';
import { attachCanvasInput } from './canvasinput.js';
import { AscentPlayer } from './ascentplay.js';
import { inclRange, minIncl, LEGACY_SITE } from './pads.js';
import { twoStageDesign } from './mission.js';
import { SatLayer } from './satlayer.js';
import { AsteroidLayer } from './asteroids.js';
import { AstUI } from './astui.js';
import { LabUI, EXPERIMENTS, LAB_HOME, engineFor, resolveView } from './labui.js';
import { AyUI } from './ayui.js';
import { DeflectUI } from './deflectui.js';
import { Updater } from './updater.js';
import { Tracker } from './tracker.js';
import { SkyUI, SkyClock } from './skyui.js';
import { applyIcons, setBtn } from './icons.js';
import { initTreeMenus, refreshTreeMenus } from './treemenu.js';
import * as PS from './passes.js';
import { MODELS } from './satmodels.js';
import { srcOf } from './satcatalog.js';
import { ImpactUI } from './impactui.js';
import { Cinema } from './cinema.js';
import { PixelGovernor, floorRatio } from './perfgov.js';
import { $ } from './uiutil.js';
import { LOC, workerOpts, isEn, setLang } from './i18n.js';
import { initG3dPanel } from './g3dpanel.js';
import { Launches } from './launches.js';
import { LaunchCal } from './launchcal.js';

const DEFAULT_DATE = '2026-10-13';
let deflect = null, updater = null, impactui = null;
// iki bağımsız MOTOR: "mission" (Ay görevi: fizik motoru, görev saati) ve "sky" (gerçek saat, uydular, asteroitler).
// İki GÖRÜNÜM (arayüz alanı): sky (Canlı Gökyüzü) ve lab (Laboratuvar). Laboratuvar'da motoru açık deney seçer (labui.js EXPERIMENTS:
// Ay görevi → mission, Asteroit saptırma → sky); deney ana sayfası motoru değiştirmez. Varsayılan açılış: Laboratuvar › Ay görevi.
let missionSrc = null, skySrc = null, skyT = 0, moonRange = null;
const clock = new SkyClock();
applyIcons();
initTreeMenus();

const canvas = $('#view'), chkNbody = $('#chkNbody');
const world = new World(canvas, $('#labels'));
// GPU bağlamı 30 sn içinde ikinci kez kaybolursa dokular geri yüklenemez (bellek için bırakılmıştı) ve sayfa yenileme döngüye girerdi: kullanıcıya bildirilir
world.onContextProblem = () => {
  $('#loading').style.display = 'grid'; $('#loadBar').style.width = '100%'; $('#loadMsg').textContent = 'Grafik bağlamı tekrar kayboldu; dokular geri yüklenemedi. Sayfayı yenileyin.';
  $('#loadBack').hidden = false; $('#loadBack').textContent = 'Sayfayı yenile'; $('#loadBack').onclick = () => location.reload();
};
let lastFrame = performance.now(), autoPilot = true;
const manual = { throttle: 0, mode: 'PRO' };

function resize() { world.resize(canvas.clientWidth, canvas.clientHeight); }
window.addEventListener('resize', resize);

const worker = new Worker(new URL('./worker.js', import.meta.url), workerOpts());
const send = (m) => worker.postMessage(m);
const ui = new UI(world, send);
// Laboratuvar › Ay görevi: dört adımın özetleri ve sonuç kartı (ayui.js). Yalnız durumu okur; "Baştan uçur" görev çubuğundaki Baştan başlat ile aynı komuttur
const ayui = new AyUI({ ui, restart: () => send({ cmd: 'restart' }) });
function ayState() {
  const key = S.DESIGN ? ui.profileKeyOf(S.DESIGN.cfg || ui.getConfig()) : ui.profileKeyOf(ui.getConfig());
  return { profileName: PROFILES[key] ? PROFILES[key].name : 'Özel', dateISO: S.DESIGN && !S.designing ? E.utcString(S.DESIGN.LAUNCH.t_launch).slice(0, 10) : pendingDate,
    designing: S.designing, ready: !!S.DESIGN && !S.designing && !!latestSentInit, running: S.running, done: !!(S.latest && S.latest.done), result: S.latest ? S.latest.result : null,
    met: S.latest && S.DESIGN ? S.latest.t - S.DESIGN.LAUNCH.t_launch : null, started: !!(S.latest && S.latest.t > ui.t0 + 1), vehicle: vehicleMode, landing: landingMode, optimalOk,
    rocket: S.DESIGN && S.DESIGN.STAGES && S.DESIGN.STAGES[0] ? S.DESIGN.STAGES[0].rocket : null };
}
let lastAy = 0;
const ayRefresh = () => { lastAy = performance.now(); ayui.update(ayState()); };
// sinematik "fragman" gösterimi (cinema.js): görevi baştan oynatır; kamera, zaman hızı ve bindirmeleri yönetir
const cinema = new Cinema({ world, send, ui, root: $('#app'), latest: () => S.latest, play: (on) => setPlay(on), running: () => S.running, landing: () => landingMode, ascent: () => ascent,
  onStart: () => { document.querySelectorAll('.tm-pop').forEach((p) => { p.hidden = true; }); ui.hidePick(); $('#hoverTip').hidden = true; },
  onStop: () => { resize(); } });

async function boot() {
  resize();
  // JPL çekirdekleri parçalı depodan (ephstore.js): yalnız gereken yılların kayıtları iner (~120 KB/yıl; eskiden 45,6 MB'lık iki dosyanın tamamı).
  // Açılışta: varsayılan/istenen görev tarihinin ve bugünün (Canlı Gökyüzü saati) yılı. Başka tarihler startDesign / ensureSky'da gerektikçe.
  const q0 = new URLSearchParams(location.search), d0 = Date.parse((q0.get('date') || DEFAULT_DATE) + 'T00:00:00Z');
  const kp = Promise.all([EphStore.open(new URL('data/eph/v1/', location.href).href), fetch('data/earth_orient.json').then((r) => r.json()),
    fetch('data/designs_default.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)])
    .then(async ([eph, eo, defs]) => {
      EO.loadEarthOrientation(eo);
      const now = etOf(tOfUtcMs(Date.now()));
      await Promise.all([eph.ensure(now - 2 * 86400, now + 2 * 86400), Number.isFinite(d0) ? eph.ensure(...missionEtWindow(tOfUtcMs(d0) - 86400)) : null]);
      S.K = { spk: eph.spk, pck: eph.pck, eph, eo, defs };
    });
  await world.load('./', (f, name) => { $('#loadBar').style.width = (100 * f).toFixed(0) + '%'; $('#loadMsg').textContent = 'Yükleniyor: ' + name; });
  $('#loadMsg').textContent = 'JPL efemeris çekirdekleri yükleniyor…';
  await kp;
  const q = new URLSearchParams(location.search);
  const pk = (q.get('profile') || '').toUpperCase(); if (PROFILES[pk]) ui.setConfig(PROFILES[pk].cfg);
  startDesign(q.get('date') || DEFAULT_DATE);
}
// Canlı Gökyüzü katmanları: uydular (SGP4 worker + 3B modeller), asteroitler (katalog, DAMIT, worker), takip/asteroit/çarpma arayüzleri ve veri güncelleyici (canlı veri
// indirmeleri). Açılışı geciktirmesin diye açılışta kurulmaz: görev hazır olup arayüz boşa çıkınca (ya da gökyüzü çalışma alanı daha önce açılırsa o an) tek seferlik kurulur.
let skyInit = false;
function initSky() {
  if (skyInit || !S.K) return; skyInit = true;
  const q = new URLSearchParams(location.search);
  // canlı uydular ve asteroitler (yerel sunucu ya da bulut vekili üzerinden); 10 dakikada bir sürüm denetimi
  S.sats = new SatLayer(world.scene, $('#labels'), S.K.eo); ui.bindSats(S.sats);
  S.asts = new AsteroidLayer(world.scene, $('#labels'));
  S.astui = new AstUI({ world, asts: S.asts, ui, getT: curT, focusOn, setCam: setSkyCam, openLab });
  deflect = new DeflectUI({ world, asts: S.asts, ui, getT: curT, setCam: setSkyCam }); S.astui.deflect = deflect; deflect.onCatalog();
  S.tracker = new Tracker(world.scene, $('#labels'), S.sats);
  S.skyui = new SkyUI({ clock, tracker: S.tracker, sats: S.sats, asts: S.asts, setSkyCam, lookAt: lookAtSat, follow: followSat });
  impactui = new ImpactUI({ sats: S.sats, asts: S.asts, astui: S.astui, follow: followSat }); ui.onCarpma = () => impactui.open();
  S.sats.models.onLoad = (e, st) => { if (st === 'start') S.skyui.toast(`${e.name}: gerçek 3B model yükleniyor (${srcOf(MODELS[e.key])})…`); else if (st === 'error') S.skyui.toast(`${e.name}: 3B model yüklenemedi, temsili model gösteriliyor.`); };
  S.sats.onData = () => { if (S.tracker) S.tracker.computePasses(true); if (ui.skyTab === 'carpma') impactui.refresh(); };            // Çarpma sekmesi açıkken katalog yenilenirse liste yeni veriyle yeniden hesaplanır
  // fırlatma takvimi (saatin altında) ve Fırlatmalar sekmesi: LL2 (yedek RocketLaunch.Live), son fırlatmalar uydu kataloğuna COSPAR ile bağlanır
  S.launches = new Launches();
  S.launchcal = new LaunchCal({ launches: S.launches, sats: S.sats, follow: followSat,
    openTab: () => { ui.setTab('firlatma'); if (narrowScreen()) $('#skyPanel').classList.add('open'); } });
  world.obsPose = obsPose;
  if (gov.r !== gov.max) { S.sats.setPixelScale(gov.r / world.prMax); S.asts.setPixelScale(gov.r / world.prMax); }          // oran önceden düşmüşse yeni katmanlar da aynı ölçekte
  const jobs = {};
  if (q.get('sats') !== '0') jobs.gp = (v) => S.sats.load(v);
  if (q.get('ast') !== '0') Object.assign(jobs, { neo: (v) => S.asts.load('neo', v), mb: (v) => S.asts.load('mb', v), sentry: (v) => S.asts.loadSentry(v) });
  if (q.get('launch') !== '0') jobs.launch = (v) => S.launches.load(v);
  updater = new Updater(jobs); updater.onChange = () => S.astui.renderUpdater(updater); updater.start();
}
// arayüz boşa çıkınca kur (rIC yoksa kısa gecikmeyle); ?prefetch=1 ile görev hazır olur olmaz
function idleInitSky() {
  if (skyInit) return;
  if (new URLSearchParams(location.search).get('prefetch') === '1') { initSky(); return; }
  if (window.requestIdleCallback) requestIdleCallback(initSky, { timeout: 8000 }); else setTimeout(initSky, 3000);
}
// ------------------------------------------------------------------ çalışma alanları
const curT = () => (S.MODE === 'sky' ? skyT : S.latest ? S.latest.t : 0);
// Canlı Gökyüzü'nün kendi efemerisi: gerçek saatten 1 gün önce DE440 durumundan (Ay görevininkinden bağımsız)
// Canlı Gökyüzü efemerisi: saat pencerenin dışına çıkınca yeniden kurulur. O yılın JPL kayıtları inmediyse indirilir ve kurulana dek
// gökyüzü karesi atlanır (false döner): yüklenmemiş kayıt sessizce yanlış durum vermez, ChebSegment hata atar.
let skyEphPending = null;
function ensureSky(t) {
  if (skySrc && t > skySrc.tStart - 30 * 86400 && t < skySrc.tStart + 400 * 86400) return true;
  const et = etOf(t - 86400);
  if (!S.K.eph.has(et)) {
    if (!skyEphPending) skyEphPending = S.K.eph.ensure(et - 86400, et + 2 * 86400).catch((err) => { if (S.skyui) S.skyui.toast('Efemeris parçası indirilemedi: ' + (err.message || err)); }).finally(() => { skyEphPending = null; });
    return false;
  }
  skySrc = makeLiveSource(S.K.spk, S.K.pck, S.K.eo, t - 86400);
  if (S.MODE === 'sky') { E.setProvider(skySrc.prov); world.live = skySrc; }
  world.resetDynamic && world.resetDynamic();
  return true;
}
// görev mesajları (iz, grafik) görev efemerisiyle işlenmeli
function withMission(fn) {
  if (S.MODE === 'sky' && missionSrc && skySrc) { E.setProvider(missionSrc.prov); try { fn(); } finally { E.setProvider(skySrc.prov); } } else fn();
}
const camStore = { mission: null, sky: { mode: 'EARTH', dist: 36000, el: 0.45, az: 0.6, auto: false, key: '' } };
function switchEngine(m) {                                       // mission ↔ sky motoru (lab görünümü sky motorunu kullanır)
  if (m === 'sky' && cinema.on) cinema.stop();
  if (m === 'sky') { compare.cancel(); }
  camStore[S.MODE] = world.cam; S.MODE = m;
  world.cam = camStore[m] || world.cam;
  ui.hidePick(); $('#hoverTip').hidden = true;
  if (m === 'sky') {
    initSky();
    skyT = tOfUtcMs(clock.nowMs());
    if (ensureSky(skyT)) { E.setProvider(skySrc.prov); world.live = skySrc; world.resetDynamic && world.resetDynamic(); loadMoonSats(skyT); }       // değilse: o yılın kayıtları iniyor, ensureSky kurunca sağlayıcıyı kendisi bağlar
    S.skyui.setCamButtons(world.cam.mode);
    if (S.tracker) S.tracker.computePasses();
  } else if (missionSrc) {
    E.setProvider(missionSrc.prov); world.live = missionSrc; world.resetDynamic && world.resetDynamic();
    world.setSkyMode(false);
  }
}
// Görünüm ve motoru eşler: body[data-mode] görünümü, body[data-engine] çalışan motoru, body[data-exp] açık deneyi taşır (CSS data-for kuralları bunlara bakar).
// Motor yalnız gerekince değişir (switchEngine): Laboratuvar ↔ Canlı Gökyüzü geçişi gökyüzü motorunu yeniden kurmaz.
function syncWorkspace(push = true) {
  const exp = S.VIEW === 'lab' ? labui.page : null, m = engineFor(S.VIEW, exp, S.MODE);
  if (m !== S.MODE || !camStore[m]) switchEngine(m);
  const b = document.body; b.dataset.mode = S.VIEW; b.dataset.engine = S.MODE; b.dataset.exp = exp || '';
  document.querySelectorAll('[data-workspace]').forEach((x) => { const on = x.dataset.workspace === S.VIEW; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
  if (S.VIEW === 'lab' && narrowScreen() && (exp === LAB_HOME || (EXPERIMENTS[exp] && EXPERIMENTS[exp].phoneOpen))) $('#labPanel').classList.add('open');     // telefonda deney paneli ana içerikse açılır
  try { localStorage.setItem('ls19.mode', S.VIEW); if (exp) localStorage.setItem('ls19.exp', exp); } catch (e) { /* özel pencere */ }
  if (push) { const u = new URL(location.href); u.searchParams.set('mode', S.VIEW); if (exp && exp !== LAB_HOME) u.searchParams.set('exp', exp); else u.searchParams.delete('exp'); history.replaceState(null, '', u); }
  resize();
}
// view: 'sky' | 'lab' (eski 'mission' → Laboratuvar › Ay görevi); exp: Laboratuvar'da açılacak deney (verilmezse açık olan kalır)
function setWorkspace(view, push = true, exp = null) {
  if (view === 'mission') { view = 'lab'; exp = 'ay'; }
  if (view !== 'sky' && view !== 'lab') return;
  S.VIEW = view;
  if (view === 'lab' && exp && exp !== labui.page) { quietShow = !push; labui.show(exp); quietShow = false; }          // labui.onShow → syncWorkspace
  else syncWorkspace(push);
}
const narrowScreen = () => window.matchMedia('(max-width: 760px)').matches;
// Laboratuvar: deney merkezi. Deney değişince motor ve adres eşlenir; "Çarpma riski" Canlı Gökyüzü'ne kısayoldur. openLab: saptırma deneyini bir asteroitle açar (pick kartı, Asteroitler/Çarpma sekmeleri)
let quietShow = false;
const labui = new LabUI({
  initial: 'ay',
  openImpact: () => { setWorkspace('sky'); ui.setTab('carpma'); if (narrowScreen()) $('#skyPanel').classList.add('open'); },
});
labui.onShow = () => { if (S.VIEW === 'lab') syncWorkspace(!quietShow); };
function openLab(i, opts) {
  setWorkspace('lab', true, 'saptirma');
  if (deflect) deflect.setTarget(i, opts);
}
document.querySelectorAll('[data-workspace]').forEach((b) => b.addEventListener('click', () => setWorkspace(b.dataset.workspace)));
// arayüz dili: düğme öteki dili gösterir; seçim hatırlanır ve sayfa yeniden yüklenir (js/i18n.js)
{
  const lb = $('#langBtn');
  if (lb) {
    lb.textContent = isEn ? 'TR' : 'EN'; lb.lang = isEn ? 'tr' : 'en';
    lb.title = isEn ? 'Türkçe arayüz' : 'English interface'; lb.setAttribute('aria-label', lb.title);
    lb.addEventListener('click', () => setLang(isEn ? 'tr' : 'en'));
  }
}
function loadMoonSats(t) {
  if (!S.sats) return;
  if (moonRange && t > moonRange[0] + 3600 && t < moonRange[1] - 3600) return;
  // aralık UTC gün başına yuvarlanır: aynı gün açılan her sayfa aynı Horizons sorgusunu sorar, bulut vekilinin CDN önbelleği paylaşılır
  // (dakika duyarlı aralıkta her ziyaretçi 6 ayrı Horizons isteği tetikliyordu)
  const day0 = t - ((E.utcMsFromT(t) / 1000) % 86400 + 86400) % 86400;
  moonRange = [day0 - 86400, day0 + 7 * 86400]; S.sats.loadMoon(moonRange[0], moonRange[1]);
}
// gözlemci kamerası: küresel Dünya yüzeyinde (çizimle uyumlu), yerel doğu/başucu yönleri
function obsPose(t) {
  // gerçek gözlemci: WGS-84 noktası ve jeodezik dikey (geçiş tablosunun az/el'iyle aynı geometri). Gözlemci kipinde Dünya küresi çizilmez.
  const { eye, up, east } = S.tracker.obsTrue(t);
  return { eye, up, east };
}
const SKY_CAM = { EARTH: { dist: 36000, el: 0.45, az: 0.6 }, MOON: { dist: 9000, el: 0.35, az: 0.6 }, SYSTEM: { dist: 900000, el: 1.05, az: -1.2 },
  SOLAR: { dist: 8.5e8, el: 1.05, az: -1.0 }, OBS: { el: 0.6, az: Math.PI } };
function setSkyCam(mode) {
  if (S.MODE !== 'sky') setWorkspace('sky');
  Object.assign(world.cam, { mode, focus: null, lookFn: null, auto: false, userFov: false }, SKY_CAM[mode] || {});
  if (mode === 'EARTH') {                                        // gözlemcinin üstünden başla (Dünya döndüğü için ICRF yönü)
    const d = E.unit(S.tracker.obsIcrf(curT() || tOfUtcMs(clock.nowMs())));
    Object.assign(world.cam, { az: Math.atan2(d[1], d[0]) + 0.35, el: Math.asin(d[2]) * 0.85 });
  }
  S.skyui.setCamButtons(mode);
}
function followSat(id, dist = 60) {
  if (S.MODE !== 'sky') setWorkspace('sky');
  const i = S.sats.indexOf(id); if (i >= 0) S.sats.select(i);
  const mdl = S.sats.modelOf(id);                                   // gerçek modeli olan uydunun içine girilmesin
  focusOn({ kind: 'sat', fn: (tt) => S.tracker.icrfOf(id, tt), R: (mdl ? mdl.size : S.sats.familySizeM(id)) / 2000 }, dist); S.skyui.setCamButtons('');
}
function lookAtSat(id) {
  setSkyCam('OBS');
  const s = S.tracker.state(id, clock.nowMs());
  world.cam.lookFn = (tt) => { const st = S.tracker.state(id, E.utcMsFromT(tt)); return st && st.el > 0 ? S.tracker.icrfOf(id, tt) : null; };
  if (s && s.el <= 0) {
    const np = S.tracker.passes.find((p) => p.id === +id && p.rise && p.rise.ms > Date.now());
    S.skyui.toast(`${S.tracker.name(id)} şu an ufkun altında.` + (np ? ` Sonraki geçiş ${new Date(np.rise.ms).toLocaleString(LOC, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}, ${PS.compass(np.rise.az)} yönünden.` : ''));
    if (s) Object.assign(world.cam, { az: s.az * Math.PI / 180, el: 0.15 });
  }
}
const sameCfg = (a, b) => JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
// hazır tasarımlar (varsayılan tarih için tüm profiller) ve bu oturumda hesaplananlar: anahtar tarih|yapılandırma
const designCache = new Map();
const cacheKey = (ms, cfg) => ms + '|' + JSON.stringify(normalizeConfig(cfg));
function cachedDesign(ms, cfg) {
  const c = designCache.get(cacheKey(ms, cfg)); if (c) return c;
  const d = S.K.defs; if (!d || Math.abs(d.startMs - ms) > 1000) return null;
  for (const v of Object.values(d.profiles)) if (sameCfg(v.design.cfg, cfg)) {
    // nominalBy: öteki güdüm/araç birleşimlerinin hazır Δv'si (test/make_designs.js); önbelleğe alınır ki sonradan hesaplananlar da saklansın
    const e = { tStart: d.tStart, design: v.design, nominal: v.nominal, nominalBy: { ...(v.nominalBy || {}) } }; designCache.set(cacheKey(ms, cfg), e); return e;
  }
  return null;
}
// görev için gereken çekirdek aralığı (ET): canlı efemeris başlangıcı (tStart) ve Efemeris sekmesinin görev boyunca karşılaştırması (en uzun profil < 60 gün)
const missionEtWindow = (tStart) => [etOf(tStart) - 86400, etOf(tStart) + 120 * 86400];
// UTC ms -> motor zamanı (TDB s); worker'daki ile aynı
function tOfUtcMs(ms) { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; }
// tarih seç -> görev o tarih için tasarlanır (ana iş parçacığında, adım adım: bazı tarayıcılarda worker'lar
// düşük öncelikte koşup birkaç kat yavaşlıyor), sonra tasarım fizik worker'ına gönderilir.
// Canlı efemeris seçilen günden 1 gün önce DE440 durumundan başlar.
let designSeq = 0;
async function startDesign(dateStr) {
  const ms = Date.parse(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return;
  const id = ++designSeq;
  S.START_MS = ms; pendingDate = dateStr; S.designing = true; S.latest = null;
  $('#dateInput').value = dateStr; ui.beginDesign(dateStr);
  if (nomWorker) { nomWorker.terminate(); nomWorker = null; }
  if (latestSentInit) send({ cmd: 'pause', on: true });
  S.running = false; setBtn($('#btnPlay'), 'play', 'Başlat');
  $('#loading').style.display = 'grid'; $('#loadBar').style.width = '0%'; $('#loadBack').hidden = true;
  $('#loadMsg').textContent = 'Görev tasarlanıyor: ' + dateStr;
  ayRefresh();
  const cfg = ui.getConfig(), pre = cachedDesign(ms, cfg);
  try { await S.K.eph.ensure(...missionEtWindow(pre ? pre.tStart : tOfUtcMs(ms) - 86400)); }           // o yılın JPL kayıtları (önbellekteyse hemen)
  catch (err) { if (id === designSeq) designFailed(String(err.message || err)); return; }
  if (id !== designSeq) return;
  let msg;
  if (pre) {
    ui.designLog('Hazır tasarım yüklendi (' + pre.design.label + ')');
    msg = { startMs: ms, tStart: pre.tStart, design: pre.design, nominal: pre.nominal || null };
  } else {
    const tStart = tOfUtcMs(ms) - 86400;
    try {
      await new Promise((r) => setTimeout(r, 30));                    // katman görünsün
      makeLive(S.K.spk, S.K.pck, S.K.eo, tStart);
      const design = await designMissionAsync(tOfUtcMs(ms), (m, f) => {
        if (id !== designSeq) return;
        $('#loadMsg').textContent = m; if (f != null) $('#loadBar').style.width = (100 * f).toFixed(0) + '%';
        ui.designLog(m);
      }, () => id !== designSeq, cfg);
      if (!design || id !== designSeq) return;
      designCache.set(cacheKey(ms, cfg), { tStart, design, nominal: null });
      msg = { startMs: ms, tStart, design, nominal: null };
    } catch (err) {
      if (id === designSeq) designFailed(String(err.message || err));
      return;
    }
  }
  $('#loadMsg').textContent = 'Görev kuruluyor…';
  if (vehicleMode === 'two') msg = { ...msg, design: twoStageDesign(msg.design) };
  send({ cmd: latestSentInit ? 'design' : 'init', ...msg, landing: landingMode }); latestSentInit = true;
}
function designFailed(m) {
  if (/gönderemez/.test(m) && ui.rocket !== rocketOk) {                     // roketin yakıtı yetmedi: önceki rokete dön (Geri dön düğmesi onunla tasarlar)
    ui.setRocket(rocketOk, m + '.');
    try { localStorage.setItem('ls19.rocket', ui.rocket); } catch (e) { /* özel pencere */ }
  }
  $('#loadMsg').textContent = 'Tasarım başarısız: ' + m; $('#loadBack').hidden = false;
  $('#loadBack').textContent = goodDate && goodDate !== pendingDate ? goodDate + ' tarihine dön' : 'Varsayılan tarihe dön';
  ui.designMsg('Bu tarih için tasarım başarısız: ' + m);
}
let latestSentInit = false, pendingDate = null, goodDate = null, urlApplied = false;
ui.onDesign = startDesign;
$('#loadBack').onclick = () => startDesign(goodDate && goodDate !== pendingDate ? goodDate : DEFAULT_DATE);
// Δv panelinin "Nominal" sütunu: aynı tarihin bozulmasız otopilot uçuşu, ayrı bir iş parçacığında (~5 s)
let nomWorker = null, nomId = 0;
function runNominal(tStart, design, landing, done) {
  if (nomWorker) nomWorker.terminate();
  const w = (nomWorker = new Worker(new URL('./nominal.js', import.meta.url), workerOpts())), id = ++nomId;
  w.onmessage = (e) => { if (e.data.id !== id) return; ui.setNominal(e.data.error ? {} : e.data.dv); if (!e.data.error && done) done(e.data.dv); w.terminate(); if (nomWorker === w) nomWorker = null; };
  w.onerror = () => { ui.setNominal({}); w.terminate(); if (nomWorker === w) nomWorker = null; };
  w.postMessage({ id, tStart, design, landing });
}

// iniş güdümü: ZEM/ZEV (eski) ya da optimal (SOCP; konik çözücü yüklenemezse ZEM'e düşer); araç: tek kademe iniş aracı ya da iki kademe (Ay yörünge kademesi + iniş kademesi).
// Δv panelinin Nominal sütunu seçilen güdüm ve araçla uçurulur (anahtar: güdüm + '+2' iki kademeliyse; hazır tasarımın nominali yalnız 'zem' + tek kademe için geçerlidir).
let landingMode = 'opt', vehicleMode = 'two', optimalOk = true, lastTStart = null;
try {
  const v = localStorage.getItem('ls19.landing'); if (v === 'zem' || v === 'opt' || v === 'free') landingMode = v;
  const w = localStorage.getItem('ls19.vehicle'); if (w === 'one' || w === 'two') vehicleMode = w;
} catch (e) { /* özel pencere */ }
const nominalKey = () => (optimalOk ? landingMode : 'zem') + (vehicleMode === 'two' ? '+2' : '');
function syncLanding() {
  document.querySelectorAll('[data-landing]').forEach((b) => {
    const needs = b.dataset.landing !== 'zem'; b.disabled = needs && !optimalOk; b.classList.toggle('on', b.dataset.landing === (optimalOk ? landingMode : 'zem'));
  });
  document.querySelectorAll('[data-vehicle]').forEach((b) => b.classList.toggle('on', b.dataset.vehicle === vehicleMode));
  refreshTreeMenus(); ayRefresh();
}
function refreshNominal(preNominal, ce) {
  const key = nominalKey(), cached = key === 'zem' ? (preNominal || (ce && ce.nominal)) : (ce && ce.nominalBy && ce.nominalBy[key]);
  if (cached) { ui.setNominal(cached); return; }
  runNominal(lastTStart, S.DESIGN, optimalOk ? landingMode : 'zem', (dv) => { if (!ce) return; if (key === 'zem') ce.nominal = dv; else (ce.nominalBy ||= {})[key] = dv; });
}
function setLanding(mode) {
  if (mode === landingMode) return; landingMode = mode;
  try { localStorage.setItem('ls19.landing', mode); } catch (e) { /* özel pencere */ }
  send({ cmd: 'landing', mode }); syncLanding();
  if (S.DESIGN && lastTStart != null) refreshNominal(null, designCache.get(cacheKey(S.START_MS, S.DESIGN.cfg || ui.getConfig())));
}
function setVehicle(mode) {
  if (mode === vehicleMode) return; vehicleMode = mode;
  try { localStorage.setItem('ls19.vehicle', mode); } catch (e) { /* özel pencere */ }
  syncLanding();
  if (latestSentInit && pendingDate) startDesign(pendingDate);               // araç değişince görev (önbellekteki tasarımla) yeniden kurulur
}
// roket: TLI kademesini (itki, Isp, park yörüngesindeki yakıt) değiştirir → görev yeniden tasarlanır. Roket bu aracı Ay'a gönderemezse (yakıt yetmez)
// tasarım hata verir: önceki rokete dönülür ve neden gösterilir
let rocketOk = 'GENEL';
try { const r = localStorage.getItem('ls19.rocket'); if (r) ui.setRocket(r); } catch (e) { /* özel pencere */ }
const rocketSheet = new RocketSheet(document.getElementById('rocketSheet'), { onFly: (id) => ui.onRocket(id) });
ui.onRocketInfo = (id) => rocketSheet.open(id);
// kalkış canlandırması (ascentplay.js): rampadan yörüngeye girişe; bitince görev girişten sürer
let insState = null;
const ascent = new AscentPlayer({ world, E, send, getDesign: () => S.DESIGN, getIns: () => insState, getState: () => S.latest,
  onEnd: () => { send({ cmd: 'seek', t: ui.t0 }); } });
initG3dPanel(world);                                                                // Google 3B karolar ayarları (kalkış çubuğu)
$('#btnAscent').addEventListener('click', async () => {
  const btn = $('#btnAscent');
  if (S.designing || ascent.active || btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');                      // model ve gökyüzü yüklenirken düğme kapalı: yeniden basılınca ikinci kez başlamaz
  try {
    if (!insState) { send({ cmd: 'seek', t: ui.t0 }); await new Promise((r) => setTimeout(r, 400)); }
    if (S.running) setPlay(false);
    if (!(await ascent.start())) ui.designMsg && ui.designMsg('Kalkış canlandırması başlatılamadı (görev henüz hazır değil).');
  } catch (e) { console.error(e); ui.designMsg && ui.designMsg('Kalkış canlandırması başlatılamadı (görev henüz hazır değil).'); }
  finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
});
// fırlatma rampası (dünyadaki yörüngesel rampalar) ve fırlatma pencereleri tarayıcısı (launchui.js)
const siteIncl = (st) => (st ? (st.az ? inclRange(st.lat, st.az) : [minIncl(st.lat), 90]) : inclRange(LEGACY_SITE.lat, LEGACY_SITE.az));
const launch = new LaunchUI({
  getRocket: () => ui.rocket,
  onSite: (st) => {
    if (S.designing) { launch.setSite(ui.site); return; }
    // park eğimi eski rampanın en küçüğündeyse yeni rampanın en küçüğüne taşınır (ör. Baykonur 46,0° → Kourou'da da 46° kalmasın)
    const c = ui.getConfig(), lo0 = (siteIncl(ui.site) || [28.7])[0], ir = siteIncl(st);
    ui.site = st;
    if (ir && Math.abs(c.earth.inc - lo0) < 0.05) c.earth.inc = ir[0];
    ui.setConfig({ ...c, site: st || null }); $('#cfgEi').min = String(ir ? ir[0] : 0);
    compare.cancel(); scanner.cancel();
    startDesign($('#dateInput').value || pendingDate || DEFAULT_DATE);
  },
  onScan: () => scanner.scan(),
  onDay: () => scanner.day(),
  onPickInc: (inc) => {                                                           // günlük penceredeki fırsat: aynı gün, o park eğimiyle
    if (S.designing) return; scanner.cancel();
    const c = ui.getConfig(); c.earth.inc = inc; ui.setConfig(c);
    startDesign($('#dateInput').value || pendingDate || DEFAULT_DATE);
  },
  onPick: (d) => { if (!S.designing) { scanner.cancel(); $('#dateInput').value = d; startDesign(d); } },
});
const scanner = new WindowScanner({ ui, launch, siteIncl, tOfUtcMs, missionEtWindow,
  dateStr: () => $('#dateInput').value || DEFAULT_DATE });
ui.onSiteSync = (st) => { launch.setSite(st); const ir = siteIncl(st); $('#cfgEi').min = String(ir ? ir[0] : 0); };
ui.onRocket = (id) => {
  if (S.designing || id === ui.rocket) return;
  ui.setRocket(id);
  try { localStorage.setItem('ls19.rocket', ui.rocket); } catch (e) { /* özel pencere */ }
  const p = launch.padFor(id);                                                  // gerçek roket yalnız kendi rampalarından: gerekirse ilkine geçilir (null = varsayılan LC-39B)
  if (p !== undefined) { const c = ui.getConfig(), lo0 = (siteIncl(ui.site) || [28.7])[0], ir = siteIncl(p); ui.site = p; if (ir && Math.abs(c.earth.inc - lo0) < 0.05) c.earth.inc = ir[0]; ui.setConfig({ ...c, site: p }); ui.setRocket(id, `Rampa ${p ? p.name : LEGACY_SITE.short} olarak değiştirildi (roketin gerçek rampası).`); }
  launch.syncRocket();
  compare.cancel(); scanner.cancel();
  startDesign($('#dateInput').value || pendingDate || DEFAULT_DATE);
};
document.querySelectorAll('[data-vehicle]').forEach((b) => b.addEventListener('click', () => setVehicle(b.dataset.vehicle)));
document.querySelectorAll('[data-landing]').forEach((b) => b.addEventListener('click', () => setLanding(b.dataset.landing)));

worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'designProgress') {
    $('#loadMsg').textContent = d.msg; if (d.frac != null) $('#loadBar').style.width = (100 * d.frac).toFixed(0) + '%';
    ui.designLog(d.msg);
    return;
  }
  if (d.type === 'error') { designFailed(d.msg); return; }
  if (S.designing && d.type === 'state') return;                  // yeni tasarım kurulurken eski görevin durumları
  if (d.type === 'ready') {
    insState = null;                                              // yeni görev: giriş durumu ilk durum iletisinden yeniden alınır
    S.designing = false;
    // ana iş parçacığı da aynı başlangıçtan aynı canlı efemerisi kurar (deterministik: worker ile birebir)
    const lv = makeLive(S.K.spk, S.K.pck, S.K.eo, d.tStart);
    missionSrc = lv; ui.live = lv;
    if (S.MODE === 'sky' && skySrc) { E.setProvider(skySrc.prov); world.live = skySrc; } else world.live = lv; S.DESIGN = d.design; ui.setDesign(d.design, d.startMs); goodDate = pendingDate; rocketOk = ui.rocket; launch.syncRocket(); launch.showDesign(S.DESIGN);
    E.setMoonZone(S.DESIGN.profile === 'HALO' ? 1.25 * S.DESIGN.HALO.stats.raKm : E.SOI_M);
    world.resetDynamic && world.resetDynamic(); world.setDesign(S.DESIGN);
    const ce = designCache.get(cacheKey(d.startMs, S.DESIGN.cfg || ui.getConfig()));
    lastTStart = d.tStart; if (d.type === 'ready') optimalOk = d.optimalOk !== false;
    syncLanding();
    refreshNominal(d.nominal, ce);
    refreshCompare();
  }
  if (d.type === 'ready' || d.type === 'restarted') {
    ui.reset(d.plan, d.t0, S.DESIGN.LAUNCH.t_launch);
    if (d.type === 'restarted') cinema.onRestarted();
    world.resetTrail(); world.resetDynamic && world.resetDynamic();
    $('#loading').style.display = 'none';
    if (d.seek) { if (!S.running) setPlay(true); }
    else { S.running = false; setBtn($('#btnPlay'), 'play', 'Başlat'); }
    if (d.type === 'ready' && !urlApplied) { urlApplied = true; applyUrlParams(); idleInitSky(); }
    ayRefresh();
  } else if (d.type === 'state') {
    S.latest = d;
    if (!insState && Math.abs(d.t - ui.t0) < 1) insState = { t: d.t, r: d.r.slice(), v: d.v.slice() };   // yörüngeye giriş durumu (kalkış canlandırmasının varış noktası)
    if (d.nbody !== undefined && chkNbody.checked !== d.nbody) chkNbody.checked = d.nbody;          // durum iletisi saniyede ~60: DOM sorgusu önbellekte
    if (d.trail && (d.trail.length || d.trailReset)) withMission(() => { world.addTrail(d.trail, d.trailReset); ui.addSamples(d.trail, d.trailReset); });
    if (d.events && d.events.length) ui.addEvents(d.events);
    ui.onState(d);
    if (cinema.on && ((d.events && d.events.length) || (d.disp && d.disp.length))) cinema.onEvents(d.events || [], d.disp || []);   // fragman alt yazıları
    if (d.auto !== autoPilot) { autoPilot = d.auto; syncAuto(); }
  }
};

let lastUpd = 0, lastSkyHud = 0, lastSatTab = 0;
// Uyarlanır çizim çözünürlüğü (perfgov.js): kare süresi sürekli yüksekse piksel oranı kademeli düşer. Kapalı: ?adapt=0, otomasyon (webdriver), sinematik kip (post hattı kendi kalitesini yönetir)
const gov = new PixelGovernor({ max: world.prMax, min: floorRatio(world.prMax) });          // taban: yüksek yoğunluklu ekranda en çok %25 düşüş (pikselleşme yok)
const govOn = !navigator.webdriver && new URLSearchParams(location.search).get('adapt') !== '0';
function applyPixelRatio(r) {
  world.setPixelRatio(r);
  const k = r / world.prMax; if (S.sats) S.sats.setPixelScale(k); if (S.asts) S.asts.setPixelScale(k);
}
function frame(now) {
  const dtMs = now - lastFrame, dt = Math.min(0.1, dtMs / 1000); lastFrame = now;
  if (govOn && !cinema.on && !S.designing && !document.hidden) { const r = gov.tick(dtMs, now, !!world.tilesBusy); if (r) applyPixelRatio(r); }
  if (S.MODE === 'sky' && S.K && S.skyui && !S.designing) {
    const ms = clock.nowMs(); skyT = tOfUtcMs(ms);
    if (ensureSky(skyT)) skyFrame(ms, now, dt);
  } else if (ascent.active && S.latest) {                          // kalkış canlandırması: worker duraklatılmış, ana iş parçacığı oynatır
    const x = ascent.tick(dt);
    if (x) { world.update(x, { dtReal: dt, stage: 0, debris: [], local: null, drAxis: null }); ui.hud(ascent.hud || x, now); }
  } else if (S.latest) {
    world.update(S.latest, { dtReal: dt, stage: S.latest.stage, debris: S.latest.debris, local: S.latest.local, drAxis: S.latest.drAxis });
    // uydular ve asteroitler Ay görevi alanında çizilmez (yalnız Canlı Gökyüzü'nde)
    if (S.sats && world.eye) { S.sats.obsView = false; S.sats.update(S.latest.t, world.eye, world.camera, canvas, false, false); }
    if (S.asts) { S.asts.hideAll(); S.astui.update(null); }
    if (S.tracker) S.tracker.hideAll();
    ui.hud(S.latest, now);
    if (now - lastAy > 500) ayRefresh();                          // Ay görevi adım özetleri: saniyede 2 kez yeter (değişmeyen metin yeniden yazılmaz)
  }
  if (!S.designing) world.render();                               // tasarım sırasında katman her şeyi örtüyor: işlemci tasarıma kalsın
  requestAnimationFrame(frame);
}
// Canlı Gökyüzü karesi (efemeris kurulu iken)
function skyFrame(ms, now, dt) {
    world.updateSky(skyT, { dtReal: dt });
    const t = skyT, full = !!world.full, eye = world.eye;
    if (eye) {
      S.sats.suppressLabel = (id) => S.tracker.has(id); S.sats.obsView = world.cam.mode === 'OBS';
      S.sats.update(t, eye, world.camera, canvas, !full, !full);
      S.asts.update(t, eye, world.camera, canvas, full); S.astui.update(eye);
      S.tracker.update(t, eye, world.camera, canvas, true, full);
    }
    loadMoonSats(t);
    if (now - lastSkyHud > 200) { lastSkyHud = now; S.skyui.hud(t, ms); S.launchcal.tick(); ui.pickTick(t, now); S.tracker.computePasses(); }
    if (ui.skyTab === 'uydular' && now - lastSatTab > 400) { lastSatTab = now; ui.satTab(t); }
    if (updater && now - lastUpd > 5000) { lastUpd = now; S.astui.renderUpdater(updater); }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ kontroller
function setPlay(on) {
  S.running = on; send({ cmd: 'pause', on: !on });
  setBtn($('#btnPlay'), on ? 'pause' : 'play', on ? 'Duraklat' : 'Devam');
}
$('#btnPlay').onclick = () => setPlay(!S.running);
// Sekme arka plandayken görev benzetimi duraklar: fizik worker'ı gizli sekmede de tam hızda koşar (CPU/pil), kimse izlemiyor. Sekmeye dönünce kaldığı yerden sürer
// (kullanıcı kendisi duraklattıysa dokunulmaz). ?bg=1: arka planda sürsün.
let bgPaused = false;
document.addEventListener('visibilitychange', () => {
  if (new URLSearchParams(location.search).get('bg') === '1') return;
  if (document.hidden) { if (S.running && !S.designing) { bgPaused = true; setPlay(false); } }
  else if (bgPaused) { bgPaused = false; setPlay(true); }
});
$('#btnCine').onclick = () => { if (cinema.on) cinema.stop(); else cinema.start(); };
let warp = 1;
const setWarp = (w) => { warp = Math.max(1, Math.min(100000, w)); send({ cmd: 'warp', value: warp }); $('#chkAutoWarp').checked = false; send({ cmd: 'autoWarp', on: false }); };
$('#btnFast').onclick = () => setWarp((S.latest ? S.latest.warp : warp) * 2);
$('#btnSlow').onclick = () => setWarp((S.latest ? S.latest.warp : warp) / 2);
$('#chkAutoWarp').onchange = (e) => send({ cmd: 'autoWarp', on: e.target.checked });
chkNbody.onchange = (e) => send({ cmd: 'solver', nbody: e.target.checked });
$('#chkAuto').onchange = (e) => { send({ cmd: 'auto', on: e.target.checked }); };
function syncAuto() {
  $('#chkAuto').checked = autoPilot; $('#manual').hidden = autoPilot; refreshTreeMenus();
  if (!autoPilot) { manual.throttle = 0; $('#thrSlider').value = 0; $('#thrSet').textContent = '%0'; }
}
$('#btnPerturb').onclick = () => send({ cmd: 'perturb', dv: 2.0 });
$('#btnRestart').onclick = () => { send({ cmd: 'restart' }); };
$('#thrSlider').oninput = (e) => { manual.throttle = e.target.value / 100; $('#thrSet').textContent = '%' + e.target.value; send({ cmd: 'manual', throttle: manual.throttle }); };
document.querySelectorAll('#manual [data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(m) {
  manual.mode = m; send({ cmd: 'manual', mode: m });
  document.querySelectorAll('#manual [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
}
function setThrottle(v) { manual.throttle = Math.max(0, Math.min(1, v)); $('#thrSlider').value = Math.round(manual.throttle * 100); $('#thrSet').textContent = '%' + Math.round(manual.throttle * 100); send({ cmd: 'manual', throttle: manual.throttle }); }
// kamera
const CAM_DEFAULT = { VEHICLE: { dist: 0.06, el: 0.2, az: -2.3 }, EARTH: { dist: 30000, el: 0.35, az: 0.4 }, MOON: { dist: 8000, el: 0.35, az: 0.6 },
  SYSTEM: { dist: 900000, el: 1.05, az: -1.2 }, EMB: { dist: 32000, el: 0.5, az: -0.6 }, SOLAR: { dist: 6.0e8, el: 1.2, az: -1.0 }, SITE: {} };
function setCam(mode) {
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  world.cam.focus = null;
  if (mode === 'AUTO') { world.cam.auto = true; world.cam.key = ''; return; }
  world.cam.auto = false; world.cam.userFov = false; Object.assign(world.cam, { mode }, CAM_DEFAULT[mode]);
}
// seçilen gezegen ya da uydu etrafında kamera
function focusOn(focus, dist) {
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.remove('on'));
  Object.assign(world.cam, { auto: false, userFov: false, mode: 'FOCUS', focus, dist, el: 0.25, az: world.cam.az || 0.5 });
}
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
// fare: sürükle döndür, tekerlek yakınlaştır
attachCanvasInput(canvas, { world, ui, curT, focusOn, followSat, lookAtSat, setCam, setSkyCam });
// klavye
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (e.defaultPrevented) return; if (!$('#pick').hidden) ui.hidePick(); else if (S.VIEW === 'lab' && labui.page !== LAB_HOME) labui.show(LAB_HOME); return; }       // Esc: önce bilgi kartı, sonra deneyden Laboratuvar ana sayfasına
  if (k === 'm') { setWorkspace(S.VIEW === 'sky' ? 'lab' : 'sky'); return; }                        // M: Canlı Gökyüzü ↔ Laboratuvar
  if (S.MODE === 'sky') {                                          // Canlı Gökyüzü: zaman ve kamera
    if (k === ' ') { e.preventDefault(); clock.pause(!clock.paused); S.skyui.syncClock(); }
    else if (k === 'n') { clock.live(); S.skyui.syncClock(); }
    else if (k === '.' || k === ',') { const R = [1, 10, 60, 600, 3600], i = R.indexOf(clock.rate); clock.setRate(R[Math.max(0, Math.min(R.length - 1, (i < 0 ? 0 : i) + (k === '.' ? 1 : -1)))]); S.skyui.syncClock(); }
    else if (/^[1-5]$/.test(k)) setSkyCam(['EARTH', 'OBS', 'SYSTEM', 'MOON', 'SOLAR'][+k - 1]);
    return;
  }
  if (k === ' ') { e.preventDefault(); setPlay(!S.running); }
  else if (k === '.') setWarp((S.latest ? S.latest.warp : warp) * 2);
  else if (k === ',') setWarp((S.latest ? S.latest.warp : warp) / 2);
  else if (k === 'g') { $('#chkAuto').checked = !$('#chkAuto').checked; send({ cmd: 'auto', on: $('#chkAuto').checked }); refreshTreeMenus(); }
  else if (k === 'p') send({ cmd: 'perturb', dv: 2.0 });
  else if (k === 'k') { setWorkspace('lab', true, 'ay'); ui.setTab('kontrol'); $('#labPanel').classList.add('open'); }
  else if (k === 'c') cinema.start();
  else if (/^[1-8]$/.test(k)) setCam(['AUTO', 'VEHICLE', 'EARTH', 'MOON', 'SYSTEM', 'SITE', 'EMB', 'SOLAR'][+k - 1]);
  else if (!autoPilot) {
    const modes = { w: 'PRO', s: 'RETRO', a: 'NML', d: 'ANML', q: 'RADOUT', e: 'RADIN', r: 'SRFRETRO', h: 'HOLD' };
    if (modes[k]) setMode(modes[k]);
    else if (k === 'shift') setThrottle(manual.throttle + 0.1);
    else if (k === 'control') setThrottle(manual.throttle - 0.1);
    else if (k === 'z') setThrottle(1); else if (k === 'x') setThrottle(0);
    else if (k === 'b') send({ cmd: 'separate' });
  }
});

// olaya atla: görev baştan, hedef ana kadar hızlı (ekransız) koşulur — fizik deterministik
ui.onSeek = (t) => send({ cmd: 'seek', t });
// ------------------------------------------------------------------ profil karşılaştırması (yörünge optimizasyonu görünümü)
const compare = new ProfileCompare({ ui, cachedDesign, designCache, cacheKey, tOfUtcMs });
const refreshCompare = (status) => compare.refresh(status);
ui.onCompare = () => compare.run();
ui.onProfile = (key) => {
  if (!PROFILES[key] || S.designing) return;
  compare.cancel();
  ui.setConfig(PROFILES[key].cfg);
  startDesign($('#dateInput').value || DEFAULT_DATE);
};
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (q.get('cam')) setCam(q.get('cam').toUpperCase());
  if (q.get('seek')) send({ cmd: 'seek', t: parseFloat(q.get('seek')) });
  if (q.get('warp')) setWarp(parseFloat(q.get('warp')));
  if (q.get('play') === '1' && !q.get('seek')) setPlay(true);
  // ?mode=sky | lab [&exp=ay|saptirma]; eski adresler: ?mode=mission → Laboratuvar › Ay görevi, ?tab=<görev sekmesi> → Ay görevi, ?tab=saptirma → saptırma
  let stored = null, storedExp = null; try { stored = localStorage.getItem('ls19.mode'); storedExp = localStorage.getItem('ls19.exp'); } catch (e) { /* özel pencere */ }
  const qm = q.get('mode'), tab = q.get('tab');
  const r = resolveView({ mode: qm || stored, exp: qm ? q.get('exp') : (q.get('exp') || storedExp), tab, tabOwner: (t) => (ui.isSkyTab(t) ? 'sky' : ui.isMissionTab(t) ? 'mission' : null) });
  if (r) setWorkspace(r.view, false, r.exp);
  if (tab) ui.setTab(tab);
  if (q.get('skycam')) setSkyCam(q.get('skycam').toUpperCase());
  if (q.get('cine') && !q.get('seek')) setTimeout(() => cinema.start({ scale: Math.max(0.2, parseFloat(q.get('cine')) || 1) }), 800);       // ?cine=1: açılışta sinematik gösterim (sayı: süre ölçeği)
}
$('#btnPanel').onclick = () => $('#labPanel').classList.toggle('open');
$('#btnSkyPanel').onclick = () => (S.VIEW === 'lab' ? $('#labPanel') : $('#skyPanel')).classList.toggle('open');
window.LS19 = { world, ui, send, ascent, setCam, setPlay, cinema, focusOn, setWorkspace, setSkyCam, clock, followSat, lookAtSat, labui, openLab, get mode() { return S.MODE; }, get view() { return S.VIEW; }, get skyT() { return skyT; }, get deflect() { return deflect; },
  get sats() { return S.sats; }, get asts() { return S.asts; }, get astui() { return S.astui; }, get updater() { return updater; }, get tracker() { return S.tracker; }, get skyui() { return S.skyui; }, get launches() { return S.launches; } };
window.ROCSIM = window.LS19;

boot().catch((err) => { $('#loadMsg').textContent = 'Hata: ' + err.message + ' — siteyi yerel sunucuyla (baslat.command) ya da bulutta açın.'; console.error(err); });
