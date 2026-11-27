// tarihçe olayları: kaydın kendi verisinden (SBDB keşif ve gözlem aralığı, CAD yakın geçişleri, Sentry, GCAT fırlatma) ve elle derlenmiş
// görev olaylarından (data/events.json; sayfa içe aktarıp verir: Node testleri JSON içe aktaramaz) tek bir zaman sırası. Her olay: { date (ISO gün), prec, kind, text, src, mission?, future }
import { t, num, sig } from './i18n.js';
import { AU_KM, LD_AU } from './jpl.js';
import { missionEvents } from './missions.js';

const odds = (lang, ip) => num(lang, Math.round(1 / ip), 0);
function finish(list, today) {
  return list.filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((e) => ({ ...e, future: e.date > today }));
}
// görev olayları data/missions.json'dan (hedef JPL gösterimiyle eşlenir: katalogdaki her cisim için çalışır)
export function asteroidEvents(o, lang, today, missions) {
  const H = t(lang).hist, ev = [], d = o.discovery, so = o.solution || {};
  if (d && d.date) ev.push({ date: d.date, kind: 'disc', text: H.disc(d.who, d.location), src: H.src.sbdb });
  if (so.first) ev.push({ date: so.first, kind: 'obs', text: H.firstObs(!!(d && d.date && so.first < d.date)), src: H.src.sbdb });
  if (so.last) ev.push({ date: so.last, kind: 'obs', text: H.lastObs, src: H.src.sbdb });
  if (so.date && so.id) ev.push({ date: so.date, kind: 'data', text: H.solution(so.id, num(lang, so.nObs, 0)), src: H.src.sbdb });
  // yakın geçişler: geçmişte 0,05 au'dan yakın olanların en yakın dördü; gelecekte 0,05 au'dan yakın ilk ikisi
  const close = (o.approaches || []).filter((c) => c.dist < 0.05), past = close.filter((c) => c.date.slice(0, 10) <= today), next = close.filter((c) => c.date.slice(0, 10) > today);
  for (const c of [...past].sort((a, b) => a.dist - b.dist).slice(0, 4)) ev.push({ date: c.date.slice(0, 10), kind: 'ca', text: H.ca(sig(lang, c.dist, 3), num(lang, c.dist / LD_AU, 1)), src: H.src.cad });
  for (const c of next.slice(0, 2)) ev.push({ date: c.date.slice(0, 10), kind: 'ca', text: H.caNext(sig(lang, c.dist, 3), num(lang, c.dist / LD_AU, 1)), src: H.src.cad });
  const s = o.sentry;
  if (s && s.status === 'removed' && s.removed) ev.push({ date: s.removed, kind: 'risk', text: H.sentryOut, src: H.src.sentry });
  if (s && s.status === 'listed' && s.computed) ev.push({ date: s.computed, kind: 'risk', text: H.sentryIn(odds(lang, s.ip)), src: H.src.sentry });
  ev.push(...missionEvents(o.des, lang, missions));
  return finish(ev, today);
}
export function satEvents(s, lang, today, events) {
  const H = t(lang).hist, ev = [], G = s.gcat;
  if (G && G.launch && G.launch.date) ev.push({ date: G.launch.date.iso, time: G.launch.date.time, kind: 'launch', text: H.launch(G.launch.vehicle, G.launch.site), src: H.src.gcat });
  if (G && G.sdate && G.launch && G.launch.date && G.sdate.iso !== G.launch.date.iso) ev.push({ date: G.sdate.iso, time: G.sdate.time, kind: 'data', text: H.sep, src: H.src.gcat });
  if (G && G.ddate && /^(R|D|L|AR)$/.test(G.status || '')) ev.push({ date: G.ddate.iso, kind: 'end', text: H.reentry, src: H.src.gcat });
  for (const m of (events.satellites[s.id] || [])) ev.push({ date: m.date, prec: m.prec, kind: m.kind, text: m[lang] || m.en, mission: m.mission, src: H.src.mission });
  if (s.epoch) ev.push({ date: s.epoch.slice(0, 10), kind: 'data', text: H.elements(num(lang, s.derived.perigee, 0), num(lang, s.derived.apogee, 0)), src: H.src.gp });
  return finish(ev, today);
}
export const hasCurated = (events, kind, id) => !!(events[kind] && events[kind][id] && events[kind][id].length);
