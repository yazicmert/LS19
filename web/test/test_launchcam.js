// Kalkış yayını kurgusu (launchcam.js) ve bağlantıları: cd web && node test/test_launchcam.js
import fs from 'fs';
import { directShot, onboardWindows, autoWarp, shake, timeline } from '../js/launchcam.js';
import { ROCKETS } from '../js/rockets.js';
let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const SV = ROCKETS.SATURN_V.ascent, mq = { t: 83 };
const at = (met, h) => directShot({ met, h, events: SV.events, maxQ: mq }).shot;
check('kurgu sırası (Saturn V): geniş → rampa → yer izleme → takip', at(-8, 0) === 'wide' && at(0, 0) === 'pad' && at(10, 0.3) === 'track' && at(60, 8) === 'chase', [at(-8, 0), at(0, 0), at(10, 0.3), at(60, 8)].join(' '));
check('Max-Q ve S-IC ayrılmasında araç üstü kamera; ayrılma yavaş çekim', at(85, 12) === 'onboard' && at(165, 66) === 'onboard' && directShot({ met: 165, h: 66, events: SV.events, maxQ: mq }).slow && at(300, 150) === 'chase');
const sep = directShot({ met: 165, h: 66, events: SV.events, maxQ: mq });
check('ayrılmada kamera üst kademede (kesme + 12 m)', sep.mount === 42.1 + 12);
for (const [id, r] of Object.entries(ROCKETS)) if (r.ascent) {
  const w = onboardWindows(r.ascent.events, { t: 80 }); let ok = true; for (let i = 1; i < w.length; i++) if (w[i].t0 < w[i - 1].t1 - 1e-9) ok = false;
  check(`${id}: araç üstü pencereler çakışmaz ve yörüngeden önce biter`, ok && w.every((x) => x.t1 <= r.ascent.tIns + 20));
}
check('kullanıcı seçimi kurguyu geçersiz kılar', directShot({ met: 0, h: 0, events: SV.events, maxQ: mq, user: 'chase' }).shot === 'chase' && directShot({ met: 200, h: 80, events: SV.events, maxQ: mq, user: 'onboard' }).mount === 54.1);
check('otomatik hız: kalkış ×1, ayrılma ×2, arada ×10', autoWarp(5, false) === 1 && autoWarp(165, true) === 2 && autoWarp(300, false) === 10);
const s0 = shake('pad', -1), s1 = shake('pad', 1, { thr: 1, dist: 0.16 }), s2 = shake('pad', 60, { thr: 1, dist: 0.16 }), m1 = Math.hypot(...s1), m2 = Math.hypot(...s2);
check('sarsıntı: ateşlemeden önce yok, kalkışta var (< 6 m), zamanla söner', Math.hypot(...s0) === 0 && m1 > 0 && m1 < 0.006 && m2 < m1 * 0.05, `${(m1 * 1000).toFixed(2)} m → ${(m2 * 1000).toFixed(3)} m`);
check('sarsıntı deterministik', JSON.stringify(shake('onboard', 12.3, { q: 20000 })) === JSON.stringify(shake('onboard', 12.3, { q: 20000 })));
const tl = timeline(SV.events, mq, SV.tIns);
check('zaman çizgisi sıralı, Max-Q ve yörüngeyi içerir', tl[0].name === 'Max-Q' && tl[tl.length - 1].kind === 'orbit' && tl.every((e, i) => !i || e.t >= tl[i - 1].t));
const sc = sceneSrc(), Sky = fs.readFileSync(new URL('../lib/addons/objects/Sky.js', import.meta.url), 'utf8');
check('Sky eklentisi (three r170) yamalanacak satırları içerir', Sky.includes('gl_Position.z = gl_Position.w; // set z to camera.far') && Sky.includes('gl_FragColor = vec4( retColor, 1.0 );') && Sky.includes('vec3 direction = normalize( vWorldPosition - cameraPosition );'));
check('scene.js: kalkışta Sky, alev ışığı, bulut ve çekimler bağlı', /skyMaterial\(\)/.test(sc) && /plumeLight/.test(sc) && /new LaunchSmoke\(/.test(sc) && /shot === 'onboard'/.test(sc));
import { execFileSync } from 'child_process';
import { sceneSrc } from './scenesrc.js';
for (const f of ['scene.js', 'ascentplay.js', 'launchfx.js', 'launchcam.js']) { let ok = true; try { execFileSync(process.execPath, ['--check', new URL('../js/' + f, import.meta.url).pathname], { stdio: 'pipe' }); } catch (e) { ok = false; } check(`${f}: sözdizimi geçerli`, ok); }
console.log(fail ? `\n${fail} denetim BAŞARISIZ` : '\nTüm denetimler geçti'); process.exit(fail ? 1 : 0);
