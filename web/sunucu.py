#!/usr/bin/env python3
# LS19 (Look Star 19) yerel sunucu: sitenin dosyaları + canlı veri vekili (tarayıcı bu kaynaklara doğrudan erişemez: CORS)
#   /api/gp?group=active          CelesTrak GP (OMM JSON) — CelesTrak kuralı: aynı veri 2 saatten sık indirilmez
#   /api/gp?group=active&fmt=col  aynı liste sütunlu ({ n, cols }; omm_columns, api/_lib.js ommColumns ile aynı; ~%30 küçük)
#   /api/gp?catnr=5               tek uydu (NORAD), etkin listede olmayan yükler için; kayıt yoksa 404
#   /api/horizons?cmd=-85&start=2026-10-10&stop=2026-10-20&step=10m
#                                 JPL Horizons: Ay merkezli ICRF durum vektörleri (km, km/s)
#   /api/asteroids?set=neo|mb     JPL SBDB: Dünya'ya yakın asteroitler / büyük ana kuşak + Jüpiter Truvalıları (sütunlu, sıkıştırılmış)
#   /api/sbdb?des=99942           JPL SBDB tek cisim: tam duyarlıklı öğeler, fiziksel özellikler, keşif, Dünya yakın geçişleri, Sentry
#   /api/sentry                   JPL Sentry çarpma riski listesi (özet)
#   /api/supgp?file=iss           CelesTrak Supplemental GP (operatör verisi: ISS, Starlink, OneWeb, GPS…) — 2 sa önbellek
#   /api/launches                 fırlatma kataloğu: yaklaşan 30 + son 20 (The Space Devs Launch Library 2; yedek RocketLaunch.Live) — 30 dk
#   /api/surum                    kaynak sürümleri: tarayıcı 10 dakikada bir sorar, değişen katmanı yeniden yükler
#   /api/durum                    sunucu ve önbellek bilgisi
# Arka planda 10 dakikada bir denetim: süresi dolan kaynak (CelesTrak 2 sa, SBDB/Sentry 24 sa, fırlatmalar 30 dk) önceden yenilenir.
# Yalnız Python standart kütüphanesi. Kullanım: python3 sunucu.py   (LS19_PORT ile farklı kapı; LS19_HOST ile dinlenen adres,
# varsayılan 127.0.0.1 yalnız bu bilgisayar — Docker kapsayıcısında 0.0.0.0, kapıyı dışarıya compose.yaml yine yalnız 127.0.0.1'e açar)
import calendar, gzip, hashlib, http.server, json, math, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'data', 'cache')
os.makedirs(CACHE, exist_ok=True)
PORT = int(os.environ.get('LS19_PORT', os.environ.get('ROCSIM_PORT', '8765')))
HOST = os.environ.get('LS19_HOST', '127.0.0.1')
# CelesTrak toplu grupları (ör. active) tanıtıcı ve iletişim adresli bir User-Agent ister; adres olmadan 403 verebiliyor
UA = {'User-Agent': 'LS19/1.1 (Look Star 19 egitim simulasyonu; +https://github.com/yazicmert/LS19)'}
GROUPS = {'active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days'}
HZ_ALLOWED = re.compile(r"^(-?\d{1,7}|THEMIS-[BC]|[A-Za-z0-9 \-]{1,24})$")
DES_OK = re.compile(r"^[A-Za-z0-9 ()/'\-]{1,40}$")
LOCK = threading.Lock()
HZ_LOCK = threading.Lock()                          # Horizons'a aynı anda tek istek (hız sınırı)
SB_LOCK = threading.Lock()
CHECK_S = 600                                       # güncelleme denetimi: 10 dakika
# kaynak -> (önbellek dosyası, en kısa yenileme aralığı s)
SOURCES = {'gp': ('gp_active.json', 2 * 3600), 'neo': ('ast_neo.json', 24 * 3600), 'mb': ('ast_mb.json', 24 * 3600), 'sentry': ('sentry.json', 24 * 3600),
           'launch': ('launches.json', 1800)}
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


def omm_columns(arr):
    """OMM listesi -> sütunlu { n, cols }: alan adları bir kez (api/_lib.js ommColumns ile aynı; olmayan alan None)"""
    keys = []
    for o in arr:
        for k in o:
            if k not in keys:
                keys.append(k)
    return {'n': len(arr), 'cols': {k: [o.get(k) for o in arr] for k in keys}}


_COL_CACHE = {}


