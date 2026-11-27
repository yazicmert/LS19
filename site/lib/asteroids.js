// asteroit verisi (scripts/asteroitler.mjs üretir): JPL SBDB + LS19 şekil modeli kataloğu
import data from '../data/asteroids.json';

export const RETRIEVED = data.retrieved;
export const OBJECTS = data.objects;
export const CAD = data.cad;                                                // yakın geçiş sorgusu: { maxAu, range, body }
export const byId = (id) => OBJECTS.find((o) => o.id === id) || null;
const AU_KM = 149597870.7;
export const auKm = (au) => (au == null ? null : au * AU_KM);
// LS19'da asteroit saptırma deneyi bu cisim hedefken (labtext.js LINK_KEYS: hedef = SBDB des)
export const ls19Link = (base, o) => `${base}/?mode=lab&exp=saptirma&hedef=${encodeURIComponent(o.des)}`;
// ana sayfadaki aramaya giden küçük kayıt (istemciye yalnız bu gider)
export const lookupRecord = (o) => ({
  id: o.id, name: o.name, des: o.des, number: o.number, cls: o.orbitClass, neo: o.neo, pha: o.pha,
  a: o.elements.a, e: o.elements.e, i: o.elements.i, per: o.elements.per, moid: o.moid, D: o.phys.diameter, rot: o.phys.rotPer, method: o.model.method,
});
export { matchObjects } from './asteroids-match.js';
// dizin tablosu ve süzgeçleri için ince kayıt (istemciye yalnız bu gider; yakın geçişler ve belirsizlikler gitmez)
export const tableRecord = (o) => ({
  id: o.id, number: o.number, name: o.name, des: o.des, fullname: o.fullname, neo: o.neo, pha: o.pha, orbitClass: o.orbitClass,
  elements: { a: o.elements.a, e: o.elements.e, i: o.elements.i }, phys: { diameter: o.phys.diameter }, moid: o.moid,
  model: { method: o.model.method }, sentry: o.sentry ? o.sentry.status : null,
});
