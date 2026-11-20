// Model otomasyonu ortak yardımcıları: depo yolları, SBDB asteroit listesi, rapor yazımı.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ARA = path.join(ROOT, '.model-ara');                 // indirilen kaynaklar ve ara dosyalar (git dışı)
export const UA = { 'User-Agent': 'LS19-model-otomasyonu (+https://github.com/yazicmert/LS19)' };
fs.mkdirSync(ARA, { recursive: true });

export const arg = (ad, varsayilan = null) => { const i = process.argv.indexOf(ad); return i < 0 ? varsayilan : (process.argv[i + 1] ?? true); };
export const var_ = (ad) => process.argv.includes(ad);

export async function getText(u, { timeoutMs = 120000, deneme = 3 } = {}) {    // ağ kesilirse artan beklemeyle yeniden dener
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) throw new Error(`${u}: ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= deneme) throw e;
      console.log(`yeniden deneniyor (${i}/${deneme - 1}): ${u} — ${e.cause?.code || e.message}`); await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

// LS19'un asteroit kümesi: /api/asteroids ile aynı süzgeçler (Dünya'ya yakınlar + ana kuşak H<13,5 + Truvalılar H<13), yalnız birincil adlar
export async function sbdbListesi() {
  const SBQ = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api?', q = async (p) => JSON.parse(await getText(SBQ + new URLSearchParams({ fields: 'pdes', 'sb-kind': 'a', ...p }), { timeoutMs: 180000 }));
  const parts = [await q({ 'sb-group': 'neo' }), await q({ 'sb-class': 'IMB,MBA,OMB,MCA', 'sb-cdata': JSON.stringify({ AND: ['H|LT|13.5'] }) }),
    await q({ 'sb-class': 'TJN', 'sb-cdata': JSON.stringify({ AND: ['H|LT|13'] }) })];
  const s = new Set(parts.flatMap((p) => p.data.map((r) => String(r[0]).trim())));
  if (s.size < 40000) throw new Error(`SBDB listesi eksik (${s.size})`);
  return s;
}

// basit CSV okuyucu (tırnaklı alanlar, BOM)
export function csv(metin) {
  metin = metin.replace(/^﻿/, '');
  const satirlar = []; let alan = '', satir = [], tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) { if (c === '"') { if (metin[i + 1] === '"') { alan += '"'; i++; } else tirnak = false; } else alan += c; continue; }
    if (c === '"') tirnak = true; else if (c === ',') { satir.push(alan); alan = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && metin[i + 1] === '\n') i++; satir.push(alan); satirlar.push(satir); satir = []; alan = ''; } else alan += c;
  }
  if (alan || satir.length) { satir.push(alan); satirlar.push(satir); }
  const [bas, ...gov] = satirlar.filter((s) => s.length > 1 || s[0]);
  return gov.map((s) => Object.fromEntries(bas.map((b, i) => [b, s[i] ?? ''])));
}

// İş akışının PR gövdesine koyduğu rapor (Markdown); her araç kendi bölümünü ekler
export function rapor(bolum, metin) {
  const p = path.join(ARA, 'rapor.md');
  fs.appendFileSync(p, `\n## ${bolum}\n\n${metin.trim()}\n`);
  console.log(`\n## ${bolum}\n${metin.trim()}`);
}
