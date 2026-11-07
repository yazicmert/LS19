// Kalkış yayını kurgusu (launchcam.js) ve bağlantıları: cd web && node test/test_launchcam.js
import fs from 'fs';
import { directShot, onboardWindows, autoWarp, shake, timeline, SITES, SHOT_NAMES, siteEye, lineOfSight, sight, groundCovers, AUTO_TRACK_KM, AUTO_AIR_KM } from '../js/launchcam.js';
import { massState } from '../js/ascentsim.js';
import { ROCKETS } from '../js/rockets.js';
let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const SV = ROCKETS.SATURN_V.ascent, mq = { t: 83 };
// görüş: { track: { ok, dist }, air: { ok, dist } } (km)
const see = (tOk, tD, aOk = true, aD = 100) => ({ track: { ok: tOk, dist: tD }, air: { ok: aOk, dist: aD } });
const at = (met, sv = see(true, 5)) => directShot({ met, events: SV.events, maxQ: mq, see: sv }).shot;
check('kurgu sırası (Saturn V): helikopter → rampa → yer izleme → takip uçağı → araç üstü (gerçek kameralar)',
  at(-8) === 'wide' && at(0) === 'pad' && at(10) === 'track' && at(60, see(true, AUTO_TRACK_KM + 1)) === 'air' && at(300, see(true, 400, true, AUTO_AIR_KM + 1)) === 'onboard',
  [at(-8), at(0), at(10), at(60, see(true, AUTO_TRACK_KM + 1)), at(300, see(true, 400, true, AUTO_AIR_KM + 1))].join(' '));
check('kurgu: kamera roketi ufkun altında görmezse sıradakine geçer (yer → uçak → araç üstü)', at(60, see(false, 20)) === 'air' && at(400, see(false, 900, false, 800)) === 'onboard');
check('Max-Q ve S-IC ayrılmasında araç üstü kamera; ayrılma yavaş çekim', at(85) === 'onboard' && at(165) === 'onboard' && directShot({ met: 165, events: SV.events, maxQ: mq }).slow && at(300, see(true, 400)) === 'air');
const sep = directShot({ met: 165, events: SV.events, maxQ: mq });
check('ayrılmada kamera üst kademede (kesme + 12 m)', sep.mount === 42.1 + 12);
for (const [id, r] of Object.entries(ROCKETS)) if (r.ascent) {
  const w = onboardWindows(r.ascent.events, { t: 80 }); let ok = true; for (let i = 1; i < w.length; i++) if (w[i].t0 < w[i - 1].t1 - 1e-9) ok = false;
  check(`${id}: araç üstü pencereler çakışmaz ve yörüngeden önce biter`, ok && w.every((x) => x.t1 <= r.ascent.tIns + 20));
}
check('kullanıcı seçimi kurguyu geçersiz kılar (yer kamerası geri sayımda da yerde)', directShot({ met: -8, events: SV.events, maxQ: mq, user: 'ground' }).shot === 'track' && directShot({ met: 0, events: SV.events, maxQ: mq, user: 'air' }).shot === 'air' && directShot({ met: 200, events: SV.events, maxQ: mq, user: 'onboard' }).mount === 54.1);
const lostG = directShot({ met: 600, events: SV.events, maxQ: mq, user: 'ground', see: see(false, 1900) }), lostA = directShot({ met: 680, events: SV.events, maxQ: mq, user: 'air', see: see(false, 2000, false, 2100) });
check('seçilen kamera roketi ufukta kaybedince araç üstü kameraya geçilir ve etikette nedeni yazar (yer kamerası 167 km\'de yerde kalır, uzaydan bakmaz)',
  lostG.shot === 'onboard' && /yer kamerası aracı ufukta kaybetti/.test(lostG.note) && lostA.shot === 'onboard' && /takip uçağı/.test(lostA.note) && directShot({ met: 300, events: SV.events, maxQ: mq, user: 'ground', see: see(true, 300) }).shot === 'track',
  `${lostG.shot}: ${lostG.note}`);
