// roket kademelerinin ayrıntısı: GCAT kademe ve motor kaydı (data/rockets.json, scripts/roketler.mjs) ile elle derlenmiş üretici bilgisi
// (data/rocket-detail.json) birleşir. Saf modül (JSON dışarıdan verilir; Node'da sınanır). Kaynakta olmayan düzen uydurulmaz: tank düzeni,
// motor dizilişi ya da parça kaynakta yoksa "documented: false" ve çizim şematik genel düzendir.

// GCAT yakıt adı → sözlük anahtarı (lib/i18n.js rk.x.prop) ve parantezde gösterilecek kod
const PROP = [
  [/^LOX$/i, 'lox', 'LOX'], [/^LH2$/i, 'lh2', 'LH2'], [/^Kero(sene)?\b\s*(.*)$/i, 'kero', 2], [/^Methane LNG$/i, 'lng', 'LNG'], [/^Methane$/i, 'methane', 'CH₄'],
  [/^N2O4$/i, 'n2o4', 'N₂O₄'], [/^MON-?3$/i, 'mon', 'MON-3'], [/^UDMH$/i, 'udmh', 'UDMH'], [/^MMH$/i, 'mmh', 'MMH'], [/^Hydrazine$/i, 'hydrazine', 'N₂H₄'],
  [/^H2O2$/i, 'h2o2', 'H₂O₂'], [/^(RFNA|NA)$/i, 'nitric', 1], [/^Propane$/i, 'propane', null], [/^Paraffin$/i, 'paraffin', null], [/^Polyethylene$/i, 'polyethylene', null],
  [/^HTPB(.*)$/i, 'htpb', 0], [/^PBAN$/i, 'pban', 'PBAN'], [/^CTPB$/i, 'ctpb', 'CTPB'], [/^BHT$/i, 'bht', 'BHT'], [/^NEPE/i, 'nepe', 'NEPE'], [/^Solid$/i, 'solid', null],
  [/^RL Green Prop$/i, 'green', null],
];
export function propKey(raw) {
  const s = String(raw || '').trim(); if (!s) return null;
  for (const [re, key, code] of PROP) {
    const m = re.exec(s); if (!m) continue;
    const c = typeof code === 'number' ? (code === 0 ? s : m[code] || null) : code;
    return { key, code: c || null, raw: s };
  }
  return { key: null, code: null, raw: s };
}
// itki sınıfı: GCAT motor grubundan (Solid, Hybrid, MonoHyd; gerisi iki sıvılı)
export function propClass(eng) {
  const g = (eng && eng.group) || '';
  if (/^Solid$/i.test(g)) return 'solid';
  if (/^Hybrid$/i.test(g)) return 'hybrid';
  if (/^Mono/i.test(g)) return 'mono';
  if (eng && !eng.ox && eng.fuel && /HTPB|PBAN|CTPB|NEPE|BHT|Solid/i.test(eng.fuel)) return 'solid';
  return 'liquid';
}

const stageOrder = (a, b) => (a.no === '0' ? -1 : b.no === '0' ? 1 : +a.no - +b.no);
// bir aracın elle derlenmiş kayıtları (aynı kademeye birden çok kayıt düşebilir: birleşir; tank/besleme/diziliş sonrakinin)
export function curatedFor(slug, no, detail) {
  const hits = ((detail && detail.entries) || []).filter((e) => e.slugs.includes(slug) && e.stage === no);
  if (!hits.length) return null;
  const out = { tanks: null, feed: null, rings: null, parts: [], facts: [], values: [] };
  for (const e of hits) {
    for (const k of ['tanks', 'feed', 'rings']) if (e[k]) out[k] = e[k];
    out.parts.push(...(e.parts || [])); out.facts.push(...(e.facts || [])); out.values.push(...(e.values || []));
  }
  return out;
}

// motor halkaları (içten dışa): kaynakta yoksa genel kural (1–6 tek halka; 7–12 ortada bir; 13–20 ortada üç; daha çoğunda üç halka)
export function engineRings(n) {
  if (!(n > 0)) return [];
  if (n === 1) return [1];
  if (n <= 6) return [n];
  if (n <= 12) return [1, n - 1];
  if (n <= 20) return [3, n - 3];
  const outer = Math.round(((n - 3) * 2) / 3);
  return [3, n - 3 - outer, outer];
}

