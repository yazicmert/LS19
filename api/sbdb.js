// /api/sbdb?des=99942 — tek cisim: tam duyarlıklı öğeler, fiziksel özellikler, keşif, Dünya yakın geçişleri, Sentry sanal çarpıcıları
import { send, fail, getText } from './_lib.js';
const DES_OK = /^[A-Za-z0-9 ()/'\-]{1,40}$/;
export async function GET(req) {
  const des = (new URL(req.url).searchParams.get('des') || '').trim();
  if (!DES_OK.test(des)) return fail('geçersiz tanım', 400);
  const q = new URLSearchParams({ sstr: des, 'phys-par': '1', 'ca-data': '1', 'ca-body': 'Earth', discovery: '1', 'vi-data': '1', 'full-prec': '1' });
  try { return send(await getText('https://ssd-api.jpl.nasa.gov/sbdb.api?' + q), { sMaxAge: 86400, swr: 7 * 86400 }); }
  catch (e) { return fail('SBDB verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