check('kamera adları gerçek kameraları söyler; sanal "takip kamerası" yok', Object.keys(SHOT_NAMES).join() === 'wide,pad,track,air,onboard' && !Object.values(SHOT_NAMES).some((n) => /Takip kamerası/.test(n)));

// geometri: kamera yerleri, görüş hattı, zemin kapsaması (küre R = 6378,137 km, rampa (0, 0, R) ekvatorda, uçuş yönü +y)
const R = 6378.137, P = { pos: [0, 0, R], up: [0, 0, 1], dr: [0, 1, 0] }, eT = siteEye(P, SITES.track), eA = siteEye(P, SITES.air);
check('kamera yerleri: yer izleme 1,4 km yanda 12 m yukarıda; uçak 18,3 km, 70 km ileride, 40 km yanda', Math.abs(eT[0] - 1.4) < 1e-9 && Math.abs(eT[1] + 0.42) < 1e-9 && Math.abs(eT[2] - R - 0.012) < 1e-9
  && Math.abs(eA[0] - 40) < 1e-9 && Math.abs(eA[1] - 70) < 1e-9 && Math.abs(eA[2] - R - 18.3) < 1e-9, `${eT.map((v) => v.toFixed(3))} · ${eA.map((v) => v.toFixed(1))}`);
const rocketAt = (downKm, hKm) => { const th = downKm / R, r = R + hKm; return [0, r * Math.sin(th), r * Math.cos(th)]; };
const v1 = sight(eT, rocketAt(5, 10), R), v2 = sight(eT, rocketAt(1000, 160), R), v3 = sight(eT, rocketAt(1800, 185), R), v4 = sight(eA, rocketAt(1800, 185), R), v5 = sight(eT, P.pos, R);
check('görüş hattı: yer kamerası roketi 1.000 km/160 km\'de görür, 1.800 km/185 km\'de ufkun altında kaybeder; uçak 18 km\'den daha uzağı görür; rampadaki roket görünür',
  v1.ok && v2.ok && !v3.ok && v4.ok && v5.ok && Math.abs(v1.dist - Math.hypot(1.4, 5.42, 10)) < 0.2, [v1, v2, v3, v4, v5].map((x) => `${x.ok ? '✓' : '✗'}${x.dist.toFixed(0)}`).join(' '));
check('lineOfSight: Dünya\'nın içinden geçen doğru kapalı, dışından geçen açık', !lineOfSight([R + 1, 0, 0], [-R - 1, 0, 0], R) && lineOfSight([R + 1, 0, 0], [R + 1, 500, 0], R));
const up = (h) => [0, 0, R + h];
check('groundCovers: rampa üstünde alçak kamera (yer, uçak, 100 km) zemini kullanır; çok uzak (20.000 km) ya da 1.500 km uzaktaki 180 km irtifa kullanmaz',
  groundCovers(eT, P.pos, R) && groundCovers(eA, P.pos, R) && groundCovers(up(100), P.pos, R) && !groundCovers(up(20000), P.pos, R) && !groundCovers(rocketAt(1500, 180), P.pos, R));
// kütle: kalkış kütlesinin oranı (fly() ile aynı varsayım)
const SL = ROCKETS.SLS1.ascent.veh, q0 = massState(SL, 0), q1 = massState(SL, 64), q2 = massState(SL, 130), q3 = massState(SL, 400);
check('massState: kalkışta 1, yanma boyunca azalır, kademe arası süzülmede yanan kademe yok, sonra ikinci kademe', q0.frac === 1 && q0.si === 0 && q0.left === 1 && q1.frac < 1 && q1.left > 0.4 && q1.left < 0.6
  && q2.si === -1 && q2.left === null && q3.si === 1 && q3.frac < q2.frac, [q0, q1, q2, q3].map((x) => x.frac.toFixed(3)).join(' '));
