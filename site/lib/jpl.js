// JPL SSD API yanıtlarını (SBDB, CAD, Sentry) sitenin kaydına çeviren ve veriyi doğrulayan saf işlevler.
// scripts/asteroitler.mjs bunlarla data/asteroids.json'u üretir; web/test/test_site.js aynı işlevleri örnek yanıtlarla denetler.
// Her değer kaynağın verdiği gibidir: belirsizlikler 1σ (SBDB), yakın geçiş uzaklık aralığı 3σ (CAD), çarpma olasılığı Sentry'nin özeti.
export const AU_KM = 149597870.7;
export const LD_AU = 384399 / AU_KM;                                          // ortalama Ay uzaklığı (au)
export const CAD_MAX_AU = 0.2;                                               // yakın geçiş listesi: Dünya'ya 0,2 au'dan yakın (1900–2200)
export const CAD_RANGE = ['1900-01-01', '2200-01-01'];
const ELS = ['a', 'e', 'i', 'om', 'w', 'ma', 'q', 'ad', 'per', 'n'];
const num = (v) => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);
export const jdToIso = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
// CAD tarihi "2029-Apr-13 21:46" (TDB) → "2029-04-13T21:46"
export const cadDate = (s) => { const m = /^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}:\d{2})$/.exec(String(s).trim()); return m && MON[m[2]] ? `${m[1]}-${MON[m[2]]}-${m[3]}T${m[4]}` : null; };
// SBDB gözlem tarihi "2020-10-03" ya da Sentry'nin "2020-10-3.80160" biçimi → "2020-10-03"
const obsDate = (s) => { const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s || '')); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };

