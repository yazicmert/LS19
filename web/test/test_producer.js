// Yapımcı masası (fragman kurgusu) doğrulaması (Node 20+): cd web && node test/test_producer.js
//  1) normalize: varsayılan, bozuk girdi, seçenek listeleri, tempo sınırı, metin süzgeci (denetim/yön karakterleri, kod noktası sınırı), boş fragman olmaz
//  2) paylaşım: diff/encodeCut/decodeCut gidiş-dönüş (Türkçe, emoji), varsayılan en kısa, bozuk/uzun/yanlış bağlantı → null
//  3) bölüm grupları buildShots'un her çekimini kapsar (altı olay kümesi × kalkışlı/kalkışsız), kimlikler tekil
//  4) applyCut: varsayılan kurgu çekimleri değiştirmez; kapatılan bölüm çıkar, ardındaki çekim afterCut; uzunluk; kamera (doğru cisim); metinler; anlatıcı bölümde bir kez
//  5) hazır kurgular: metinler korunur, presetOf tanır, kendine eşit
//  6) güvenlik ve bağlantılar: bindirmede kaçışlama, masada kullanıcı metni innerHTML'e girmez; film dokusu post.js ile, müzik ruhları, cinema.js yakalama ve app.js bağlantısı
//  7) yazı, yerleşim, renk düzeni, geçiş ve özel kamera: süzgeç, LVLH dönüşümü ve hareketler, hazır açılar, CSS değişkenleri ve konum kuralları, önizleme bağlantıları
import fs from 'fs';
import { register } from 'node:module';
register('./importmap_loader.mjs', import.meta.url);
const P = await import('../js/producer.js');
const C = await import('../js/cinema.js');
const AU = await import('../js/cineaudio.js');

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- 1) normalize
{
  const d = P.normalize({});
  check('normalize({}) varsayılan kurgudur; her bölüm açık, yönetmenin kamerası, normal uzunluk', eq(d, JSON.parse(JSON.stringify(P.DEFAULT_CUT))) && P.GROUPS.every((g) => d.ch[g.k].on && d.ch[g.k].cam === 'auto' && d.ch[g.k].len === 'normal'));
  const junk = [null, undefined, 42, 'x', [], [1, 2], { ch: 'x' }, { ch: [1] }, { tempo: 'çok' }];
  check('bozuk girdi → varsayılan (hata yok)', junk.every((j) => eq(P.normalize(j), d)));
  const x = P.normalize({ tempo: 9, aspect: 185, film: 'neon', accent: 'ice', mood: 'disco', strip: 'evet', voice: false, extra: 1, ch: { tli: { on: false, cam: 'drone', len: 'long', hack: 1 }, nope: { on: false } } });
  check('seçenekler listeden (bilinmeyen → varsayılan), tempo [0,5; 2], sayı olarak gelen kadraj, bilinmeyen anahtarlar atılır',
    x.tempo === 2 && P.normalize({ tempo: 0.1 }).tempo === 0.5 && P.normalize({ tempo: 1.234 }).tempo === 1.25 && x.aspect === '185' && x.film === 'normal' && x.accent === 'ice' && x.mood === 'gizem' && x.strip === true && x.voice === false
    && !('extra' in x) && !('nope' in x.ch) && x.ch.tli.on === false && x.ch.tli.cam === 'auto' && x.ch.tli.len === 'long' && !('hack' in x.ch.tli));
  const t = P.cleanText('  A‮B\u0000\n\tC​ D  ', 99), e = P.cleanText('🚀'.repeat(30), P.MAX.title);
  check('metin süzgeci: denetim, sıfır genişlikli ve yön değiştiren karakterler boşluğa, boşluklar teke, uçlar kırpılır; sınır kod noktasıyla (emoji bölünmez)', t === 'A B C D' && [...e].length === P.MAX.title && e === '🚀'.repeat(P.MAX.title) && P.cleanText(5, 9) === '');
  const long = P.normalize({ title: 'x'.repeat(500), ch: { pdi: { narr: 'y'.repeat(999) } } });
  check('metin uzunlukları sınırlı (fragman adı, anlatıcı notu)', long.title.length === P.MAX.title && long.ch.pdi.narr.length === P.MAX.narr);
  const none = P.normalize({ ch: Object.fromEntries(P.GROUPS.map((g) => [g.k, { on: false }])) });
  check('bütün bölümler kapatılırsa temas ve kapanış kalır (boş fragman olmaz)', P.GROUPS.filter((g) => none.ch[g.k].on).map((g) => g.k).join() === 'land,outro');
}

