#!/usr/bin/env python3
# LS19 (Look Star 19) yerel sunucu: sitenin dosyaları + canlı veri vekili (tarayıcı bu kaynaklara doğrudan erişemez: CORS)
#   /api/gp?group=active          CelesTrak GP (OMM JSON) — CelesTrak kuralı: aynı veri 2 saatten sık indirilmez
#   /api/horizons?cmd=-85&start=2026-10-10&stop=2026-10-20&step=10m
#                                 JPL Horizons: Ay merkezli ICRF durum vektörleri (km, km/s)
#   /api/asteroids?set=neo|mb     JPL SBDB: Dünya'ya yakın asteroitler / büyük ana kuşak + Jüpiter Truvalıları (sütunlu, sıkıştırılmış)
#   /api/sbdb?des=99942           JPL SBDB tek cisim: tam duyarlıklı öğeler, fiziksel özellikler, keşif, Dünya yakın geçişleri, Sentry
#   /api/sentry                   JPL Sentry çarpma riski listesi (özet)
#   /api/supgp?file=iss           CelesTrak Supplemental GP (operatör verisi: ISS, Starlink, OneWeb, GPS…) — 2 sa önbellek
#   /api/surum                    kaynak sürümleri: tarayıcı 10 dakikada bir sorar, değişen katmanı yeniden yükler
#   /api/durum                    sunucu ve önbellek bilgisi
# Arka planda 10 dakikada bir denetim: süresi dolan kaynak (CelesTrak 2 sa, SBDB/Sentry 24 sa) önceden yenilenir.
# Yalnız Python standart kütüphanesi. Kullanım: python3 sunucu.py   (LS19_PORT ile farklı kapı)
import gzip, hashlib, http.server, json, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'data', 'cache')
os.makedirs(CACHE, exist_ok=True)
PORT = int(os.environ.get('LS19_PORT', os.environ.get('ROCSIM_PORT', '8765')))
UA = {'User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu)'}
GROUPS = {'active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days'}
HZ_ALLOWED = re.compile(r"^(-?\d{1,7}|THEMIS-[BC]|[A-Za-z0-9 \-]{1,24})$")
DES_OK = re.compile(r"^[A-Za-z0-9 ()/'\-]{1,40}$")
LOCK = threading.Lock()
HZ_LOCK = threading.Lock()                          # Horizons'a aynı anda tek istek (hız sınırı)
SB_LOCK = threading.Lock()
CHECK_S = 600                                       # güncelleme denetimi: 10 dakika
# kaynak -> (önbellek dosyası, en kısa yenileme aralığı s)
SOURCES = {'gp': ('gp_active.json', 2 * 3600), 'neo': ('ast_neo.json', 24 * 3600), 'mb': ('ast_mb.json', 24 * 3600), 'sentry': ('sentry.json', 24 * 3600)}
SBQ = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api?'
SB_FIELDS = 'pdes,name,class,pha,H,diameter,albedo,epoch,a,e,i,om,w,ma,moid,rot_per,spec_B,spec_T,condition_code,data_arc,GM'


