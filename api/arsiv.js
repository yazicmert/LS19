// /api/arsiv — "Kendi uydum" arşivi (web/js/usersat.js uydumArsivle). Tarayıcı dosyayı Vercel Blob'a doğrudan yükler (40 MB'a dek; işlev gövde sınırına takılmaz);
// bu uç yalnız kısa ömürlü yükleme anahtarı verir ve kuralları uygular:
//   · Arşiv yalnız açıkça açılınca çalışır: Vercel'de Blob deposu bağlı (BLOB_READ_WRITE_TOKEN) ve LS19_ARSIV=1. Değilse 503; tarayıcı modeli saklar, sonra yeniden dener.
//   · Yol arsiv/<16 onaltılık>/model.<uzantı> ya da meta.json; içerik türü ve boyut biçime göre; ad sonuna rastgele sonek (üzerine yazılamaz).
//   · Onay güncel şart sürümüyle (web/js/usersart.js SART_SURUM) verilmiş olmalı.
//   · Tarayıcıdan gelen istek aynı kökenden olmalı (başka sitenin sayfası anahtar alamaz). Yükleme bitti geri çağrısı kullanılmaz (kayıt tarayıcıdan ikinci dosya olarak gelir).
// GET: { acik } — tarayıcı yüklemeye girişmeden önce sorar.
import { handleUpload } from '@vercel/blob/client';
import { SART_SURUM, SINIR, BICIMLER, ARSIV_YOL } from '../web/js/usersart.js';

const acik = () => !!process.env.BLOB_READ_WRITE_TOKEN && process.env.LS19_ARSIV === '1';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export function GET() { return json({ acik: acik(), surum: SART_SURUM }); }

// yol ve istemci yükü → yükleme anahtarının kuralları (yoksa hata fırlatır); dışa açık: test/test_api.js
export function kurallar(pathname, clientPayload) {
  if (!ARSIV_YOL.test(pathname || '')) throw new Error('yol');
  let p = null; try { p = JSON.parse(clientPayload || 'null'); } catch (e) { p = null; }
  if (!p || p.surum !== SART_SURUM || !Number.isFinite(p.onay)) throw new Error('onay');
  const kayit = pathname.endsWith('/meta.json'), ext = kayit ? null : pathname.split('.').pop();
  return {
    allowedContentTypes: kayit ? ['application/json'] : [BICIMLER[ext].tur, 'application/octet-stream'],
    maximumSizeInBytes: kayit ? SINIR.kayit : SINIR.bayt,
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({ surum: p.surum, onay: p.onay }),
  };
}

export async function POST(request) {
  let body; try { body = await request.json(); } catch (e) { return json({ error: 'gövde' }, 400); }
  const istemci = body && body.type === 'blob.generate-client-token';
  if (istemci) {
    if (!acik()) return json({ error: 'arsiv-kapali' }, 503);
    const o = request.headers.get('origin');
    if (o) { let ok = false; try { ok = new URL(o).host === new URL(request.url).host; } catch (e) { ok = false; } if (!ok) return json({ error: 'köken' }, 403); }
  }
  try {
    const r = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => kurallar(pathname, clientPayload),
    });
    return json(r);
  } catch (e) {
    const m = String((e && e.message) || e);
    return json({ error: /^(yol|onay)$/.test(m) ? m : 'yükleme' }, /^(yol|onay)$/.test(m) ? 400 : 500);
  }
}