// ---------------------------------------------------------------- 2) paylaşım bağlantısı
{
  const cut = P.normalize({ title: 'Ayşe’nin Ay’ı 🌙', producer: 'Çağrı & Ekip <3', over: "Ödev \"fragmanı\"", tempo: 1.4, accent: 'rose', mood: 'umut', tags: false, ch: { park: { on: false }, tli: { cam: 'orbit', narr: 'İşte şimdi: <b>TLI</b>!' }, outro: { title: 'BAŞARDIK', sub: 'Ğ ü ş ı ö ç' } } });
  const s = P.encodeCut(cut), back = P.decodeCut(s);
  check('kurgu → bağlantı → kurgu birebir (Türkçe, emoji, HTML işaretleri); bağlantı base64url', eq(back, cut) && /^[A-Za-z0-9_-]+$/.test(s), `${s.length} karakter`);
  check('varsayılan kurgu en kısa bağlantı ({}), isDefault', P.encodeCut(P.normalize({})) === 'e30' && P.isDefault({}) && !P.isDefault(cut) && eq(P.decodeCut('e30'), P.normalize({})));
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const bad = ['', '!!!', 'a b', 'x'.repeat(30000), b64('nope'), b64('[1,2]').length ? null : 0, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]).toString('base64url'), 42];
  check('bozuk bağlantı → null (geçersiz karakter, çok uzun, JSON değil, geçersiz UTF-8, dize değil); dizi JSON varsayılana süzülür',
    bad.filter((v) => v !== null).every((v) => P.decodeCut(v) === null) && eq(P.decodeCut(b64([1, 2])), P.normalize({})));
  const big = P.normalize({ title: 'Ş'.repeat(99), over: 'ğ'.repeat(99), producer: 'ü'.repeat(99), ch: Object.fromEntries(P.GROUPS.map((g) => [g.k, { title: 'İ'.repeat(99), sub: 'ö'.repeat(199), narr: 'ç'.repeat(399), cam: 'ots', len: 'long' }])) });
  const bs = P.encodeCut(big);
  check('en uzun kurgu da bağlantıya sığar ve çözülür', eq(P.decodeCut(bs), big), `${bs.length} karakter`);
}

// ---------------------------------------------------------------- 3) bölüm grupları ↔ çekim listesi
{
  const full = { INS: 0, TLI: 6000, SEP: 6600, LOI: 300000, SEP2: 330000, PDI: 340000, INDI: 340700 };
  const sets = [full, { INS: 0, TLI: 6000 }, { INS: 0, TLI: 6000, SEP: 6600 }, { INS: 0, TLI: 6000, SEP: 6600, LOI: 300000 }, { ...full, SEP2: undefined }, { INS: 0, TLI: 6000, SEP: 6600, LOI: 300000, PDI: 340000, INDI: 340700 }];
  let ok = true, why = '';
  for (const S of sets) for (const ascent of [false, true]) { const Q = Object.fromEntries(Object.entries(S).filter(([, v]) => v != null)); for (const s of C.buildShots(Q, { ascent })) if (!P.GROUP_OF[s.id]) { ok = false; why += ` ${s.id}`; } }
  const ids = P.GROUPS.flatMap((g) => g.ids);
  check('her çekim bir bölüme bağlı (altı olay kümesi × kalkışlı/kalkışsız); kimlikler tekil; kalkış ayrı bölüm', ok && new Set(ids).size === ids.length && P.GROUPS[0].k === 'asc' && P.GROUPS[0].ids.length === 0, why.trim());
  const shots = C.buildShots(full, {}), chap = P.GROUPS.filter((g) => g.ids.some((id) => { const s = shots.find((q) => q.id === id); return s && (s.chapter || s.card || s.closing); }));
  check('her görüntülü bölümün (kalkış dışı) kartlı ya da kapanış çekimi var', chap.length === P.GROUPS.length - 1, chap.map((g) => g.k).join());
}

// ---------------------------------------------------------------- 4) applyCut
{
  const full = { INS: 0, TLI: 6000, SEP: 6600, LOI: 300000, SEP2: 330000, PDI: 340000, INDI: 340700 }, base = C.buildShots(full, {});
  const same = P.applyCut(base, P.normalize({}));
  check('varsayılan kurgu: aynı çekimler, aynı süreler ve kameralar; afterCut yok', same.length === base.length && same.every((s, i) => s.id === base[i].id && s.dur === base[i].dur && s.rig === base[i].rig && s.rigs === base[i].rigs && !s.afterCut && !s.narr));
  check('applyCut özgün çekim nesnelerini değiştirmez', base.every((s) => !('grp' in s) && !('afterCut' in s)));
  const cut = P.normalize({ ch: { park: { on: false }, sep: { on: false }, llo: { on: false }, coast: { cam: 'ots', len: 'short' }, tli: { cam: 'close', title: 'ATEŞ!', sub: 'benim alt yazım', narr: 'Not' }, open: { title: 'BAŞLA' } } });
  const out = P.applyCut(base, cut), id = (k) => out.find((s) => s.id === k);
  check('kapatılan bölümlerin çekimleri çıkar; ardından gelen ilk çekim afterCut taşır (yakalama), ötekiler taşımaz',
    !out.some((s) => ['park-wide', 'park-close', 'sep', 'llo'].includes(s.id)) && id('tli-ignite').afterCut && id('coast-a').afterCut && id('sep2').afterCut && !id('tli-burn').afterCut && !id('coast-b').afterCut && !id('open').afterCut);
  check('uzunluk: kısa ×0,6 (yolculuk çekimleri)', ['coast-a', 'coast-b', 'coast-c'].every((k) => Math.abs(id(k).dur - base.find((s) => s.id === k).dur * 0.6) < 1e-9));
  check('kamera: omuz üstü yolculukta Dünya arkada, Ay\'a yaklaşmada (coast-c) Ay arkada; yakın plan LVLH; çok düzenekli çekimde tek düzenek',
    id('coast-a').rig.type === 'ots' && id('coast-a').rig.body === 'E' && id('coast-c').rig.body === 'M' && id('tli-ignite').rig.type === 'lvlh' && !id('tli-ignite').rigs && id('tli-burn').rig.type === 'lvlh');
  const rigSrc = rd('../js/cinema.js');
  check('kamera seçenekleri yönetmenin düzeneklerinden (RIG) biri', P.OPT.cam.filter((c) => c !== 'auto').every((c) => { const r = P.camRig(c, 'E', P.normalize({}).ch.tli); return r && (new RegExp(`\\n  ${r.type}\\(c, p, e\\)`).test(rigSrc) || new RegExp(`\\nRIG\\.${r.type} = \\(c, p, e\\)`).test(rigSrc)); }) && P.camRig('auto') === null);
  check('metin: bölüm başlığı ve alt yazısı (kullanıcı işaretli), açılış kartı başlığı; anlatıcı notu bölümün ilk çekiminde bir kez',
    id('tli-ignite').chapter.title === 'ATEŞ!' && id('tli-ignite').chapter.user && id('tli-ignite').chapter.sub === 'benim alt yazım' && id('tli-ignite').chapter.userSub && id('open').card.title === 'BAŞLA' && id('open').card.user
    && id('tli-ignite').narr === 'Not' && !id('tli-burn').narr && typeof base.find((s) => s.id === 'tli-ignite').chapter.sub === 'function');
  const g = P.applyCut(base, P.normalize({ title: 'FİLMİM' }));
  check('fragman adı, kalkışsız açılış kartının başlığı olur', g.find((s) => s.id === 'open').card.title === 'FİLMİM');
  const onlyLand = P.applyCut(base, P.normalize({ ch: Object.fromEntries(P.GROUPS.map((q) => [q.k, { on: ['land', 'outro'].includes(q.k) }])) }));
  check('yalnız temas ve kapanış: iki çekim, ilki (durum güdümlü) yakalanır', onlyLand.map((s) => s.id).join() === 'touchdown,outro' && onlyLand[0].afterCut && onlyLand[0].wf);
}

