// 3B model otomasyonu (docs/model_otomasyonu.md): otomatik katalog birleşir, elle yazılanlar önceliklidir; iş akışı PR açar, main'e yazmaz
import fs from 'fs';
import { MODELS, modelFor } from '../js/satcatalog.js';
import { OTO } from '../js/satcatalog_oto.js';
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
let fail = 0; const check = (n, ok, x = '') => { console.log((ok ? 'TAMAM ' : 'HATA  ') + n + (x ? ' — ' + x : '')); if (!ok) fail++; };
check('satcatalog_oto.js: models ve byId; her kayıt boyutlu ve kaynaklı', OTO && typeof OTO.models === 'object' && typeof OTO.byId === 'object'
  && Object.values(OTO.models).every((m) => m.size > 0 && m.title && m.kaynak && m.src === 'nasa3d'), `${Object.keys(OTO.models).length} otomatik model`);
check('otomatik modeller katalogda; NORAD eşlemesi modele gider', Object.keys(OTO.models).every((k) => MODELS[k]) && Object.entries(OTO.byId).every(([id, k]) => !MODELS[k] || modelFor(+id) !== null));
check('elle yazılan kayıt önceliklidir (ISS otomatik kayıtla ezilmez)', modelFor(25544).key === 'iss');
check('eslesme.json geçerli: klasör → NORAD listesi ya da null', Object.entries(JSON.parse(rd('../../tools/model/eslesme.json'))).every(([k, v]) => k.startsWith('_') || v === null || (Array.isArray(v) && v.every((n) => Number.isInteger(n)))));
const wf = rd('../../.github/workflows/modeller.yml');
check('iş akışı: aylık + elle; DAMIT ve uydu; testler; PR (main\'e doğrudan yazmaz)', /cron: '23 4 2 \* \*'/.test(wf) && /workflow_dispatch/.test(wf) && /damit\.mjs --indir/.test(wf) && /uydu\.mjs/.test(wf) && /npm test/.test(wf) && /pr\.mjs/.test(wf) && !/git push[^\n]*main/.test(wf + rd('../../tools/model/pr.mjs')));
const pkg = JSON.parse(rd('../../tools/model/package.json'));
check('araç bağımlılıkları ayrı ve sabit sürümlü (siteye girmez)', Object.values(pkg.dependencies).every((v) => /^\d+\.\d+\.\d+$/.test(v)) && fs.existsSync(new URL('../../tools/model/package-lock.json', import.meta.url)) && !JSON.parse(rd('../../package.json')).dependencies);
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
