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
import { Briefing } from './brifing.js';
import { DesignJob } from './designjob.js';
import { briefKind } from './brifingtext.js';
import { inclRange, minIncl, LEGACY_SITE, padAllowed, siteOf as padSite, padShort } from './pads.js';
import { rocketOf } from './rockets.js';
import { twoStageDesign, STAGES as MISSION_STAGES } from './mission.js';
import { SatLayer } from './satlayer.js';
import { AsteroidLayer } from './asteroids.js';
import { AstUI } from './astui.js';
import { LabUI, EXPERIMENTS, LAB_HOME, engineFor, resolveView } from './labui.js';
import { LINK_KEYS } from './labtext.js';
import { AyUI } from './ayui.js';
import { AyMC } from './aymc.js';
import { AyAbort } from './ayabort.js';
import { setViewSite, ephSpanDays, validSite, DEFAULT_SITE, siteOf } from './moonsite.js';
import { AY_LINK_KEYS, ayLinkFromState, ayStateFromLink } from './aytext.js';
import { DeflectUI } from './deflectui.js';
import { LagrangeUI } from './lagrangeui.js';
import { LG_LINK_KEYS } from './lagrange.js';
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
import { ProducerDesk } from './producerui.js';
import { loadCut, decodeCut } from './producer.js';
import { paylasimCoz, uydumPaylasilanAyarla } from './usersat.js';
import { MainLink } from './producersync.js';
import { PixelGovernor, floorRatio } from './perfgov.js';
import { $ } from './uiutil.js';
import { LOC, workerOpts, isEn, setLang } from './i18n.js';
import { installGlossary } from './glossary.js';
import { initG3dPanel } from './g3dpanel.js';
import { Launches } from './launches.js';
import { LaunchCal } from './launchcal.js';

const DEFAULT_DATE = '2026-10-13';
let brief = null;                                                                       // Ay görevi brifingi (brifing.js; aşağıda kurulur)
// Laboratuvar brifingleri: deney → brifing (ortak kabuk: brifkabuk.js). Merkezden bir deney seçilince o deneyin brifingi açılır (sayfa başına bir kez)
const briefs = {}, briefEntered = new Set();
const briefOn = () => Object.values(briefs).find((b) => b.active) || null;                                                                     // görev brifingi (brifing.js; aşağıda kurulur)
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
const ayui = new AyUI({ ui, restart: () => send({ cmd: 'restart' }),
  link: () => { const o = ayLinkNow(); return o ? { qs: String(new URLSearchParams(o)), url: ayLinkUrl(o) } : null; },
  open: (qs) => openAyLink(qs), site: () => (S.DESIGN ? siteOf(S.DESIGN).name : ''), urlOf: (qs) => ayLinkUrl(Object.fromEntries(new URLSearchParams(qs))) });
// Laboratuvar › Ay görevi › Uçuş: görev iptali okuması (ayrı iş parçacığı; canlı uçuşa dokunmaz)
const ayabort = new AyAbort({ get: () => (S.latest && S.DESIGN && !S.designing ? { tStart: lastTStart, state: S.latest, stages: S.DESIGN.STAGES || MISSION_STAGES, halo: S.DESIGN.profile === 'HALO', utc: (t) => E.utcString(t).slice(0, 16) + ' UTC' } : null) });
// Laboratuvar › Ay görevi › Sonuç: dağılım denemesi (Monte Carlo; ayrı iş parçacıkları, canlı uçuşa dokunmaz)
const aymc = new AyMC({ get: () => (S.DESIGN && !S.designing ? { tStart: lastTStart, design: S.DESIGN, landing: optimalOk ? landingMode : 'zem', optimalOk, vehicle: vehicleMode,
  profileName: (PROFILES[ui.profileKeyOf(S.DESIGN.cfg || ui.getConfig())] || {}).name } : null) });
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
  onStop: () => { resize(); dropLayer('cine'); if (desk.docked) desk.setDock(false); }, openDesk: (o) => openDesk(o),
  onShot: (st) => { link.setState(st); desk.setNowPlaying(st.grp, st.on); } });
// Yapımcı masası (producerui.js): izleyici fragmanın kurgusunu kurar (bölümler, kamera, metinler, görünüm, ses); paylaşılan bağlantıdaki kurgu (#kurgu=…) bu oturumda önceliklidir
let sharedCut = null;
// yanaşık masa için geniş masaüstü ekranı (dar ekranda ve dokunmatikte masa fragmanı durdurup ortada açılır)
const dockable = () => matchMedia('(min-width: 1100px) and (hover: hover)').matches;
const playCut = (cut) => { sharedCut = null; if (cinema.on) cinema.stop(); pushLayer('cine'); cinema.start({ cut }); };
const desk = new ProducerDesk({ cinema, onPlay: (cut) => { if (desk.docked) { desk.setDock(false); desk.hide(); } playCut(cut); },
  onChange: (cut) => { sharedCut = null; link.sendCut(cut); if (cinema.on) cinema.liveCut(cut); },              // yerel düzenleme: oynayan fragmana canlı, ayrı pencereye eşit
  onDock: () => requestAnimationFrame(() => { resize(); if (cinema.on && cinema.shots) cinema.ui.ticks(cinema.tickMarks()); }),     // sahne daralır; çizelge etiketleri yeni genişliğe göre
  onPopOut: () => openPopOut(),
  onExport: (cut) => openExport(cut),
  onPreview: (cut, k) => { pushLayer('cine'); cinema.preview(null, 0.45, null, { cut, fromDesk: true, grp: k }).then((ok) => { if (!ok && cinema.on) cinema.stop(); else if (!ok) desk.reopen(); }); } });
// o.back: bölüm önizlemesinden dönüş (masa olduğu gibi); yoksa masa kayıtlı (ya da paylaşılan) kurguyla açılır.
// Fragman oynarken geniş ekranda masa sağa yanaşır, fragman sürer ve değişiklikler canlı yansır; dar ekranda fragman durur.
function openDesk(o = {}) {
  if (o.back) { desk.reopen(); return; }
  if (desk.isOpen && desk.docked) { desk.close(); return; }                       // Y: yanaşık masayı kapat/aç
  const live = cinema.on && cinema.state !== 'preview' && dockable();
  if (cinema.on && !live) cinema.stop();
  desk.open(sharedCut || loadCut(), { shared: !!sharedCut, dock: live, instant: !!o.key });
}
// Ayrı pencerede editör (yapimci.html): bu sekmeyle BroadcastChannel üzerinden konuşur (producersync.js)
const link = new MainLink({ chapters: () => cinema.chapterInfo(), cut: () => sharedCut || loadCut(), estimate: (cut) => cinema.estimate(cut, true),
  onCut: (cut) => { sharedCut = null; desk.load(cut); if (cinema.on) cinema.liveCut(cut); },
  onPlay: (cut) => { if (desk.isOpen) desk.close(); playCut(cut); },
  onPreview: (cut, k) => { if (desk.isOpen) desk.hide(); if (cinema.on) cinema.stop(); pushLayer('cine'); cinema.preview(null, 0.45, null, { cut, fromDesk: 'pop', grp: k }).then((ok) => { if (!ok && cinema.on) cinema.stop(); }); },
  onStop: () => { if (cinema.on) cinema.stop(); },
  onExport: (cut) => { openExport(cut); try { window.focus(); } catch (e) { /* yok */ } } });
