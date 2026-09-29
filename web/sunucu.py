#!/usr/bin/env python3
# ROCSIM yerel sunucu: sitenin dosyaları + canlı veri vekili (tarayıcı bu kaynaklara doğrudan erişemez: CORS)
#   /api/gp?group=active        CelesTrak GP (OMM JSON), 2 saatlik önbellek (CelesTrak kuralı: grup başına 2 saatte bir indirme)
#   /api/horizons?cmd=-85&start=2026-10-10&stop=2026-10-20&step=10m
#                               JPL Horizons: Ay merkezli ICRF durum vektörleri (km, km/s), 12 saatlik önbellek
#   /api/durum                  sunucu ve önbellek bilgisi
# Yalnız Python standart kütüphanesi. Kullanım: python3 sunucu.py   (ROCSIM_PORT ile farklı kapı)
import http.server, json, os, re, sys, time, hashlib, urllib.error, urllib.parse, urllib.request, threading

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'data', 'cache')
os.makedirs(CACHE, exist_ok=True)
PORT = int(os.environ.get('ROCSIM_PORT', '8765'))
UA = {'User-Agent': 'ROCSIM/1.0 (yerel egitim simulasyonu)'}
GROUPS = {'active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days'}
HZ_ALLOWED = re.compile(r"^(-?\d{1,7}|THEMIS-[BC]|[A-Za-z0-9 \-]{1,24})$")
LOCK = threading.Lock()
HZ_LOCK = threading.Lock()                         # Horizons'a aynı anda tek istek (hız sınırı)


def http_get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


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


def celestrak(group):
    key = f'gp_{group}.json'
    with LOCK:
        data, age, fresh = read_cache(key, 2 * 3600)
        if fresh:
            return data, {'kaynak': 'önbellek', 'yas_s': round(age)}
        url = f'https://celestrak.org/NORAD/elements/gp.php?GROUP={urllib.parse.quote(group)}&FORMAT=json'
        try:
            raw = http_get(url, 90)
            arr = json.loads(raw)                    # CelesTrak veri değişmemişse düz metin döndürebilir
            if not isinstance(arr, list) or not arr:
                raise ValueError('beklenmeyen yanıt')
            write_cache(key, raw)
            return raw, {'kaynak': 'CelesTrak', 'yas_s': 0}
        except Exception as e:
            if data is not None:
                return data, {'kaynak': 'eski önbellek', 'yas_s': round(age), 'hata': str(e)[:200]}
            raise


def horizons(cmd, start, stop, step):
    key = 'hz_' + hashlib.sha1(f'{cmd}|{start}|{stop}|{step}'.encode()).hexdigest()[:16] + '.json'
    with LOCK:
        data, age, fresh = read_cache(key, 12 * 3600)
        if fresh:
            return data
    with HZ_LOCK:
        return horizons_fetch(key, cmd, start, stop, step)


def hz_get(url):
    for i in range(3):
        try:
            return http_get(url, 90)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and i < 2:
                time.sleep(2 + 3 * i)
                continue
            raise


def horizons_fetch(key, cmd, start, stop, step):
    tries, out, err = 0, None, None
    while tries < 3 and out is None:
        tries += 1
        q = {'format': 'json', 'COMMAND': f"'{cmd}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
             'CENTER': "'500@301'", 'REF_PLANE': "'FRAME'", 'REF_SYSTEM': "'ICRF'", 'VEC_TABLE': "'2'", 'OUT_UNITS': "'KM-S'",
             'CSV_FORMAT': "'YES'", 'START_TIME': f"'{start}'", 'STOP_TIME': f"'{stop}'", 'STEP_SIZE': f"'{step}'"}
        res = json.loads(hz_get('https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q))).get('result', '')
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
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
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
                return self.send_json(200, data, {'X-Rocsim-Kaynak': urllib.parse.quote(info['kaynak']), 'X-Rocsim-Yas': str(info['yas_s'])})
            if u.path == '/api/horizons':
                cmd = q.get('cmd', '')
                if not HZ_ALLOWED.match(cmd):
                    return self.send_json(400, {'hata': 'geçersiz hedef'})
                start, stop, step = q.get('start', ''), q.get('stop', ''), q.get('step', '10m')
                if not re.match(r'^\d{4}-\d\d-\d\d( \d\d:\d\d)?$', start) or not re.match(r'^\d{4}-\d\d-\d\d( \d\d:\d\d)?$', stop) or not re.match(r'^\d{1,3}[mhd]$', step):
                    return self.send_json(400, {'hata': 'geçersiz tarih/adım'})
                return self.send_json(200, horizons(cmd, start, stop, step))
            if u.path == '/api/durum':
                files = sorted(os.listdir(CACHE))
                return self.send_json(200, {'sunucu': 'ROCSIM', 'onbellek': files})
        except Exception as e:
            return self.send_json(503, {'hata': 'veri alınamadı: ' + str(e)[:200]})
        return super().do_GET()


def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'ROCSIM: http://localhost:{PORT}  (durdurmak için Ctrl+C)')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
