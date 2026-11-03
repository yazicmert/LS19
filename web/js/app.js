// LS19 (Look Star 19) — ana iş parçacığı: yükleme, fizik worker'ı, kamera/klavye, HUD
import * as E from './engine.js';
import { World } from './scene.js';
import { UI } from './ui.js';
import { makeLive, makeLiveSource, etOf } from './live.js';
import { EphStore } from './ephstore.js';
import * as EO from './earth.js';
import { designMissionAsync, PROFILES, normalizeConfig } from './design.js';
import { RocketSheet } from './rocketsheet.js';
import { LaunchUI } from './launchui.js';
import { inclRange, minIncl } from './pads.js';
import { launchWeather } from './weather.js';
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
import { MODELS, MOON_MODELS } from './satmodels.js';
import { srcOf } from './satcatalog.js';
import { ImpactUI } from './impactui.js';
import { Cinema } from './cinema.js';
import { PixelGovernor } from './perfgov.js';

const DEFAULT_DATE = '2026-10-13';
let K = null, DESIGN = null, START_MS = 0, sats = null, asts = null, astui = null, deflect = null, updater = null, tracker = null, skyui = null, impactui = null;
// iki bağımsız MOTOR: "mission" (Ay görevi: fizik motoru, görev saati) ve "sky" (gerçek saat, uydular, asteroitler).
// İki GÖRÜNÜM (arayüz alanı): sky (Canlı Gökyüzü) ve lab (Laboratuvar). Laboratuvar'da motoru açık deney seçer (labui.js EXPERIMENTS:
// Ay görevi → mission, Asteroit saptırma → sky); deney ana sayfası motoru değiştirmez. Varsayılan açılış: Laboratuvar › Ay görevi.
let MODE = 'mission', VIEW = 'lab', missionSrc = null, skySrc = null, skyT = 0, moonRange = null;
const clock = new SkyClock();
applyIcons();
initTreeMenus();

const $ = (s) => document.querySelector(s);
const canvas = $('#view'), chkNbody = $('#chkNbody');
const world = new World(canvas, $('#labels'));
// GPU bağlamı 30 sn içinde ikinci kez kaybolursa dokular geri yüklenemez (bellek için bırakılmıştı) ve sayfa yenileme döngüye girerdi: kullanıcıya bildirilir
world.onContextProblem = () => {
  $('#loading').style.display = 'grid'; $('#loadBar').style.width = '100%'; $('#loadMsg').textContent = 'Grafik bağlamı tekrar kayboldu; dokular geri yüklenemedi. Sayfayı yenileyin.';
  $('#loadBack').hidden = false; $('#loadBack').textContent = 'Sayfayı yenile'; $('#loadBack').onclick = () => location.reload();
};
let latest = null, lastFrame = performance.now(), running = false, autoPilot = true;
const manual = { throttle: 0, mode: 'PRO' };

