// değişken şemaları: her biri kaydın gerçek değeriyle, ölçekli çizilen küçük bir SVG (300 × 150). Saf işlevler: sunucuda ve istemcide çalışır.
// Görsel dil: mürekkep çizgiler (başvuru: Dünya, ekliptik, ekvator, Ay), kobalt nesne, eş aralıklı ölçü etiketleri; gölge ve süs yok.
// Açıklama cümlesi i18n.js "viz" sözlüğünden gelir; şema aria-hidden, anlamı cümle taşır.
import { num, sig } from '@/lib/i18n';

const W = 300, H = 150, D2R = Math.PI / 180;
export const RE_KM = 6378.137, LD_KM = 384399, AU_KM = 149597870.7;
const f = (x) => Math.round(x * 10) / 10;
function Svg({ children, h = H }) {
  return <svg className="vz" overflow="hidden" viewBox={`0 0 ${W} ${h}`} width={W} height={h} aria-hidden="true" focusable="false">{children}</svg>;
}
const Lab = ({ x, y, children, a = 'start', obj = false, size }) => (
  <text x={f(x)} y={f(y)} textAnchor={a} className={obj ? 'vz-t vz-t--obj' : 'vz-t'} style={size ? { fontSize: size } : undefined}>{children}</text>
);
// elips (odak başlangıçta, yakın nokta +x): noktalar
function ellipse(a, e, s, cx, cy, rot = 0, n = 96) {
  const b = a * Math.sqrt(1 - e * e), pts = [];
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * 2 * Math.PI, x = a * (Math.cos(E) - e), y = b * Math.sin(E);
    pts.push(`${f(cx + (x * Math.cos(rot) - y * Math.sin(rot)) * s)},${f(cy - (x * Math.sin(rot) + y * Math.cos(rot)) * s)}`);
  }
  return `M${pts.join('L')}Z`;
}
const arc = (cx, cy, r, a0, a1) => {                                       // derece, saat yönünün tersi (y yukarı)
  const p = (a) => `${f(cx + r * Math.cos(a * D2R))},${f(cy - r * Math.sin(a * D2R))}`;
  return `M${p(a0)}A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 0 : 1} ${p(a1)}`;
};

// lejant: değer sol üstte (kobalt), simge anahtarları altta; çizimin üstüne yazı binmez
const Val = ({ children, line = 0 }) => <Lab x={10} y={16 + line * 14} obj={line === 0} size={line === 0 ? 12 : 10}>{children}</Lab>;
function Keys({ items, y = H - 6 }) {
  let x = 10; const out = [];
  for (const [kind, text] of items) {
    out.push(
      <g key={text}>
        {kind === 'dash' ? <line x1={x} y1={y - 3} x2={x + 14} y2={y - 3} className="vz-ref vz-dash" />
          : kind === 'ref' ? <line x1={x} y1={y - 3} x2={x + 14} y2={y - 3} className="vz-ref" />
            : kind === 'obj' ? <line x1={x} y1={y - 3} x2={x + 14} y2={y - 3} className="vz-obj" />
              : kind === 'earth' ? <circle cx={x + 6} cy={y - 3} r="5" className="vz-earth" />
                : kind === 'sun' ? <circle cx={x + 6} cy={y - 3} r="3" className="vz-sun" />
                  : kind === 'hole' ? <circle cx={x + 6} cy={y - 3} r="3.5" className="vz-hole" /> : <circle cx={x + 6} cy={y - 3} r="3.5" className="vz-dot" />}
        <Lab x={x + 18} y={y} size={9}>{text}</Lab>
      </g>,
    );
    x += 26 + text.length * 5.4;
  }
  return <g>{out}</g>;
}
const T = (lang, en, tr) => (lang === 'tr' ? tr : en);

