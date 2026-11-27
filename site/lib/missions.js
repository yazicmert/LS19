// asteroitlere giden uzay araçları (data/missions.json; sayfalar içe aktarıp verir: Node testleri JSON içe aktaramaz).
// Hedefler JPL birincil gösterimiyle (des) eşlenir: şekil modelli 33 cismin sayfası da kataloğun istekle üretilen sayfası da aynı veriyi kullanır.
import { t } from './i18n.js';

const ROLE_ORDER = ['sample', 'impact', 'orbit', 'rendezvous', 'flyby'];
// bir hedefteki görevin durumu: planlanan (henüz bir şey olmadı), sürüyor, tamamlandı
export function visitStatus(tg, today) {
  const done = tg.events.filter((e) => e.kind !== 'planned' && e.date <= today), ahead = tg.events.filter((e) => e.kind === 'planned' || e.date > today);
  return !done.length ? 'planned' : tg.ongoing || ahead.length ? 'active' : 'done';
}
// bu cisme giden görevler, ilk olay sırasıyla: { mission, target, status, first, last, closest }
export function missionsFor(des, M, today) {
  const out = [];
  for (const m of M.missions) for (const tg of m.targets) {
    if (tg.des !== des) continue;
    const ds = tg.events.map((e) => e.date).sort(), km = tg.events.filter((e) => e.km != null).map((e) => e.km);
    out.push({ mission: m, target: tg, status: visitStatus(tg, today), first: ds[0], last: ds[ds.length - 1], closest: km.length ? Math.min(...km) : null });
  }
  return out.sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}
// tarihçe olayları: hedefteki olaylar ve (ana hedefse) fırlatma
export function missionEvents(des, lang, M) {
  const H = t(lang).hist, ev = [];
  for (const m of M.missions) for (const tg of m.targets) {
    if (tg.des !== des) continue;
    if (tg.primary && m.launch) ev.push({ date: m.launch, kind: 'launch', text: H.mLaunch(m.name), mission: m.name, src: H.src.mission });
    for (const e of tg.events) ev.push({ date: e.date, prec: e.prec, kind: e.kind, text: e[lang] || e.en, mission: m.name, src: H.src.mission });
  }
  return ev;
}
export const visitedDes = (M) => [...new Set(M.missions.flatMap((m) => m.targets.map((tg) => tg.des)))];
// katalog sayfası için: ziyaret edilen her cisim bir kez, ilk ziyaret sırasıyla; görevleri ve en "derin" işi (örnek > çarpma > yörünge > buluşma > geçiş)
export function visitIndex(M, today) {
  const by = new Map();
  for (const m of M.missions) for (const tg of m.targets) {
    const r = by.get(tg.des) || { des: tg.des, name: tg.name || tg.des, missions: [], roles: new Set(), first: '9999', status: 'planned' };
    const st = visitStatus(tg, today), first = tg.events.map((e) => e.date).sort()[0];
    r.missions.push(m.name); r.roles.add(tg.role); if (first < r.first) r.first = first;
    if (st !== 'planned') r.status = r.status === 'active' || st === 'active' ? 'active' : 'done';
    by.set(tg.des, r);
  }
  return [...by.values()].map((r) => ({ ...r, role: ROLE_ORDER.find((x) => r.roles.has(x)), roles: undefined }))
    .sort((a, b) => (a.status === 'planned') - (b.status === 'planned') || (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}
// veri denetimi (testler ve derleme): kimlik tekil, tarih ISO, iki dilde metin, rol bilinen, gösterim geçerli
export const ROLES = ROLE_ORDER;
export function checkMissions(M) {
  const bad = [], ids = new Set(), iso = /^\d{4}-\d\d-\d\d$/;
  for (const m of M.missions) {
    if (!m.id || ids.has(m.id)) bad.push(`kimlik: ${m.id}`); ids.add(m.id);
    if (!m.name || !m.agency || !iso.test(m.launch || '') || !m.en || !m.tr) bad.push(`künye: ${m.id}`);
    if (m.url != null && !/^https:\/\//.test(m.url)) bad.push(`adres: ${m.id}`);
    for (const tg of m.targets || []) {
      if (!/^[0-9A-Za-z][0-9A-Za-z /-]*$/.test(tg.des || '') || !tg.name || !ROLE_ORDER.includes(tg.role) || !tg.events || !tg.events.length) bad.push(`hedef: ${m.id}/${tg.des}`);
      for (const e of tg.events || []) if (!iso.test(e.date) || !e.en || !e.tr || !e.kind || (e.prec && !/^(day|month|year)$/.test(e.prec)) || (e.km != null && !(e.km > 0)) || e.date < m.launch) bad.push(`olay: ${m.id}/${tg.des}/${e.date}`);
    }
  }
  return bad;
}