// Video dışa aktarımı (4K): kare kare, sanal saatle (exporter.js; ilk kullanımda yüklenir). Panel exportui.js; masa ve ayrı pencere açar.
let stepWaiter = null, exporter = null, exportPanel = null;
const exportHost = { world, cinema, appEl: $('#app'), resize: () => resize(), send: (m) => send(m), step: (dt, n) => new Promise((resolve) => { stepWaiter = { n, resolve }; send({ cmd: 'step', dt, n }); }) };
async function openExport(cut) {
  if (desk.isOpen) { if (desk.docked) desk.setDock(false); desk.close(); }
  if (cinema.on) cinema.stop();
  const [EX, UI] = await Promise.all([import('./exporter.js'), import('./exportui.js')]);
  exporter = exporter || new EX.Exporter(exportHost);
  exportPanel = exportPanel || new UI.ExportPanel({ exporter, EX, planned: () => (ui.plan || []).length > 0, estimate: (c) => cinema.estimate(c), onClose: () => {} });
  exportPanel.open(cut || sharedCut || loadCut());
}
function openPopOut() {
  const u = new URL('yapimci.html', location.href); u.searchParams.set('ana', link.id);
  const w = window.open(u.href, 'ls19-yapimci', 'popup,width=1040,height=920');
  if (!w) { desk.say('Tarayıcı açılır pencereyi engelledi: bu site için açılır pencerelere izin ver.'); return; }
  if (desk.docked) desk.setDock(false);
  desk.close(); try { w.focus(); } catch (e) { /* yok */ }
}
const playCine = (opts = {}) => cinema.start({ ...opts, cut: sharedCut || undefined });

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
  const q = new URLSearchParams(location.search), L = ayStateFromLink(q, { profiles: PROFILES, validSite });
  await applyAyLink(L);
  startDesign((L && L.date) || DEFAULT_DATE);
}
// Ay görevi bağlantısı (aytext.js › ayStateFromLink) → yapılandırma, roket, rampa, araç ve güdüm (tasarlamaz: çağıran startDesign'ı çağırır).
// Yeni biçimde (L.full) yazılmayan iniş yeri, roket ve rampa varsayılandır; eski ?profile= bağlantısı yalnız profili uygular (eskisi gibi).
async function applyAyLink(L) {
  if (!L) return;
  const base = L.profile ? PROFILES[L.profile].cfg : L.custom ? normalizeConfig(L.custom) : ui.getConfig();
  if (!L.full) { if (L.profile || L.custom) ui.setConfig(base); return; }
  const rocket = L.rocket || 'GENEL';
  let site = null;
  if (L.pad) {
    try { await launch.ready; } catch (e) { /* rampa listesi yok: varsayılan */ }
    const p = launch.pads.get(L.pad);
    if (p && padAllowed(rocket, L.pad)) site = padSite(p);
  }
  ui.setConfig({ ...base, rocket, site, moonSite: L.moonSite || DEFAULT_SITE });
  launch.syncRocket();
  if (L.vehicle) vehicleMode = L.vehicle;
  if (L.landing) landingMode = L.landing;
}
// "Denemelerim" satırı: bağlantıdaki görevi kurup tasarlar (Görev adımı açılır)
async function openAyLink(qs) {
  if (S.designing) return;
  const L = ayStateFromLink(new URLSearchParams(qs), { profiles: PROFILES, validSite }); if (!L) return;
  compare.cancel(); scanner.cancel();
  await applyAyLink(L); syncLanding();
  if (L.date) $('#dateInput').value = L.date;
  ui.setTab('gorev');
  startDesign(L.date || $('#dateInput').value || DEFAULT_DATE);
}
// şu anki görevin bağlantı anahtarları (görev hazır değilse null): tarih istenen tarihtir; yapılandırma tasarımın kendisinden
function ayLinkNow() {
  if (!S.DESIGN || S.designing || !goodDate) return null;
  const cfg = S.DESIGN.cfg || ui.getConfig();
  return ayLinkFromState({ date: goodDate, cfg, profileKey: ui.profileKeyOf(cfg), vehicle: vehicleMode, landing: landingMode });
}
const ayLinkUrl = (o) => { const u = new URL(location.pathname, location.origin); u.searchParams.set('mode', 'lab'); u.searchParams.set('exp', 'ay'); for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v); return u.href; };
// Ay görevinin anahtarları yalnız o deneyde adreste durur; görev hazır değilken (açılış) gelen bağlantı olduğu gibi kalır
function writeAyUrl(u = new URL(location.href)) {
  const ay = document.body.dataset.exp === 'ay' && S.VIEW === 'lab', o = ay ? ayLinkNow() : null;
  if (ay && !o) return u;
  for (const k of AY_LINK_KEYS) u.searchParams.delete(k);
  if (o) for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v);
  return u;
}
function syncAyUrl() { if (!window.history || !history.replaceState) return; const u = writeAyUrl(); if (u.href !== location.href) history.replaceState(history.state, '', u); }
// Canlı Gökyüzü katmanları: uydular (SGP4 worker + 3B modeller), asteroitler (katalog, DAMIT, worker), takip/asteroit/çarpma arayüzleri ve veri güncelleyici (canlı veri
// indirmeleri). Gökyüzü motoru ilk kez açılınca (Canlı Gökyüzü, Laboratuvar › Asteroit saptırma / Lagrange noktaları: switchEngine) tek seferlik kurulur; ?prefetch=1 ile görev
// hazır olur olmaz. Ay görevinde hiç kurulmaz: orada uydu/asteroit çizilmez; kurulum gereksiz modül, model ve veri indirmesi demekti (docs/performans.md §15).
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
  impactui = new ImpactUI({ sats: S.sats, asts: S.asts, astui: S.astui, follow: followSat });
  S.sats.models.onLoad = (e, st) => { if (st === 'start') S.skyui.toast(`${e.name}: gerçek 3B model yükleniyor (${srcOf(MODELS[e.key])})…`); else if (st === 'error') S.skyui.toast(`${e.name}: 3B model yüklenemedi, temsili model gösteriliyor.`); };
  S.sats.onData = () => { if (S.tracker) S.tracker.computePasses(true); if (S.VIEW === 'lab' && labui.page === 'carpma') impactui.refresh(); };            // Çarpma riski deneyi açıkken katalog yenilenirse liste yeni veriyle yeniden hesaplanır
  // fırlatma takvimi (saatin altında) ve Fırlatmalar sekmesi: LL2 (yedek RocketLaunch.Live), son fırlatmalar uydu kataloğuna COSPAR ile bağlanır
  S.launches = new Launches();
  S.launchcal = new LaunchCal({ launches: S.launches, sats: S.sats, follow: followSat,
    openTab: () => { ui.setTab('firlatma'); if (narrowScreen()) $('#skyPanel').classList.add('open'); } });
  world.obsPose = obsPose;
  // katmanların programları veri gelmeden derlensin: ilk gökyüzü karesinde, ışık ve gölge durumu kurulduktan sonra (program anahtarına girer; görev motorunun
  // ışıklarıyla derlenen program gökyüzünde kullanılmıyordu). Gökyüzüyle açılışta bu örtünün altında olur. Aile modelleri yüklenince sıraya eklenir.
  skyWarm = [S.sats.points, S.asts.points];
  if (S.sats.inst.ready) skyWarm.push(S.sats.inst.group); else S.sats.inst.onReady = () => skyWarm.push(S.sats.inst.group);
  if (gov.r !== gov.max) { S.sats.setPixelScale(gov.r / world.prMax); S.asts.setPixelScale(gov.r / world.prMax); }          // oran önceden düşmüşse yeni katmanlar da aynı ölçekte
  const jobs = {};
  if (q.get('sats') !== '0') jobs.gp = (v) => S.sats.load(v);
  if (q.get('ast') !== '0') Object.assign(jobs, { neo: (v) => S.asts.load('neo', v), mb: (v) => S.asts.load('mb', v), sentry: (v) => S.asts.loadSentry(v) });
  if (q.get('launch') !== '0') jobs.launch = (v) => S.launches.load(v);
  updater = new Updater(jobs); updater.onChange = () => S.astui.renderUpdater(updater); updater.start();
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
  for (const B of Object.values(briefs)) if (B.active && !(S.VIEW === 'lab' && exp === B.id)) B.close('away');            // brifing yalnız kendi deneyinde
  if (world.vehicle && !briefOn()) world.vehicle.visible = !(S.VIEW === 'lab' && exp === LAB_HOME);          // deney merkezinde yörüngedeki araç gizli (CSS göstergeleri de gizler)
  document.querySelectorAll('[data-workspace]').forEach((x) => { const on = x.dataset.workspace === S.VIEW; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
  if (S.VIEW === 'lab' && narrowScreen() && (exp === LAB_HOME || (EXPERIMENTS[exp] && EXPERIMENTS[exp].phoneOpen))) $('#labPanel').classList.add('open');     // telefonda deney paneli ana içerikse açılır
  try { localStorage.setItem('ls19.mode', S.VIEW); if (exp) localStorage.setItem('ls19.exp', exp); } catch (e) { /* özel pencere */ }
  if (push) {
    const u = navUrl(S.VIEW, exp);
    // alan ya da deney değişince geçmişe yeni kayıt: telefonda geri hareketi siteden çıkmak yerine bir önceki görünüme döner (popstate)
    const nav = S.VIEW + '/' + (exp || ''), st = history.state && history.state.nav;
    const based = !!(history.state && history.state.based);                       // merkez kaydı altta (initHistory): yenilemede yeniden eklenmesin
    if (st && st !== nav) history.pushState({ nav, based }, '', u); else history.replaceState({ ...(history.state || {}), nav, based }, '', u);     // aynı görünüm: katman işareti korunur
  }
  if (exp === 'lagrange') lagrange.show();
  if (exp === 'carpma' && impactui) impactui.open();                             // gökyüzü motoru (initSky) yukarıda kuruldu
  resize();
}
// alanın ve deneyin adresi (geçmiş kaydı için)
function navUrl(view, exp) {
  const u = new URL(location.href); u.searchParams.set('mode', view); if (exp && exp !== LAB_HOME) u.searchParams.set('exp', exp); else u.searchParams.delete('exp');
  if (exp !== 'saptirma') for (const k of LINK_KEYS) u.searchParams.delete(k);                 // saptırma denemesinin parametreleri yalnız o deneyde adreste kalır
  writeAyUrl(u);                                                                                 // Ay görevininkiler de
  if (exp !== 'lagrange') for (const k of LG_LINK_KEYS) u.searchParams.delete(k);                // Lagrange deneyininkiler de
  return u;
}
// İlk açılış kaydı. Site bir deneyde ya da Canlı Gökyüzü'nde açıldıysa altına Laboratuvar merkezi kaydı konur: tarayıcının geri düğmesi siteden çıkmadan önce
// merkeze döner. Kayıt ilk kullanıcı dokunuşunda eklenir: tarayıcılar (Chrome, Safari) kullanıcı etkileşimi olmadan eklenen geçmiş kayıtlarını geri düğmesinde
// atlar; açılışta eklenen kayıt telefonda atlanıp siteden çıkılıyordu. pointerup/keydown kullanıcı etkinleştirmesi sayılır (pointerdown dokunmatikte sayılmaz) ve
// tıklamadan önce gelir: ilk dokunuş bir gezinme tıklamasıysa merkez kaydı onun altında kalır. Sayfa yenilenince kayıt zaten vardır (history.state.based).
function initHistory() {
  const nav = S.VIEW + '/' + (S.VIEW === 'lab' ? labui.page : ''), st = history.state || {};
  const home = nav === 'lab/' + LAB_HOME;
  history.replaceState({ ...st, nav, based: !!st.based || home }, '', location.href);
  if (st.based || home) return;
  const arm = () => {
    window.removeEventListener('pointerup', arm, true); window.removeEventListener('keydown', arm, true);
    const cur = history.state || {};
    if (cur.based || !cur.nav || cur.nav === 'lab/' + LAB_HOME) return;
    const here = location.href;
    history.replaceState({ nav: 'lab/' + LAB_HOME, based: true }, '', navUrl('lab', LAB_HOME)); history.pushState({ ...cur, based: true }, '', here);
  };
  window.addEventListener('pointerup', arm, true); window.addEventListener('keydown', arm, true);
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
// Laboratuvar: deney merkezi. Deney değişince motor ve adres eşlenir. openLab: saptırma deneyini bir asteroitle açar (seçim kartı, Asteroitler sekmesi, Çarpma riski deneyi)
let quietShow = false;
// Laboratuvar › Lagrange noktaları (yalnız panel: dönen çerçeve çizimi; motor gökyüzü, değişmez). Ay görevine halo profiliyle geçiş: onFly
const lagrange = new LagrangeUI({
  onFly: (key) => { setWorkspace('lab', true, 'ay'); if (PROFILES[key]) ui.onProfile(key); },
  onLink: (o) => {
    if (document.body.dataset.exp !== 'lagrange' || !window.history || !history.replaceState) return;
    const u = new URL(location.href); for (const k of LG_LINK_KEYS) u.searchParams.delete(k); for (const [k, v] of Object.entries(o)) u.searchParams.set(k, v);
    if (u.href !== location.href) history.replaceState(history.state, '', u);
  },
});
const labui = new LabUI({ initial: LAB_HOME });                                // açılış deney merkezi: Laboratuvar'da Ay görevinden başka deneyler de var
labui.onShow = () => { if (S.VIEW === 'lab') syncWorkspace(!quietShow); };
// Brifing, Laboratuvar merkezinden Ay görevi seçilince açılır (sayfa başına bir kez; ilk görev henüz hazır değilse hazır olunca: ready işleyicisi).
// Laboratuvar'ın açılışı, kayıtlı son deney, geri/ileri, K kısayolu ve Lagrange'dan "bu profille uç" geçişi brifingi açmaz (brifingtext.js briefKind).
$('#lab-home').addEventListener('click', (e) => {
  const b = e.target.closest('[data-exp]'), exp = b && b.dataset.exp, B = briefs[exp];
  if (!B || briefEntered.has(exp)) return;
  briefEntered.add(exp);
  setTimeout(() => { const bk = urlApplied && briefKind({ visited: B.seen(), view: S.VIEW, exp: labui.page, entered: true, briefed: Object.keys(briefs) }); if (bk && !B.active) B.open(bk); }, 0);      // labui.show bittikten sonra
});
// geri/ileri: adresteki alanı ve deneyi kur (adres yazılmaz; kayıt zaten o adreste)
// Ekranı kaplayan katmanlar (kalkış izleme, sinematik gösterim) geçmişte ayrı kayıt: telefonda geri önce katmanı kapatır, görünüm aynı kalır.
// Kayıt kullanıcı tıklamasında, beklemeden önce eklenir (etkileşimsiz eklenen kaydı tarayıcı geri düğmesinde atlar); katman kendiliğinden bitince kaydı geri alınır.
function pushLayer(layer) { const st = history.state || {}; if (st.layer !== layer) history.pushState({ ...st, layer }, '', location.href); }
function dropLayer(layer) { setTimeout(() => { if (history.state && history.state.layer === layer) history.back(); }, 0); }          // bir tur sonra: katman alan geçişiyle kapandıysa yeni kayıt zaten üstte, geri alınmaz
window.addEventListener('popstate', () => {
  if (!urlApplied) return;
  const layer = (history.state && history.state.layer) || null;
  if (cinema.on && layer !== 'cine') cinema.stop();
  else if (ascent.active && layer !== 'asc') ascent.stop();
  const q = new URLSearchParams(location.search);
  const r = resolveView({ mode: q.get('mode'), exp: q.get('exp'), tab: null, tabOwner: () => null }) || { view: 'lab', exp: LAB_HOME };
  setWorkspace(r.view, false, r.view === 'lab' ? (r.exp || LAB_HOME) : null);
});
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
const missionEtWindow = (tStart, x = null) => [etOf(tStart) - 86400, etOf(tStart) + ephSpanDays(x) * 86400];      // x: yapılandırma/tasarım (moonsite.js)
// UTC ms -> motor zamanı (TDB s); worker'daki ile aynı
function tOfUtcMs(ms) { const jdU = ms / 86400000 + 2440587.5; return (jdU + EO.ttMinusUtc(jdU + 69 / 86400) / 86400 - E.jdTdb(0)) * 86400; }
// tarih seç -> görev o tarih için tasarlanır (ana iş parçacığında, adım adım: bazı tarayıcılarda worker'lar
// düşük öncelikte koşup birkaç kat yavaşlıyor), sonra tasarım fizik worker'ına gönderilir.
// Ölçüm (2026-11, telefon taklidi CPU ×4, Apollo 15): Apollo profili 13 sn (en uzun görev 5,3 sn), NRHO 132 sn (129 sn uzun görev). Bilerek burada
// kalır: yükleme katmanı altında beklenir, etkileşim yoktur. Canlı sayfadaki tasarımlar (profil karşılaştırması) iş parçacığındadır (designwork.js).
// Canlı efemeris seçilen günden 1 gün önce DE440 durumundan başlar.
let designSeq = 0;
async function startDesign(dateStr) {
  const ms = Date.parse(dateStr + 'T00:00:00Z');
  if (!Number.isFinite(ms)) return;
  const id = ++designSeq;
  compare.cancel(); scanner.cancel();                               // yeni tasarım: süren profil karşılaştırması ve pencere taraması durur (iş parçacığı kapatılır; önbellekten anında biten tasarımı da kaçırmasın)
  S.START_MS = ms; pendingDate = dateStr; S.designing = true; S.latest = null;
  $('#dateInput').value = dateStr; ui.beginDesign(dateStr);
  if (nomWorker) { nomWorker.terminate(); nomWorker = null; }
  if (latestSentInit) send({ cmd: 'pause', on: true });
  S.running = false; setBtn($('#btnPlay'), 'play', 'Başlat');
  if (!(brief && brief.active)) { $('#loading').style.display = 'grid'; $('#loadBar').style.width = '0%'; $('#loadBack').hidden = true; }      // brifingde örtü yok: brifing kendi bekleme göstergesini gösterir
  $('#loadMsg').textContent = 'Görev tasarlanıyor: ' + dateStr;
  ayRefresh();
  const cfg = ui.getConfig(), pre = cachedDesign(ms, cfg);
  try { await S.K.eph.ensure(...missionEtWindow(pre ? pre.tStart : tOfUtcMs(ms) - 86400, cfg)); }           // o yılın JPL kayıtları (önbellekteyse hemen)
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
      }, () => id !== designSeq, cfg, { retry: true });            // Tasarla: yakınsamayan pencereden sonraki aydınlanma penceresi denenebilir (Apollo 11 dışında)
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
  if (brief && brief.waiting) { $('#loading').style.display = 'none'; brief.onFail(m); }          // brifing: hata brifingde gösterilir, seçimler değiştirilebilir
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
  send({ cmd: 'landing', mode }); syncLanding(); syncAyUrl();
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
  onEnd: () => { send({ cmd: 'seek', t: ui.t0 }); dropLayer('asc'); if (ascentThenPlay) { ascentThenPlay = false; setTimeout(() => setPlay(true), 300); } } });     // brifingden "Rampadan fırlat": kalkıştan sonra görev sürer
