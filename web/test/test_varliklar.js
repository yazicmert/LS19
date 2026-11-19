// Ağır varlıklar GitHub Release'te (varliklar.json, tools/varliklar.mjs, docs/varliklar.md): bildirim tutarlı, git'e girmiyorlar, herkes indiriyor
import fs from 'fs';
import { GRUPLAR } from '../../tools/varliklar.mjs';
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
let fail = 0; const check = (name, ok, extra = '') => { console.log((ok ? 'TAMAM ' : 'HATA  ') + name + (extra ? ' — ' + extra : '')); if (!ok) fail++; };
const b = JSON.parse(rd('../../varliklar.json')), pk = b.paketler, gi = rd('../../.gitignore');
check('bildirim: beş paket, adlar içerik özetli (<grup>-<12 hane>.tar), cekirdek siteye gitmez',
  GRUPLAR.every((g) => pk[g.ad] && new RegExp(`^${g.ad}-[0-9a-f]{12}\\.tar$`).test(pk[g.ad].ad) && pk[g.ad].site === g.site) && pk.cekirdek.site === false);
const all = Object.values(pk).flatMap((p) => Object.entries(p.dosyalar));
check('her dosya web/ altında, 64 haneli SHA-256 özetiyle; yol kaçışı yok', all.length > 400 && all.every(([p, h]) => p.startsWith('web/') && !p.split('/').includes('..') && /^[0-9a-f]{64}$/.test(h)), `${all.length} dosya`);
check('her dosya kendi grubunun klasöründe ve deseninde', GRUPLAR.every((g) => Object.keys(pk[g.ad].dosyalar).every((p) => p.startsWith(g.kok + '/') && g.desen.test(p.split('/').pop()))));
check('.gitignore varlıkları dışarıda tutar', ['/web/textures/', '/web/data/eph/v1/*.bin', '/web/models/sats/*.glb.gz', '/web/models/ast/*.glb', '/web/models/ast/damit/*.bin.gz', '/web/data/de440s.bsp', '.varliklar/'].every((x) => gi.includes(x)));
check('indirenler: Vercel derlemesi (--site), CI (denetim, gecmis), npm run varliklar, sunucu.py ve Docker',
  /varliklar\.mjs indir --site/.test(rd('../../vercel.json')) && /varliklar\.mjs indir/.test(rd('../../.github/workflows/denetim.yml')) && /varliklar\.mjs indir/.test(rd('../../.github/workflows/gecmis.yml'))
  && /"varliklar": "node tools\/varliklar\.mjs indir"/.test(rd('../../package.json')) && /def varliklari_hazirla/.test(rd('../sunucu.py')) && /sunucu\.py --varliklar/.test(rd('../../Dockerfile')));
check('uydu modelleri .glb.gz: tarayıcı gzip imzasına bakıp DecompressionStream ile açar',
  /fetchGlb\(`models\/sats\/\$\{key\}\.glb\.gz`\)/.test(rd('../js/satmodels.js')) && /buf\[0\] === 0x1f && buf\[1\] === 0x8b/.test(rd('../js/satmodels.js')));
check('sunucu.py paketten yalnız web/ altındaki düz dosyaları çıkarır', /m\.isfile\(\) or not m\.name\.startswith\('web\/'\) or '\.\.' in m\.name\.split\('\/'\)/.test(rd('../sunucu.py')));
console.log(fail ? `\n${fail} HATA` : '\nTAMAM'); process.exit(fail ? 1 : 0);