def celestrak_columns(group):
    """sütunlu liste; aynı ham veri için dönüşüm bir kez yapılır (7 MB JSON'u her istekte yeniden çevirmemek için)"""
    raw, info = celestrak(group)
    key = hashlib.sha1(raw).hexdigest()
    hit = _COL_CACHE.get(group)
    if not hit or hit[0] != key:
        hit = (key, json.dumps(omm_columns(json.loads(raw)), separators=(',', ':'), ensure_ascii=False).encode())
        _COL_CACHE[group] = hit
    return hit[1], info


class NoRecord(Exception):
    pass


def fetch_gp_one(n):
    raw = http_get(f'https://celestrak.org/NORAD/elements/gp.php?CATNR={n}&FORMAT=json', 30)
    try:
        arr = json.loads(raw)
    except ValueError:                               # "No GP data found" düz metni: atmosfere girmiş ya da izlenmiyor
        arr = None
    if not isinstance(arr, list) or not any(str(o.get('NORAD_CAT_ID')) == str(n) for o in arr):
        raise NoRecord('güncel yörünge verisi yok')
    return raw


def celestrak_one(n):
    """tek uydu (NORAD): etkin listede olmayan, görevi bitmiş ama yörüngedeki yükler; 2 saat önbellek"""
    return cached(f'gp_cat_{n}.json', SOURCES['gp'][1], lambda: fetch_gp_one(n))


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


# ---------------------------------------------------------------- fırlatma kataloğu (web/js/launchdata.js ile aynı biçim)
# The Space Devs Launch Library 2: ücretsiz, anahtarsız, IP başına saatte 15 istek (yenileme başına 2). Alınamazsa RocketLaunch.Live
# ücretsiz akışı (sonraki 5 fırlatma; "Data by RocketLaunch.Live" yazılır).
LL2_BASE = 'https://ll.thespacedevs.com/2.3.0/'
LL2_UPCOMING = LL2_BASE + 'launches/upcoming/?limit=30&mode=detailed&hide_recent_previous=true'
LL2_PREVIOUS = LL2_BASE + 'launches/previous/?limit=20&mode=detailed'
RLL_NEXT = 'https://fdo.rocketlaunch.live/json/launches/next/5'
LAUNCH_CREDITS = {'ll2': 'The Space Devs — Launch Library 2 (ücretsiz, anahtarsız)', 'rll': 'Data by RocketLaunch.Live'}
LAUNCH_STATUS = {1: 'go', 2: 'tbd', 3: 'basarili', 4: 'basarisiz', 5: 'bekleme', 6: 'ucusta', 7: 'kismi', 8: 'tbc'}
LAUNCH_DONE = {'basarili', 'basarisiz', 'kismi'}
ISO_RE = re.compile(r'^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(Z|[+-]\d\d:?\d\d)?$')


def iso_ms(s):
    """ISO 8601 (LL2 '2026-11-06T23:35:00Z', RocketLaunch.Live '2026-11-06T23:35Z') -> ms; saat dilimi yoksa UTC"""
    m = ISO_RE.match(s.strip()) if isinstance(s, str) else None
    if not m:
        return None
    y, mo, d, h, mi = (int(m.group(k)) for k in range(1, 6))
    sec = int(m.group(6) or 0)
    frac = int((m.group(7) or '0')[:3].ljust(3, '0'))
    off = 0
    z = m.group(8)
    if z and z != 'Z':
        z = z.replace(':', '')
        off = (1 if z[0] == '+' else -1) * (int(z[1:3]) * 60 + int(z[3:5])) * 60
    return (calendar.timegm((y, mo, d, h, mi, sec)) - off) * 1000 + frac


def lstr(x):
    return x.strip() if isinstance(x, str) and x.strip() else None


def lnum(x):
    if x is None or x == '' or isinstance(x, bool):
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v or v in (float('inf'), float('-inf')):
        return None
    r = math.floor(v * 1e5 + 0.5) / 1e5                  # JS Math.round ile aynı yuvarlama
    return int(r) if r == int(r) else r


def prec_ll2(np):
    i = np.get('id') if isinstance(np, dict) else None
    if not isinstance(i, (int, float)) or isinstance(i, bool):
        return None
    return 'sn' if i <= 0 else 'dk' if i == 1 else 'sa' if i == 2 else 'gun' if i <= 5 else 'hafta' if i == 6 else 'ay' if i == 7 \
        else 'ceyrek' if i <= 11 else 'yariyil' if i <= 13 else 'yil'


