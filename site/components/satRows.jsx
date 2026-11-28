// uydu kaydının satırları ve değişken şemaları: modelli uydu sayfası (/satellites/[id]) ve katalog sayfası (/sat/[norad]) aynısını kullanır.
// Satır biçimi ElementBlock'taki gibi; vz etikete göre şema ve açıklama (withViz ile satırlara eklenir). extra: GCAT programı satırı
import { t, num, sci, dateTime } from '@/lib/i18n';
import { SatOrbit, Incl, Node, ArgPeri, MeanAnom, Ticks, Scale, Drift, Mass, Dims } from '@/components/viz';

export function satRows(lang, s, name, { extra = false } = {}) {
  const L = t(lang), S = L.sat, A = L.ast, E = s.elements, D = s.derived, G = s.gcat, el = S.el;
  const orbit = [
    ['i', el.i, num(lang, E.i, 4), '°'],
    ['e', el.e, num(lang, E.e, 7), null],
    ['Ω', el.om, num(lang, E.om, 4), '°'],
    ['ω', el.w, num(lang, E.w, 4), '°'],
    ['M', el.ma, num(lang, E.ma, 4), '°'],
    ['n', el.n, num(lang, E.n, 8), S.revDay],
    ['B*', el.bstar, sci(lang, E.bstar, 3), S.perEr],
  ];
  const derived = [
    ['a', el.a, num(lang, D.a, 1), A.km],
    ['hₚ', el.perigee, num(lang, D.perigee, 1), A.km],
    ['hₐ', el.apogee, num(lang, D.apogee, 1), A.km],
    ['P', el.period, num(lang, D.period, 2), S.min],
    ['dΩ/dt', el.nodal, num(lang, D.nodal, 4), S.degDay, null, D.sso ? S.sso : null],
  ];
  const dims = G ? [G.length, G.diameter, G.span] : [];
  const body = G ? [
    G.name && G.name !== name ? ['', S.b.catalog, G.name, null, 'text'] : null,
    ['', S.b.owner, G.owner.join(' / ') || null, null, 'text'],
    ['', S.b.manufacturer, G.manufacturer.join(' / ') || null, null, 'text'],
    ['', S.b.bus, G.bus, null],
    ['', S.b.mass, G.mass != null ? num(lang, G.mass, 0) : null, S.kg],
    G.dryMass != null ? ['', S.b.dry, num(lang, G.dryMass, 0), S.kg] : null,
    dims.some((x) => x != null) ? ['', S.b.dims, dims.map((x) => (x == null ? '–' : num(lang, x, 1))).join(' × '), S.meter] : null,
    ['', S.b.state, G.state, null],
    extra && G.program ? ['', L.satcat.program, G.program, null, 'text'] : null,
  ] : [];
  const Ld = G && G.launch;
  const launch = Ld ? [
    ['', S.l.date, Ld.date ? `${Ld.date.iso}${Ld.date.time ? ` ${Ld.date.time}` : ''}${Ld.date.uncertain ? ' ?' : ''}` : null, null],
    ['', S.l.vehicle, Ld.vehicle, null, 'text'],
    Ld.flight ? ['', S.l.flight, Ld.flight, null, 'text'] : null,
    ['', S.l.site, Ld.site, null, 'text', Ld.pad],
    ['', S.l.cospar, s.cospar, null],
  ] : [];
  const epoch = dateTime(lang, s.epoch);
  // değişken şemaları (etikete göre)
  const V = L.viz, tr = lang === 'tr';
  const day = <Ticks value={D.period} unit={1440} lang={lang} unitLabel={tr ? '1 gün = 1 440 dk' : '1 day = 1,440 min'} valueLabel={`P = ${num(lang, D.period, 1)} ${S.min}`} />;
  const vz = {
    [el.i]: { node: <Incl i={E.i} plane="equator" lang={lang} />, text: V.i('equator') },
    [el.e]: { node: <SatOrbit a={D.a} e={E.e} mark="e" lang={lang} />, text: V.e('earth') },
    [el.om]: { node: <Node om={E.om} plane="equator" lang={lang} />, text: V.om('equator') },
    [el.w]: { node: <ArgPeri w={E.w} e={E.e} earth lang={lang} />, text: V.w('earth') },
    [el.ma]: { node: <MeanAnom M={E.ma} lang={lang} />, text: V.ma('earth') },
    [el.n]: { node: day, text: V.n },
    [el.bstar]: E.bstar > 0 ? { node: <Scale v={E.bstar} min={1e-6} max={1e-2} log lang={lang} label={`B* = ${sci(lang, E.bstar, 2)}`} ticks={[[1e-6, '10⁻⁶'], [1e-5, '10⁻⁵'], [1e-4, '10⁻⁴'], [1e-3, '10⁻³'], [1e-2, '10⁻²']]} left={tr ? 'az sürükleme' : 'little drag'} right={tr ? 'çok' : 'strong'} />, text: V.bstar } : null,
    [el.a]: { node: <SatOrbit a={D.a} e={E.e} mark="a" lang={lang} />, text: V.sa },
    [el.perigee]: { node: <SatOrbit a={D.a} e={E.e} mark="q" lang={lang} />, text: V.hp },
    [el.apogee]: { node: <SatOrbit a={D.a} e={E.e} mark="Q" lang={lang} />, text: V.ha },
    [el.period]: { node: day, text: V.sper },
    [el.nodal]: { node: <Drift rate={D.nodal} lang={lang} />, text: V.nodal },
    ...(G ? {
      [S.b.mass]: G.mass != null ? { node: <Mass kg={G.mass} lang={lang} />, text: V.mass } : null,
      [S.b.dims]: dims.some((x) => x != null) ? { node: <Dims L={G.length} D={G.diameter} S={G.span} lang={lang} />, text: V.dims } : null,
    } : {}),
  };
  return { orbit, derived, body, launch, vz, epoch };
}