// SBDB keşif kaydı: "1898-Aug-13" → ISO; yer, keşfeden, kaynağın cümlesi (keşif bilinmiyorsa null)
export function mapDiscovery(x) {
  if (!x || !x.date) return null;
  const m = /^(\d{4})-([A-Z][a-z]{2})-(\d{2})/.exec(String(x.date).trim());
  return { date: m && MON[m[2]] ? `${m[1]}-${MON[m[2]]}-${m[3]}` : null, location: x.location || null, site: x.site || null, who: x.who || null, text: x.discovery || null, citation: x.citation || null };
}
// SBDB: kimlik, yörünge elementleri ve 1σ belirsizlikleri, yörünge çözümünün künyesi, fiziksel parametreler
export function mapSbdb(d) {
  const o = d.object, orb = d.orbit;
  const byName = Object.fromEntries(orb.elements.map((e) => [e.name, e]));
  const elements = Object.fromEntries(ELS.map((k) => [k, num(byName[k] && byName[k].value)]));
  const sigma = Object.fromEntries(ELS.filter((k) => k !== 'n').map((k) => [k, num(byName[k] && byName[k].sigma)]));
  const ph = Object.fromEntries((d.phys_par || []).map((p) => [p.name, p.value]));
  // ad: adı olan cisimde yalnız ad (Apophis); adsız numaralıda "276049 (2002 CE26)"; numarasızda geçici gösterim (1998 KY26)
  const full = o.fullname.trim(), bare = full.replace(/^\s*\d+\s+/, '').replace(/\s*\(.*\)\s*$/, '').trim();
  const name = bare && !/^\(/.test(bare) ? bare : full.replace(/^\((.*)\)$/, '$1');
  return {
    des: o.des, fullname: full, name, number: o.prefix ? null : num(o.des), neo: !!o.neo, pha: !!o.pha,
    orbitClass: { code: o.orbit_class.code, name: o.orbit_class.name },
    epoch: { jd: num(orb.epoch), date: jdToIso(num(orb.epoch)) }, elements, sigma,
    moid: num(orb.moid), conditionCode: orb.condition_code ?? null, dataArc: num(orb.data_arc),
    solution: {
      id: orb.orbit_id ? String(orb.orbit_id) : null, date: orb.soln_date ? String(orb.soln_date).slice(0, 10) : null, producer: orb.producer || null,
      nObs: num(orb.n_obs_used), nDel: num(orb.n_del_obs_used), nDop: num(orb.n_dop_obs_used), first: obsDate(orb.first_obs), last: obsDate(orb.last_obs), rms: num(orb.rms),
    },
    discovery: mapDiscovery(d.discovery), altDes: (Array.isArray(o.des_alt) ? o.des_alt : []).map((x) => x.des || x.pri).filter(Boolean),
    phys: { H: num(ph.H), diameter: num(ph.diameter), rotPer: num(ph.rot_per), albedo: num(ph.albedo), specB: ph.spec_B || null, specT: ph.spec_T || null, density: num(ph.density) },
  };
}

// CAD: Dünya'ya yakın geçişler; uzaklık nominal ve 3σ aralığı (au), göreli hız (km/s), zaman belirsizliği (kaynağın metni)
export function mapCad(d) {
  if (!d || !Array.isArray(d.data) || !Array.isArray(d.fields)) return [];
  const f = Object.fromEntries(d.fields.map((k, i) => [k, i]));
  return d.data.map((r) => ({
    date: cadDate(r[f.cd]), jd: num(r[f.jd]), orbitId: r[f.orbit_id] ? String(r[f.orbit_id]) : null,
    dist: num(r[f.dist]), distMin: num(r[f.dist_min]), distMax: num(r[f.dist_max]), vRel: num(r[f.v_rel]), tSigma: r[f.t_sigma_f] ? String(r[f.t_sigma_f]).trim() : null,
  })).filter((x) => x.date && x.dist != null).sort((a, b) => a.jd - b.jd);
}

// Sentry: listede (özet), listeden çıkarılmış (tarihiyle) ya da hiç listelenmemiş
export function mapSentry(d) {
  if (!d) return null;
  if (d.summary) {
    const s = d.summary, years = (Array.isArray(d.data) ? d.data : []).map((v) => num(String(v.date || '').slice(0, 4))).filter((y) => y != null);
    return {
      status: 'listed', ip: num(s.ip), psCum: num(s.ps_cum), psMax: num(s.ps_max), tsMax: num(s.ts_max), nImp: num(s.n_imp),
      years: years.length ? [Math.min(...years), Math.max(...years)] : null, vImp: num(s.v_imp), computed: s.cdate ? String(s.cdate).slice(0, 10) : null, method: s.method || null,
    };
  }
  if (d.removed) return { status: 'removed', removed: String(d.removed).slice(0, 10) };
  if (d.error && /not found|not in|no data/i.test(d.error)) return { status: 'none' };
  return null;                                                              // tanınmayan yanıt: doğrulama durdurur
}

const close = (x, y, rel) => Math.abs(x - y) <= rel * Math.max(Math.abs(x), Math.abs(y), 1e-12);
// tek cisim kaydının iç tutarlılığı: hata metinleri listesi (boşsa geçerli)
export function checkObject(o) {
  const E = o.elements, S = o.sigma, err = [], p = (m) => err.push(`${o.id}: ${m}`);
  if (!ELS.every((k) => Number.isFinite(E[k]))) p('yörünge elementi eksik');
  else {
    if (!(E.a > 0 && E.e >= 0 && E.e < 1)) p(`a/e geçersiz (a=${E.a}, e=${E.e})`);
    if (!close(E.q, E.a * (1 - E.e), 1e-6)) p('q ≠ a(1−e)');
    if (!close(E.ad, E.a * (1 + E.e), 1e-6)) p('Q ≠ a(1+e)');
    if (!close(E.per, 365.25 * E.a ** 1.5, 0.01)) p('dönem Kepler yasasıyla tutmuyor');
    if (!(E.i >= 0 && E.i <= 180)) p('eğiklik aralık dışında');
  }
  if (Object.values(S).some((s) => s != null && !(s >= 0))) p('negatif belirsizlik');
  if (!(o.moid >= 0)) p('MOID yok');
  if (!o.solution || !o.solution.id || !o.solution.date) p('yörünge çözümü künyesi eksik');
  if (o.conditionCode != null && !/^[0-9]$/.test(String(o.conditionCode))) p(`belirsizlik kodu ${o.conditionCode}`);
  for (const c of o.approaches || []) {
    if (!(c.distMin <= c.dist && c.dist <= c.distMax)) p(`yakın geçiş ${c.date}: uzaklık 3σ aralığı dışında`);
    if (!(c.dist <= CAD_MAX_AU)) p(`yakın geçiş ${c.date}: ${CAD_MAX_AU} au'dan uzak`);
  }
  if ((o.approaches || []).some((c, i, a) => i && a[i - 1].jd > c.jd)) p('yakın geçişler sırasız');
  const s = o.sentry;
  if (o.neo && !s) p('Sentry durumu bilinmiyor');
  if (s && s.status === 'listed' && !(s.ip > 0 && s.ip <= 1 && s.nImp > 0)) p('Sentry özeti geçersiz');
  return err;
}

// önceki dosyaya göre değişiklikler (PR raporu) ve kuşkulu değişiklikler (yazmayı durdurur)
export function compare(prev, next) {
  const notes = [], stop = [];
  const P = Object.fromEntries((prev ? prev.objects : []).map((o) => [o.id, o]));
  if (prev && next.objects.length < prev.objects.length) stop.push(`cisim sayısı azaldı: ${prev.objects.length} → ${next.objects.length}`);
  for (const o of next.objects) {
    const p = P[o.id]; if (!p) { notes.push(`${o.name}: yeni cisim`); continue; }
    const ps = p.solution || {}, os = o.solution;
    if (ps.id && os.id !== ps.id) notes.push(`${o.name}: yeni yörünge çözümü ${ps.id} → ${os.id} (${os.date})`);
    else if (ps.id && o.epoch.jd === p.epoch.jd && !close(o.elements.a, p.elements.a, 1e-9)) stop.push(`${o.name}: aynı çözüm (${os.id}) ve epokta yarı büyük eksen değişti`);
    if (p.elements && !close(o.elements.a, p.elements.a, 1e-3)) stop.push(`${o.name}: yarı büyük eksen %0,1'den çok değişti (${p.elements.a} → ${o.elements.a})`);
    if (p.pha !== o.pha || p.neo !== o.neo) notes.push(`${o.name}: sınıf bayrağı değişti (NEO ${p.neo}→${o.neo}, PHA ${p.pha}→${o.pha})`);
    const a = p.sentry && p.sentry.status, b = o.sentry && o.sentry.status;
    if (a && b && a !== b) notes.push(`**${o.name}: Sentry durumu ${a} → ${b}**`);
    else if (b === 'listed' && p.sentry && !close(p.sentry.ip, o.sentry.ip, 0.05)) notes.push(`${o.name}: çarpma olasılığı ${p.sentry.ip} → ${o.sentry.ip}`);
    if (String(p.conditionCode) !== String(o.conditionCode)) notes.push(`${o.name}: belirsizlik kodu U ${p.conditionCode} → ${o.conditionCode}`);
  }
  return { notes, stop };
}

// sıradaki ve son geçişler (sayfa): verinin alındığı tarihe göre
export function splitApproaches(list, isoNow) {
  const t = Date.parse(isoNow), past = [], next = [];
  for (const c of list || []) (Date.parse(`${c.date}Z`) < t ? past : next).push(c);
  return { past, next };
}