// yörünge, üstten: odakta merkez cisim (Güneş ya da ölçekli Dünya); Dünya yörüngesi kesikli; işaret: a, q, Q, e
export function OrbitTop({ a, e, mark, central = 'sun', lang }) {
  const isEarth = central === 'earth', R = isEarth ? RE_KM : 1, Q = a * (1 + e), q = a * (1 - e), b = a * Math.sqrt(1 - e * e);
  const xmin = Math.min(-Q, -R), xmax = Math.max(q, R), ymax = Math.max(b, R), top = 28, bot = 122;
  const s = Math.min(276 / (xmax - xmin), (bot - top) / (2 * ymax)), cx = 12 - xmin * s + (276 - (xmax - xmin) * s) / 2, cy = (top + bot) / 2;
  const X = (x) => cx + x * s, u = isEarth ? 'km' : 'au', v = (x) => (isEarth ? num(lang, x, 0) : sig(lang, x, 3));
  const val = mark === 'a' ? `a = ${v(a)} ${u}` : mark === 'e' ? `e = ${num(lang, e, 4)}` : mark === 'q' ? (isEarth ? `hₚ = ${v(q - RE_KM)} km` : `q = ${v(q)} au`) : (isEarth ? `hₐ = ${v(Q - RE_KM)} km` : `Q = ${v(Q)} au`);
  return (
    <Svg>
      {isEarth ? <circle cx={f(cx)} cy={cy} r={f(Math.max(R * s, 2))} className="vz-earth" /> : <circle cx={f(cx)} cy={cy} r={f(R * s)} className="vz-ref vz-dash" />}
      <path d={ellipse(a, e, s, cx, cy)} className="vz-obj" />
      {!isEarth ? <circle cx={f(cx)} cy={cy} r="3" className="vz-sun" /> : null}
      {mark === 'a' ? <><line x1={f(X(-a * e))} y1={cy} x2={f(X(q))} y2={cy} className="vz-mark" /><circle cx={f(X(-a * e))} cy={cy} r="2" className="vz-dot" /></> : null}
      {mark === 'q' ? <><line x1={f(X(isEarth ? R : 0))} y1={cy} x2={f(X(q))} y2={cy} className="vz-mark" /><circle cx={f(X(q))} cy={cy} r="3" className="vz-dot" /></> : null}
      {mark === 'Q' ? <><line x1={f(X(isEarth ? -R : 0))} y1={cy} x2={f(X(-Q))} y2={cy} className="vz-mark" /><circle cx={f(X(-Q))} cy={cy} r="3" className="vz-dot" /></> : null}
      {mark === 'e' ? <><line x1={f(X(-a * e))} y1={cy} x2={f(cx)} y2={cy} className="vz-mark" /><circle cx={f(X(-a * e))} cy={cy} r="2" className="vz-dot" /></> : null}
      <Val>{val}</Val>
      {mark === 'e' ? <Val line={1}>c = a·e = {isEarth ? `${num(lang, a * e, 0)} km` : `${sig(lang, a * e, 3)} au`}</Val> : null}
      <Keys items={isEarth ? [['earth', T(lang, 'Earth, to scale', 'Dünya, ölçekli')], ['obj', T(lang, 'orbit', 'yörünge')]]
        : [['sun', T(lang, 'Sun', 'Güneş')], ['dash', T(lang, 'Earth orbit, 1 au', 'Dünya yörüngesi, 1 au')], ['obj', T(lang, 'orbit', 'yörünge')]]} />
    </Svg>
  );
}
// eğiklik, yandan: başvuru düzlemi (ekliptik ya da ekvator) ve yörünge düzlemi; çizgi kutunun içinde kalır
export function Incl({ i, plane = 'ecliptic', lang }) {
  const cx = 150, cy = 74, t = i * D2R, Lm = Math.min(118, 46 / Math.max(Math.abs(Math.sin(t)), 1e-6)), eq = plane === 'equator';
  return (
    <Svg>
      <line x1={cx - 128} y1={cy} x2={cx + 128} y2={cy} className="vz-ref" />
      {eq ? <><line x1={cx} y1={cy - 50} x2={cx} y2={cy + 50} className="vz-ref vz-dash" /><circle cx={cx} cy={cy} r="20" className="vz-earth" /></> : <circle cx={cx} cy={cy} r="3" className="vz-sun" />}
      <line x1={f(cx - Lm * Math.cos(t))} y1={f(cy + Lm * Math.sin(t))} x2={f(cx + Lm * Math.cos(t))} y2={f(cy - Lm * Math.sin(t))} className="vz-obj" />
      <path d={arc(cx, cy, eq ? 34 : 30, 0, i)} className="vz-mark" />
      <Val>i = {num(lang, i, 2)}°</Val>
      <Keys items={[['ref', eq ? T(lang, 'equatorial plane', 'ekvator düzlemi') : T(lang, 'ecliptic', 'ekliptik')], ['obj', T(lang, 'orbital plane', 'yörünge düzlemi')], ...(eq ? [['dash', T(lang, 'rotation axis', 'dönme ekseni')]] : [])]} />
    </Svg>
  );
}
// çıkış düğümü boylamı, üstten: başvuru yönü (ilkbahar noktası) ve düğüm çizgisi
export function Node({ om, plane = 'ecliptic', lang }) {
  const cx = 150, cy = 66, r = 44, p = (ang) => [cx + r * Math.cos(ang * D2R), cy - r * Math.sin(ang * D2R)];
  const [ax, ay] = p(om), [dx, dy] = p(om + 180);
  return (
    <Svg>
      <circle cx={cx} cy={cy} r={r} className="vz-ref" />
      <line x1={cx} y1={cy} x2={cx + r + 36} y2={cy} className="vz-ref vz-dash" />
      {plane === 'equator' ? <circle cx={cx} cy={cy} r="11" className="vz-earth" /> : <circle cx={cx} cy={cy} r="3" className="vz-sun" />}
      <line x1={f(dx)} y1={f(dy)} x2={f(ax)} y2={f(ay)} className="vz-obj" />
      <path d={arc(cx, cy, 22, 0, om)} className="vz-mark" />
      <circle cx={f(ax)} cy={f(ay)} r="4" className="vz-dot" /><circle cx={f(dx)} cy={f(dy)} r="3.5" className="vz-hole" />
      <Val>Ω = {num(lang, om, 1)}°</Val>
      <Keys y={H - 20} items={[['dash', T(lang, 'vernal equinox direction', 'ilkbahar noktası yönü')]]} />
      <Keys items={[['dot', T(lang, 'ascending node', 'çıkış düğümü')], ['hole', T(lang, 'descending node', 'iniş düğümü')]]} />
    </Svg>
  );
}
// günberi/yerberi açısı: yörünge düzleminde, çıkış düğümünden en yakın noktaya (gerçek dış merkezlikle)
export function ArgPeri({ w, e = 0, lang, earth = false }) {
  const cx = 150, cy = 68, a = 46, q = a * (1 - e), px = cx + q * Math.cos(w * D2R), py = cy - q * Math.sin(w * D2R);
  const s = Math.min(1, 50 / (a * (1 + e)));
  return (
    <Svg>
      <line x1={cx - 126} y1={cy} x2={cx + 126} y2={cy} className="vz-ref vz-dash" />
      <path d={ellipse(a * s, e, 1, cx, cy, w * D2R)} className="vz-obj" />
      {earth ? <circle cx={cx} cy={cy} r="6" className="vz-earth" /> : <circle cx={cx} cy={cy} r="3" className="vz-sun" />}
      <circle cx={cx + 116} cy={cy} r="3.5" className="vz-sun" />
      <path d={arc(cx, cy, 20, 0, w)} className="vz-mark" />
      <line x1={cx} y1={cy} x2={f(cx + (px - cx) * s)} y2={f(cy + (py - cy) * s)} className="vz-mark" /><circle cx={f(cx + (px - cx) * s)} cy={f(cy + (py - cy) * s)} r="3.5" className="vz-dot" />
      <Val>ω = {num(lang, w, 1)}°</Val>
      <Keys y={H - 20} items={[['dash', T(lang, 'line of nodes', 'düğüm çizgisi')], ['sun', T(lang, 'ascending node (right)', 'çıkış düğümü (sağda)')]]} />
      <Keys items={[['dot', earth ? T(lang, 'perigee', 'yerberi') : T(lang, 'perihelion', 'günberi')], ['obj', T(lang, 'orbit', 'yörünge')]]} />
    </Svg>
  );
}
// ortalama anomali: en yakın noktadan bu yana geçen dönem kesri (dilim)
export function MeanAnom({ M, lang }) {
  const cx = 82, cy = 76, r = 54, frac = (((M % 360) + 360) % 360) / 360;
  const end = [cx + r * Math.cos(frac * 2 * Math.PI), cy - r * Math.sin(frac * 2 * Math.PI)];
  return (
    <Svg>
      <circle cx={cx} cy={cy} r={r} className="vz-ref" />
      {frac > 0.002 ? <path d={`M${cx},${cy}L${cx + r},${cy}A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 0 ${f(end[0])},${f(end[1])}Z`} className="vz-sector" /> : null}
      <circle cx={cx + r} cy={cy} r="3" className="vz-hole" /><circle cx={f(end[0])} cy={f(end[1])} r="3.5" className="vz-dot" />
      <Lab x={168} y={66} obj size={18}>{num(lang, frac * 100, 0)} %</Lab>
      <Lab x={168} y={86}>M = {num(lang, M, 1)}°</Lab>
    </Svg>
  );
}
// süre: birim (yıl, gün) çubuğu ve değer; kısa değer birimin içinde kaç kez sığar, uzun değer kaç birim eder
export function Ticks({ value, unit, unitLabel, valueLabel, lang }) {
  const x0 = 16, L = 268, y = 64, short = value <= unit, total = short ? unit : value, s = L / total, n = short ? unit / value : value / unit;
  const step = short ? value : unit, marks = [];
  for (let k = 1; k * step < total - 1e-9 && marks.length < 400; k++) marks.push(x0 + k * step * s);
  return (
    <Svg>
      <rect x={x0} y={y} width={f(short ? L : unit * s)} height="18" className="vz-bar" />
      {short ? <rect x={x0} y={y} width={f(Math.max(value * s, 1.5))} height="18" className="vz-fill" /> : <rect x={x0} y={y + 26} width={L} height="8" className="vz-fill" />}
      {marks.map((m, k) => <line key={k} x1={f(m)} y1={short ? y : y + 24} x2={f(m)} y2={short ? y + 18 : y + 36} className={short ? 'vz-mark' : 'vz-tick'} />)}
      <Lab x={x0} y={y - 8}>{unitLabel}</Lab>
      <Lab x={x0 + L} y={short ? y - 8 : y + 50} a="end" obj>{valueLabel} · {short ? `${num(lang, n, n < 10 ? 1 : 0)} ×` : `× ${num(lang, n, n < 10 ? 2 : 1)}`}</Lab>
    </Svg>
  );
}
// Ay uzaklığı merdiveni (log): Dünya, yer eşzamanlı kuşak, Ay; değer (MOID ya da geçiş uzaklığı)
export function Ladder({ ld, lang, label }) {
  const x0 = 24, L = 256, lo = -2, hi = 3, X = (v) => x0 + ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo)) * L, tr = lang === 'tr', y = 78;
  const geo = 42164 / LD_KM;
  return (
    <Svg>
      <line x1={x0} y1={y} x2={x0 + L} y2={y} className="vz-ref" />
      {[0.01, 0.1, 1, 10, 100, 1000].map((v) => <g key={v}><line x1={f(X(v))} y1={y - 4} x2={f(X(v))} y2={y + 4} className="vz-ref" /><Lab x={X(v)} y={y + 18} a="middle" size={9}>{num(lang, v, v < 1 ? (v < 0.1 ? 2 : 1) : 0)}</Lab></g>)}
      <circle cx={x0 - 10} cy={y} r="6" className="vz-earth" />
      <line x1={f(X(geo))} y1={y - 16} x2={f(X(geo))} y2={y} className="vz-ref vz-dash" /><Lab x={X(geo)} y={y - 20} a="middle" size={9}>GEO</Lab>
      <circle cx={f(X(1))} cy={y} r="4" className="vz-moon" /><Lab x={X(1)} y={y - 12} a="middle" size={9}>{tr ? 'Ay' : 'Moon'}</Lab>
      <line x1={f(X(ld))} y1={y - 34} x2={f(X(ld))} y2={y} className="vz-mark" /><circle cx={f(X(ld))} cy={y} r="3.5" className="vz-dot" />
      <Lab x={Math.min(Math.max(X(ld), 60), 240)} y={y - 40} a="middle" obj>{label}</Lab>
      <Lab x={x0 + L} y={H - 10} a="end">{tr ? 'Ay uzaklığı (log)' : 'lunar distances (log)'}</Lab>
    </Svg>
  );
}
// ölçek üzerinde işaret (doğrusal ya da log): kadir, Palermo, B*, U, Torino
export function Scale({ v, min, max, log = false, ticks = [], label, left, right, boxes = 0, zero = null, lang }) {
  const x0 = 20, L = 260, y = 76, T = (x) => (log ? Math.log10(x) : x), X = (x) => x0 + ((T(Math.min(Math.max(x, min), max)) - T(min)) / (T(max) - T(min))) * L;
  return (
    <Svg>
      {boxes ? Array.from({ length: boxes }, (_, k) => <rect key={k} x={f(x0 + (k * L) / boxes + 1)} y={y - 10} width={f(L / boxes - 2)} height="20" className={k === Math.round(v) ? 'vz-fill' : 'vz-bar'} />)
        : <line x1={x0} y1={y} x2={x0 + L} y2={y} className="vz-ref" />}
      {ticks.map(([t, txt, up]) => <g key={t}>{boxes ? null : <line x1={f(X(t))} y1={y - 5} x2={f(X(t))} y2={y + 5} className="vz-ref" />}<Lab x={X(t)} y={up ? y - 10 : y + 22} a="middle" size={9}>{txt}</Lab></g>)}
      {zero != null ? <line x1={f(X(zero))} y1={y - 22} x2={f(X(zero))} y2={y + 10} className="vz-ref vz-dash" /> : null}
      {!boxes ? <><line x1={f(X(v))} y1={y - 26} x2={f(X(v))} y2={y} className="vz-mark" /><circle cx={f(X(v))} cy={y} r="4" className="vz-dot" /></> : null}
      <Val>{label}</Val>
      {left ? <Lab x={x0} y={H - 10}>{left}</Lab> : null}{right ? <Lab x={x0 + L} y={H - 10} a="end">{right}</Lab> : null}
    </Svg>
  );
}
// boyut: nesne (daire) ve aynı ölçekte tanıdık bir başvuru
export function Size({ km, lang }) {
  const tr = lang === 'tr', ref = km < 0.6 ? { k: 0.105, t: tr ? 'futbol sahası 105 m' : 'football pitch 105 m', shape: 'pitch' }
    : km < 40 ? { k: 8.849, t: tr ? 'Everest yüksekliği 8,85 km' : 'height of Everest 8.85 km', shape: 'bar' } : { k: 3474.8, t: tr ? 'Ay çapı 3 475 km' : 'Moon diameter 3,475 km', shape: 'disc' };
  const big = Math.max(km, ref.k), s = 120 / big, y = 135;
  return (
    <Svg>
      <line x1="10" y1={y} x2="290" y2={y} className="vz-ref" />
      <circle cx={f(90)} cy={f(y - (km * s) / 2)} r={f(Math.max((km * s) / 2, 1.5))} className="vz-objfill" />
      <Lab x={90} y={f(Math.max(y - km * s - 6, 12))} a="middle" obj>{km < 1 ? `${num(lang, km * 1000, 0)} m` : `${sig(lang, km, 3)} km`}</Lab>
      {ref.shape === 'pitch' ? <rect x={f(210 - (ref.k * s) / 2)} y={f(y - 0.068 * s)} width={f(ref.k * s)} height={f(Math.max(0.068 * s, 1))} className="vz-bar" />
        : ref.shape === 'bar' ? <rect x="206" y={f(y - ref.k * s)} width="8" height={f(Math.max(ref.k * s, 1))} className="vz-bar" />
          : <circle cx="210" cy={f(y - (ref.k * s) / 2)} r={f(Math.max((ref.k * s) / 2, 1.5))} className="vz-moonfill" />}
      <Lab x={210} y={f(Math.max(y - (ref.shape === 'pitch' ? 0.068 : ref.k) * s - 6, 12))} a="middle">{ref.t}</Lab>
    </Svg>
  );
}
// dönme: 24 saatlik kadran; nesnenin her tam dönüşü bir çentik
export function Spin({ h, lang }) {
  const cx = 80, cy = 76, r = 52, turns = 24 / h, marks = [];
  for (let k = 0; k < Math.min(Math.floor(turns + 1e-9), 96); k++) marks.push((k * h / 24) * 360);
  return (
    <Svg>
      <circle cx={cx} cy={cy} r={r} className="vz-ref" />
      {Array.from({ length: 24 }, (_, k) => { const a = (k / 24) * 360 * D2R; return <line key={k} x1={f(cx + r * Math.sin(a))} y1={f(cy - r * Math.cos(a))} x2={f(cx + (r - 4) * Math.sin(a))} y2={f(cy - (r - 4) * Math.cos(a))} className="vz-ref" />; })}
      {turns < 1 ? <path d={arc(cx, cy, r - 10, 90, 90 - turns * 360)} className="vz-obj" /> : marks.map((m, k) => <line key={k} x1={f(cx + (r - 8) * Math.sin(m * D2R))} y1={f(cy - (r - 8) * Math.cos(m * D2R))} x2={f(cx + (r - 22) * Math.sin(m * D2R))} y2={f(cy - (r - 22) * Math.cos(m * D2R))} className="vz-obj" />)}
      <Lab x={cx} y={cy + 4} a="middle" size={9}>24 h</Lab>
      <Lab x={150} y={70} obj size={18}>{num(lang, turns, turns < 10 ? 1 : 0)} ×</Lab>
      <Lab x={150} y={90}>T = {num(lang, h, h < 10 ? 2 : 1)} h</Lab>
    </Svg>
  );
}
// yansıtma: 0–1 ölçeği, başvuru yüzeyleri ve nesnenin gri tonu
export function Albedo({ p, lang }) {
  const tr = lang === 'tr', x0 = 20, L = 260, X = (v) => x0 + v * L, g = (v) => { const c = Math.round(255 * Math.pow(Math.min(v, 1), 1 / 2.2)); return `rgb(${c},${c},${c})`; };
  const refs = [[0.05, tr ? 'asfalt' : 'asphalt'], [0.12, tr ? 'Ay' : 'Moon'], [0.37, tr ? 'Dünya' : 'Earth'], [0.8, tr ? 'taze kar' : 'fresh snow']];
  return (
    <Svg>
      <line x1={x0} y1="96" x2={x0 + L} y2="96" className="vz-ref" />
      {refs.map(([v, t], k) => <g key={t}><rect x={f(X(v) - 8)} y="82" width="16" height="14" fill={g(v)} className="vz-swatch" /><Lab x={X(v)} y={k % 2 ? 124 : 112} a="middle" size={9}>{t}</Lab></g>)}
      <rect x={f(X(p) - 16)} y="30" width="32" height="32" fill={g(p)} className="vz-swatch vz-swatch--obj" />
      <line x1={f(X(p))} y1="62" x2={f(X(p))} y2="96" className="vz-mark" />
      <Lab x={X(p) + 22} y="50" obj>pᵥ = {num(lang, p, 3)}</Lab>
      <Lab x={x0} y={H - 8} size={9}>0</Lab><Lab x={x0 + L} y={H - 8} a="end" size={9}>1</Lab>
    </Svg>
  );
}
// gözlem aralığı: ilk ve son gözlem, on yıllık çentikler
export function Arc({ first, last, lang }) {
  const y0 = +first.slice(0, 4), y1 = +last.slice(0, 4), a = Math.floor(y0 / 10) * 10, b = Math.ceil((y1 + 1) / 10) * 10, x0 = 20, L = 260, X = (y) => x0 + ((y - a) / (b - a)) * L;
  const fy = (d) => +d.slice(0, 4) + (+d.slice(5, 7) - 1) / 12;
  return (
    <Svg>
      <line x1={x0} y1="82" x2={x0 + L} y2="82" className="vz-ref" />
      {Array.from({ length: (b - a) / 10 + 1 }, (_, k) => a + k * 10).map((y) => <g key={y}><line x1={f(X(y))} y1="78" x2={f(X(y))} y2="86" className="vz-ref" /><Lab x={X(y)} y="102" a="middle" size={9}>{y}</Lab></g>)}
      <rect x={f(X(fy(first)))} y="70" width={f(Math.max(X(fy(last)) - X(fy(first)), 2))} height="10" className="vz-fill" />
      <Lab x={X(fy(first))} y="62" obj>{first}</Lab><Lab x={X(fy(last))} y="50" a="end" obj>{last}</Lab>
    </Svg>
  );
}
// olasılık: N noktalık ızgarada bir nokta
export function Odds({ ip, lang }) {
  const N = Math.min(Math.max(Math.round(1 / ip), 1), 6000), cols = Math.ceil(Math.sqrt(N * 2.4)), rows = Math.ceil(N / cols), st = Math.min(268 / cols, 118 / rows), r = Math.max(st * 0.32, 0.6), dots = [];
  for (let k = 0; k < N; k++) dots.push([16 + (k % cols) * st + st / 2, 14 + Math.floor(k / cols) * st + st / 2]);
  return (
    <Svg>
      {dots.map(([x, y], k) => <circle key={k} cx={f(x)} cy={f(y)} r={f(k === N - 1 ? Math.max(r * 2.2, 2.4) : r)} className={k === N - 1 ? 'vz-dot' : 'vz-grain'} />)}
      <Lab x={290} y={H - 6} a="end" obj>1 / {num(lang, Math.round(1 / ip), 0)}</Lab>
    </Svg>
  );
}
// yükseklik ölçeği (uydular): Dünya ölçekli, yörünge ve işaretlenen yükseklik
export const SatOrbit = ({ a, e, mark, lang }) => <OrbitTop a={a} e={e} mark={mark} central="earth" lang={lang} />;
// düğüm kayması: yörünge düzleminin günlük dönüşü (°/gün) eksen üstünde; Güneş yönünün dönüşü (+0,9856 °/gün) başvuru
export function Drift({ rate, lang }) {
  const R = Math.max(1.6, Math.abs(rate) * 1.15), x0 = 20, L = 260, X = (v) => x0 + ((v + R) / (2 * R)) * L, y = 80, sun = 0.9856;
  return (
    <Svg>
      <line x1={x0} y1={y} x2={x0 + L} y2={y} className="vz-ref" />
      <line x1={f(X(0))} y1={y - 6} x2={f(X(0))} y2={y + 6} className="vz-ref" /><Lab x={X(0)} y={y + 20} a="middle" size={9}>0</Lab>
      <line x1={f(X(sun))} y1={y - 22} x2={f(X(sun))} y2={y + 6} className="vz-ref vz-dash" /><Lab x={X(sun)} y={y - 26} a="middle" size={9}>{T(lang, 'Sun', 'Güneş')} +{num(lang, sun, 3)}</Lab>
      <line x1={f(X(rate))} y1={y - 30} x2={f(X(rate))} y2={y} className="vz-mark" /><circle cx={f(X(rate))} cy={y} r="4" className="vz-dot" />
      <Val>dΩ/dt = {num(lang, rate, 3)} °/{T(lang, 'day', 'gün')}</Val>
      <Lab x={x0} y={H - 8} size={9}>{T(lang, '← westward', '← batıya')}</Lab><Lab x={x0 + L} y={H - 8} a="end" size={9}>{T(lang, 'eastward →', 'doğuya →')}</Lab>
    </Svg>
  );
}
// kütle: nesne ve iki tanıdık başvuru, aynı ölçekte çubuk
export function Mass({ kg, lang }) {
  const tr = lang === 'tr', R = [[75, tr ? 'yetişkin insan' : 'adult person'], [1200, tr ? 'küçük otomobil' : 'small car'], [6000, tr ? 'Afrika fili' : 'African elephant'], [12000, tr ? 'şehir otobüsü' : 'city bus'], [40000, tr ? 'yüklü tır' : 'loaded lorry']];
  const above = R.find(([m]) => m >= kg) || R[R.length - 1], below = [...R].reverse().find(([m]) => m < kg) || R[0];
  const rows = [[kg, num(lang, kg, 0) + ' kg', true], ...[below, above].filter((x, k, a) => a.indexOf(x) === k).map(([m, t]) => [m, `${t} ≈ ${num(lang, m, 0)} kg`, false])];
  const max = Math.max(...rows.map((r) => r[0])), L = 230;
  return (
    <Svg>
      {rows.map(([m, t, obj], k) => <g key={k}><rect x="20" y={28 + k * 38} width={f(Math.max((m / max) * L, 1.5))} height="14" className={obj ? 'vz-fill' : 'vz-bar'} /><Lab x="20" y={22 + k * 38} obj={obj}>{t}</Lab></g>)}
    </Svg>
  );
}
// boyutlar: uzunluk × en (çap ya da açıklık) dikdörtgen ve 1,8 m başvuru çizgisi
export function Dims({ L, D, S, lang }) {
  const w = Math.max(L || 0, S || 0, D || 0), h = Math.max(Math.min(D || L || w, w), 0.1), s = Math.min(190 / w, 92 / Math.max(h, 1.8)), y = 128, rx = 250;
  return (
    <Svg>
      <line x1="10" y1={y} x2="290" y2={y} className="vz-ref" />
      <rect x="20" y={f(y - h * s)} width={f(w * s)} height={f(h * s)} className="vz-objbox" />
      <line x1={rx} y1={y} x2={rx} y2={f(y - 1.8 * s)} className="vz-mark vz-mark--ink" />
      <Lab x={rx} y={f(y - 1.8 * s - 6)} a="middle" size={9}>1{T(lang, '.', ',')}8 m</Lab>
      <Val>{num(lang, w, 1)} × {num(lang, h, 1)} m</Val>
    </Svg>
  );
}
// fırlatma zamanının kesinliği: dakikadan yıla log ekseninde pencere genişliği
export function Window({ kind, lang }) {
  const tr = lang === 'tr', min = { exact: 1, hour: 60, day: 1440, week: 10080, month: 43800, quarter: 131400, half: 262800, year: 525960 }[kind] || 1;
  const x0 = 20, L = 260, lo = 0, hi = Math.log10(525960), X = (m) => x0 + (Math.log10(m) - lo) / (hi - lo) * L, y = 82;
  const T = [[1, tr ? 'dk' : 'min'], [60, tr ? 'sa' : 'h'], [1440, tr ? 'gün' : 'day'], [10080, tr ? 'hafta' : 'wk'], [43800, tr ? 'ay' : 'mo'], [525960, tr ? 'yıl' : 'yr']];
  return (
    <Svg>
      <line x1={x0} y1={y} x2={x0 + L} y2={y} className="vz-ref" />
      {T.map(([m, t]) => <g key={t}><line x1={f(X(m))} y1={y - 5} x2={f(X(m))} y2={y + 5} className="vz-ref" /><Lab x={X(m)} y={y + 20} a="middle" size={9}>{t}</Lab></g>)}
      <rect x={x0} y={y - 9} width={f(Math.max(X(min) - x0, 3))} height="18" className="vz-fill" />
    </Svg>
  );
}
// satırlara şema ekle: rows içindeki her satır etiketine göre { node, text } (yoksa satır olduğu gibi)
export const withViz = (rows, map) => rows.map((r) => {
  if (!r || !map[r[1]]) return r;
  const x = [...r]; while (x.length < 6) x.push(null); x[6] = map[r[1]]; return x;
});
// yörünge planı (şekil modeli olmayan cisimler için büyük çizim): Güneş merkezde, gezegen yörüngeleri ölçekli (çember), cismin yörüngesi
// ekliptiğe izdüşümle (günberi boylamı ϖ = Ω + ω), günberi noktası işaretli. Ölçek cismin günötesine göre; Dünya her zaman çizilir.
const PLANETS = [[0.387, 'Mercury', 'Merkür'], [0.723, 'Venus', 'Venüs'], [1, 'Earth', 'Dünya'], [1.524, 'Mars', 'Mars'], [5.203, 'Jupiter', 'Jüpiter'], [9.537, 'Saturn', 'Satürn'], [19.19, 'Uranus', 'Uranüs'], [30.07, 'Neptune', 'Neptün']];
export function OrbitPlan({ a, e, w = 0, om = 0, lang, name }) {
  const Q = a * (1 + e), R = Math.max(Q * 1.08, 1.15), S = 136 / R, c = 150, varpi = ((om + w) % 360) * D2R, tr = lang === 'tr';
  const shown = PLANETS.filter(([r]) => r <= R && r * S > 4);
  return (
    <figure className="op">
      <svg className="vz" viewBox="0 0 300 300" width="300" height="300" aria-hidden="true" focusable="false" overflow="hidden">
        {shown.map(([r, en, trn], k) => { const ang = (100 + k * 47) * D2R; return (   // etiketler farklı açılarda: iç gezegenler üst üste binmesin
          <g key={en}>
            <circle cx={c} cy={c} r={f(r * S)} className={r === 1 ? 'vz-ref' : 'vz-ref vz-dash'} />
            <Lab x={c + r * S * Math.cos(ang)} y={c - r * S * Math.sin(ang) - 4} a="middle" size={9}>{tr ? trn : en}</Lab>
          </g>
        ); })}
        <path d={ellipse(a, e, S, c, c, varpi)} className="vz-obj" />
        <circle cx={f(c + a * (1 - e) * S * Math.cos(varpi))} cy={f(c - a * (1 - e) * S * Math.sin(varpi))} r="3.5" className="vz-dot" />
        <circle cx={c} cy={c} r="3.5" className="vz-sun" />
      </svg>
      <figcaption className="op__cap">
        <span>{tr ? `${name}: yörüngenin ekliptiğe izdüşümü, gezegen yörüngeleriyle aynı ölçekte (Güneş ortada; nokta günberi).` : `${name}: the orbit projected on the ecliptic, to scale with the planets’ orbits (Sun at centre; dot at perihelion).`}</span>
        <span className="mv__scale">{tr ? 'Ölçek' : 'Scale'} <b>{sig(lang, R, 2)} au</b></span>
      </figcaption>
    </figure>
  );
}
