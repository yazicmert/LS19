// /api/horizons?cmd=-85&start=2026-10-10&stop=2026-10-20&step=10m — JPL Horizons, Ay merkezli ICRF durum vektörleri
import { send, fail, getJson } from './_lib.js';
const HZ_OK = /^(-?\d{1,7}|THEMIS-[BC]|[A-Za-z0-9 \-]{1,24})$/, D_OK = /^\d{4}-\d\d-\d\d( \d\d:\d\d)?$/, S_OK = /^\d{1,3}[mhd]$/;
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
export async function GET(req) {
  const p = new URL(req.url).searchParams, cmd = p.get('cmd') || '', step = p.get('step') || '10m';
  let start = p.get('start') || '', stop = p.get('stop') || '';
  if (!HZ_OK.test(cmd)) return fail('geçersiz hedef', 400);
  if (!D_OK.test(start) || !D_OK.test(stop) || !S_OK.test(step)) return fail('geçersiz tarih/adım', 400);
  try {
    let out = null, err = null;
    for (let tries = 0; tries < 3 && !out; tries++) {
      const q = new URLSearchParams({ format: 'json', COMMAND: `'${cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", CENTER: "'500@301'",
        REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", VEC_TABLE: "'2'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'", START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: `'${step}'` });
      const res = (await getJson('https://ssd.jpl.nasa.gov/api/horizons.api?' + q)).result || '';
      if (res.includes('$$SOE')) {
        const name = /Target body name:\s*(.+?)\s{2,}/.exec(res);
        const rows = res.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map((l) => { const c = l.split(',').map((x) => x.trim()); return [Number(c[0]), ...c.slice(2, 8).map(Number)]; });
        out = { cmd, ad: name ? name[1] : cmd, satirlar: rows }; break;
      }
      const m = /(after|prior to) A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}:\d{2})/.exec(res);
      if (m) { const iso = `${m[2]}-${MON[m[3]]}-${m[4]} ${m[5]}`; if (m[1] === 'after') stop = iso; else start = iso; continue; }
      err = res.trim().slice(-300) || 'Horizons yanıtı boş'; break;
    }
    return send(out || { cmd, hata: err || 'kapsam dışı' }, { sMaxAge: 43200, swr: 86400 });
  } catch (e) { return fail('Horizons verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