def prune(o):
    """boş alanları at (None, '', boş liste, boş sözlük): launchdata.js prune ile aynı"""
    return {k: v for k, v in o.items() if not (v is None or v == '' or (isinstance(v, (list, dict)) and not v))}


def lint(x):
    v = lnum(x)
    return None if v is None else int(math.floor(v + 0.5))


def lcut(x, n):
    v = lstr(x)
    if not v:
        return v
    return v[:n - 1].rstrip() + '…' if len(v) > n else v


def tri(x):
    return True if x is True else False if x is False else None


def detail_ll2(r):
    """ayrıntılı kipteki zengin alanlar (launchdata.js detailLL2 ile aynı)"""
    mi, lsp = r.get('mission') or {}, r.get('launch_service_provider') or {}
    cfg = (r.get('rocket') or {}).get('configuration') or {}

    def names(arr, n):
        return [lstr(a.get('name')) for a in arr if isinstance(a, dict) and lstr(a.get('name'))][:n] if isinstance(arr, list) else []
    stages = []
    for st in ((r.get('rocket') or {}).get('launcher_stage') or [])[:3]:
        L = st.get('landing') or {}
        loc, lt, ln = L.get('landing_location') or {}, L.get('type') or {}, st.get('launcher') or {}
        inis = prune({'basari': tri(L.get('success')), 'yer': lstr(loc.get('abbrev')) or lstr(loc.get('name')), 'yerAd': lstr(loc.get('name')),
                      'tip': lstr(lt.get('abbrev')), 'mesafe': lint(L.get('downrange_distance'))}) if L.get('attempt') is True else None
        x = prune({'seri': lstr(ln.get('serial_number')), 'ucus': lint(st.get('launcher_flight_number')), 'tekrar': tri(st.get('reused')), 'inis': inis})
        if x:
            stages.append(x)
    vids = [v for v in (r.get('vid_urls') or []) if isinstance(v, dict) and lstr(v.get('url')) and isinstance(v.get('url'), str) and v['url'].startswith('https://')]
    ranked = []
    for i, v in enumerate(vids):
        off = 1 if (v.get('type') or {}).get('id') == 1 else 0
        pr = lnum(v.get('priority'))
        ranked.append((-off, -(pr if pr is not None else 0), i, v, off))
    ranked.sort(key=lambda x: x[:3])
    yayin = [prune({'u': lstr(v.get('url')), 'b': lcut(v.get('title'), 90), 'resmi': True if off == 1 else None}) for *_, v, off in ranked[:2]]
    ups = r.get('updates')
    up = ups[0] if isinstance(ups, list) and ups else None
    rk = r.get('rocket') or {}

    def https(u):
        v = lstr(u)
        return v if v and v.startswith('https://') else None
    yuk = []
    for pf in (rk.get('payloads') if isinstance(rk.get('payloads'), list) else [])[:8]:
        pf = pf if isinstance(pf, dict) else {}
        p = pf.get('payload') or {}
        op, mf, n = p.get('operator') or {}, p.get('manufacturer') or {}, lint(pf.get('amount'))
        yuk.append(prune({'ad': lstr(p.get('name')), 'tur': lstr((p.get('type') or {}).get('name')), 'op': lstr(op.get('abbrev')) or lstr(op.get('name')),
                          'uretici': lstr(mf.get('abbrev')) or lstr(mf.get('name')), 'hedef': lstr(pf.get('destination')), 'adet': n if n is not None and n > 1 else None,
                          'kg': lnum(p.get('mass')), 'aciklama': lcut(p.get('description'), 400), 'url': https(p.get('info_link')), 'wiki': https(p.get('wiki_link'))}))
    scs = rk.get('spacecraft_stage') or []
    for st in (scs if isinstance(scs, list) else [scs])[:2]:
        st = st if isinstance(st, dict) else {}
        sc = st.get('spacecraft') or {}
        yuk.append(prune({'ad': lstr(sc.get('name')), 'tur': lstr((sc.get('spacecraft_config') or {}).get('name')), 'hedef': lstr(st.get('destination')), 'arac': True}))
    yuk = [x for x in yuk if x.get('ad')]
    urls = [u for u in (r.get('info_urls') or []) if isinstance(u, dict) and https(u.get('url'))]
    ranked = []
    for i, u in enumerate(urls):
        off = 1 if (u.get('type') or {}).get('id') == 1 else 0
        pr = lnum(u.get('priority'))
        ranked.append((-off, -(pr if pr is not None else 0), i, u, off))
    ranked.sort(key=lambda x: x[:3])
    site = [prune({'u': https(u.get('url')), 'k': lcut(u.get('source'), 40) or lcut(u.get('title'), 40), 'resmi': True if off == 1 else None}) for *_, u, off in ranked[:2]]
    return prune({
        'aciklama': lcut(mi.get('description'), 700),
        'gorevTur': lstr(mi.get('type')),
        'yuk': yuk,
        'site': site,
        'musteri': names(mi.get('agencies'), 3),
        'program': names(r.get('program'), 2),
        'tur': lstr((lsp.get('type') or {}).get('name')),
        'roket': prune({'toplam': lint(cfg.get('total_launch_count')), 'basarili': lint(cfg.get('successful_launches')), 'basarisiz': lint(cfg.get('failed_launches')),
                        'inis': lint(cfg.get('successful_landings')), 'inisDeneme': lint(cfg.get('attempted_landings')), 'ilk': lstr(cfg.get('maiden_flight')),
                        'leo': lint(cfg.get('leo_capacity')), 'gto': lint(cfg.get('gto_capacity')), 'tekrar': True if cfg.get('reusable') is True else None}),
        'itici': stages,
        'yayin': yayin,
        'olasilik': lint(r.get('probability')),
        'hava': lcut(r.get('weather_concerns'), 200),
        'hata': lcut(r.get('failreason'), 300),
        'sayac': prune({'yil': lint(r.get('orbital_launch_attempt_count_year')), 'rampaYil': lint(r.get('pad_launch_attempt_count_year')),
                        'rampa': lint(r.get('pad_launch_attempt_count')), 'ajansYil': lint(r.get('agency_launch_attempt_count_year'))}),
        'son': prune({'m': lcut(up.get('comment'), 160), 't': iso_ms(up.get('created_on'))}) if isinstance(up, dict) and lstr(up.get('comment')) else None,
    })


