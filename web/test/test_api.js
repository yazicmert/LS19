// Bulut (Vercel) veri işlevlerinin sınaması: kaynak yanıtları yerel dosyalardan taklit edilir; biçim, sıkıştırma ve
// yerel sunucuyla (sunucu.py compact_sbdb) aynı çıktı denetlenir. Kullanım: node test/test_api.js [taklit veri klasörü]
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { execFileSync } from 'child_process';
const dir = process.argv[2] || new URL('./fixtures/', import.meta.url).pathname;
const file = (f) => fs.readFileSync(dir + f, 'utf8');
globalThis.fetch = async (url) => {
  const u = String(url); let body;
  if (u.includes('sbdb_query') && u.includes('sb-group=neo')) body = file('sb_neo.json');
  else if (u.includes('sbdb_query')) body = file('sb_mb.json');
  else if (u.includes('sentry.api')) body = file('sentry.json');
  else if (u.includes('sbdb.api')) body = file('sbdb_99942.json');
  else if (u.includes('celestrak')) body = file('gp_active.json');
  else return new Response('yok', { status: 404 });
  return new Response(body, { status: 200 });
};
const call = async (mod, q = '') => {
  const m = await import(`../../api/${mod}.js`), r = await m.GET(new Request('https://ls19.example/api/' + mod + q));
  const buf = Buffer.from(await r.arrayBuffer()), txt = r.headers.get('content-encoding') === 'gzip' ? gunzipSync(buf).toString() : buf.toString();
  return { status: r.status, cc: r.headers.get('cache-control'), size: buf.length, raw: txt.length, j: JSON.parse(txt) };
};
let ok = true;
const check = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); ok = ok && c; };
const neo = await call('asteroids', '?set=neo');
check(neo.status === 200 && neo.j.n === neo.j.cols.a.length && neo.j.n === JSON.parse(file('sb_neo.json')).data.length, `asteroids neo: ${neo.j.n} cisim, gzip ${(neo.size / 1e6).toFixed(2)} MB (ham ${(neo.raw / 1e6).toFixed(2)} MB) < 4,5 MB`);
check(neo.size < 4.5e6, 'Vercel yanıt sınırının altında');
check(/s-maxage=86400/.test(neo.cc), 'CDN önbelleği 24 sa: ' + neo.cc);
const mb = await call('asteroids', '?set=mb'); check(mb.status === 200 && mb.j.n > 0, `asteroids mb: ${mb.j.n}`);
const bad = await call('asteroids', '?set=x'); check(bad.status === 400, 'geçersiz küme 400');
const se = await call('sentry'); check(se.status === 200 && se.j.n > 0 && se.j.data[0].des, `sentry: ${se.j.n}`);
const sb = await call('sbdb', '?des=99942'); check(sb.status === 200 && sb.j.orbit && sb.j.object, 'sbdb 99942');
const sbBad = await call('sbdb', '?des=' + encodeURIComponent('<script>')); check(sbBad.status === 400, 'geçersiz tanım 400');
const gp = await call('gp', '?group=active'); check(gp.status === 200 && Array.isArray(gp.j) && gp.j.length > 0 && gp.size < 4.5e6, `gp: ${gp.j.length} uydu, gzip ${(gp.size / 1e6).toFixed(2)} MB`);
check(/s-maxage=7200/.test(gp.cc), 'CelesTrak için 2 sa önbellek');
const sv = await call('surum'); check(sv.j.mod === 'bulut' && sv.j.kaynaklar.gp.surum === Math.floor(Date.now() / 7.2e6), 'surum kovaları');
// yerel sunucuyla aynı biçim
const py = execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'.'); import sunucu as S; print(json.dumps(S.compact_sbdb([json.load(open('${dir}sb_neo.json'))]), separators=(',',':')))`], { cwd: new URL('..', import.meta.url).pathname, maxBuffer: 1e9 }).toString();
const pyc = JSON.parse(py), jc = neo.j.cols;
let diff = 0;
for (const k of Object.keys(jc)) for (let i = 0; i < jc[k].length; i += 97) { const a = jc[k][i], b = pyc[k][i]; if (!(a === b || (typeof a === 'number' && Math.abs(a - b) <= 1e-9 * Math.abs(a)))) diff++; }
check(diff === 0, `sunucu.py ile aynı sütunlar (fark: ${diff})`);
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