function resize() { world.resize(canvas.clientWidth, canvas.clientHeight); }
window.addEventListener('resize', resize);

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const send = (m) => worker.postMessage(m);
const ui = new UI(world, send);
// Laboratuvar › Ay görevi: dört adımın özetleri ve sonuç kartı (ayui.js). Yalnız durumu okur; "Baştan uçur" görev çubuğundaki Baştan başlat ile aynı komuttur
const ayui = new AyUI({ ui, restart: () => send({ cmd: 'restart' }) });
function ayState() {
  const key = DESIGN ? ui.profileKeyOf(DESIGN.cfg || ui.getConfig()) : ui.profileKeyOf(ui.getConfig());
  return { profileName: PROFILES[key] ? PROFILES[key].name : 'Özel', dateISO: DESIGN && !designing ? E.utcString(DESIGN.LAUNCH.t_launch).slice(0, 10) : pendingDate,
    designing, ready: !!DESIGN && !designing && !!latestSentInit, running, done: !!(latest && latest.done), result: latest ? latest.result : null,
    met: latest && DESIGN ? latest.t - DESIGN.LAUNCH.t_launch : null, started: !!(latest && latest.t > ui.t0 + 1), vehicle: vehicleMode, landing: landingMode, optimalOk,
    rocket: DESIGN && DESIGN.STAGES && DESIGN.STAGES[0] ? DESIGN.STAGES[0].rocket : null };
}
let lastAy = 0;
const ayRefresh = () => { lastAy = performance.now(); ayui.update(ayState()); };
// sinematik "fragman" gösterimi (cinema.js): görevi baştan oynatır; kamera, zaman hızı ve bindirmeleri yönetir
const cinema = new Cinema({ world, send, ui, root: $('#app'), latest: () => latest, play: (on) => setPlay(on), running: () => running, landing: () => landingMode,
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
      K = { spk: eph.spk, pck: eph.pck, eph, eo, defs };
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
  if (skyInit || !K) return; skyInit = true;
  const q = new URLSearchParams(location.search);
  // canlı uydular ve asteroitler (yerel sunucu ya da bulut vekili üzerinden); 10 dakikada bir sürüm denetimi
  sats = new SatLayer(world.scene, $('#labels'), K.eo); ui.bindSats(sats);
  asts = new AsteroidLayer(world.scene, $('#labels'));
  astui = new AstUI({ world, asts, ui, getT: curT, focusOn, setCam: setSkyCam, openLab });
  deflect = new DeflectUI({ world, asts, ui, getT: curT, setCam: setSkyCam }); astui.deflect = deflect; deflect.onCatalog();
  tracker = new Tracker(world.scene, $('#labels'), sats);
  skyui = new SkyUI({ clock, tracker, sats, asts, setSkyCam, lookAt: lookAtSat, follow: followSat });
  impactui = new ImpactUI({ sats, asts, astui, follow: followSat }); ui.onCarpma = () => impactui.open();
  sats.models.onLoad = (e, st) => { if (st === 'start') skyui.toast(`${e.name}: gerçek 3B model yükleniyor (${srcOf(MODELS[e.key])})…`); else if (st === 'error') skyui.toast(`${e.name}: 3B model yüklenemedi, temsili model gösteriliyor.`); };
  sats.onData = () => { if (tracker) tracker.computePasses(true); };
  world.obsPose = obsPose;
  if (gov.r !== gov.max) { sats.setPixelScale(gov.r / world.prMax); asts.setPixelScale(gov.r / world.prMax); }          // oran önceden düşmüşse yeni katmanlar da aynı ölçekte
  const jobs = {};
  if (q.get('sats') !== '0') jobs.gp = (v) => sats.load(v);
  if (q.get('ast') !== '0') Object.assign(jobs, { neo: (v) => asts.load('neo', v), mb: (v) => asts.load('mb', v), sentry: (v) => asts.loadSentry(v) });
  updater = new Updater(jobs); updater.onChange = () => astui.renderUpdater(updater); updater.start();
}
// arayüz boşa çıkınca kur (rIC yoksa kısa gecikmeyle); ?prefetch=1 ile görev hazır olur olmaz
function idleInitSky() {
  if (skyInit) return;
  if (new URLSearchParams(location.search).get('prefetch') === '1') { initSky(); return; }
  if (window.requestIdleCallback) requestIdleCallback(initSky, { timeout: 8000 }); else setTimeout(initSky, 3000);
}
// ------------------------------------------------------------------ çalışma alanları
const curT = () => (MODE === 'sky' ? skyT : latest ? latest.t : 0);
// Canlı Gökyüzü'nün kendi efemerisi: gerçek saatten 1 gün önce DE440 durumundan (Ay görevininkinden bağımsız)
// Canlı Gökyüzü efemerisi: saat pencerenin dışına çıkınca yeniden kurulur. O yılın JPL kayıtları inmediyse indirilir ve kurulana dek
// gökyüzü karesi atlanır (false döner): yüklenmemiş kayıt sessizce yanlış durum vermez, ChebSegment hata atar.
let skyEphPending = null;
function ensureSky(t) {
  if (skySrc && t > skySrc.tStart - 30 * 86400 && t < skySrc.tStart + 400 * 86400) return true;
  const et = etOf(t - 86400);
  if (!K.eph.has(et)) {
    if (!skyEphPending) skyEphPending = K.eph.ensure(et - 86400, et + 2 * 86400).catch((err) => { if (skyui) skyui.toast('Efemeris parçası indirilemedi: ' + (err.message || err)); }).finally(() => { skyEphPending = null; });
    return false;
  }
  skySrc = makeLiveSource(K.spk, K.pck, K.eo, t - 86400);
  if (MODE === 'sky') { E.setProvider(skySrc.prov); world.live = skySrc; }
  world.resetDynamic && world.resetDynamic();
  return true;
}
// görev mesajları (iz, grafik) görev efemerisiyle işlenmeli
function withMission(fn) {
  if (MODE === 'sky' && missionSrc && skySrc) { E.setProvider(missionSrc.prov); try { fn(); } finally { E.setProvider(skySrc.prov); } } else fn();
}
const camStore = { mission: null, sky: { mode: 'EARTH', dist: 36000, el: 0.45, az: 0.6, auto: false, key: '' } };
function switchEngine(m) {                                       // mission ↔ sky motoru (lab görünümü sky motorunu kullanır)
  if (m === 'sky' && cinema.on) cinema.stop();
  if (m === 'sky') { cmpCancel = true; }
  camStore[MODE] = world.cam; MODE = m;
  world.cam = camStore[m] || world.cam;
  ui.hidePick(); $('#hoverTip').hidden = true;
  if (m === 'sky') {
    initSky();
    skyT = tOfUtcMs(clock.nowMs());
    if (ensureSky(skyT)) { E.setProvider(skySrc.prov); world.live = skySrc; world.resetDynamic && world.resetDynamic(); loadMoonSats(skyT); }       // değilse: o yılın kayıtları iniyor, ensureSky kurunca sağlayıcıyı kendisi bağlar
    skyui.setCamButtons(world.cam.mode);
    if (tracker) tracker.computePasses();
  } else if (missionSrc) {
    E.setProvider(missionSrc.prov); world.live = missionSrc; world.resetDynamic && world.resetDynamic();
    world.setSkyMode(false);
  }
}
// Görünüm ve motoru eşler: body[data-mode] görünümü, body[data-engine] çalışan motoru, body[data-exp] açık deneyi taşır (CSS data-for kuralları bunlara bakar).
// Motor yalnız gerekince değişir (switchEngine): Laboratuvar ↔ Canlı Gökyüzü geçişi gökyüzü motorunu yeniden kurmaz.
function syncWorkspace(push = true) {
  const exp = VIEW === 'lab' ? labui.page : null, m = engineFor(VIEW, exp, MODE);
  if (m !== MODE || !camStore[m]) switchEngine(m);
  const b = document.body; b.dataset.mode = VIEW; b.dataset.engine = MODE; b.dataset.exp = exp || '';
  document.querySelectorAll('[data-workspace]').forEach((x) => { const on = x.dataset.workspace === VIEW; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
  if (VIEW === 'lab' && narrowScreen() && (exp === LAB_HOME || (EXPERIMENTS[exp] && EXPERIMENTS[exp].phoneOpen))) $('#labPanel').classList.add('open');     // telefonda deney paneli ana içerikse açılır
  try { localStorage.setItem('ls19.mode', VIEW); if (exp) localStorage.setItem('ls19.exp', exp); } catch (e) { /* özel pencere */ }
  if (push) { const u = new URL(location.href); u.searchParams.set('mode', VIEW); if (exp && exp !== LAB_HOME) u.searchParams.set('exp', exp); else u.searchParams.delete('exp'); history.replaceState(null, '', u); }
  resize();
}
// view: 'sky' | 'lab' (eski 'mission' → Laboratuvar › Ay görevi); exp: Laboratuvar'da açılacak deney (verilmezse açık olan kalır)
function setWorkspace(view, push = true, exp = null) {
  if (view === 'mission') { view = 'lab'; exp = 'ay'; }
  if (view !== 'sky' && view !== 'lab') return;
  VIEW = view;
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
labui.onShow = () => { if (VIEW === 'lab') syncWorkspace(!quietShow); };
function openLab(i, opts) {
  setWorkspace('lab', true, 'saptirma');
  if (deflect) deflect.setTarget(i, opts);
}
document.querySelectorAll('[data-workspace]').forEach((b) => b.addEventListener('click', () => setWorkspace(b.dataset.workspace)));
function loadMoonSats(t) {
  if (!sats) return;
  if (moonRange && t > moonRange[0] + 3600 && t < moonRange[1] - 3600) return;
  moonRange = [t - 86400, t + 6 * 86400]; sats.loadMoon(moonRange[0], moonRange[1]);
}
// gözlemci kamerası: küresel Dünya yüzeyinde (çizimle uyumlu), yerel doğu/başucu yönleri
function obsPose(t) {
  // gerçek gözlemci: WGS-84 noktası ve jeodezik dikey (geçiş tablosunun az/el'iyle aynı geometri). Gözlemci kipinde Dünya küresi çizilmez.
  const { eye, up, east } = tracker.obsTrue(t);
  return { eye, up, east };
}
const SKY_CAM = { EARTH: { dist: 36000, el: 0.45, az: 0.6 }, MOON: { dist: 9000, el: 0.35, az: 0.6 }, SYSTEM: { dist: 900000, el: 1.05, az: -1.2 },
  SOLAR: { dist: 8.5e8, el: 1.05, az: -1.0 }, OBS: { el: 0.6, az: Math.PI } };
function setSkyCam(mode) {
  if (MODE !== 'sky') setWorkspace('sky');
  Object.assign(world.cam, { mode, focus: null, lookFn: null, auto: false, userFov: false }, SKY_CAM[mode] || {});
  if (mode === 'EARTH') {                                        // gözlemcinin üstünden başla (Dünya döndüğü için ICRF yönü)
    const d = E.unit(tracker.obsIcrf(curT() || tOfUtcMs(clock.nowMs())));
    Object.assign(world.cam, { az: Math.atan2(d[1], d[0]) + 0.35, el: Math.asin(d[2]) * 0.85 });
  }
  skyui.setCamButtons(mode);
}
function followSat(id, dist = 60) {
  if (MODE !== 'sky') setWorkspace('sky');
  const i = sats.indexOf(id); if (i >= 0) sats.select(i);
  const mdl = sats.modelOf(id);                                   // gerçek modeli olan uydunun içine girilmesin
  focusOn({ kind: 'sat', fn: (tt) => tracker.icrfOf(id, tt), R: (mdl ? mdl.size : sats.familySizeM(id)) / 2000 }, dist); skyui.setCamButtons('');
}
function lookAtSat(id) {
  setSkyCam('OBS');
  const s = tracker.state(id, clock.nowMs());
  world.cam.lookFn = (tt) => { const st = tracker.state(id, E.utcMsFromT(tt)); return st && st.el > 0 ? tracker.icrfOf(id, tt) : null; };
  if (s && s.el <= 0) {
    const np = tracker.passes.find((p) => p.id === +id && p.rise && p.rise.ms > Date.now());
    skyui.toast(`${tracker.name(id)} şu an ufkun altında.` + (np ? ` Sonraki geçiş ${new Date(np.rise.ms).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}, ${PS.compass(np.rise.az)} yönünden.` : ''));
    if (s) Object.assign(world.cam, { az: s.az * Math.PI / 180, el: 0.15 });
  }
}
const sameCfg = (a, b) => JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
// hazır tasarımlar (varsayılan tarih için tüm profiller) ve bu oturumda hesaplananlar: anahtar tarih|yapılandırma
const designCache = new Map();
const cacheKey = (ms, cfg) => ms + '|' + JSON.stringify(normalizeConfig(cfg));
function cachedDesign(ms, cfg) {
  const c = designCache.get(cacheKey(ms, cfg)); if (c) return c;
  const d = K.defs; if (!d || Math.abs(d.startMs - ms) > 1000) return null;
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
let designSeq = 0, designing = false;
async function startDesign(dateStr) {
  const ms = Date.parse(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return;
  const id = ++designSeq;
  START_MS = ms; pendingDate = dateStr; designing = true; latest = null;
  $('#dateInput').value = dateStr; ui.beginDesign(dateStr);
  if (nomWorker) { nomWorker.terminate(); nomWorker = null; }
  if (latestSentInit) send({ cmd: 'pause', on: true });
  running = false; setBtn($('#btnPlay'), 'play', 'Başlat');
  $('#loading').style.display = 'grid'; $('#loadBar').style.width = '0%'; $('#loadBack').hidden = true;
  $('#loadMsg').textContent = 'Görev tasarlanıyor: ' + dateStr;
  ayRefresh();
  const cfg = ui.getConfig(), pre = cachedDesign(ms, cfg);
  try { await K.eph.ensure(...missionEtWindow(pre ? pre.tStart : tOfUtcMs(ms) - 86400)); }           // o yılın JPL kayıtları (önbellekteyse hemen)
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
      makeLive(K.spk, K.pck, K.eo, tStart);
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
  const w = (nomWorker = new Worker(new URL('./nominal.js', import.meta.url), { type: 'module' })), id = ++nomId;
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
  runNominal(lastTStart, DESIGN, optimalOk ? landingMode : 'zem', (dv) => { if (!ce) return; if (key === 'zem') ce.nominal = dv; else (ce.nominalBy ||= {})[key] = dv; });
}
function setLanding(mode) {
  if (mode === landingMode) return; landingMode = mode;
  try { localStorage.setItem('ls19.landing', mode); } catch (e) { /* özel pencere */ }
  send({ cmd: 'landing', mode }); syncLanding();
  if (DESIGN && lastTStart != null) refreshNominal(null, designCache.get(cacheKey(START_MS, DESIGN.cfg || ui.getConfig())));
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
// fırlatma rampası (dünyadaki yörüngesel rampalar) ve fırlatma pencereleri tarayıcısı (launchui.js)
const siteIncl = (st) => (st ? (st.az ? inclRange(st.lat, st.az) : [minIncl(st.lat), 90]) : [28.6, 90]);
const launch = new LaunchUI({
  getRocket: () => ui.rocket,
  onSite: (st) => {
    if (designing) { launch.setSite(ui.site); return; }
    // park eğimi eski rampanın en küçüğündeyse yeni rampanın en küçüğüne taşınır (ör. Baykonur 46,0° → Kourou'da da 46° kalmasın)
    const c = ui.getConfig(), lo0 = (siteIncl(ui.site) || [28.6])[0], ir = siteIncl(st);
    ui.site = st;
    if (ir && Math.abs(c.earth.inc - lo0) < 0.05) c.earth.inc = ir[0];
    ui.setConfig({ ...c, site: st || null }); $('#cfgEi').min = String(ir ? ir[0] : 0);
    cmpCancel = true; scanCancel = true;
    startDesign($('#dateInput').value || pendingDate || DEFAULT_DATE);
  },
  onScan: () => scanWindows(),
  onPick: (d) => { if (!designing) { scanCancel = true; $('#dateInput').value = d; startDesign(d); } },
});
ui.onSiteSync = (st) => { launch.setSite(st); const ir = siteIncl(st); $('#cfgEi').min = String(ir ? ir[0] : 0); };
// sonraki N pencere: her biri bir öncekinin fırlatmasından 1 gün sonrasından aranır; ana iş parçacığının efemeris kaynağı tarama sonunda geri yüklenir
let scanning = false, scanCancel = false;
async function scanWindows(N = 4) {
  if (scanning || designing || !K) return;
  scanning = true; scanCancel = false;
  const cfg = ui.getConfig(), prov0 = E.getProvider(), rows = [];
  let tFrom = tOfUtcMs(Date.parse(($('#dateInput').value || DEFAULT_DATE) + 'T00:00:00Z'));
  try {
    for (let k = 0; k < N && !scanCancel; k++) {
      const row = { from: E.utcString(tFrom).slice(0, 10), busy: true }; rows.push(row); launch.setScan(rows, `${k + 1}/${N} tasarlanıyor…`, true);
      try {
        const tStart = tFrom - 86400;
        await K.eph.ensure(...missionEtWindow(tStart));
        makeLive(K.spk, K.pck, K.eo, tStart);
        const D = await designMissionAsync(tFrom, (m) => launch.setScan(rows, `${k + 1}/${N}: ${m.slice(0, 50)}`, true), () => scanCancel || designing, cfg);
        if (!D) break;
        // yakıt: iniş aracının ve TLI'ın gerektirdiği (tasarım tabanları olmadan) — pencereler arasındaki gerçek fark
        const pay = D.LANDER_NEED ?? D.STAGES.slice(1).reduce((q, x) => q + x.prop, 0);
        row.D = D; row.busy = false;
        row.dvTot = Object.values(D.DV || {}).reduce((q, x) => q + x, 0);
        row.cost = pay + (D.TLI_NEED ?? D.STAGES[0].prop);
        row.margin = D.STAGES[0].rocket ? D.STAGES[0].prop - D.TLI_NEED : null;
        const L = D.LAUNCH;
        launchWeather(L.lat ?? 28.5729, L.lon ?? -80.649, E.utcMsFromT(L.t_launch)).then((w) => { row.wx = w; if (!scanning) launch.setScan(rows, ''); });
        tFrom = L.t_launch + 86400;
      } catch (err) { row.busy = false; row.err = String(err.message || err).slice(0, 90); break; }
    }
  } finally {
    E.setProvider(prov0); scanning = false;
    launch.setScan(rows, scanCancel ? 'Tarama durduruldu.' : '', false);
  }
}
ui.onRocket = (id) => {
  if (designing || id === ui.rocket) return;
  ui.setRocket(id);
  try { localStorage.setItem('ls19.rocket', ui.rocket); } catch (e) { /* özel pencere */ }
  const p = launch.padFor(id);                                                  // gerçek roket yalnız kendi rampalarından: gerekirse ilkine geçilir
  if (p) { const c = ui.getConfig(), lo0 = (siteIncl(ui.site) || [28.6])[0], ir = siteIncl(p); ui.site = p; if (ir && Math.abs(c.earth.inc - lo0) < 0.05) c.earth.inc = ir[0]; ui.setConfig({ ...c, site: p }); ui.setRocket(id, `Rampa ${p.name} olarak değiştirildi (roketin gerçek rampası).`); }
  launch.syncRocket();
  cmpCancel = true; scanCancel = true;
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
  if (designing && d.type === 'state') return;                  // yeni tasarım kurulurken eski görevin durumları
  if (d.type === 'ready') {
    designing = false;
    // ana iş parçacığı da aynı başlangıçtan aynı canlı efemerisi kurar (deterministik: worker ile birebir)
    const lv = makeLive(K.spk, K.pck, K.eo, d.tStart);
    missionSrc = lv; ui.live = lv;
    if (MODE === 'sky' && skySrc) { E.setProvider(skySrc.prov); world.live = skySrc; } else world.live = lv; DESIGN = d.design; ui.setDesign(d.design, d.startMs); goodDate = pendingDate; rocketOk = ui.rocket; launch.syncRocket(); launch.showDesign(DESIGN);
    E.setMoonZone(DESIGN.profile === 'HALO' ? 1.25 * DESIGN.HALO.stats.raKm : E.SOI_M);
    world.resetDynamic && world.resetDynamic(); world.setDesign(DESIGN);
    const ce = designCache.get(cacheKey(d.startMs, DESIGN.cfg || ui.getConfig()));
    lastTStart = d.tStart; if (d.type === 'ready') optimalOk = d.optimalOk !== false;
    syncLanding();
    refreshNominal(d.nominal, ce);
    refreshCompare();
  }
  if (d.type === 'ready' || d.type === 'restarted') {
    ui.reset(d.plan, d.t0, DESIGN.LAUNCH.t_launch);
    if (d.type === 'restarted') cinema.onRestarted();
    world.resetTrail(); world.resetDynamic && world.resetDynamic();
    $('#loading').style.display = 'none';
    if (d.seek) { if (!running) setPlay(true); }
    else { running = false; setBtn($('#btnPlay'), 'play', 'Başlat'); }
    if (d.type === 'ready' && !urlApplied) { urlApplied = true; applyUrlParams(); idleInitSky(); }
    ayRefresh();
  } else if (d.type === 'state') {
    latest = d;
    if (d.nbody !== undefined && chkNbody.checked !== d.nbody) chkNbody.checked = d.nbody;          // durum iletisi saniyede ~60: DOM sorgusu önbellekte
    if (d.trail && (d.trail.length || d.trailReset)) withMission(() => { world.addTrail(d.trail, d.trailReset); ui.addSamples(d.trail, d.trailReset); });
    if (d.events && d.events.length) ui.addEvents(d.events);
    ui.onState(d);
    if (d.auto !== autoPilot) { autoPilot = d.auto; syncAuto(); }
  }
};

let lastUpd = 0, lastSkyHud = 0, lastSatTab = 0;
// Uyarlanır çizim çözünürlüğü (perfgov.js): kare süresi sürekli yüksekse piksel oranı kademeli düşer. Kapalı: ?adapt=0, otomasyon (webdriver), sinematik kip (post hattı kendi kalitesini yönetir)
const gov = new PixelGovernor({ max: world.prMax, min: 1 });
const govOn = !navigator.webdriver && new URLSearchParams(location.search).get('adapt') !== '0';
function applyPixelRatio(r) {
  world.setPixelRatio(r);
  const k = r / world.prMax; if (sats) sats.setPixelScale(k); if (asts) asts.setPixelScale(k);
}
function frame(now) {
  const dtMs = now - lastFrame, dt = Math.min(0.1, dtMs / 1000); lastFrame = now;
  if (govOn && !cinema.on && !designing && !document.hidden) { const r = gov.tick(dtMs, now); if (r) applyPixelRatio(r); }
  if (MODE === 'sky' && K && skyui && !designing) {
    const ms = clock.nowMs(); skyT = tOfUtcMs(ms);
    if (ensureSky(skyT)) skyFrame(ms, now, dt);
  } else if (latest) {
    world.update(latest, { dtReal: dt, stage: latest.stage, debris: latest.debris, local: latest.local, drAxis: latest.drAxis });
    // uydular ve asteroitler Ay görevi alanında çizilmez (yalnız Canlı Gökyüzü'nde)
    if (sats && world.eye) { sats.obsView = false; sats.update(latest.t, world.eye, world.camera, canvas, false, false); }
    if (asts) { asts.hideAll(); astui.update(null); }
    if (tracker) tracker.hideAll();
    ui.hud(latest, now);
    if (now - lastAy > 500) ayRefresh();                          // Ay görevi adım özetleri: saniyede 2 kez yeter (değişmeyen metin yeniden yazılmaz)
  }
  if (!designing) world.render();                               // tasarım sırasında katman her şeyi örtüyor: işlemci tasarıma kalsın
  requestAnimationFrame(frame);
}
// Canlı Gökyüzü karesi (efemeris kurulu iken)
function skyFrame(ms, now, dt) {
    world.updateSky(skyT, { dtReal: dt });
    const t = skyT, full = !!world.full, eye = world.eye;
    if (eye) {
      sats.suppressLabel = (id) => tracker.has(id); sats.obsView = world.cam.mode === 'OBS';
      sats.update(t, eye, world.camera, canvas, !full, !full);
      asts.update(t, eye, world.camera, canvas, full); astui.update(eye);
      tracker.update(t, eye, world.camera, canvas, true, full);
    }
    loadMoonSats(t);
    if (now - lastSkyHud > 200) { lastSkyHud = now; skyui.hud(t, ms); ui.pickTick(t, now); tracker.computePasses(); }
    if (ui.skyTab === 'uydular' && now - lastSatTab > 400) { lastSatTab = now; ui.satTab(t); }
    if (updater && now - lastUpd > 5000) { lastUpd = now; astui.renderUpdater(updater); }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ kontroller
function setPlay(on) {
  running = on; send({ cmd: 'pause', on: !on });
  setBtn($('#btnPlay'), on ? 'pause' : 'play', on ? 'Duraklat' : 'Devam');
}
$('#btnPlay').onclick = () => setPlay(!running);
// Sekme arka plandayken görev benzetimi duraklar: fizik worker'ı gizli sekmede de tam hızda koşar (CPU/pil), kimse izlemiyor. Sekmeye dönünce kaldığı yerden sürer
// (kullanıcı kendisi duraklattıysa dokunulmaz). ?bg=1: arka planda sürsün.
let bgPaused = false;
document.addEventListener('visibilitychange', () => {
  if (new URLSearchParams(location.search).get('bg') === '1') return;
  if (document.hidden) { if (running && !designing) { bgPaused = true; setPlay(false); } }
  else if (bgPaused) { bgPaused = false; setPlay(true); }
});
$('#btnCine').onclick = () => { if (cinema.on) cinema.stop(); else cinema.start(); };
let warp = 1;
const setWarp = (w) => { warp = Math.max(1, Math.min(100000, w)); send({ cmd: 'warp', value: warp }); $('#chkAutoWarp').checked = false; send({ cmd: 'autoWarp', on: false }); };
$('#btnFast').onclick = () => setWarp((latest ? latest.warp : warp) * 2);
$('#btnSlow').onclick = () => setWarp((latest ? latest.warp : warp) / 2);
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
let drag = null, press = null;
canvas.addEventListener('pointerdown', (e) => { $('#hoverTip').hidden = true; drag = { x: e.clientX, y: e.clientY }; press = { x: e.clientX, y: e.clientY, t: performance.now() }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => {
  drag = null;
  // sürüklemeden kısa tıklama: gezegen / uydu seçimi
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5 && performance.now() - press.t < 450) handleClick(e);
  press = null;
});
function pickAt(e) {
  const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const cands = [];
  const pp = world.pickPlanet(mx, my); if (pp) cands.push({ ...pp, d2: pp.d * pp.d });
  if (MODE === 'sky') {
    if (sats && world.eye) { const sp = sats.pick(mx, my, world.camera, world.eye, canvas, curT()); if (sp) cands.push(sp); }
    if (asts && world.eye) { const ap = asts.pick(mx, my, world.camera, world.eye, canvas, curT()); if (ap) cands.push(ap); }
  }
  cands.sort((a, b) => a.d2 - b.d2);
  return cands[0] ? { ...cands[0], mx, my } : null;
}
// fareyle üzerine gelince: imleç ve ad ipucu
let hoverT = 0;
function hover(e) {
  const tip = $('#hoverTip');
  const c = (MODE === 'sky' || latest) && !designing ? pickAt(e) : null;
  canvas.style.cursor = c ? 'pointer' : '';
  if (!c) { tip.hidden = true; return; }
  tip.textContent = c.kind === 'sat' ? sats.names[c.i] : c.kind === 'msat' ? c.m.name : c.kind === 'ast' ? asts.label(c.i) : c.i === 3 ? 'Dünya–Ay' : world.planetName(c.i);
  tip.hidden = false; tip.style.transform = `translate(${c.mx + 12}px, ${c.my - 22}px)`;
}
function handleClick(e) {
  if (MODE !== 'sky' && !latest) return;
  const c = pickAt(e), t = curT();
  if (!c) { ui.hidePick(); return; }
  const mx = c.mx, my = c.my;
  if (c.kind === 'planet' && c.i === 3) { ui.hidePick(); if (MODE === 'sky') setSkyCam('SYSTEM'); else setCam('SYSTEM'); return; }
  if (c.kind === 'planet') {
    const R = world.planetInfo(c.i, t).R;
    ui.showPick({ kind: 'planet', refresh: (tt) => world.planetInfo(c.i, tt),
      actions: [{ label: 'Yakınlaş', fn: () => focusOn({ kind: 'planet', i: c.i }, 6 * R) }] }, mx, my, t);
  } else if (c.kind === 'sat') {
    const id = +sats.ids[c.i];
    const watchAct = () => (tracker.has(id) ? { label: 'Takipten çıkar', fn: () => { tracker.remove(id); ui.hidePick(); } } : { label: 'Takibe al', fn: () => { tracker.add(id); tracker.computePasses(true); ui.hidePick(); skyui.toast(`${sats.names[c.i]} takip listesine eklendi (Takip sekmesi).`); } });
    const mdl = sats.modelOf(id);
    ui.showPick({ kind: 'sat', refresh: (tt) => {
      const d = sats.satDetails(c.i, tt); if (!d) return d;
      const s = tracker.state(id, E.utcMsFromT(tt)); if (s) { d.obsName = tracker.observer.name; d.obsEl = s.el; d.obsAz = s.az; d.obsRange = s.range; }
      const np = tracker.passes.find((p) => p.id === id && p.rise && p.set.ms > Date.now()); if (np) d.nextPass = np;
      return d; },
    actions: [watchAct(), { label: 'Yörüngesini göster', fn: () => sats.select(c.i) }, { label: 'Kamerayla izle', fn: () => followSat(id) },
      { label: '3B modeli yakından gör', fn: () => followSat(id, (mdl ? mdl.size : sats.familySizeM(id) || 10) * 2.4 / 1000) },
      { label: 'Gökte izle', fn: () => lookAtSat(id) }] }, mx, my, t);
  } else if (c.kind === 'ast') {
    const i = c.i; asts.fetchDetail(i);
    ui.showPick({ kind: 'ast', refresh: (tt) => asts.details(i, tt), card: (d) => astui.card(d),
      actions: [{ label: 'Yörüngesini göster', fn: () => asts.select(i) }, { label: 'Kamerayla izle', fn: () => astui.follow(i) },
        { label: 'Laboratuvarda dene', fn: () => { ui.hidePick(); astui.openLab(i); } }] }, mx, my, t);
  } else if (c.kind === 'msat') {
    const m = c.m;
    ui.showPick({ kind: 'msat', refresh: (tt) => sats.moonSatDetails(m, tt),
      actions: [{ label: 'Kamerayla izle', fn: () => focusOn({ kind: 'msat', fn: (tt) => { const r = sats.moonState(m, tt); return r ? E.add(E.moonPos(tt), r) : null; } }, 300) },
        ...(MOON_MODELS[m.name] ? [{ label: '3B modeli yakından gör', fn: () => focusOn({ kind: 'msat', fn: (tt) => { const r = sats.moonState(m, tt); return r ? E.add(E.moonPos(tt), r) : null; } }, MODELS[MOON_MODELS[m.name]].size * 2.4 / 1000) }] : [])] }, mx, my, t);
  }
}
canvas.addEventListener('pointermove', (e) => {
  if (!drag) { const now = performance.now(); if (now - hoverT > 120) { hoverT = now; hover(e); } return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
  if (world.cam.mode === 'SITE') return;
  if (world.cam.mode === 'OBS') {                               // gözlemci: bakış yönü (sürükleyince hedef izleme bırakılır)
    world.cam.lookFn = null; world.cam.az -= dx * 0.004 * (world.camera.fov / 70); world.cam.el = Math.max(-0.25, Math.min(1.56, world.cam.el + dy * 0.004 * (world.camera.fov / 70))); return;
  }
  if (world.cam.auto) { world.cam.auto = false; document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === world.cam.mode)); }
  world.cam.az -= dx * 0.005; world.cam.el = Math.max(-1.5, Math.min(1.5, world.cam.el + dy * 0.005));
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (world.cam.mode === 'SITE' || world.cam.mode === 'OBS') { world.cam.userFov = true; world.camera.fov = Math.max(2, Math.min(world.cam.mode === 'OBS' ? 100 : 70, world.camera.fov * Math.exp(e.deltaY * 0.001))); world.camera.updateProjectionMatrix(); return; }
  const f = world.cam.focus;
  const minD = world.cam.mode === 'FOCUS' ? (f && f.kind === 'planet' ? world.planetInfo(f.i, curT()).R * 1.15 : f && (f.kind === 'ast' || f.R) ? Math.max(0.004, f.R * 1.3) : 0.004)
    : { VEHICLE: 0.012, EARTH: E.R_E * 1.05, MOON: E.R_M * 1.03, SYSTEM: 50000, EMB: 9000, SOLAR: 2e6 }[world.cam.mode] || 0.01;
  const maxD = world.cam.mode === 'SOLAR' || world.cam.mode === 'FOCUS' ? 1e10 : 3e6;
  world.cam.dist = Math.max(minD, Math.min(maxD, world.cam.dist * Math.exp(e.deltaY * 0.0012)));
}, { passive: false });
// klavye
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (e.defaultPrevented) return; if (!$('#pick').hidden) ui.hidePick(); else if (VIEW === 'lab' && labui.page !== LAB_HOME) labui.show(LAB_HOME); return; }       // Esc: önce bilgi kartı, sonra deneyden Laboratuvar ana sayfasına
  if (k === 'm') { setWorkspace(VIEW === 'sky' ? 'lab' : 'sky'); return; }                        // M: Canlı Gökyüzü ↔ Laboratuvar
  if (MODE === 'sky') {                                          // Canlı Gökyüzü: zaman ve kamera
    if (k === ' ') { e.preventDefault(); clock.pause(!clock.paused); skyui.syncClock(); }
    else if (k === 'n') { clock.live(); skyui.syncClock(); }
    else if (k === '.' || k === ',') { const R = [1, 10, 60, 600, 3600], i = R.indexOf(clock.rate); clock.setRate(R[Math.max(0, Math.min(R.length - 1, (i < 0 ? 0 : i) + (k === '.' ? 1 : -1)))]); skyui.syncClock(); }
    else if (/^[1-5]$/.test(k)) setSkyCam(['EARTH', 'OBS', 'SYSTEM', 'MOON', 'SOLAR'][+k - 1]);
    return;
  }
  if (k === ' ') { e.preventDefault(); setPlay(!running); }
  else if (k === '.') setWarp((latest ? latest.warp : warp) * 2);
  else if (k === ',') setWarp((latest ? latest.warp : warp) / 2);
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
let comparing = false, cmpCancel = false;
const pcfg = (key) => ({ ...PROFILES[key].cfg, rocket: ui.rocket });          // profil + seçili roket
function compareRows() {
  return Object.entries(PROFILES).map(([key, p]) => { const c = cachedDesign(START_MS, pcfg(key)); return { key, name: p.name, D: c ? c.design : null }; });
}
function refreshCompare(status) { if (!comparing) ui.setCompare(compareRows(), status ?? ''); }
ui.onCompare = async () => {
  if (comparing || designing) return;
  comparing = true; cmpCancel = false;
  const rows = compareRows(), tFrom = tOfUtcMs(START_MS), tStart = tOfUtcMs(START_MS) - 86400;
  for (const r of rows) {
    if (r.D) continue;
    r.busy = true; ui.setCompare(rows, `${r.name} hesaplanıyor…`);
    try {
      const D = await designMissionAsync(tFrom, (m) => ui.setCompare(rows, `${r.name}: ${m.slice(0, 60)}`), () => cmpCancel || designing, pcfg(r.key));
      if (!D) break;
      r.D = D; designCache.set(cacheKey(START_MS, pcfg(r.key)), { tStart, design: D, nominal: null });
    } catch (err) { r.err = 'tasarım başarısız: ' + String(err.message || err).slice(0, 60); }
    r.busy = false; ui.setCompare(rows, '');
  }
  comparing = false; refreshCompare('');
};
ui.onProfile = (key) => {
  if (!PROFILES[key] || designing) return;
  cmpCancel = true;
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
$('#btnSkyPanel').onclick = () => (VIEW === 'lab' ? $('#labPanel') : $('#skyPanel')).classList.toggle('open');
window.LS19 = { world, ui, send, setCam, setPlay, cinema, focusOn, setWorkspace, setSkyCam, clock, followSat, lookAtSat, labui, openLab, get mode() { return MODE; }, get view() { return VIEW; }, get skyT() { return skyT; }, get deflect() { return deflect; },
  get sats() { return sats; }, get asts() { return asts; }, get astui() { return astui; }, get updater() { return updater; }, get tracker() { return tracker; }, get skyui() { return skyui; } };
window.ROCSIM = window.LS19;

boot().catch((err) => { $('#loadMsg').textContent = 'Hata: ' + err.message + ' — siteyi yerel sunucuyla (baslat.command) ya da bulutta açın.'; console.error(err); });
