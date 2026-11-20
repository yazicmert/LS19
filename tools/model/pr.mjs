// Model otomasyonunun son adımı (GitHub Actions): yeni varlık paketlerini ve önizleme görüntülerini Release'e yükler, dalı gönderir, PR açar.
// PR açılamazsa (depo ayarı kapalı) dal yine gönderilir; iş özetine PR açma bağlantısı yazılır.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { ROOT, ARA } from './ortak.mjs';

const sh = (c, o = {}) => execSync(c, { cwd: ROOT, stdio: o.sessiz ? 'pipe' : 'inherit', ...o })?.toString?.() ?? '';
const DEPO = process.env.GITHUB_REPOSITORY || 'yazicmert/LS19', TOKEN = process.env.GITHUB_TOKEN;
const ozet = (m) => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, m + '\n'); console.log(m); };
const api = (u, o = {}) => fetch(u.startsWith('http') ? u : `https://api.github.com${u}`, { ...o, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'ls19-model', ...(o.headers || {}) } });

// 1) varlık paketleri
sh('node tools/varliklar.mjs yukle');

// 2) önizlemeler: içerik özetli adla Release'e (git'e girmez)
const onizDir = path.join(ARA, 'onizleme'), resimler = [];
if (fs.existsSync(onizDir) && fs.readdirSync(onizDir).length) {
  const rel = await (await api(`/repos/${DEPO}/releases/tags/varliklar`)).json();
  const var_ = new Set((rel.assets || []).map((a) => a.name));
  for (const f of fs.readdirSync(onizDir).filter((x) => x.endsWith('.png'))) {
    const buf = fs.readFileSync(path.join(onizDir, f)), ad = `onizleme-${f.slice(0, -4)}-${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8)}.png`;
    if (!var_.has(ad)) {
      const r = await api(rel.upload_url.replace(/\{.*\}$/, '') + `?name=${ad}`, { method: 'POST', body: buf, headers: { 'Content-Type': 'image/png' } });
      if (!r.ok) { console.log('önizleme yüklenemedi', f, r.status); continue; }
    }
    resimler.push([f.slice(0, -4), `https://github.com/${DEPO}/releases/download/varliklar/${ad}`]);
  }
}

// 3) dal ve işleme
const tarih = new Date().toISOString().slice(0, 10), dal = `otomasyon/modeller-${tarih}-${Date.now().toString(36).slice(-4)}`;
sh('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
sh(`git checkout -q -b ${dal}`);
sh('git add varliklar.json web/models/ast/damit/damit.json web/js/satcatalog_oto.js');
sh(`git commit -q -m "3B modeller: otomatik güncelleme (${tarih})"`);
sh(`git push -q origin ${dal}`);

// 4) PR
const rapor = fs.existsSync(path.join(ARA, 'rapor.md')) ? fs.readFileSync(path.join(ARA, 'rapor.md'), 'utf8') : '';
const govde = `Aylık 3B model otomasyonu (\`.github/workflows/modeller.yml\`). Yalnız açık lisanslı kaynaklar; modeller git'e girmez: yeni paketler \`varliklar\` Release'inde, bu PR bildirimi ve kataloğu değiştirir. Testler iş akışında koştu.

**İnceleme:** yeni uydu modellerinin ölçeğini ve yönelimini önizlemelerden denetleyin (gerekirse \`web/js/satcatalog_oto.js\` içinde \`size\` / \`rot\`); istenmeyen bir eşleşmeyi \`tools/model/eslesme.json\` dosyasına \`null\` yazarak dışlayın.
${rapor}
${resimler.length ? `\n## Önizlemeler (üç açı)\n\n${resimler.map(([k, u]) => `**\`${k}\`**\n\n![${k}](${u})`).join('\n\n')}\n` : ''}`;
fs.writeFileSync(path.join(ARA, 'pr.md'), govde);
const r = await api(`/repos/${DEPO}/pulls`, { method: 'POST', body: JSON.stringify({ title: `3B modeller: otomatik güncelleme (${tarih})`, head: dal, base: 'main', body: govde }) });
if (r.ok) ozet(`PR açıldı: ${(await r.json()).html_url}`);
else {
  ozet(`PR açılamadı (${r.status}): ${(await r.text()).slice(0, 200)}\n\nDal gönderildi: \`${dal}\`. PR'ı elle açın: https://github.com/${DEPO}/compare/main...${encodeURIComponent(dal)}?expand=1\n\n` +
    '(Otomatik açılması için: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".)\n\n' + govde);
}
