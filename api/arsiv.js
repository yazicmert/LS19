// /api/arsiv — "Kendi uydum" arşivi (web/js/usersat.js uydumArsivle). Tarayıcı dosyayı Vercel Blob'a doğrudan yükler (40 MB'a dek; işlev gövde sınırına takılmaz);
// bu uç yalnız kısa ömürlü yükleme anahtarı verir ve kuralları uygular:
//   · Arşiv yalnız açıkça açılınca çalışır: Vercel'de Blob deposu bağlı ve LS19_ARSIV=1. Değilse 503; tarayıcı modeli saklar, sonra yeniden dener.
//   · İki kip (GET kip): 'anahtar' — depo okuma-yazma anahtarıyla bağlı (BLOB_READ_WRITE_TOKEN): istemci anahtarı (handleUpload, tarayıcıda upload);
//     'oidc' — yeni depolar yalnız BLOB_STORE_ID ile bağlanır, işlev Vercel'in OIDC kimliğiyle imzalı yükleme adresi üretir (issueSignedToken + handleUploadPresigned,
//     tarayıcıda uploadPresigned). Kurallar iki kipte aynı.
//   · Yol arsiv/<16 onaltılık>/model.<uzantı> ya da meta.json; içerik türü ve boyut biçime göre; ad sonuna rastgele sonek (üzerine yazılamaz).
//   · Onay güncel şart sürümüyle (web/js/usersart.js SART_SURUM) verilmiş olmalı.
//   · Tarayıcıdan gelen istek aynı kökenden olmalı (başka sitenin sayfası anahtar alamaz). Yükleme bitti geri çağrısı kullanılmaz (kayıt tarayıcıdan ikinci dosya olarak gelir).
// GET: { acik, kip } — tarayıcı yüklemeye girişmeden önce sorar.
import { handleUpload, handleUploadPresigned } from '@vercel/blob/client';
import { issueSignedToken } from '@vercel/blob';
import { SART_SURUM, SINIR, BICIMLER, ARSIV_YOL } from '../web/js/usersart.js';

// Blob anahtarı: BLOB_READ_WRITE_TOKEN ya da depo bağlanırken ön ek seçildiyse <ÖNEK>_BLOB_READ_WRITE_TOKEN
export const anahtarAdi = (env = process.env) => (env.BLOB_READ_WRITE_TOKEN ? 'BLOB_READ_WRITE_TOKEN' : Object.keys(env).sort().find((k) => /^[A-Z0-9_]+_BLOB_READ_WRITE_TOKEN$/.test(k) && env[k]) || null);
// LS19_ARSIV: 1 / true / evet (boşluk ve tırnak yok sayılır)
export const bayrak = (env = process.env) => /^(1|true|evet)$/i.test(String(env.LS19_ARSIV || '').trim().replace(/^["']|["']$/g, ''));
export const kip = (env = process.env) => (anahtarAdi(env) ? 'anahtar' : env.BLOB_STORE_ID ? 'oidc' : null);
const acik = () => !!kip() && bayrak();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// denetim: arşiv neden kapalı (değer değil, yalnız var/yok): bayrak, anahtar (var | oidc: yalnız BLOB_STORE_ID, okuma-yazma anahtarı yok | yok), dağıtım ortamı
export function GET() {
  const k = anahtarAdi();
  return json({ acik: acik(), surum: SART_SURUM, kip: kip(), denetim: { LS19_ARSIV: bayrak(), anahtar: k ? 'var' : process.env.BLOB_STORE_ID ? 'oidc' : 'yok', ortam: process.env.VERCEL_ENV || 'yerel' } });
}

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
  const tur = body && body.type, istek = tur === 'blob.generate-client-token' || tur === 'blob.generate-presigned-url';
  if (istek) {
    if (!acik()) return json({ error: 'arsiv-kapali' }, 503);
    const o = request.headers.get('origin');
    if (o) { let ok = false; try { ok = new URL(o).host === new URL(request.url).host; } catch (e) { ok = false; } if (!ok) return json({ error: 'köken' }, 403); }
  }
  try {
    if (tur === 'blob.generate-presigned-url' || (!istek && kip() === 'oidc')) {
      // OIDC: depo kimliği + işlevin OIDC belirteci; yalnız bu yol ve 'put', 15 dakika. Geri çağrı kullanılmadığından imza anahtarı gerekmez (kütüphane yine ister).
      const r = await handleUploadPresigned({
        body, request, webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'kullanilmiyor',
        getSignedToken: async (pathname, clientPayload) => {
          const k = kurallar(pathname, clientPayload);
          const token = await issueSignedToken({ pathname, operations: ['put'], allowedContentTypes: k.allowedContentTypes, maximumSizeInBytes: k.maximumSizeInBytes, validUntil: Date.now() + 15 * 60e3 });
          return { token, urlOptions: { allowedContentTypes: k.allowedContentTypes, maximumSizeInBytes: k.maximumSizeInBytes, addRandomSuffix: true } };
        },
      });
      return json(r);
    }
    const r = await handleUpload({
      body, request, token: process.env[anahtarAdi()],
      onBeforeGenerateToken: async (pathname, clientPayload) => kurallar(pathname, clientPayload),
    });
    return json(r);
  } catch (e) {
    const m = String((e && e.message) || e);
    if (!/^(yol|onay)$/.test(m)) console.error('arsiv:', m);                         // Vercel günlüğünde neden görünsün (anahtar/belirteç değeri yazılmaz)
    return json({ error: /^(yol|onay)$/.test(m) ? m : 'yükleme' }, /^(yol|onay)$/.test(m) ? 400 : 500);
  }
}