// ---------------------------------------------------------------- 5) hazır kurgular
{
  const mine = P.normalize({ title: 'X', producer: 'Y', ch: { tli: { title: 'T', narr: 'N' } } });
  let ok = true;
  for (const k of Object.keys(P.PRESETS)) { const c = P.applyPreset(mine, k); if (c.title !== 'X' || c.producer !== 'Y' || c.ch.tli.title !== 'T' || c.ch.tli.narr !== 'N' || P.presetOf(c) !== k || !eq(P.normalize(c), c)) { ok = false; } }
  check('hazır kurgular: metinler korunur, presetOf tanır, süzgeçten geçmiş', ok);
  check('yönetmenin kurgusu = varsayılan yapı; kısa kurgu bölüm kapatır ve tempoyu düşürür; saf görüntü grafikleri ve anonsları kapatır',
    P.presetOf({}) === 'director' && P.applyPreset({}, 'short').tempo < 1 && !P.applyPreset({}, 'short').ch.park.on && P.applyPreset({}, 'silent').strip === false && P.applyPreset({}, 'silent').voice === false && P.presetOf({ tempo: 1.9 }) === null);
}

// ---------------------------------------------------------------- 6) güvenlik, görünüm, ses ve bağlantılar
{
  check('esc: HTML özel karakterleri kaçışlanır', P.esc(`<img src=x onerror="a('b')">&`) === '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  const ui = rd('../js/cinemaui.js'), desk = rd('../js/producerui.js');
  check('cinemaui.js: kart başlığı, alt yazısı, üst satırı ve jenerik kaçışlanır; anlatıcı notu textContent',
    /\$\{esc\(c\.title\)\}/.test(ui) && /\$\{esc\(c\.sub\)\}/.test(ui) && /\$\{esc\(c\.over\)\}/.test(ui) && /\$\{esc\(k\)\}/.test(ui) && /\$\{esc\(v\)\}/.test(ui) && /c\.textContent = text/.test(ui));
  const inner = [...desk.matchAll(/innerHTML = ([^;]+);/g)].map((m) => m[1]).filter((v) => v.trim() !== 'html');       // iconBtn yardımcısı: html yalnız aşağıdaki sabit çağrılardan
  const iconCalls = [...desk.matchAll(/iconBtn\(([^,]+), ([^,]+),/g)].map((m) => m[2]);
  check('producerui.js: innerHTML yalnız sabit simge işaretlemesi (kullanıcı metni textContent/value ile); simge düğmesi yardımcısına yalnız sabit işaretleme geçer',
    inner.length > 0 && inner.every((v) => /^'[^'$]*'$/.test(v.trim())) && iconCalls.length > 0 && iconCalls.every((v) => /^'<i data-icon="[a-z]+"><\/i>'$/.test(v.trim())) && (desk.match(/innerHTML = html/g) || []).length === 1, [...inner, ...iconCalls].join(' | '));
  const post = rd('../js/post.js'), m = /vignette: \{ value: ([\d.]+) \}, grain: \{ value: ([\d.]+) \}, chroma: \{ value: ([\d.]+) \}/.exec(post);
  check('film dokusu: "normal" post.js\'in özgün değerleri; artan sırada (yok < hafif < normal < yoğun); kademe değişince yeniden uygulanır',
    !!m && P.FILM_LOOK.normal.vignette === +m[1] && P.FILM_LOOK.normal.grain === +m[2] && P.FILM_LOOK.normal.chroma === +m[3]
    && ['vignette', 'grain', 'chroma'].every((k) => P.FILM_LOOK.off[k] < P.FILM_LOOK.light[k] && P.FILM_LOOK.light[k] < P.FILM_LOOK.normal[k] && P.FILM_LOOK.normal[k] < P.FILM_LOOK.strong[k]) && /this\.applyLook\(\);/.test(post));
  const moods = P.OPT.mood.filter((x) => x !== 'off');
  check('müzik ruhları: her biri 8 akor, dört artan ses, 50–700 Hz; bilinmeyen ruh gizeme düşer',
    moods.every((md) => AU.MOODS[md] && AU.MOODS[md].length === 8 && AU.MOODS[md].every((_, i) => { const f = AU.chordFreqs(i, md); return f.length === 4 && f.every((x, k) => x > 50 && x < 700 && (k === 0 || x > f[k - 1])); })) && eq(AU.chordFreqs(3, 'yok'), AU.chordFreqs(3)));
  check('vurgu renkleri ve seçenekler eşleşir', P.OPT.accent.every((a) => /^#[0-9a-f]{6}$/i.test(P.ACCENTS[a])) && P.OPT.film.every((f) => P.FILM_LOOK[f]) && P.OPT.len.every((l) => P.LEN_K[l] > 0));
  const cin = rd('../js/cinema.js'), app = rd('../js/app.js'), html = rd('../index.html'), css = rd('../css/cinema.css');
  check('cinema.js: kurgu uygulanır (applyCut), afterCut durum güdümlü çekimi de yakalar, ileri besleme süre ölçeğini bir kez sayar, sesler kurguya bağlı',
    /applyCut\(buildShots\(/.test(cin) && /\(s\.afterCut && gap > 60\)/.test(cin) && /ff = dT \/ dur;/.test(cin) && !/1 \/ this\.opts\.scale/.test(cin) && /new CineAudio\(\{ mood: this\.cut\.mood, sfx: this\.cut\.sfx \}\)/.test(cin) && /this\.cut\.ch\.asc\.on/.test(cin) && /\|\| !this\.cut\.cues\) return;/.test(cin));
  check('app.js: masa (ProducerDesk), film düğmesi masayı açar, C doğrudan oynatır, Y masa (klavyeyle: animasyonsuz), paylaşılan kurgu #kurgu= ile (decodeCut)',
    /new ProducerDesk\(/.test(app) && /\$\('#btnCine'\)\.onclick = \(\) => \{ if \(cinema\.on\) cinema\.stop\(\); else openDesk\(\); \}/.test(app) && /k === 'c'\) \{ pushLayer\('cine'\); playCine\(\); \}/.test(app) && /k === 'y'\) openDesk\(\{ key: true \}\)/.test(app) && /location\.hash\.slice\(1\)\)\.get\('kurgu'\)/.test(app) && /decodeCut\(hk\)/.test(app));
  check('index.html: producer.css bağlı; cinema.css: kadraj seçenekleri (1,85:1, tam ekran), grafik gizleme, sahne atlama levhası',
    /css\/producer\.css/.test(html) && /\.cine\[data-ar="185"\]/.test(css) && /\.cine\[data-ar="full"\] > \* \{ --bar: 0px; \}/.test(css) && /\.cine\.hide-strip \.cine-strip/.test(css) && /\.cine-slate \{/.test(css) && !/rgba\(255, 179, 92/.test(css));
}
// ---------------------------------------------------------------- 7) yazı, yerleşim, renk, geçiş ve özel kamera
{
  const x = P.normalize({ hFont: 'comic', tFont: 'cinzel', hSize: 9, tSize: '0.83', hWeight: 'black', track: 'wide', upper: 'no', ink: 'gold', shade: 'strong', cardPos: 'xx', titlePos: 'top', closePos: 'c', cuePos: 'tc', bugPos: 'off', chNum: false, hold: 0.04, grade: 'teal',
    ch: { pdi: { cam: 'custom', cAz: 999, cEl: -90, cDist: 1, cFov: 50.4, cMove: 'spin', cYaw: '7', cShake: 2, pos: 'tr', trans: 'flash' }, llo: { pos: 'none', trans: 'zap' } } });
  check('yazı ve yerleşim süzgeci: bilinmeyen yazı tipi/konum → varsayılan, boyut ve kart süresi sınırda ve adımda, mantıksal alanlar yalnız true/false',
    x.hFont === 'exo' && x.tFont === 'cinzel' && x.hSize === 1.6 && x.tSize === 0.85 && x.hWeight === 'normal' && x.track === 'wide' && x.upper === true && x.ink === 'gold' && x.shade === 'strong'
    && x.cardPos === 'bl' && x.titlePos === 'top' && x.closePos === 'c' && x.cuePos === 'tc' && x.bugPos === 'off' && x.chNum === false && x.hold === 0.5 && x.grade === 'teal');
  const c = x.ch.pdi;
  check('özel kamera süzgeci: açı, yükseklik, uzaklık, görüş açısı, kaydırma ve titreşim aralıkta; bilinmeyen hareket → varsayılan; bölüm kartı konumu ve geçiş listeden',
    c.cAz === 180 && c.cEl === -30 && c.cDist === 12 && c.cFov === 50 && c.cMove === 'left' && c.cYaw === 7 && c.cShake === 1 && c.pos === 'tr' && c.trans === 'flash' && x.ch.llo.pos === 'none' && x.ch.llo.trans === 'auto');
  const base = P.normalize({}).ch.tli, rig = (m, o = {}) => P.camRig('custom', 'E', { ...base, cMove: m, ...o });
  const R = Math.PI / 180, near = (a, b) => Math.abs(a - b) < 1e-9;
  const st = rig('none', { cAz: 30, cEl: 20, cDist: 250, cFov: 28, cYaw: -5 });
  check('özel kamera → LVLH düzeneği: derece → radyan, metre → km, görüş açısı ve kadraj kaydırma',
    st.type === 'lvlh' && near(st.az[0], 30 * R) && near(st.az[1], 30 * R) && near(st.el[0], 20 * R) && near(st.dist[0], 0.25) && st.fov[0] === 28 && near(st.yaw, -5 * R) && st.look === 'mid');
  const orb = rig('orbit'), inn = rig('in', { cDist: 20 }), out = rig('out', { cDist: 2900 }), rise = rig('rise', { cEl: 70 }), lft = rig('left'), rgt = rig('right');
  check('kamera hareketleri: tam tur +360°, sola −40°, sağa +40°, yaklaş ×0,55 (en az 12 m), uzaklaş ×1,9 (en çok 3 km), yüksel +30° (en çok 85°)',
    near(orb.az[1] - orb.az[0], 2 * Math.PI) && near(lft.az[1] - lft.az[0], -40 * R) && near(rgt.az[1] - rgt.az[0], 40 * R) && near(inn.dist[1], 0.012) && near(out.dist[1], 3) && near(rise.el[1], 85 * R));
  const types = Object.fromEntries(P.OPT.cam.filter((k) => k !== 'auto').map((k) => [k, P.camRig(k, 'M', base).type]));
  check('hazır kamera açıları: yakın/dönen/tepeden LVLH, omuz üstü (Ay fonda), motor yakın planı gövde çerçevesinde, geniş', types.close === 'lvlh' && types.orbit === 'lvlh' && types.top === 'lvlh' && types.ots === 'ots' && P.camRig('ots', 'M').body === 'M' && types.engine === 'body' && types.wide === 'wideBody' && types.custom === 'lvlh', JSON.stringify(types));
  const full = { INS: 0, TLI: 6000, SEP: 6600, LOI: 300000, SEP2: 330000, PDI: 340000, INDI: 340700 }, shots = C.buildShots(full, {});
  const out2 = P.applyCut(shots, P.normalize({ ch: { tli: { trans: 'flash', pos: 'c', cam: 'custom', cShake: 0.8 }, coast: { trans: 'cut', cam: 'wide' }, loi: { trans: 'fade', cam: 'close' } } })), id = (k) => out2.find((q) => q.id === k);
  check('geçiş yalnız bölümün ilk çekiminde (parlama: kararmasız + parlama, kesme: kararmasız, kararma: kararmalı); kart konumu bölümün bütün çekimlerinde; özel kamera titreşimi',
    id('tli-ignite').flashIn && id('tli-ignite').dip === false && id('tli-burn').flashIn === undefined && id('coast-a').dip === false && !id('coast-a').flashIn && id('coast-b').dip === shots.find((q) => q.id === 'coast-b').dip
    && id('loi-approach').dip === true && id('tli-ignite').cardPos === 'c' && id('tli-burn').cardPos === 'c' && id('tli-ignite').shake === 0.8);
  check('geniş kamera yörünge izini ve ışıltıyı açar (yolculukta dönen çerçeve ve etiketler); yakın kamera izleri ve etiketleri kapatır',
    id('coast-b').lines && id('coast-b').beacon && id('coast-b').syn && id('coast-b').tags && id('loi-approach').lines === false && id('loi-approach').syn === false && id('loi-approach').tags === false);
  const post = rd('../js/post.js');
  const L = P.filmLook(P.normalize({ film: 'strong', grade: 'sepia' }));
  check('renk düzeni: doğal = gölgelendiricinin özgün değerleri; film dokusu ve renk düzeni birleşir; siyah-beyaz ve sepya doygunluksuz; gölgelendiricide doygunluk, renk süzgeci, sepya, ayrım',
    /sat: \{ value: 1 \}/.test(post) && /split: \{ value: 0\.6 \}/.test(post) && /contrast: \{ value: 0\.22 \}/.test(post) && P.GRADE.natural.sat === 1 && P.GRADE.natural.split === 0.6 && P.GRADE.natural.contrast === 0.22 && eq(P.GRADE.natural.tint, [1, 1, 1])
    && L.vignette === P.FILM_LOOK.strong.vignette && L.sepia === 1 && P.GRADE.bw.sat === 0 && /mix\(vec3\(l\), col, sat\)/.test(post) && /\* tint;/.test(post) && /sepia\);/.test(post) && /for \(const k of \['vignette', 'grain', 'chroma', 'sat', 'sepia', 'split', 'contrast'\]\)/.test(post));
  check('yazı tipleri: her seçeneğin CSS yığını var (yedek yazı tipiyle), uzaktan yüklenenler Google Fonts aile biçiminde; yazı renkleri ikişer değer',
    [...P.OPT.hFont, ...P.OPT.tFont].every((k) => P.FONTS[k] && /,/.test(P.FONTS[k].css) && (!P.FONTS[k].g || /^[A-Za-z+]+(:wght@[\d;]+)?$/.test(P.FONTS[k].g))) && P.OPT.ink.every((k) => P.INKS[k] && P.INKS[k].length === 2));
  check('hazır kurgular (destansı dahil) tanınır ve yazı/yerleşimi de kurar', Object.keys(P.PRESETS).every((k) => P.presetOf(P.applyPreset({ title: 'A' }, k)) === k) && P.applyPreset({}, 'epic').hFont === 'cinzel' && P.applyPreset({}, 'epic').ch.tli.cam === 'engine' && P.applyPreset({ ch: { tli: { cAz: 33 } } }, 'epic').ch.tli.cAz === 33);
  const css = rd('../css/cinema.css'), cin = rd('../js/cinema.js'), ui = rd('../js/cinemaui.js'), desk = rd('../js/producerui.js'), app = rd('../js/app.js');
  check('cinema.css: başlık boyutu, yazı tipi, kalınlık, harf aralığı ve büyük harf değişkenlerle; metin yazı tipi ve boyutu; bölüm kartı konumları; başlık/kapanış/alt yazı/köşe işareti konumları; numara gizleme; okunurluk perdesi',
    /\.cc-h \{ margin: 0; font-family: var\(--cine-hf, var\(--font\)\); font-weight: var\(--cine-hw, 600\); font-size: calc\(clamp\(22px, 3\.4cqw, 52px\) \* var\(--cine-k, 1\)\)/.test(css) && /text-transform: var\(--cine-tt, uppercase\)/.test(css)
    && /\.cc-s \{[^}]*calc\(clamp\(11px, 1\.25cqw, 16px\) \* var\(--cine-tk, 1\)\) \/ 1\.6 var\(--cine-tf, var\(--mono\)\)/.test(css) && ['tl', 'tr', 'br', 'bc', 'c'].every((p) => css.includes(`.cine-card.pos-${p}`))
    && /\.cine\[data-title="top"\]/.test(css) && /\.cine\[data-close="c"\]/.test(css) && /\.cine\[data-cue="bl"\]/.test(css) && /\.cine\[data-cue="tc"\]/.test(css) && /\.cine\[data-bug="off"\] \.cine-bug \{ display: none; \}/.test(css) && /\.cine\.no-num \.cc-idx/.test(css) && /calc\(0\.58 \* var\(--cine-shade, 1\)\)/.test(css));
  check('cinemaui.js: görünüm değişkenleri (yazı tipi, boyut, kalınlık, aralık, renk, perde) ve konum öznitelikleri; kart konumu sınıfı; önizleme çubuğu',
    ['--cine-hf', '--cine-tf', '--cine-k', '--cine-tk', '--cine-hw', '--cine-ls', '--cine-tt', '--cine-shade', '--cine-ink-2'].every((v) => ui.includes(`'${v}'`)) && /r\.dataset\.cue = /.test(ui) && /r\.dataset\.bug = /.test(ui) && /pos-' \+ c\.pos/.test(ui) && /previewBar\(o\)/.test(ui));
  check('cinema.js: geniş kamera düzeneği (cisme yakın / sistem), kart konumu ve "kart yok", kart süresi ölçeği, parlama geçişi, yazı tipi yükleme, önizleme masadan (Esc masaya döner, benzetim eski anına sarılır), atlanan sürenin olayları süzülür',
    /RIG\.wideBody = /.test(cin) && /mode: 'SYSTEM'/.test(cin) && /if \(pos === 'none'\) return null;/.test(cin) && /hold \* this\.cut\.hold/.test(cin) && /s\.flashIn && !this\.reduced/.test(cin) && /await loadFonts\(/.test(cin)
    && /this\.opts\.fromDesk === true && this\.h\.openDesk/.test(cin) && /this\.opts\.preview && this\.saved\.t != null/.test(cin) && /e\.t < this\.evFloor/.test(cin));
  check('producerui.js ve app.js: bölüm önizlemesi, özel kamera paneli ve kroki, kart konum seçicisi, sahne maketi; masa önizlemeden olduğu gibi döner',
    /preview\(k\)/.test(desk) && /cameraPanel\(/.test(desk) && /spotPicker\(/.test(desk) && /pd-frame/.test(desk) && /onPreview: \(cut, k\) =>/.test(app) && /if \(o\.back\) \{ desk\.reopen\(\); return; \}/.test(app));
}
// ---------------------------------------------------------------- 8) kullanım kolaylığı: geri al / yinele, değişiklik sayımı
{
  const H = new P.History(3);
  H.record('a', null, 0); H.record('b', 'title', 100); H.record('b2', 'title', 600); H.record('c', 'title', 3000); H.record('d', null, 3100);
  check('geçmiş: aynı alanın 1,5 s içindeki düzenlemeleri tek adım; sınır (en eski düşer); geri al → yinele birebir; yeni değişiklik yineleme listesini siler',
    H.past.join() === 'b,c,d' && H.undo('e') === 'd' && H.undo('d') === 'c' && H.redo('c') === 'd' && H.canRedo && (H.record('x', null, 9000), !H.canRedo) && H.past.length === 3 && new P.History().undo('z') === null);
  const H2 = new P.History(); H2.record('s0', 'cAz', 0); H2.undo('s1'); H2.record('s2', 'cAz', 10);
  const H3 = new P.History(); H3.record('a', 'title', 0, Infinity); H3.record('b', 'title', 9e9, Infinity); H3.seal(); H3.record('c', 'title', 9e9 + 1, Infinity);
  check('geçmiş: geri aldıktan sonra aynı alanın düzenlemesi yeni adım başlatır; masada süre sınırsız birleşir, alandan çıkınca (seal) yeni adım', H2.past.length === 1 && H2.past[0] === 's2' && H3.past.join() === 'a,c');
  const cut = P.normalize({ title: 'X', tempo: 1.5, grade: 'bw', hFont: 'cinzel', cardPos: 'c', ch: { tli: { title: 'T' }, llo: { on: false }, pdi: { cAz: 10 }, sep: { cam: 'custom', cAz: 10 } } });
  const n = P.changedCounts(cut);
  check('değişiklik sayımı: bölümler (yalnız özel kamera seçiliyken kamera değerleri sayılır), isimler, yazılar, görüntü ve ses; varsayılanda hepsi 0',
    n.ch === 3 && n.credits === 1 && n.type === 2 && n.look === 2 && !P.chapterChanged(cut, 'pdi') && P.chapterChanged(cut, 'sep') && Object.values(P.changedCounts({})).every((v) => v === 0), JSON.stringify(n));
  const all = new Set([...P.TAB_FIELDS.credits, ...P.TAB_FIELDS.type, ...P.TAB_FIELDS.look]);
  check('her genel ayar bir sekmeye düşer (rozet sayımı eksiksiz)', Object.keys(P.DEFAULT_CUT).filter((k) => !['v', 'ch'].includes(k)).every((k) => all.has(k)) && all.size === P.TAB_FIELDS.credits.length + P.TAB_FIELDS.type.length + P.TAB_FIELDS.look.length);
  const desk = rd('../js/producerui.js'), cin = rd('../js/cinema.js');
  check('masa (video düzenleyici düzeni): ipucu (bir kez, ? ile yeniden), geri al/yinele ve Ctrl+Z/Ctrl+Y, şablon seçici; zaman çizelgesi (V1 bölüm klipleri, cetvel, A1 müzik; ←/→ ile gezinme) klip seçer, Denetçi o klibin yazılarını, kamerasını, zamanlamasını ve aç/kapa anahtarını gösterir; Program monitörü seçili klibin kartı; buradan oynat, bölümü sıfırla, kaydedildi, sürgüde varsayılana dönüş',
    /INTRO_KEY = 'ls19\.deskIntro'/.test(desk) && /this\.undo\(\)/.test(desk) && /this\.redo\(\)/.test(desk) && /k === 'z' && !e\.shiftKey/.test(desk) && /role', 'switch'/.test(desk) && /b\.onclick = \(\) => this\.selectClip\(info\.k\)/.test(desk) && /ArrowRight: 1, ArrowLeft: -1/.test(desk)
    && /chapterInspector\(info\)/.test(desk) && /buildMonitor\(\)/.test(desk) && /this\.syncMon = \(\) =>/.test(desk) && /'pd-ruler'/.test(desk) && /'pd-audio'/.test(desk) && /this\.tpl\.value = presetOf\(this\.cut\) \|\| 'custom'/.test(desk)
    && /buildStrip\(\)/.test(desk) && /playFrom\(k\)/.test(desk) && /DEFAULT_CH/.test(desk) && /flashSaved\(\)/.test(desk) && /ondblclick/.test(desk) && /estimate\(cut, parts = false\)/.test(cin) && /Esc: vazgeç/.test(cin));
}
// ---------------------------------------------------------------- 9) ayrı pencere eşitlemesi (producersync.js; Node'un BroadcastChannel'ı ile gerçek ileti alışverişi)
{
  const S = await import('../js/producersync.js');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const got = { cut: [], play: [], preview: [], stop: 0 }, popGot = { info: [], cut: [], est: 0, state: [] };
  const main = new S.MainLink({ chapters: () => [{ k: 'tli', name: 'TLI', title: 'T', sub: '', live: false }], cut: () => P.normalize({ title: 'ANA' }), estimate: (c) => ({ total: c.tempo * 100, parts: { tli: 50 } }),
    onCut: (c) => got.cut.push(c), onPlay: (c) => got.play.push(c), onPreview: (c, k) => got.preview.push(k), onStop: () => got.stop++ });
  const other = new S.MainLink({ chapters: () => [], cut: () => P.normalize({ title: 'BAŞKA' }), estimate: () => null, onCut: () => got.cut.push('YANLIŞ'), onPlay: () => {}, onPreview: () => {}, onStop: () => {} });
  const pop = new S.PopLink(main.id, { onInfo: (i) => popGot.info.push(i), onCut: (c) => popGot.cut.push(c), onEst: () => popGot.est++, onState: (st) => popGot.state.push(st), onLost: () => { popGot.lost = true; }, onBack: () => {} });
  await wait(80);
  check('ayrı pencere: selama yalnız bağlandığı LS19 sekmesi yanıt verir (bölümler ve kurgu gelir)', popGot.info.length === 1 && popGot.info[0].cut.title === 'ANA' && pop.chapters[0].k === 'tli' && main.connected);
  pop.send('cut', { cut: { title: 'YENİ', hFont: 'cinzel', zararlı: '<script>' } }); pop.send('play', { cut: { tempo: 0.5 } }); pop.send('preview', { cut: {}, k: 'llo' }); pop.send('stop');
  pop.send('preview', { cut: {}, k: 5 });
  await wait(80);
  check('ayrı pencere → LS19: kurgu (süzülmüş), oynat, önizle, durdur; başka LS19 sekmesi etkilenmez; geçersiz önizleme yok sayılır',
    got.cut.length === 1 && got.cut[0].title === 'YENİ' && got.cut[0].hFont === 'cinzel' && !('zararlı' in got.cut[0]) && got.play[0].tempo === 0.5 && got.preview.join() === 'llo' && got.stop === 1);
  const c1 = P.normalize({ tempo: 1.5 }); pop.estimate(c1, true); pop.estimate(c1, true); await wait(80);
  check('tahmini süre: istek LS19\'da hesaplanır, aynı kurgu için bir kez istenir, yanıt masaya döner', popGot.est === 1 && pop.estimate(c1, true).total === 150 && pop.estimate(c1, false) === 150);
  main.sendCut(P.normalize({ title: 'SAYFA İÇİ' })); main.setState({ on: true, grp: 'pdi' }); await wait(80);
  check('LS19 → ayrı pencere: sayfa içi masanın düzenlemesi ve oynayan bölüm', popGot.cut.length === 1 && popGot.cut[0].title === 'SAYFA İÇİ' && popGot.state.at(-1).grp === 'pdi' && popGot.state.at(-1).on === true);
  main.close(); other.close(); pop.last = Date.now() - 6000; pop.tick(); pop.close();
  check('bağlantı kopması: 5,5 s yanıt yoksa ayrı pencere bilir', popGot.lost === true);
  const cin = rd('../js/cinema.js'), app = rd('../js/app.js'), css = rd('../css/producer.css'), html = rd('../yapimci.html'), pj = rd('../js/yapimci.js'), desk = rd('../js/producerui.js');
  check('canlı uygulama: cinema.liveCut görünümü, yazıyı, rengi, sesi hemen; çekim listesini yeniden kurar (o anki çekimin kamerası ve kartı hemen, τ korunur; kapatılan bölümün çekimi biter, sonraki yakalanır)',
    /liveCut\(cut\) \{/.test(cin) && /this\.ui\.look\(K\)/.test(cin) && /setLook\(filmLook\(K\)\)/.test(cin) && /setMix\(\{ mood: K\.mood, sfx: K\.sfx \}\)/.test(cin) && /this\.shotT \*= nd \/ oldDur/.test(cin) && /fresh\[at\]\.afterCut = true/.test(cin) && /e\.target\.closest\('#cineDesk'\)/.test(cin));
  check('yanaşık masa: fragman oynarken geniş ekranda sağa yanaşır (sahne daralır, kip modal değil), dar ekranda fragman durur; değişiklik canlı uygulanır ve ayrı pencereye gider',
    /dockable = \(\) => matchMedia\('\(min-width: 1100px\) and \(hover: hover\)'\)/.test(app) && /dock: live/.test(app) && /cinema\.liveCut\(cut\)/.test(app) && /link\.sendCut\(cut\)/.test(app) && /body\.pd-docked #app \{ right: var\(--pd-dock\); \}/.test(css) && /aria-modal', String\(!on/.test(desk));
  check('düzenleyici etkileşimleri: sağ tık menüsü (role=menu, alt menü, ok tuşları, Esc masayı kapatmaz; klip, monitör ve müzik izi; Shift+F10 / menü tuşu), klip kenarını sürükle (kısa/normal/uzun), Efektler panelinden kliplere sürükle-bırak (tıklayınca seçili klibe), monitörde başlık/logo/alt yazıyı tut-bırak, cetvelde oynatma çizgisi; Del, Ctrl+C/V, +/−; yeniden kurulumda odak klipte kalır',
    /role', 'menu'/.test(desk) && /aria-haspopup', 'menu'/.test(desk) && /e\.stopPropagation\(\);\s+\/\/ masanın Esc/.test(desk) && /clipMenu\(k, x, y, back\)/.test(desk) && /monitorMenu\(x, y, back\)/.test(desk) && /audioMenu\(x, y, back\)/.test(desk)
    && /e\.key === 'ContextMenu' \|\| \(e\.shiftKey && e\.key === 'F10'\)/.test(desk) && /trim\(e, k, b, q\)/.test(desk) && /LEN_K\[pick\]/.test(desk) && /FX_MIME = 'application\/x-ls19-fx'/.test(desk) && /b\.ondrop = /.test(desk)
    && /monDrag\(e, card, scr, SPOT/.test(desk) && /scrubTo\(/.test(desk) && /e\.key === 'Delete' \|\| e\.key === 'Backspace'/.test(desk) && /copyClip\(k\)/.test(desk) && /pasteClip\(k\)/.test(desk) && /odak = this\.strip\.contains\(document\.activeElement\)/.test(desk));
  check('telefonda ve dokunmatik tablette editör kapalı: masa yerine "bilgisayarda düzenle" penceresi (fragmanı izle, kurguyu taşıyan bağlantıyı bilgisayara gönder; bağlantıda cine yok: bilgisayarda masa açılır)',
    /EDITOR_KAPALI_MQ = '\(max-width: 760px\), \(hover: none\) and \(pointer: coarse\)'/.test(desk) && /if \(editorKapali\(\)\) \{ this\.openMobil\(cut, shared\); return; \}/.test(desk)
    && /u\.searchParams\.delete\('cine'\)/.test(desk) && /navigator\.share/.test(desk) && /\.pdesk\.mobil \.pd-box \{ display: none; \}/.test(css));
  check('klavye kısayolları animasyonsuz: Y ile açılan masa (instant) ve Ctrl+Z/Y bildirimi kaymaz; tıklamayla açılışta giriş kalır',
    /\.pdesk\.instant \.pd-box, \.pdesk\.instant\.docked \.pd-box \{ animation: none; \}/.test(css) && /\.pd-toast\.instant \{ transition: none; \}/.test(css)
    && /this\.root\.classList\.toggle\('instant', !!instant\)/.test(desk) && /this\.undo\(true\)/.test(desk) && /this\.say\('Geri alındı\.', false, key\)/.test(desk)
    && /instant: !!o\.key/.test(app) && /\.xp-bar i \{[^}]*transition: transform \.25s linear/.test(css));
  check('ayrı pencere sayfası: yapimci.html yalnız masayı yükler (sahne yok), LS19 yoksa masa yine açılır ve bant söyler; açılır pencere engellenirse masa söyler',
    /js\/yapimci\.js/.test(html) && !/js\/app\.js/.test(html) && /new PopLink\(mainId/.test(pj) && /lostBanner\(\)/.test(pj) && /window\.open\(u\.href, 'ls19-yapimci'/.test(app) && /açılır pencereyi engelledi/.test(app));
}
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