def http_get(url, timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def get_retry(url, timeout=120):
    for i in range(3):
        try:
            return http_get(url, timeout)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and i < 2:
                time.sleep(2 + 3 * i)
                continue
            raise


def cache_path(key):
    return os.path.join(CACHE, key)


def read_cache(key, max_age):
    p = cache_path(key)
    if os.path.exists(p):
        age = time.time() - os.path.getmtime(p)
        with open(p, 'rb') as f:
            return f.read(), age, age <= max_age
    return None, None, False


def write_cache(key, data):
    p = cache_path(key)
    with open(p + '.tmp', 'wb') as f:
        f.write(data)
    os.replace(p + '.tmp', p)


def cached(key, max_age, fetch, lock=LOCK, force=False):
    """önbellekten ver; süresi dolmuşsa yenile, alınamazsa eski kopya"""
    with lock:
        data, age, fresh = read_cache(key, max_age)
        if fresh and not force:
            return data, {'kaynak': 'önbellek', 'yas_s': round(age)}
        try:
            raw = fetch()
            write_cache(key, raw)
            return raw, {'kaynak': 'canlı', 'yas_s': 0}
        except Exception as e:
            if data is not None:
                return data, {'kaynak': 'eski önbellek', 'yas_s': round(age), 'hata': str(e)[:200]}
            raise


# ---------------------------------------------------------------- CelesTrak
def fetch_gp(group):
    raw = http_get(f'https://celestrak.org/NORAD/elements/gp.php?GROUP={urllib.parse.quote(group)}&FORMAT=json', 90)
    arr = json.loads(raw)                            # CelesTrak veri değişmemişse düz metin döndürebilir
    if not isinstance(arr, list) or not arr:
        raise ValueError('beklenmeyen yanıt')
    return raw


def celestrak(group, force=False):
    return cached(f'gp_{group}.json', SOURCES['gp'][1], lambda: fetch_gp(group), force=force)


SUP_FILES = {'iss', 'starlink', 'oneweb', 'planet', 'gps', 'glonass', 'intelsat', 'ses', 'kuiper', 'ast', 'cpf'}


def fetch_supgp(f):
    raw = http_get(f'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE={urllib.parse.quote(f)}&FORMAT=json', 120)
    arr = json.loads(raw)
    if not isinstance(arr, list) or not arr:
        raise ValueError('beklenmeyen yanıt')
    return raw


def supgp(f):
    return cached(f'sup_{f}.json', SOURCES['gp'][1], lambda: fetch_supgp(f))


# ---------------------------------------------------------------- JPL SBDB (asteroitler)
def num(x, sig=12):
    if x is None or x == '':
        return None
    try:
        v = float(x)
    except ValueError:
        return None
    if v != v or v in (float('inf'), float('-inf')):
        return None
    return float(f'{v:.{sig}g}')


def compact_sbdb(parts):
    """sbdb_query yanıtlarını sütunlu, küçük JSON'a çevir"""
    cols = {k: [] for k in ['des', 'name', 'cls', 'pha', 'H', 'D', 'alb', 'ep', 'a', 'e', 'i', 'om', 'w', 'ma', 'moid', 'rot', 'spec', 'cc', 'arc', 'gm']}
    for j in parts:
        f = {n: k for k, n in enumerate(j['fields'])}
        for r in j.get('data', []):
            g = lambda n: r[f[n]]
            if g('a') is None or g('e') is None or float(g('e')) >= 1:
                continue
            cols['des'].append(g('pdes')); cols['name'].append(g('name') or '')
            cols['cls'].append(g('class')); cols['pha'].append(1 if g('pha') == 'Y' else 0)
            cols['H'].append(num(g('H'), 5)); cols['D'].append(num(g('diameter'), 5)); cols['alb'].append(num(g('albedo'), 3))
            cols['ep'].append(num(g('epoch'), 10)); cols['a'].append(num(g('a'))); cols['e'].append(num(g('e')))
            cols['i'].append(num(g('i'))); cols['om'].append(num(g('om'))); cols['w'].append(num(g('w'))); cols['ma'].append(num(g('ma')))
            cols['moid'].append(num(g('moid'), 6)); cols['rot'].append(num(g('rot_per'), 6)); cols['spec'].append(g('spec_B') or g('spec_T') or '')
            cols['cc'].append(g('condition_code') or ''); cols['arc'].append(num(g('data_arc'), 7)); cols['gm'].append(num(g('GM'), 6))
    return cols


def sbq(params):
    return json.loads(get_retry(SBQ + urllib.parse.urlencode(params), 180))


def fetch_asteroids(which):
    if which == 'neo':
        parts = [sbq({'fields': SB_FIELDS, 'sb-kind': 'a', 'sb-group': 'neo', 'full-prec': '1'})]
        desc = "Dünya'ya yakın asteroitler (tümü)"
    else:
        parts = [sbq({'fields': SB_FIELDS, 'sb-kind': 'a', 'sb-class': 'IMB,MBA,OMB,MCA', 'full-prec': '1', 'sb-cdata': json.dumps({'AND': ['H|LT|13.5']})}),
                 sbq({'fields': SB_FIELDS, 'sb-kind': 'a', 'sb-class': 'TJN', 'full-prec': '1', 'sb-cdata': json.dumps({'AND': ['H|LT|13']})})]
        desc = 'Ana kuşak (H<13,5) + Jüpiter Truvalıları (H<13)'
    cols = compact_sbdb(parts)
    if len(cols['a']) < 100:
        raise ValueError('SBDB yanıtı eksik')
    out = {'set': which, 'aciklama': desc, 'kaynak': 'JPL SBDB', 't': int(time.time() * 1000), 'n': len(cols['a']), 'cols': cols}
    return json.dumps(out, separators=(',', ':')).encode()


def asteroids(which, force=False):
    return cached(SOURCES[which][0], SOURCES[which][1], lambda: fetch_asteroids(which), SB_LOCK, force)


def fetch_sentry():
    j = json.loads(get_retry('https://ssd-api.jpl.nasa.gov/sentry.api', 120))
    data = [{'des': s.get('des'), 'ip': num(s.get('ip'), 4), 'ps': num(s.get('ps_max'), 3), 'ts': s.get('ts_max'), 'range': s.get('range'),
             'n': s.get('n_imp'), 'D': num(s.get('diameter'), 3), 'vinf': num(s.get('v_inf'), 4), 'last_obs': s.get('last_obs')} for s in j.get('data', [])]
    return json.dumps({'kaynak': 'JPL Sentry', 't': int(time.time() * 1000), 'n': len(data), 'data': data}, separators=(',', ':')).encode()


def sentry(force=False):
    return cached(SOURCES['sentry'][0], SOURCES['sentry'][1], fetch_sentry, SB_LOCK, force)


def sbdb_one(des):
    key = 'sbdb_' + hashlib.sha1(des.encode()).hexdigest()[:16] + '.json'
    q = {'sstr': des, 'phys-par': '1', 'ca-data': '1', 'ca-body': 'Earth', 'discovery': '1', 'vi-data': '1', 'full-prec': '1'}
    return cached(key, 24 * 3600, lambda: get_retry('https://ssd-api.jpl.nasa.gov/sbdb.api?' + urllib.parse.urlencode(q), 60), SB_LOCK)[0]


# ---------------------------------------------------------------- JPL Horizons (Ay uyduları)
def horizons(cmd, start, stop, step):
    key = 'hz_' + hashlib.sha1(f'{cmd}|{start}|{stop}|{step}'.encode()).hexdigest()[:16] + '.json'
    with LOCK:
        data, age, fresh = read_cache(key, 12 * 3600)
        if fresh:
            return data
    with HZ_LOCK:
        return horizons_fetch(key, cmd, start, stop, step)


def horizons_fetch(key, cmd, start, stop, step):
    tries, out, err = 0, None, None
    while tries < 3 and out is None:
        tries += 1
        q = {'format': 'json', 'COMMAND': f"'{cmd}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
             'CENTER': "'500@301'", 'REF_PLANE': "'FRAME'", 'REF_SYSTEM': "'ICRF'", 'VEC_TABLE': "'2'", 'OUT_UNITS': "'KM-S'",
             'CSV_FORMAT': "'YES'", 'START_TIME': f"'{start}'", 'STOP_TIME': f"'{stop}'", 'STEP_SIZE': f"'{step}'"}
        res = json.loads(get_retry('https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q), 90)).get('result', '')
        if '$$SOE' in res:
            name = re.search(r'Target body name:\s*(.+?)\s{2,}', res)
            rows = []
            for line in res.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
                p = [x.strip() for x in line.split(',')]
                rows.append([float(p[0])] + [float(x) for x in p[2:8]])
            out = {'cmd': cmd, 'ad': name.group(1) if name else cmd, 'satirlar': rows}
            break
        # kapsam dışı: "No ephemeris for target ... after A.D. 2026-OCT-23 05:01:09" -> aralığı daralt
        m = re.search(r'(after|prior to) A\.D\. (\d{4}-[A-Z]{3}-\d{2} \d{2}:\d{2})', res)
        if m:
            t = time.strptime(m.group(2), '%Y-%b-%d %H:%M')
            iso = time.strftime('%Y-%m-%d %H:%M', t)
            if m.group(1) == 'after':
                stop = iso
            else:
                start = iso
            continue
        err = res.strip()[-300:] or 'Horizons yanıtı boş'
        break
    if out is None:
        out = {'cmd': cmd, 'hata': err or 'kapsam dışı'}
    raw = json.dumps(out).encode()
    with LOCK:
        write_cache(key, raw)
    return raw


# ---------------------------------------------------------------- sürümler ve 10 dakikalık denetim
STATUS = {'son_denetim': None, 'sonraki': None, 'hatalar': {}}


def versions():
    out = {}
    for k, (fn, iv) in SOURCES.items():
        p = cache_path(fn)
        mt = os.path.getmtime(p) if os.path.exists(p) else None
        out[k] = {'surum': int(mt) if mt else None, 'aralik_s': iv, 'yas_s': round(time.time() - mt) if mt else None,
                  'hata': STATUS['hatalar'].get(k)}
    return {'mod': 'yerel', 'simdi': int(time.time() * 1000), 'denetim_s': CHECK_S, 'son_denetim': STATUS['son_denetim'],
            'sonraki': STATUS['sonraki'], 'kaynaklar': out}


def refresher():
    jobs = {'gp': lambda: celestrak('active'), 'neo': lambda: asteroids('neo'), 'mb': lambda: asteroids('mb'), 'sentry': sentry}
    while True:
        for k, job in jobs.items():
            try:
                job()                                # süresi dolmamışsa önbellekten döner (indirme yok)
                STATUS['hatalar'].pop(k, None)
            except Exception as e:
                STATUS['hatalar'][k] = str(e)[:160]
        STATUS['son_denetim'] = int(time.time() * 1000)
        STATUS['sonraki'] = STATUS['son_denetim'] + CHECK_S * 1000
        time.sleep(CHECK_S)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        if '/api/' in (self.path or ''):
            sys.stderr.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), fmt % args))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_json(self, code, body, extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        gz = 'gzip' in (self.headers.get('Accept-Encoding') or '') and len(body) > 4096
        if gz:
            body = gzip.compress(body, 5)
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        if gz:
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path == '/api/gp':
                group = q.get('group', 'active')
                if group not in GROUPS:
                    return self.send_json(400, {'hata': 'bilinmeyen grup'})
                data, info = celestrak(group)
                return self.send_json(200, data, {'X-LS19-Kaynak': urllib.parse.quote(info['kaynak']), 'X-LS19-Yas': str(info['yas_s'])})
            if u.path == '/api/asteroids':
                which = q.get('set', 'neo')
                if which not in ('neo', 'mb'):
                    return self.send_json(400, {'hata': 'bilinmeyen küme'})
                data, info = asteroids(which)
                return self.send_json(200, data, {'X-LS19-Kaynak': urllib.parse.quote(info['kaynak']), 'X-LS19-Yas': str(info['yas_s'])})
            if u.path == '/api/supgp':
                f = q.get('file', '')
                if f not in SUP_FILES:
                    return self.send_json(400, {'hata': 'bilinmeyen dosya'})
                data, info = supgp(f)
                return self.send_json(200, data, {'X-LS19-Kaynak': urllib.parse.quote('CelesTrak SupGP · ' + info['kaynak']), 'X-LS19-Yas': str(info['yas_s'])})
            if u.path == '/api/sentry':
                return self.send_json(200, sentry()[0])
            if u.path == '/api/sbdb':
                des = q.get('des', '').strip()
                if not DES_OK.match(des):
                    return self.send_json(400, {'hata': 'geçersiz tanım'})
                return self.send_json(200, sbdb_one(des))
            if u.path == '/api/horizons':
                cmd = q.get('cmd', '')
                if not HZ_ALLOWED.match(cmd):
                    return self.send_json(400, {'hata': 'geçersiz hedef'})
                start, stop, step = q.get('start', ''), q.get('stop', ''), q.get('step', '10m')
                if not re.match(r'^\d{4}-\d\d-\d\d( \d\d:\d\d)?$', start) or not re.match(r'^\d{4}-\d\d-\d\d( \d\d:\d\d)?$', stop) or not re.match(r'^\d{1,3}[mhd]$', step):
                    return self.send_json(400, {'hata': 'geçersiz tarih/adım'})
                return self.send_json(200, horizons(cmd, start, stop, step))
            if u.path == '/api/surum':
                return self.send_json(200, versions())
            if u.path == '/api/durum':
                return self.send_json(200, {'sunucu': 'LS19', 'onbellek': sorted(os.listdir(CACHE)), **versions()})
        except Exception as e:
            return self.send_json(503, {'hata': 'veri alınamadı: ' + str(e)[:200]})
        return super().do_GET()


def make_server(port=PORT):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    threading.Thread(target=refresher, daemon=True).start()
    return srv


def main():
    srv = make_server()
    print(f'LS19 (Look Star 19): http://localhost:{PORT}  (durdurmak için Ctrl+C)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
