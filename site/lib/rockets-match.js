// roket adları: GCAT LV_Type → sayfa adresi; Launch Library 2 araç adı (ör. "Long March 6A", "Falcon 9 Block 5") → GCAT adı.
// LL2 ile GCAT farklı adlandırır (Çin roketleri pinyin, kademe/blok ekleri); eşleme: takma ad tablosu, sonra bloğu atılmış ad, sonra önek.
import { norm } from './search.js';

export const rocketSlug = (name) => norm(name.replace(/\//g, ' ').replace(/\+/g, 'plus')).replace(/[^a-z0-9]/g, '') || 'x';
const ALIAS = [
  [/^long march /i, 'Chang Zheng '], [/^kinetica[- ]?1$/i, 'Lijian-1'], [/^kinetica[- ]?2$/i, 'Lijian-2'], [/^ceres[- ]?1$/i, 'Gushenxing 1'], [/^ceres[- ]?2$/i, 'Gushenxing 2'],
  [/^kuaizhou /i, 'Kuaizhou-'], [/^vega-c$/i, 'Vega C'], [/^soyuz 2\.1a$/i, 'Soyuz-2-1A'], [/^soyuz 2\.1b$/i, 'Soyuz-2-1B'], [/^soyuz 2\.1v$/i, 'Soyuz-2-1V'],
  [/^angara a5$/i, 'Angara-A5'], [/^angara 1\.2$/i, 'Angara-1.2'], [/^gravity-1$/i, 'Yinli-1'], [/^jielong-3 \(smart dragon 3\)$/i, 'Jielong-3'], [/^smart dragon 3$/i, 'Jielong-3'],
  [/^new glenn$/i, 'New Glenn 7x2'], [/^starship$/i, 'Starship V3'], [/^falcon 9( block 5| full thrust| v1\.[12])?$/i, 'Falcon 9'], [/^falcon heavy$/i, 'Falcon Heavy'],
  [/^hyperbola-1$/i, 'Shuang Quxian 1'], [/^zhuque-2e?$/i, (m) => (/e$/i.test(m) ? 'Zhuque-2E' : 'Zhuque-2')], [/^h3-(\d\d[a-z])$/i, (m) => m.toUpperCase()],
];
// names: GCAT adları (rockets.json); dönüş: eşleşen GCAT adı ya da null
export function matchRocket(ll2Name, names) {
  if (!ll2Name) return null;
  const set = new Map(names.map((n) => [norm(n), n]));
  let cand = String(ll2Name).trim();
  for (const [re, to] of ALIAS) if (re.test(cand)) { cand = typeof to === 'function' ? to(cand) : cand.replace(re, to); break; }
  const tries = [cand, cand.replace(/ block \d+$/i, ''), cand.replace(/-/g, ' '), cand.replace(/ /g, '-')];
  for (const t of tries) if (set.has(norm(t))) return set.get(norm(t));
  const k = norm(cand), pre = names.filter((n) => norm(n).startsWith(k));
  return pre.length === 1 ? pre[0] : null;
}