check('roketlerin kalkış kütlesi (gösterge için): gerçek roketlerde var, Genel kademede yok', ['SATURN_V', 'SLS1', 'F9', 'FH', 'VULCAN'].filter((k) => ROCKETS[k]).every((k) => ROCKETS[k].ascent.veh.m0 > 300) && !ROCKETS.GENEL.ascent.veh.m0);
check('otomatik hız: kalkış ×1, ayrılma ×2, arada ×10', autoWarp(5, false) === 1 && autoWarp(165, true) === 2 && autoWarp(300, false) === 10);
const s0 = shake('pad', -1), s1 = shake('pad', 1, { thr: 1, dist: 0.16 }), s2 = shake('pad', 60, { thr: 1, dist: 0.16 }), m1 = Math.hypot(...s1), m2 = Math.hypot(...s2);
check('sarsıntı: ateşlemeden önce yok, kalkışta var (< 6 m), zamanla söner', Math.hypot(...s0) === 0 && m1 > 0 && m1 < 0.006 && m2 < m1 * 0.05, `${(m1 * 1000).toFixed(2)} m → ${(m2 * 1000).toFixed(3)} m`);
check('sarsıntı deterministik', JSON.stringify(shake('onboard', 12.3, { q: 20000 })) === JSON.stringify(shake('onboard', 12.3, { q: 20000 })));
const tl = timeline(SV.events, mq, SV.tIns);
check('zaman çizgisi sıralı, Max-Q ve yörüngeyi içerir', tl[0].name === 'Max-Q' && tl[tl.length - 1].kind === 'orbit' && tl.every((e, i) => !i || e.t >= tl[i - 1].t));
const sc = sceneSrc(), Sky = fs.readFileSync(new URL('../lib/addons/objects/Sky.js', import.meta.url), 'utf8');
check('Sky eklentisi (three r170) yamalanacak satırları içerir', Sky.includes('gl_Position.z = gl_Position.w; // set z to camera.far') && Sky.includes('gl_FragColor = vec4( retColor, 1.0 );') && Sky.includes('vec3 direction = normalize( vWorldPosition - cameraPosition );'));
check('scene.js: kalkışta Sky, alev ışığı, bulut ve çekimler bağlı', /skyMaterial\(\)/.test(sc) && /plumeLight/.test(sc) && /new LaunchSmoke\(/.test(sc) && /shot === 'onboard'/.test(sc) && /shot === 'air'/.test(sc));
check('ascentview: yer izleme yerde kalır (takip kamerasına karışmaz), sanal takip kamerası yok; kamera yerleri launchcam.js SITES', !/shot === 'chase'/.test(sc) && !/\(h - 1\.5\) \/ 3/.test(sc) && /siteEye\(Pd, SITES\.track\)/.test(sc) && /siteEye\(Pd, SITES\.air\)/.test(sc) && /fovFit\(span, dG, 1\.0, 50\)/.test(sc));
check('ascentview: gökyüzü kameranın irtifasıyla (yer kamerası roket yükseldikçe siyah gökyüzü görmesin); tele kameralar alevi ölçer (koyu gökyüzü); uzak alev en az 10 piksel',
  /this\._skyFor\(camH, camSunUp, o\.sunDir, \[camUpV\.x, camUpV\.y, camUpV\.z\], tele \? 0\.16 : 1\)/.test(sc) && /skyGain\.value = 0\.8 \* expo/.test(sc) && /\* 10 \/ H \/ 2/.test(sc) && !/A\.sky\.scale\.setScalar\(Math\.max\(80, 1\.3 \* Math\.sqrt\(2 \* 6378 \* Math\.max\(0\.3, o\.h\)/.test(sc));
check('ascentview: izleme hatası görüş açısıyla sınırlı (dar açıda roket kadrajdan çıkmaz)', /const maxA = 0\.18 \* fov/.test(sc) && /aimLag\(e, mid, 0\.2, fov\)/.test(sc) && /aimLag\(g, tG, 0\.35, fov\)/.test(sc));
check('surfaceview: rampa zemini yalnız kameranın gördüğü yeri kapsıyorsa; değilse küre ve yüzey parçaları (uzaktan kara küre + kare olmaz)', /groundCovers\(eyeE, padP\.pos, E\.R_E\)/.test(sc) && /AG\.mesh\.visible = padGround/.test(sc));
const ap = fs.readFileSync(new URL('../js/ascentplay.js', import.meta.url), 'utf8'), uiSrc = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8'), html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check('bant T± görev saatiyle (sol üst gösterge, fmtDur ile aynı yuvarlama) aynı; görüş kamera yerlerinden hesaplanır; "gerçek uçuşta" yalnız eski (ölçekli) tasarımda',
  /updTele\(real, met, h, vRel/.test(ap) && /Math\.floor\(Math\.abs\(met\)\)/.test(ap) && /scaled \? `\$\{this\.rk\.name\} · gerçek uçuşta/.test(ap) && /sight\(siteEye\(padP, SITES\.track\)/.test(ap));
// canlandırma gerçek zamanlı: tasarım roketin kendi giriş süresini kullanır (görev saati = roketin uçuş saati)
const dsrc = fs.readFileSync(new URL('../js/design.js', import.meta.url), 'utf8');
const { ascentTime } = await import('../js/design.js');
check('tasarım: fırlatma → giriş süresi roketin gerçek giriş zamanı (genel kademe 600 s: hazır tasarımlar değişmez)',
  /tIns = tc \+ ascentTime\(K\.ROCKET\)/.test(dsrc) && ascentTime(null) === 600 && ROCKETS.GENEL.ascent.tIns === 600 && ['SATURN_V', 'SLS1', 'F9', 'FH', 'VULCAN'].every((k) => ascentTime(k) === ROCKETS[k].ascent.tIns),
  ['SATURN_V', 'SLS1', 'F9'].map((k) => `${k} ${ascentTime(k)} s`).join(', '));
check('gösterge yakıt satırı: yanan / sıradaki / son kademe (index.html "<ad> yakıtı")', /stage: burning \? 'Yanan kademe' : after \? 'Son kademe' : 'Sıradaki kademe'/.test(ap) && /setText\(H\.propName, A\.stage\)/.test(uiSrc) && /<span id="propName">Yakıt<\/span> yakıtı/.test(html));
check('bant: uçlara yakın olay etiketleri bandın içine hizalanır', /edge = px > 80 \? ' at-r' : px < 20 \? ' at-l' : ''/.test(ap));
check('gösterge kalkışta roketin değerleri: yere göre hız, yaklaşık kütle, yanan kademenin yakıtı, itki; UTC başlıkta bir kez', /const A = s\.asc, vRel = A \? A\.spd/.test(uiSrc) && /A \? 'yere göre'/.test(uiSrc) && /'≈ ' \+ fmt\(A\.m, 0\)/.test(uiSrc) && /replace\(\/ UTC\$\/, ''\)/.test(uiSrc) && /asc = \{ spd: vRel/.test(ap));
check('bant kontrol çubuğunun üstünde kalır (çubuk uzarsa yükselir); kamera düğmeleri gerçek kameralar', /new ResizeObserver\(\(\) => this\.placeTele\(\)\)\.observe\(this\.bar\)/.test(ap) && /data-ascam="air"/.test(html) && !/data-ascam="chase"/.test(html));
import { execFileSync } from 'child_process';
import { sceneSrc } from './scenesrc.js';
for (const f of ['scene.js', 'ascentplay.js', 'launchfx.js', 'launchcam.js']) { let ok = true; try { execFileSync(process.execPath, ['--check', new URL('../js/' + f, import.meta.url).pathname], { stdio: 'pipe' }); } catch (e) { ok = false; } check(`${f}: sözdizimi geçerli`, ok); }
console.log(fail ? `\n${fail} denetim BAŞARISIZ` : '\nTüm denetimler geçti'); process.exit(fail ? 1 : 0);
