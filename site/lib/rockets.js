// roket verisi (scripts/roketler.mjs üretir): GCAT ölçüleri, kademeleri ve fırlatma kaydı
import data from '../data/rockets.json';
import { matchRocket } from './rockets-match.js';

export const RK_RETRIEVED = data.retrieved;
export const RK_UPDATED = data.updated;
export const RK_SINCE = data.since;
export const ROCKETS = data.vehicles;
const NAMES = ROCKETS.map((v) => v.name);
export const rocketBySlug = (slug) => ROCKETS.find((v) => v.slug === slug) || null;
// Launch Library 2 araç adından roket sayfası (yoksa null)
export const rocketForLL2 = (name) => { const n = matchRocket(name, NAMES); return n ? ROCKETS.find((v) => v.name === n) : null; };
export const rate = (v) => (v.stats.total ? v.stats.success / v.stats.total : null);
// dizin tablosu için ince kayıt (fırlatma listesi gitmez)
export const rocketRecord = (v) => ({ slug: v.slug, name: v.name, family: v.family, maker: v.manufacturer, length: v.spec.length, leo: v.spec.leo, total: v.stats.total, success: v.stats.success, failure: v.stats.failure, first: v.stats.first, last: v.stats.last });
