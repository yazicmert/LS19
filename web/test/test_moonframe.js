// Ay PA -> ME sabit dönüşümünün yönü ve büyüklüğü (Node): cd web && node test/test_moonframe.js
// Kaynak: NAIF moon_de440_*.tf (TKFRAME AXES 3,2,1; ANGLES 67,8526″ 78,6944″ 0,2785″; "MOON_ME ile MOON_PA arası ≈ 0,02886° ≈ 875 m").
// Bağımsız ikinci uygulama: Skyfield planetarylib (TKFRAME matrisi = rot_x(c)·rot_y(b)·rot_z(a), rot_* etkin dönüşler; Skyfield bu yönle
// Ay yüzeyindeki bir noktayı HORIZONS'a 101 m içinde uydurur). Eski LS19 açıları ters işaretle uyguluyordu (1,75 km sapma).
import * as E from '../js/engine.js';
import { SITE_LAT, SITE_LON, siteMe } from '../js/mission.js';

let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && !!c; };
const as = [67.8526, 78.6944, 0.2785].map((a) => (a / 3600) * Math.PI / 180);
// Skyfield'ın etkin (vektör) dönüşleri
const rx = (t) => { const c = Math.cos(t), s = Math.sin(t); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const ry = (t) => { const c = Math.cos(t), s = Math.sin(t); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rz = (t) => { const c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const sky = E.mm(E.mm(rx(as[2]), ry(as[1])), rz(as[0]));                 // Skyfield build_frame: matrix = rot(angle)·matrix, açılar sırayla
const M = E.meMatrix([67.8526, 78.6944, 0.2785]);
const maxd = (A, B) => Math.max(...A.flatMap((r, i) => r.map((x, j) => Math.abs(x - B[i][j]))));
check(maxd(M, sky) < 1e-15, `PA -> ME matrisi Skyfield'ın SPICE TKFRAME uygulamasıyla aynı (en büyük fark ${maxd(M, sky).toExponential(1)})`);
const ang = (A) => Math.acos(Math.min(1, (A[0][0] + A[1][1] + A[2][2] - 1) / 2));
const deg = ang(M) * 180 / Math.PI, m = ang(M) * 1737.4e3;
check(Math.abs(deg - 0.02886) < 5e-5 && Math.abs(m - 875) < 3, `PA ile ME arası ${deg.toFixed(5)}° ≈ ${m.toFixed(0)} m (NAIF: ≈ 0,02886°, ≈ 875 m)`);
const old = E.mm(E.mm(E.mT(rx(as[2])), E.mT(ry(as[1]))), E.mT(rz(as[0])));      // eski (ters işaretli) uygulama
check(Math.abs(ang(E.mm(old, E.mT(M))) * 1737.4e3 - 1750) < 5, `eski uygulama doğrusundan ${(ang(E.mm(old, E.mT(M))) * 1737.4e3).toFixed(0)} m sapıyordu (2 × 875 m)`);
// motor ME'yi bu matrisle kurar: ICRF -> ME = M · (ICRF -> PA)
E.loadEphemeris(JSON.parse((await import('fs')).readFileSync(new URL('../data/rocsim_eph_2026Q4.json', import.meta.url))));
const t = 1200000, got = E.moonIcrfToMe(t), want = E.mm(sky, E.moonIcrfToPa(t));
check(maxd(got, want) < 1e-15, 'motor (tablo efemerisi): moonIcrfToMe = Skyfield PA->ME · ICRF->PA');
// Apollo 11 iniş yeri: ME enlem/boylamı (0,67409° K, 23,47298° D) ME çerçevesine birebir döner
const s = siteMe(), lat = Math.asin(s[2]), lon = Math.atan2(s[1], s[0]);
check(Math.abs(lat - SITE_LAT) < 1e-15 && Math.abs(lon - SITE_LON) < 1e-15, 'iniş yeri ME koordinatlarında (Apollo 11: 0,67409° K, 23,47298° D)');
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