def compact_ll2(r):
    if not isinstance(r, dict) or not r.get('id'):
        return None
    net = iso_ms(r.get('net'))
    if net is None:
        return None
    mi, pad, cfg, lsp = r.get('mission') or {}, r.get('pad') or {}, (r.get('rocket') or {}).get('configuration') or {}, r.get('launch_service_provider') or {}
    loc = pad.get('location') or {}
    parts = [x.strip() for x in str(r.get('name') or '').split('|')]
    durum = LAUNCH_STATUS.get((r.get('status') or {}).get('id'), 'tbd')
    orbit = lstr((mi.get('orbit') or {}).get('abbrev'))
    ws, we = iso_ms(r.get('window_start')), iso_ms(r.get('window_end'))
    pid = pad.get('id')
    return {
        'id': str(r['id']),
        'gorev': lstr(mi.get('name')) or (parts[1] if len(parts) > 1 and parts[1] else None) or lstr(r.get('name')) or '?',
        'roket': lstr(cfg.get('full_name')) or lstr(cfg.get('name')) or (parts[0] or None) or '?',
        'saglayici': lstr(lsp.get('name')),
        'durum': durum,
        'net': net,
        'kesinlik': prec_ll2(r.get('net_precision')) or ('dk' if durum in LAUNCH_DONE else 'gun'),
        'pencere': [ws, we] if ws is not None and we is not None else None,
        'rampa': lstr(pad.get('name')),
        'rampaId': int(pid) if isinstance(pid, (int, float)) and not isinstance(pid, bool) else None,
        'yer': lstr(loc.get('name')),
        'ulke': lstr((pad.get('country') or {}).get('alpha_2_code')),
        'enlem': lnum(pad.get('latitude')),
        'boylam': lnum(pad.get('longitude')),
        'yorunge': orbit if orbit and orbit != 'N/A' else None,
        'cospar': lstr(r.get('launch_designator')),
        'canli': r.get('webcast_live') is True,
        'd': detail_ll2(r),
    }