// kademe tanımları: sayfa ve 3B görünüm için tek kaynak. Kaporta ve uçak (F, A, C) kademe değildir.
export function stageList(vehicle, detail) {
  const S = vehicle.spec.stages.filter((s) => /^[0-9]$/.test(s.no)).slice().sort(stageOrder);
  const src = (detail && detail.sources) || {};
  return S.map((s) => {
    const eng = s.eng || null, cls = propClass(eng), cur = curatedFor(vehicle.slug, s.no, detail);
    const chambers = (eng && eng.chambers) || 1, neng = s.neng || 1;
    // görünen çan sayısı: motor sayısı × oda sayısı (RD-180: 1 × 2; RD-107A: 1 × 4); kaynakta diziliş varsa o
    const bells = cls === 'solid' ? 1 : Math.min(neng * chambers, 48);
    const ringsDoc = cur && cur.rings ? cur.rings : null;
    const rings = ringsDoc ? ringsDoc.v.slice() : engineRings(bells);
    const tanksDoc = cur && cur.tanks ? cur.tanks : null;
    const tanks = cls === 'liquid'
      ? { kind: tanksDoc ? tanksDoc.kind : 'generic', order: (tanksDoc && tanksDoc.order) || null, documented: !!tanksDoc, src: tanksDoc ? tanksDoc.src : [] }
      : { kind: cls, order: null, documented: false, src: [] };
    const feed = cur && cur.feed ? { kind: cur.feed.kind, documented: true, src: cur.feed.src } : { kind: 'side', documented: false, src: [] };
    // parçalar: kaynaktan gelmeyenler (tanklar, besleme, motorlar, katı yakıt) yalnız GCAT'in yakıt ve motor sayısından, şematik
    const parts = [];
    if (cls === 'liquid' || cls === 'hybrid') parts.push({ id: 'tank-ox', gen: true });
    if (cls === 'liquid' || cls === 'mono') parts.push({ id: 'tank-fuel', gen: true });
    if (tanks.kind === 'common') parts.push({ id: 'bulkhead', src: tanks.src });
    if (tanks.kind === 'separate') parts.push({ id: 'intertank', src: tanks.src });
    if (cls === 'liquid' || cls === 'hybrid') parts.push({ id: 'feed', gen: !feed.documented, src: feed.src });
    if (cls === 'solid' || cls === 'hybrid') parts.push({ id: 'grain', gen: true }, { id: 'case', gen: true });
    parts.push({ id: cls === 'solid' ? 'nozzle' : 'engines', gen: !ringsDoc, n: cls === 'solid' ? 1 : bells, src: ringsDoc ? ringsDoc.src : [] });
    for (const p of (cur && cur.parts) || []) if (!parts.some((x) => x.id === p.id)) parts.push({ id: p.id, n: p.n || null, at: p.at || null, src: p.src });
    const facts = (cur && cur.facts) || [], values = (cur && cur.values) || [];
    const used = [...new Set([...tanks.src, ...feed.src, ...(ringsDoc ? ringsDoc.src : []), ...parts.flatMap((p) => p.src || []), ...facts.flatMap((f) => f.src), ...values.map((v) => v.src)])].filter((k) => src[k]);
    const prop = eng ? [eng.ox, eng.fuel].filter(Boolean).map(propKey) : [];
    const propMass = s.mass != null && s.dry != null && s.mass * 1000 > s.dry ? +(s.mass - s.dry / 1000).toFixed(3) : null;
    return {
      key: s.no, no: s.no, name: s.name, mult: s.mult || 1, length: s.length, diameter: s.diameter, mass: s.mass, dry: s.dry ?? null, propMass,
      thrust: s.thrust ?? null, thrustSL: s.thrustSL ?? null, dur: s.dur ?? null, q: s.q || [], engine: s.engine, neng, eng, cls, prop,
      bells, rings, ringsVac: ringsDoc && ringsDoc.vac ? ringsDoc.vac : null, ringsDocumented: !!ringsDoc, tanks, feed, parts, facts, values,
      sources: used.map((k) => ({ id: k, ...src[k] })), curated: !!cur,
    };
  });
}
// adres durumu: ?stage=1&view=inside&part=engines (yalnız var olan kademe ve parça kabul edilir)
export function readStageState(search, stages) {
  const p = new URLSearchParams(search || ''), key = p.get('stage');
  const st = stages.find((s) => s.key === key);
  if (!st) return { sel: null, view: p.get('view') === 'apart' ? 'apart' : 'whole', part: null };
  const view = p.get('view') === 'inside' ? 'inside' : 'apart';
  const part = view === 'inside' && st.parts.some((x) => x.id === p.get('part')) ? p.get('part') : null;
  return { sel: key, view, part };
}
export function writeStageState(st) {
  if (!st.sel) return st.view === 'apart' ? '?view=apart' : '';
  const p = new URLSearchParams({ stage: st.sel });
  if (st.view === 'inside') { p.set('view', 'inside'); if (st.part) p.set('part', st.part); }
  return `?${p}`;
}
