// Bulut (Vercel) veri işlevlerinin sınaması: kaynak yanıtları yerel dosyalardan taklit edilir; biçim, sıkıştırma ve
// yerel sunucuyla (sunucu.py compact_sbdb) aynı çıktı denetlenir. Kullanım: node test/test_api.js [taklit veri klasörü]
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { execFileSync } from 'child_process';
const dir = process.argv[2] || new URL('./fixtures/', import.meta.url).pathname;
const file = (f) => fs.readFileSync(dir + f, 'utf8');
const seenUA = {};
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); let body;
  seenUA[new URL(u).host] = opts.headers && opts.headers['User-Agent'];
  if (u.includes('thespacedevs.com') && u.includes('/upcoming/')) body = file('ll2_upcoming.json');
  else if (u.includes('thespacedevs.com') && u.includes('/previous/')) body = file('ll2_previous.json');
  else if (u.includes('rocketlaunch.live')) body = file('rll_next.json');
  else if (u.includes('sbdb_query') && u.includes('sb-group=neo')) body = file('sb_neo.json');
  else if (u.includes('sbdb_query')) body = file('sb_mb.json');
  else if (u.includes('sentry.api')) body = file('sentry.json');
  else if (u.includes('sup-gp.php')) body = file('sup_iss.json');
  else if (u.includes('sbdb.api')) body = file('sbdb_99942.json');
  else if (u.includes('celestrak')) body = file('gp_active.json');
  else return new Response('yok', { status: 404 });
  return new Response(body, { status: 200 });
};
const call = async (mod, q = '') => {
  const m = await import(`../../api/${mod}.js`), r = await m.GET(new Request('https://ls19.example/api/' + mod + q));
  const buf = Buffer.from(await r.arrayBuffer()), txt = r.headers.get('content-encoding') === 'gzip' ? gunzipSync(buf).toString() : buf.toString();
  return { status: r.status, cc: r.headers.get('cache-control'), hk: r.headers.get('x-ls19-kaynak'), size: buf.length, raw: txt.length, j: JSON.parse(txt) };
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
check(/github\.com\/yazicmert\/LS19/.test(seenUA['celestrak.org'] || ''), 'CelesTrak isteği iletişim adresli User-Agent taşır: ' + seenUA['celestrak.org']);
const sg = await call('supgp', '?file=iss'); check(sg.status === 200 && Array.isArray(sg.j) && sg.j[0].DATA_SOURCE, `supgp iss: ${sg.j.length} kayıt`);
const sgb = await call('supgp', '?file=../etc'); check(sgb.status === 400, 'geçersiz SupGP dosyası 400');
// CelesTrak engellerse GitHub kopyasına düşme
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { const u = String(url); if (u.includes('celestrak')) return new Response('Forbidden', { status: 403 });
  if (u.includes('raw.githubusercontent.com') && u.endsWith('gp_active.json')) return new Response(file('gp_active.json'));
  if (u.includes('raw.githubusercontent.com') && u.endsWith('meta.json')) return new Response(JSON.stringify({ t: Date.now() - 3600e3 }));
  return realFetch(url); };
const gm = await call('gp', '?group=active&v=x'); check(gm.status === 200 && Array.isArray(gm.j) && /GitHub/.test(decodeURIComponent(gm.hk || '')), 'CelesTrak 403 → GitHub kopyası');
globalThis.fetch = realFetch;
const sv = await call('surum'); check(sv.j.mod === 'bulut' && sv.j.kaynaklar.gp.surum === Math.floor(Date.now() / 7.2e6), 'surum kovaları');
check(sv.j.kaynaklar.launch && sv.j.kaynaklar.launch.aralik_s === 1800 && sv.j.kaynaklar.launch.surum === Math.floor(Date.now() / 1.8e6), 'surum: fırlatma kataloğu 30 dk kovası');
// fırlatma kataloğu: LL2 (yaklaşan + geçmiş), LL2 alınamazsa RocketLaunch.Live, ikisi de yoksa 503
const la = await call('launches');
check(la.status === 200 && la.j.kod === 'll2' && la.j.yaklasan.length === 5 && la.j.gecmis.length === 3, `launches: LL2, ${la.j.yaklasan.length} yaklaşan (NET'siz kayıt atlandı), ${la.j.gecmis.length} geçmiş`);
check(la.j.yaklasan.every((l, i, a) => !i || a[i - 1].net <= l.net) && la.j.gecmis.every((l, i, a) => !i || a[i - 1].net >= l.net), 'yaklaşan artan, geçmiş azalan sırada');
const lu = Object.fromEntries(la.j.yaklasan.map((l) => [l.id, l])), lp = Object.fromEntries(la.j.gecmis.map((l) => [l.id, l]));
check(lu['u-1'].kesinlik === 'sn' && lu['u-2'].kesinlik === 'sa' && lu['u-3'].kesinlik === 'ay' && lu['u-4'].kesinlik === 'dk' && lu['u-5'].kesinlik === 'ceyrek', 'T-0 kesinliği kimlikten (M = ay, MIN = dakika)');
check(lu['u-1'].durum === 'go' && lu['u-2'].durum === 'tbc' && lu['u-3'].durum === 'tbd' && lu['u-4'].durum === 'bekleme' && lp['p-1'].durum === 'basarisiz' && lp['p-3'].durum === 'kismi', 'durum kodları');
check(lu['u-1'].gorev === 'Starlink Ornek 1' && lu['u-1'].roket === 'Falcon 9 Block 5' && lu['u-1'].rampaId === 16 && lu['u-1'].enlem === 34.632 && lu['u-1'].canli && lu['u-1'].pencere.length === 2, 'görev, roket, rampa, pencere');
check(lu['u-2'].gorev === 'Unknown Payload' && lu['u-2'].yorunge === null && lu['u-3'].yorunge === null && lu['u-5'].rampa === null, 'eksik görev/rampa ve "N/A" yörünge');
check(lp['p-2'].cospar === '2026-246' && lp['p-3'].kesinlik === 'dk', 'COSPAR kodu; kesinliği olmayan geçmiş fırlatma dakika');
const d1 = lu['u-1'].d;
check(d1 && d1.roket.toplam === 644 && d1.roket.tekrar === true && d1.itici[0].seri === 'B1103' && d1.itici[0].ucus === 7 && d1.itici[0].inis.yer === 'OCISLY' && d1.itici[0].inis.mesafe === 574 && !('basari' in d1.itici[0].inis), 'ayrıntı: roket istatistiği, itici, bekleyen iniş');
check(d1.yayin.length === 2 && d1.yayin[0].resmi === true && d1.yayin[0].u.startsWith('https://x.com') && d1.yayin.every((v) => v.u.startsWith('https://')) && Array.from(d1.yayin[1].b).length === 90 && d1.yayin[1].b.endsWith('…'), 'canlı yayın: resmî önce, yalnız https, başlık 90 karakter');
check(Array.from(d1.aciklama).length === 700 && d1.musteri.length === 3 && d1.program[0] === 'Starlink' && d1.olasilik === 80 && d1.sayac.yil === 262 && d1.son.m.startsWith('Now targeting'), 'açıklama kırpılır, müşteri en çok 3, olasılık, sayaçlar, son güncelleme');
check(lp['p-2'].d.itici[0].inis.basari === true && lp['p-1'].d.hata && !lu['u-3'].d.roket, 'geçmiş: iniş başarılı, başarısızlık nedeni; normal kipte boş alanlar atlanır');
check(/s-maxage=1800/.test(la.cc) && /Launch Library 2/.test(decodeURIComponent(la.hk || '')), 'CDN 30 dk, kaynak başlığı');
check(/github\.com\/yazicmert\/LS19/.test(seenUA['ll.thespacedevs.com'] || ''), 'LL2 isteği de iletişim adresli User-Agent taşır');
const fetchOk = globalThis.fetch;
globalThis.fetch = async (url, o) => (String(url).includes('thespacedevs.com') ? new Response('Too Many Requests', { status: 429 }) : fetchOk(url, o));
const lr = await call('launches');
check(lr.status === 200 && lr.j.kod === 'rll' && lr.j.kaynak === 'Data by RocketLaunch.Live' && lr.j.yaklasan.length === 3 && lr.j.gecmis.length === 0 && /s-maxage=600/.test(lr.cc), 'LL2 429 → RocketLaunch.Live (10 dk önbellek)');
const rl = Object.fromEntries(lr.j.yaklasan.map((l) => [l.id, l]));
check(rl['rll-6261'].durum === 'tbd' && rl['rll-6261'].kesinlik === 'dk' && rl['rll-6261'].gorev === 'Ornek Yuk' && rl['rll-6300'].kesinlik === 'ay' && rl['rll-6257'].yer === 'Vandenberg SFB, California, United States', 'RocketLaunch.Live: sonuç yok ≠ başarısız, pencere, tahmini ay, yer');
globalThis.fetch = async (url, o) => (/thespacedevs|rocketlaunch/.test(String(url)) ? new Response('yok', { status: 503 }) : fetchOk(url, o));
const lf = await call('launches'); check(lf.status === 503 && /Fırlatma verisi alınamadı/.test(lf.j.hata), 'iki kaynak da yoksa 503');
globalThis.fetch = fetchOk;
// yerel sunucuyla aynı biçim
const py = execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'.'); import sunucu as S; print(json.dumps(S.compact_sbdb([json.load(open('${dir}sb_neo.json'))]), separators=(',',':')))`], { cwd: new URL('..', import.meta.url).pathname, maxBuffer: 1e9 }).toString();
const pyc = JSON.parse(py), jc = neo.j.cols;
let diff = 0;
for (const k of Object.keys(jc)) for (let i = 0; i < jc[k].length; i += 97) { const a = jc[k][i], b = pyc[k][i]; if (!(a === b || (typeof a === 'number' && Math.abs(a - b) <= 1e-9 * Math.abs(a)))) diff++; }
check(diff === 0, `sunucu.py ile aynı sütunlar (fark: ${diff})`);
// fırlatma kataloğu: sunucu.py ile aynı biçim (LL2 ve RocketLaunch.Live)
for (const [kod, a, b] of [['ll2', 'll2_upcoming.json', 'll2_previous.json'], ['rll', 'rll_next.json', null]]) {
  const fx = (f) => JSON.parse(file(f)), up = kod === 'll2' ? fx(a).results : fx(a).result, prev = b ? fx(b).results : [];
  const pyCat = execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'.'); import sunucu as S; f=json.load(open('${dir}${a}')); u=f['results'] if '${kod}'=='ll2' else f['result']; p=json.load(open('${dir}${b}'))['results'] if '${b}'!='null' else []; print(json.dumps(S.build_launch_catalog('${kod}',u,p,1)))`],
    { cwd: new URL('..', import.meta.url).pathname }).toString();
  const { buildCatalog } = await import('../js/launchdata.js');
  check(JSON.stringify(JSON.parse(pyCat)) === JSON.stringify(buildCatalog(kod, up, prev, 1)), `fırlatma kataloğu (${kod}): sunucu.py ile aynı`);
}
console.log(ok ? 'TAMAM' : 'HATA'); process.exit(ok ? 0 : 1);