def compact_rll(r):
    if not isinstance(r, dict) or r.get('id') is None:
        return None
    t0, wo, wc = iso_ms(r.get('t0')), iso_ms(r.get('win_open')), iso_ms(r.get('win_close'))
    try:
        sd = float(r.get('sort_date'))
    except (TypeError, ValueError):
        sd = float('nan')
    net = t0 if t0 is not None else wo if wo is not None else (int(sd * 1000) if sd == sd and sd > 0 else None)
    if net is None:
        return None
    e = r.get('est_date') or {}
    kes = 'dk' if t0 is not None or wo is not None else 'gun' if e.get('day') else 'ay' if e.get('month') else 'ceyrek' if e.get('quarter') else 'yil'
    pad = r.get('pad') or {}
    loc = pad.get('location') or {}
    mi = (r.get('missions') or [{}])[0] or {}
    try:
        res = float(r.get('result'))
    except (TypeError, ValueError):
        res = None
    durum = 'basarili' if res == 1 else 'basarisiz' if res == 0 else 'kismi' if res == 2 else 'tbd'
    name = lstr(r.get('name'))
    yer = ', '.join(x for x in (lstr(loc.get('name')), lstr(loc.get('statename')) or lstr(loc.get('state')), lstr(loc.get('country'))) if x)
    return {
        'id': 'rll-' + str(r['id']), 'gorev': (name if name and name != 'TBD' else lstr(mi.get('name'))) or '?',
        'roket': lstr((r.get('vehicle') or {}).get('name')) or '?', 'saglayici': lstr((r.get('provider') or {}).get('name')),
        'durum': durum, 'net': net, 'kesinlik': kes, 'pencere': [wo, wc] if wo is not None and wc is not None else None,
        'rampa': lstr(pad.get('name')), 'rampaId': None, 'yer': yer or None, 'ulke': None, 'enlem': None, 'boylam': None,
        'yorunge': None, 'cospar': lstr(r.get('cospar_id')), 'canli': False,
    }


def build_launch_catalog(kod, upcoming, previous, t=None):
    conv = compact_rll if kod == 'rll' else compact_ll2
    up = sorted((x for x in map(conv, upcoming or []) if x), key=lambda x: x['net'])
    prev = sorted((x for x in map(conv, previous or []) if x), key=lambda x: -x['net'])
    return {'kod': kod, 'kaynak': LAUNCH_CREDITS[kod], 't': int(time.time() * 1000) if t is None else t, 'yaklasan': up, 'gecmis': prev}


def fetch_launches():
    try:
        up = json.loads(http_get(LL2_UPCOMING, 30)).get('results')
    except Exception:
        up = None
    if isinstance(up, list):
        try:
            prev = json.loads(http_get(LL2_PREVIOUS, 30)).get('results') or []
        except Exception:
            prev = []
        cat = build_launch_catalog('ll2', up, prev)
    else:
        res = json.loads(get_retry(RLL_NEXT, 30)).get('result')
        if not isinstance(res, list) or not res:
            raise ValueError('fırlatma verisi alınamadı (LL2 ve RocketLaunch.Live)')
        cat = build_launch_catalog('rll', res, [])
    return json.dumps(cat, separators=(',', ':'), ensure_ascii=False).encode()


def launches(force=False):
    data, info = cached(SOURCES['launch'][0], SOURCES['launch'][1], fetch_launches, force=force)
    if info['kaynak'] == 'canlı' and b'"kod":"rll"' in data[:40]:      # yedek kaynak: LL2 10 dakika sonra yeniden denensin
        past = time.time() - (SOURCES['launch'][1] - 600)
        os.utime(cache_path(SOURCES['launch'][0]), (past, past))
    return data, info


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
    jobs = {'gp': lambda: celestrak('active'), 'neo': lambda: asteroids('neo'), 'mb': lambda: asteroids('mb'), 'sentry': sentry, 'launch': launches}
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
            if u.path == '/api/gp' and 'catnr' in q:
                n = q['catnr']
                if not re.match(r'^\d{1,6}$', n) or int(n) < 1:
                    return self.send_json(400, {'hata': 'geçersiz NORAD numarası'})
                try:
                    data, info = celestrak_one(int(n))
                except NoRecord as e:
                    return self.send_json(404, {'hata': str(e)})
                return self.send_json(200, data, {'X-LS19-Kaynak': urllib.parse.quote('CelesTrak · ' + info['kaynak']), 'X-LS19-Yas': str(info['yas_s'])})
            if u.path == '/api/gp':
                group = q.get('group', 'active')
                if group not in GROUPS:
                    return self.send_json(400, {'hata': 'bilinmeyen grup'})
                data, info = celestrak_columns(group) if q.get('fmt') == 'col' else celestrak(group)
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
            if u.path == '/api/launches':
                data, info = launches()
                return self.send_json(200, data, {'X-LS19-Yas': str(info['yas_s'])})
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


def make_server(port=PORT, host=HOST):
    srv = http.server.ThreadingHTTPServer((host, port), Handler)
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