initG3dPanel(world);                                                                // Google 3B karolar ayarları (kalkış çubuğu)
$('#btnAscent').addEventListener('click', async () => {
  const btn = $('#btnAscent');
  if (S.designing || ascent.active || btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');                      // model ve gökyüzü yüklenirken düğme kapalı: yeniden basılınca ikinci kez başlamaz
  pushLayer('asc');                                                                 // geri düğmesi kalkışı kapatır (kayıt tıklama anında)
  try {
    if (!insState) { send({ cmd: 'seek', t: ui.t0 }); await new Promise((r) => setTimeout(r, 400)); }
    if (S.running) setPlay(false);
    if (!(await ascent.start())) { dropLayer('asc'); ui.designMsg && ui.designMsg('Kalkış canlandırması başlatılamadı (görev henüz hazır değil).'); }
  } catch (e) { console.error(e); dropLayer('asc'); ui.designMsg && ui.designMsg('Kalkış canlandırması başlatılamadı (görev henüz hazır değil).'); }
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
// roketi ve (gerekirse) roketin gerçek rampasını uygular; tasarlamaz (ui.onRocket ve brifing)
function applyRocket(id) {
  ui.setRocket(id);
  try { localStorage.setItem('ls19.rocket', ui.rocket); } catch (e) { /* özel pencere */ }
  const p = launch.padFor(id);                                                  // gerçek roket yalnız kendi rampalarından: gerekirse ilkine geçilir (null = varsayılan LC-39B)
  if (p !== undefined) { const c = ui.getConfig(), lo0 = (siteIncl(ui.site) || [28.7])[0], ir = siteIncl(p); ui.site = p; if (ir && Math.abs(c.earth.inc - lo0) < 0.05) c.earth.inc = ir[0]; ui.setConfig({ ...c, site: p }); ui.setRocket(id, `Rampa ${p ? p.name : LEGACY_SITE.short} olarak değiştirildi (roketin gerçek rampası).`); }
  launch.syncRocket();
}
ui.onRocket = (id) => {
  if (S.designing || id === ui.rocket) return;
  applyRocket(id);
  compare.cancel(); scanner.cancel();
  startDesign($('#dateInput').value || pendingDate || DEFAULT_DATE);
};
// görev brifingi (brifing.js): Ay görevinin girişi. Seçimler yapılandırmaya yazılır, görev bir kez tasarlanır; sonra rampadan (kalkış), yörüngeden ya da fragmanla başlar
const missionReady = () => new Promise((r) => { const f = () => (S.latest && !S.designing ? r() : setTimeout(f, 200)); f(); });
let ascentThenPlay = false;
// brifing: seçilen yer, tarih, roket (ve rampası) ile bir profilin gerçek tasarımı: önbellek (hazır tasarımlar dahil) ya da iş parçacığı (designwork.js).
// Sonuç ortak önbelleğe yazılır: brifingin sonundaki "Görevi tasarla" aynı seçimle anında biter. Yol (design.js missionPath) çizim içindir
const briefJob = new DesignJob(), briefPaths = new Map();
async function briefDesign(sel, key, onProg, stop) {
  const ms = Date.parse(sel.date + 'T00:00:00Z'); if (!Number.isFinite(ms) || !S.K) return null;
  const p = launch.padFor(sel.rocket), site = p !== undefined ? p : ui.site;
  const cfg = { ...PROFILES[key].cfg, rocket: sel.rocket, site: site || undefined, moonSite: sel.site }, ck = cacheKey(ms, cfg), tFrom = tOfUtcMs(ms), tStart = tFrom - 86400;
  const win = missionEtWindow(tStart, cfg);
  let hit = cachedDesign(ms, cfg);
  if (!hit) {
    const D = await briefJob.run({ tFrom, tStart, cfg, win, path: true }, onProg, stop);
    if (!D) return null;
    hit = { tStart, design: D, nominal: null }; designCache.set(ck, hit); briefPaths.set(ck, briefJob.lastPath);
  } else if (!briefPaths.has(ck) && !stop()) {
    await briefJob.run({ tFrom, tStart: hit.tStart, cfg, win: missionEtWindow(hit.tStart, cfg), pathFor: hit.design }, () => {}, stop);
    briefPaths.set(ck, briefJob.lastPath);
  }
  return { D: hit.design, path: briefPaths.get(ck) || null };
}
brief = new Briefing({ world, ui, root: $('#app'), latest: () => S.latest, defs: () => S.K && S.K.defs,
  preload: (id) => { const p = launch.padFor(id); ascent.preload(id, p !== undefined ? p : ui.site); },           // seçilen roket ve rampası: kalkış beklemeden açılsın
  live: briefDesign, liveStop: () => briefJob.drop(),
  padOf: (id) => { const p = launch.padFor(id), q = (p !== undefined ? p : ui.site) || LEGACY_SITE; return { lat: q.lat, lon: q.lon, name: `${rocketOf(id).short} · ${q.short || padShort((/(Space )?Launch Complex\s+\S+/.exec(q.name) || [q.name])[0])}` }; },      // roket adımı: rampa işareti
  current: () => ({ site: $('#cfgMoonSite').value, date: $('#dateInput').value || DEFAULT_DATE, profile: ui.profileKeyOf(ui.getConfig()), rocket: ui.rocket, vehicle: vehicleMode, landing: landingMode }),
  design: async (sel) => {
    compare.cancel(); scanner.cancel();
    if (sel.rocket !== ui.rocket) applyRocket(sel.rocket);
    ui.setConfig({ ...PROFILES[sel.profile].cfg, moonSite: sel.site });
    if (sel.vehicle && sel.vehicle !== vehicleMode) { vehicleMode = sel.vehicle; try { localStorage.setItem('ls19.vehicle', vehicleMode); } catch (e) { /* özel pencere */ } }
    if (sel.landing) setLanding(sel.landing);
    syncLanding();
    try { localStorage.setItem('ls19.rocket', ui.rocket); } catch (e) { /* özel pencere */ }
    await startDesign(sel.date);
  },
  launch: async (how) => {
    await missionReady();
    if (how === 'pad') { ascentThenPlay = true; $('#btnAscent').click(); }
    else if (how === 'orbit') setPlay(true);
    else if (how === 'cine') playCine();
  } });
briefs.ay = brief;
$('#btnBrief').addEventListener('click', () => { if (!S.designing) { brief.open('new'); brief.go(0); } });
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
    if (S.MODE === 'sky' && skySrc) { E.setProvider(skySrc.prov); world.live = skySrc; } else world.live = lv; S.DESIGN = d.design; world.setMoonSite(setViewSite(d.design)); ui.setDesign(d.design, d.startMs); goodDate = pendingDate; rocketOk = ui.rocket; launch.syncRocket(); launch.showDesign(S.DESIGN);
    E.setMoonZone(S.DESIGN.profile === 'HALO' ? 1.25 * S.DESIGN.HALO.stats.raKm : E.SOI_M);
    world.resetDynamic && world.resetDynamic(); world.setDesign(S.DESIGN);
    const ce = designCache.get(cacheKey(d.startMs, S.DESIGN.cfg || ui.getConfig()));
    lastTStart = d.tStart; if (d.type === 'ready') optimalOk = d.optimalOk !== false;
    syncLanding();
    refreshNominal(d.nominal, ce);
    refreshCompare();
    if (brief) brief.onReady(S.DESIGN);
    // kalkışı önceden hazırla (roket, rampa, rampa çevresi): "Kalkış" ya da brifingin "Rampadan fırlat"ı beklemeden açılır. Veri tasarrufunda yapılmaz
    if (!(navigator.connection && navigator.connection.saveData)) { const D0 = S.DESIGN; (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => { if (S.DESIGN === D0 && S.MODE === 'mission') ascent.preloadDesign(D0); }, { timeout: 4000 }); }
  }
  if (d.type === 'ready' || d.type === 'restarted') {
    ui.reset(d.plan, d.t0, S.DESIGN.LAUNCH.t_launch);
    if (d.type === 'ready' || !d.seek) { const ms = E.utcMsFromT(S.DESIGN.LAUNCH.t_launch); world.setRealClouds(ms).catch(() => {}); world.setSeason(ms).catch(() => {}); }      // görev gününün gerçek bulutları (bulutlar.js) ve mevsimi (mevsim.js); aynı gün yeniden inmez
    if (d.type === 'restarted') cinema.onRestarted();
    world.resetTrail(); world.resetDynamic && world.resetDynamic();
    if (d.type === 'ready') revealAt = performance.now() + 1500; else $('#loading').style.display = 'none';      // yeni görev: örtü ilk gerçek kare bitince kalkar (frame › reveal)
    if (d.seek) { if (!S.running) setPlay(true); }
    else { S.running = false; setBtn($('#btnPlay'), 'play', 'Başlat'); }
    if (d.type === 'ready' && !urlApplied) { urlApplied = true; applyUrlParams(); { const B = briefs[labui.page], ent = briefEntered.has(labui.page), bk = B && briefKind({ search: ent ? '' : location.search, visited: B.seen(), view: S.VIEW, exp: labui.page, entered: ent, briefed: Object.keys(briefs) }); if (bk) B.open(bk); } initHistory(); if (new URLSearchParams(location.search).get('prefetch') === '1') initSky(); if (narrowScreen() && S.VIEW === 'lab') $('#labPanel').classList.add('open'); }      // telefon: ilk açılışta deney paneli açık (hangi deney, geri dönüş görünsün)
    if (d.type === 'ready') syncAyUrl();
    ayRefresh();
  } else if (d.type === 'state') {
    S.latest = d;
    if (stepWaiter && d.step === stepWaiter.n) { const r = stepWaiter.resolve; stepWaiter = null; r(d); }       // dışa aktarım: elle saatte kare adımı (exporter.js)
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
// ?olcum=1: cihazda başarım okuması (perfhud.js; yalnız bu parametreyle yüklenir)
let perfHud = null;
if (new URLSearchParams(location.search).get('olcum') === '1') import('./perfhud.js').then((m) => { perfHud = new m.PerfHud(world); }).catch(() => {});
function frame(now) {
  const dtMs = now - lastFrame, dt = Math.max(0, Math.min(0.1, dtMs / 1000)); lastFrame = now;          // ≥ 0: dışa aktarımın sanal saatinden dönüşte (vclock.js) bir kez geri gidebilir
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
  { const B = briefOn(); if (B && S.MODE === EXPERIMENTS[B.id].engine && !ascent.active) B.frame(dt); }          // brifing: kamera, gizlenenler, işaretler (deneyin motorundayken)
  // görev motorunda ilk durum gelmeden, gökyüzü motorunda ilk skyFrame'den önce sahne konumlanmamıştır (Dünya ve Ay ince ağları ufuk bandı ve LOD olmadan, ~2,2 M üçgen): o kare çizilmez
  const placed = S.MODE === 'sky' ? skyPlaced : ascent.active || !!S.latest;           // gökyüzü: skyFrame en az bir kez çalıştı (efemeris kurulu)
  if (!S.designing && placed) world.render();                     // tasarım sırasında katman her şeyi örtüyor: işlemci tasarıma kalsın
  if (!primed && !S.designing && placed && S.MODE === 'mission') { primed = true; world.primeHidden(); }     // alevler vb. uçuş ortasında ilk kez görünecek nesneler: ilk çizim ilk görev karesinde (açılışta örtü altında; scene.js)
  if (revealAt && !S.designing && (placed || now > revealAt)) reveal(placed);
  if (perfHud) perfHud.frame(now, dtMs);
  requestAnimationFrame(frame);
}
// Yükleme örtüsünü kaldır. İlk gerçek karenin GPU işi (gölgelendiricilerin ve dokuların ilk kullanımı) örtünün altında bitsin diye 1×1 okumayla beklenir:
// yoksa örtü kalktıktan sonra ilk kareler sırada birikip sayfa saniyelerce donmuş görünüyordu (docs/performans.md §16). Durum 1,5 sn içinde gelmezse beklemeden kalkar.
let revealAt = 0, primed = false;
function reveal(drawn) {
  revealAt = 0;
  if (drawn) { try { const gl = world.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch (e) { /* bağlam kaybı: beklemeden kaldır */ } }
  $('#loading').style.display = 'none';
}
// Canlı Gökyüzü karesi (efemeris kurulu iken)
let skyPlaced = false, skyWarm = null;
function skyFrame(ms, now, dt) {
    skyPlaced = true;
    world.updateSky(skyT, { dtReal: dt });
    if (skyWarm && skyWarm.length) { world.warm(skyWarm); skyWarm = []; }        // initSky: katman programları gökyüzü ışıklarıyla
    const t = skyT, full = !!world.full, eye = world.eye;
    if (eye) {
      S.sats.suppressLabel = (id) => S.tracker.has(id); S.sats.obsView = world.cam.mode === 'OBS';
      // Laboratuvar'daki gökyüzü deneyleri Canlı Gökyüzü'nün takip ve gözlemci etiketlerini göstermez; uydu bulutu yalnız Çarpma riski'nde (konusu uydular).
      // "Canlı göster" ayarına (sats.enabled) dokunulmaz: Canlı Gökyüzü'ne dönünce eski hâli gelir.
      const labExp = S.VIEW === 'lab' ? labui.page : null, showSats = !labExp || labExp === 'carpma';
      S.sats.update(t, eye, world.camera, canvas, showSats && !full, showSats && !full);
      S.asts.update(t, eye, world.camera, canvas, full); S.astui.update(eye);
      S.tracker.update(t, eye, world.camera, canvas, !labExp, full);
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
  if (exporter && exporter.busy) return;                                       // video dışa aktarımı: fizik elle ilerler, duraklatılmaz (sekme arka planda da sürer)
  if (document.hidden) { if (S.running && !S.designing) { bgPaused = true; setPlay(false); } }
  else if (bgPaused) { bgPaused = false; setPlay(true); }
});
$('#btnCine').onclick = () => { if (cinema.on) cinema.stop(); else openDesk(); };          // film düğmesi Yapımcı masasını açar ("Fragmanı oynat"); C kısayolu doğrudan oynatır
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
  if (briefOn() && k !== 'escape') return;                                        // brifing açıkken uçuş kısayolları yok
  if (k === 'escape') { if (e.defaultPrevented) return; if (!$('#pick').hidden) ui.hidePick(); else if (S.VIEW === 'lab' && labui.page !== LAB_HOME) labui.show(LAB_HOME); return; }       // Esc: önce bilgi kartı, sonra deneyden Laboratuvar ana sayfasına
  if (k === 'm') { setWorkspace(S.VIEW === 'sky' ? 'lab' : 'sky'); return; }                        // M: Canlı Gökyüzü ↔ Laboratuvar
  if (S.MODE === 'sky') {                                          // Canlı Gökyüzü: yalnız kamera (zaman hep gerçek; Boşluk/N/virgül/nokta saati değiştirmez)
    if (/^[1-5]$/.test(k)) setSkyCam(['EARTH', 'OBS', 'SYSTEM', 'MOON', 'SOLAR'][+k - 1]);
    return;
  }
  if (k === ' ') { e.preventDefault(); setPlay(!S.running); }
  else if (k === '.') setWarp((S.latest ? S.latest.warp : warp) * 2);
  else if (k === ',') setWarp((S.latest ? S.latest.warp : warp) / 2);
  else if (k === 'g') { $('#chkAuto').checked = !$('#chkAuto').checked; send({ cmd: 'auto', on: $('#chkAuto').checked }); refreshTreeMenus(); }
  else if (k === 'p') send({ cmd: 'perturb', dv: 2.0 });
  else if (k === 'k') { setWorkspace('lab', true, 'ay'); ui.setTab('kontrol'); $('#labPanel').classList.add('open'); }
  else if (k === 'c') { pushLayer('cine'); playCine(); }
  else if (k === 'y') openDesk({ key: true });
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
const compare = new ProfileCompare({ ui, cachedDesign, designCache, cacheKey, tOfUtcMs, missionEtWindow });
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
  if (r) setWorkspace(r.view, false, r.exp); else syncWorkspace(false);                     // değer yok: açılış deney merkezi (HTML ilk durumu; motor ve araç görünürlüğü eşlenir)
  if (tab) ui.setTab(tab);
  if (q.get('skycam')) setSkyCam(q.get('skycam').toUpperCase());
  // paylaşılan kurgu: #kurgu=… (adresin # kısmı sunucuya gitmez); ?cine= ile açılışta oynar, yoksa Yapımcı masası açılır
  const hp = new URLSearchParams(location.hash.slice(1)), hk = hp.get('kurgu'); sharedCut = hk ? decodeCut(hk) : null;
  uydumPaylasilanAyarla(paylasimCoz(hp.get('uydu')));                             // bağlantıdaki kullanıcı uydusu (arşiv adresi; usersat.js)
  if (q.get('cine') && !q.get('seek')) setTimeout(() => playCine({ scale: Math.max(0.2, parseFloat(q.get('cine')) || 1) }), 800);       // ?cine=1: açılışta sinematik gösterim (sayı: süre ölçeği)
  else if (sharedCut) setTimeout(() => openDesk(), 800);
}
$('#btnPanel').onclick = () => $('#labPanel').classList.toggle('open');
// ---------------------------------------------------------------- telefon yerleşimi (style.css ≤ 760 px)
// bilgi kartları tek satır: dokununca tam kart (içindeki düğme ve bağlantılar kartı kapatmaz)
for (const id of ['#hud', '#skyHud']) {
  const h = $(id); h.setAttribute('aria-expanded', 'false');
  h.addEventListener('click', (e) => { if (!narrowScreen() || e.target.closest('button, a, input, select, label')) return; const on = h.classList.toggle('open'); h.setAttribute('aria-expanded', on ? 'true' : 'false'); });
}
// paneller alttan açılan sayfa: tutamaçla sürükle (yukarı tam ekran, aşağı kapanır), tutamağa dokunmak yarım ↔ tam
function sheetGrip(panel) {
  const g = document.createElement('div'); g.className = 'sheet-grip'; g.setAttribute('aria-hidden', 'true'); panel.prepend(g);
  // Sürükleme: yükseklik doğrudan öğeye yazılır (kalıtılan --sheet-h her harekette tüm alt öğelerin stilini yeniden hesaplatırdı),
  // kare başına bir kez (rAF). Bırakınca hız da sayılır: hızlı bir fiske (> 0,11 px/ms) mesafeden bağımsız bir sonraki duruşa götürür.
  let y0 = 0, h0 = 0, moved = false, raf = 0, nextH = 0, samples = [];
  const paint = () => { raf = 0; panel.style.height = nextH + 'px'; };
  g.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('sheet-drag')) return;    // ikinci parmak sürüklemeyi devralmaz
    kbd = null; g.setPointerCapture(e.pointerId);          // kullanıcı yüksekliği kendisi seçiyor: klavye dönüşü iptal
    y0 = e.clientY; h0 = panel.getBoundingClientRect().height; moved = false; samples = [{ y: e.clientY, t: e.timeStamp }]; document.body.classList.add('sheet-drag'); });
  g.addEventListener('pointermove', (e) => {
    if (!document.body.classList.contains('sheet-drag')) return;
    if (Math.abs(e.clientY - y0) > 6) moved = true;
    samples.push({ y: e.clientY, t: e.timeStamp }); if (samples.length > 5) samples.shift();
    nextH = Math.max(60, h0 + (y0 - e.clientY)); if (!raf) raf = requestAnimationFrame(paint);
  });
  const end = (e) => {
    if (!document.body.classList.contains('sheet-drag')) return;
    if (raf) { cancelAnimationFrame(raf); paint(); }
    const h = panel.getBoundingClientRect().height, vh = innerHeight, full = parseFloat(getComputedStyle(panel).maxHeight) || vh, half = 0.52 * vh;
    const a = samples[0], b = samples[samples.length - 1];
    const v = b && a && b.t > a.t && !(e && e.timeStamp - b.t > 100) ? (b.y - a.y) / (b.t - a.t) : 0;   // + aşağı, px/ms; durup bırakınca 0
    // Geçiş yeniden açılır ve satır içi yükseklik kaldırılır: panel şu anki yüksekliğinden hedefe çekmece eğrisiyle oturur.
    document.body.classList.remove('sheet-drag'); panel.style.removeProperty('height');
    const to = (x) => { if (x === 'full') panel.style.setProperty('--sheet-h', full + 'px'); else if (x === 'half') panel.style.removeProperty('--sheet-h'); else { panel.classList.remove('open'); panel.style.removeProperty('--sheet-h'); } };
    if (!moved) { panel.style.setProperty('--sheet-h', h0 < (half + full) / 2 - 10 ? full + 'px' : '52dvh'); return; }
    if (Math.abs(v) > 0.11) { to(v < 0 ? 'full' : h0 > (half + full) / 2 && h > 0.28 * vh ? 'half' : 'close'); return; }
    if (h < 0.28 * vh) { to('close'); return; }
    to(h > (half + full) / 2 ? 'full' : 'half');
  };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  // Klavye açılınca yarım sayfa daralır: yazı alanına girilince sayfa tam yüksekliğe çıkar, klavye kapanınca önceki yüksekliğine döner.
  // Dönüş üç yoldan: odak yazı alanından çıkınca; paneldeki başka bir şeye dokununca (iOS'ta odaklanamayan öğeye dokunmak odağı taşımaz: alan bırakılır);
  // görünür alan yeniden büyüyünce (Android'de geri tuşu klavyeyi kapatır, odak alanda kalır).
  const TEXT = 'input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=date]):not([type=button]), textarea';
  let kbd = null;                                                                    // { prev: önceki --sheet-h, h0: odaktaki pencere yüksekliği, low: klavye açıldı mı }
  const restore = () => { if (!kbd) return; const p = kbd.prev; kbd = null; if (p) panel.style.setProperty('--sheet-h', p); else panel.style.removeProperty('--sheet-h'); };
  panel.addEventListener('focusin', (e) => {
    if (!narrowScreen() || !e.target.matches(TEXT)) return;
    if (!kbd) kbd = { prev: panel.style.getPropertyValue('--sheet-h'), h0: innerHeight, low: false };
    panel.style.setProperty('--sheet-h', '100dvh');
  });
  panel.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!(a && panel.contains(a) && a.matches(TEXT))) restore(); }, 0));
  panel.addEventListener('click', (e) => { const a = document.activeElement; if (kbd && a && a.matches(TEXT) && panel.contains(a) && !e.target.closest(TEXT + ', label')) a.blur(); });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => {
    if (!kbd) return; const h = visualViewport.height;
    if (h < kbd.h0 * 0.8) kbd.low = true; else if (kbd.low && h > kbd.h0 * 0.9) { const a = document.activeElement; if (a && panel.contains(a)) a.blur(); restore(); }
  });
}
sheetGrip($('#labPanel')); sheetGrip($('#skyPanel'));
// iOS Safari touch-action'ı tam uygulamaz: sayfa büyütme hareketi kesilir
document.addEventListener('gesturestart', (e) => e.preventDefault());
installGlossary([$('#labPanel'), $('#skyPanel')]);                                 // kısaltmalara dokununca tanım (glossary.js)
// telefonda iki satıra kısaltılan açıklama notları (style.css): dokununca tamamı açılır/kapanır; kısalmayan nota dokunmak bir şey yapmaz
const NOTE_SEL = '#labPanel :is(p.note, .stepsub, .kp-note), #skyPanel p.note';
document.addEventListener('click', (e) => {
  if (!narrowScreen() || e.target.closest('a, button, input, select, label, summary')) return;
  const n = e.target.closest(NOTE_SEL); if (!n) return;
  if (n.classList.contains('open') || n.scrollHeight > n.clientHeight + 2) n.classList.toggle('open');
});
// telefonda sinematik gösterim "⋯" menüsünde
$('#btnCineMenu').addEventListener('click', () => $('#btnCine').click());
$('#btnSkyPanel').onclick = () => (S.VIEW === 'lab' ? $('#labPanel') : $('#skyPanel')).classList.toggle('open');
window.LS19 = { get brief() { return brief; }, briefs, world, ui, send, ascent, setCam, setPlay, cinema, desk, link, exportHost, openExport, focusOn, setWorkspace, setSkyCam, clock, followSat, lookAtSat, labui, openLab, aymc, ayabort, lagrange, compare, get mode() { return S.MODE; }, get view() { return S.VIEW; }, get skyT() { return skyT; }, get deflect() { return deflect; },
  get sats() { return S.sats; }, get asts() { return S.asts; }, get astui() { return S.astui; }, get updater() { return updater; }, get tracker() { return S.tracker; }, get skyui() { return S.skyui; }, get launches() { return S.launches; } };
window.ROCSIM = window.LS19;

boot().catch((err) => { $('#loadMsg').textContent = 'Hata: ' + err.message + ' — siteyi yerel sunucuyla (baslat.command) ya da bulutta açın.'; console.error(err); });
