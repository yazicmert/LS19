// Laboratuvar › Ay'a iniş tezgâhı: mühendis iniş aracını tasarlar (kütle, yakıt, itki, Isp, kısma), başlangıç koşulunu ve güdüm yasasını seçer;
// benzetim (landbench.js: düzlemsel 3 serbestlik, RK4) iş parçacığında koşar. Çıktılar: temas hızları, yakıt, Δv bütçesi (ideal + kayıp), T/W, fazlar, profiller.
import { PRESETS, MOON, G0, TOUCH } from './landbench.js';
import { fmt } from './format.js';
import { mk, lenText, timeText, pctText, kvTable, Steps, stepsHtml, numF, cardsHtml, bindCards, fields, labWork, labWorkCancel, autoPlot, PALETTE } from './labkit.js';

const gM = MOON.MU / MOON.R ** 2;                                                       // Ay yüzeyi çekimi 1,62 m/s²
const LAW = { zem: 'ZEM/ZEV', opt: 'Yakıt-optimal', retro: 'Sabit irtifa frenleme' };
const LAW_COL = { zem: PALETTE[0], opt: PALETTE[1], retro: PALETTE[2] };

export default class LandLab {
  constructor(root) {
    this.root = root; this.res = null;
    root.innerHTML = `<p class="labsub">Bir Ay iniş aracı tasarlayın ve güçlü inişi (PDI → temas) benzetin. Model: küresel, dönmeyen Ay; düzlemsel 3 serbestlik (konum + kütle), RK4 tümleme; itki yönü anında değişir.</p>`
      + stepsHtml([
        { t: 'Araç', s: '', b: `<div class="fttl">Hazır araçlar</div><div class="chips" data-f="presets">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="chip" data-preset="${k}">${p.ad}</button>`).join('')}</div>
          <div class="frow3">${numF('Kalkış kütlesi', 'm0', 0, 'kg', 'min="1"', 'Güçlü iniş başındaki toplam kütle (yakıt dâhil)')}${numF('Yakıt', 'prop', 0, 'kg', 'min="0"', 'Kullanılabilir itki yakıtı')}${numF('En büyük itki', 'T', 0, 'kN', 'min="0.01"')}
          ${numF('Özgül itki', 'isp', 0, 's', 'min="1"', 'Isp: egzoz hızı = Isp · g₀')}${numF('En küçük kısma', 'thrMin', 0, '%', 'min="0" max="99"', 'Motorun kısılabildiği en düşük itki oranı (Apollo DPS: %10)')}</div>
          <div data-f="vehOut"></div>
          <div class="stepnav"><button type="button" class="primary" data-f="next1">Başlangıç koşuluna geç →</button></div>` },
        { t: 'Başlangıç koşulu', s: '', b: `<p class="stepsub">Güçlü iniş başlangıcı (PDI): iniş yerinin gerisinde, yatay hızla. Varsayılanlar seçili aracın hazır değerleridir.</p>
          <div class="frow3 two">${numF('Yükseklik', 'h0', 0, 'km', 'min="0.1"')}${numF('İniş yerine uzaklık', 'range', 0, 'km', 'min="0"', 'Yüzey boyunca menzil')}${numF('Yatay hız', 'vh0', 0, 'm/s', 'min="0"')}${numF('Dikey hız', 'vv0', 0, 'm/s', '', 'Yukarı +')}</div>
          <div data-f="icOut"></div>
          <div class="stepnav"><button type="button" class="primary" data-f="next2">Güdüm yasasına geç →</button></div>` },
        { t: 'Güdüm', s: '', b: cardsHtml('lbLaw', [['zem', 'ZEM/ZEV', 'Apollo E-güdüm ailesi: iki kapı + son iniş; frenleme süresi aranır'], ['opt', 'Yakıt-optimal', 'Konik programlama (SOCP), 10 s\'de bir yeniden çözüm'],
          ['retro', 'Sabit irtifa frenleme', 'Hedefsiz: tam itki, irtifa korunur; iniş yeri serbest'], ['cmp', 'Üçünü karşılaştır', 'Aynı araç ve başlangıçla üç yasa']])
          + `<details class="adv"><summary>Benzetim ve temas ölçütü</summary><div class="frow3">${numF('Tümleme adımı', 'dt', 0.1, 's', 'min="0.02" max="0.5"')}${numF('Temas: dikey ≤', 'tvz', TOUCH.vz, 'm/s', 'min="0.1"', 'Apollo LM tasarım sınırı 3,05 m/s (10 ft/s)')}${numF('Temas: yatay ≤', 'tvh', TOUCH.vh, 'm/s', 'min="0.1"', 'Apollo LM tasarım sınırı 1,22 m/s (4 ft/s)')}</div></details>
          <div class="stepnav"><button type="button" class="primary" data-f="run">Benzet</button><button type="button" class="sm" data-f="cancel" hidden>Durdur</button><span class="k small" data-f="status" role="status" aria-live="polite"></span></div>` },
        { t: 'Sonuç', s: 'Önce benzetimi çalıştırın', b: `<div class="stale" data-f="stale" hidden>Girdiler değişti: sonuç eski. <button type="button" class="sm" data-f="rerun">Yeniden benzet</button></div><div data-f="out"></div>` },
      ]);
    this.F = fields(root);
    this.steps = new Steps(root.querySelector('.steps'));
    [2, 3].forEach((n) => this.steps.set(n, { enabled: true }));
    this.law = bindCards(root, 'lbLaw', () => this.sync());
    root.querySelector('[data-f="presets"]').addEventListener('click', (e) => { const b = e.target.closest('[data-preset]'); if (b) this.preset(b.dataset.preset); });
    root.addEventListener('input', (e) => { if (e.target.matches('input[data-f]')) this.sync(true); });
    this.F.f('next1').addEventListener('click', () => this.steps.open(2));
    this.F.f('next2').addEventListener('click', () => this.steps.open(3));
    this.F.f('run').addEventListener('click', () => this.run());
    this.F.f('rerun').addEventListener('click', () => this.run());
    this.F.f('cancel').addEventListener('click', () => labWorkCancel('inis'));
    this.preset('apollo11');
  }
  preset(k) {
    const p = PRESETS[k]; this.presetKey = k;
    const S = this.F.set; S('m0', p.m0); S('prop', p.prop); S('T', p.T / 1000); S('isp', p.isp); S('thrMin', +(p.thrMin * 100).toFixed(2));
    S('h0', p.h0 / 1000); S('vh0', p.vh0); S('vv0', p.vv0); S('range', p.range / 1000);
    this.root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === k));
    this.sync(true);
  }
  params() {
    const n = this.F.n;
    return { m0: n('m0'), prop: n('prop'), T: n('T') * 1000, isp: n('isp'), thrMin: n('thrMin') / 100, h0: n('h0') * 1000, vh0: n('vh0'), vv0: n('vv0') || 0, range: n('range') * 1000 };
  }
  // araç ve başlangıç koşulundan türetilen büyüklükler (canlı)
  sync(edited = false) {
    const P = this.params(), md = P.m0 - P.prop, ve = P.isp * G0;
    if (edited) this.root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === this.presetKey && this.same(PRESETS[b.dataset.preset], P)));
    const vehErr = !(P.m0 > 0) ? 'Kalkış kütlesi girin.' : !(P.prop > 0 && P.prop < P.m0) ? 'Yakıt sıfırdan büyük ve kalkış kütlesinden küçük olmalı.' : !(P.T > 0) ? 'İtki girin.' : !(P.isp > 0) ? 'Isp girin.' : !(P.thrMin >= 0 && P.thrMin < 1) ? 'En küçük kısma %0–99 olmalı.' : '';
    const vo = this.F.f('vehOut'); vo.textContent = '';
    let dvCap = NaN;
    if (vehErr) vo.appendChild(mk('div', 'hint', vehErr));
    else {
      dvCap = ve * Math.log(P.m0 / md);
      const mdot = P.T / ve, twD = P.thrMin * P.T / (md * gM);
      vo.appendChild(kvTable([
        ['Kuru kütle', `${fmt(md)} kg`, null, 'm_kuru = m₀ − m_yakıt'], ['Yakıt kesri', pctText(P.prop / P.m0)], ['Egzoz hızı', `${fmt(ve)} m/s`, null, 'vₑ = Isp · g₀'],
        ['Δv kapasitesi', `${fmt(dvCap)} m/s`, null, 'Tsiolkovsky: Δv = vₑ ln(m₀ / m_kuru)'], ['En büyük yakıt debisi', `${fmt(mdot, 2)} kg/s`, null, 'ṁ = T / vₑ'], ['Tam itkide yanma süresi', timeText(P.prop / mdot)],
        ['İtki/ağırlık (Ay yüzeyi, dolu)', fmt(P.T / (P.m0 * gM), 2), null, 'T / (m₀ g_Ay), g_Ay = 1,62 m/s²'], ['İtki/ağırlık (Ay yüzeyi, kuru)', fmt(P.T / (md * gM), 2)],
        ['En küçük itki / kuru ağırlık', fmt(twD, 2), twD >= 1 ? 'bad' : null, '> 1 ise boşalmaya yakın araç en düşük kısmada bile yükselir: askıda kalamaz'],
        ['Tam yakıtla askıda kalma', timeText(ve / gM * Math.log(P.m0 / md)), null, 't = (vₑ / g) ln(m₀ / m_kuru)'],
      ]));
      if (twD >= 1) vo.appendChild(mk('div', 'hint', 'En küçük kısma, boşalmış aracın Ay ağırlığından büyük: son inişte askıda kalınamaz, araç yükselebilir. Kısmayı düşürün ya da kuru kütleyi artırın.'));
      if (P.T / (P.m0 * gM) < 1) vo.appendChild(mk('div', 'hint', 'İtki, dolu aracın Ay ağırlığından küçük (T/W < 1): araç başlangıçta çekimi yenemez.'));
    }
    this.steps.set(1, { summary: vehErr ? 'Girdileri tamamlayın' : `${fmt(P.m0 / 1000, 1)} t · ${fmt(P.T / 1000, 1)} kN · Isp ${fmt(P.isp)} s · Δv ${fmt(dvCap)} m/s` });
    // başlangıç koşulu: yörünge öğeleri, enerji, ideal Δv
    const io = this.F.f('icOut'); io.textContent = '';
    const icErr = !(P.h0 > 0) ? 'Yükseklik girin.' : !(P.vh0 >= 0) ? 'Yatay hız girin.' : !(P.range >= 0) ? 'Uzaklık girin.' : '';
    if (icErr) io.appendChild(mk('div', 'hint', icErr));
    else {
      const r = MOON.R + P.h0, v2 = P.vh0 ** 2 + P.vv0 ** 2, vc = Math.sqrt(MOON.MU / r), en = v2 / 2 - MOON.MU / r;
      const a = -MOON.MU / (2 * en), hAng = r * P.vh0, e = Math.sqrt(Math.max(0, 1 + 2 * en * hAng * hAng / MOON.MU ** 2));
      const rp = en < 0 ? a * (1 - e) : hAng * hAng / (MOON.MU * (1 + e)), ra = en < 0 ? a * (1 + e) : Infinity;
      const dvI = Math.sqrt(v2 + 2 * MOON.MU * (1 / MOON.R - 1 / r));
      io.appendChild(kvTable([
        ['Yerel dairesel hız', `${fmt(vc)} m/s`, null, 'v_c = √(μ / r)'], ['Yatay hız / dairesel', fmt(P.vh0 / vc, 3)], ['Uçuş yolu açısı', `${fmt(Math.atan2(P.vv0, P.vh0) * 180 / Math.PI, 2)}°`],
        ['Özgül mekanik enerji', `${fmt(en / 1000, 3)} kJ/kg`, null, 'ε = v²/2 − μ/r'],
        ['Serbest yörünge: perilune', `${fmt((rp - MOON.R) / 1000, 1)} km`, rp < MOON.R ? 'warn' : null, rp < MOON.R ? 'Negatif: itkisiz bırakılırsa yüzeye çarpar' : 'İtkisiz bırakılırsa en alçak nokta'],
        ['Serbest yörünge: apolune', Number.isFinite(ra) ? `${fmt((ra - MOON.R) / 1000, 1)} km` : 'kaçış'],
        ['İdeal Δv (enerji alt sınırı)', `${fmt(dvI)} m/s`, null, '√(v₀² + 2μ(1/R − 1/r₀)): yüzeyde anlık frenleme (çekim kaybı sıfır)'],
        ['Δv payı (kapasite − ideal)', Number.isFinite(dvCap) ? `${fmt(dvCap - dvI)} m/s (${pctText((dvCap - dvI) / dvI)})` : '—', dvCap - dvI < 0 ? 'bad' : null, 'Gerçek inişte çekim ve yönlendirme kayıpları bu paydan karşılanır'],
      ]));
      if (dvCap < dvI) io.appendChild(mk('div', 'hint', 'Araç Δv kapasitesi ideal alt sınırın bile altında: bu koşuldan güvenli iniş fiziksel olarak olanaksız.'));
      this.steps.set(2, { summary: `${fmt(P.h0 / 1000, 1)} km · ${fmt(P.vh0)} m/s · menzil ${fmt(P.range / 1000)} km` });
    }
    const lw = this.law.get();
    this.steps.set(3, { summary: lw === 'cmp' ? 'Üç yasa karşılaştırılacak' : LAW[lw] });
    this.valid = !vehErr && !icErr;
    this.F.f('run').disabled = !this.valid;
    if (this.res && edited) this.F.f('stale').hidden = false;
  }
  same(p, P) { return ['m0', 'prop', 'isp', 'h0', 'vh0', 'vv0'].every((k) => Math.abs(p[k] - P[k]) < 1e-6) && Math.abs(p.T - P.T) < 1e-3 && Math.abs(p.thrMin - P.thrMin) < 1e-6 && Math.abs(p.range - P.range) < 1e-3; }

  async run() {
    if (!this.valid || this.busy) return;
    const P = this.params(), lw = this.law.get(), laws = lw === 'cmp' ? ['zem', 'opt', 'retro'] : [lw], dt = Math.min(0.5, Math.max(0.02, this.F.n('dt') || 0.1));
    const lim = { vz: this.F.n('tvz') || TOUCH.vz, vh: this.F.n('tvh') || TOUCH.vh };
    const st = this.F.f('status'); this.busy = true; this.F.f('run').disabled = true; this.F.f('cancel').hidden = false;
    st.textContent = laws.includes('opt') ? 'Benzetiliyor (yakıt-optimal: konik çözücü yükleniyor)…' : 'Benzetiliyor…';
    try {
      const out = await labWork('inis', { kind: 'land', P, laws, dt }, (f) => { st.textContent = `Benzetiliyor… ${pctText(f)}`; });
      this.res = { P, laws, out, lim }; st.textContent = '';
      this.F.f('stale').hidden = true;
      this.render();
      [1, 2, 3].forEach((k) => this.steps.set(k, { done: true })); this.steps.set(4, { enabled: true, done: true }); this.steps.open(4);
    } catch (err) { st.textContent = err.message === 'iptal' ? 'Durduruldu.' : 'Benzetim başarısız: ' + err.message; }
    this.busy = false; this.F.f('run').disabled = !this.valid; this.F.f('cancel').hidden = true;
  }
  verdict(r, lim) {
    if (!r.landed) return { kind: 'bad', t: r.outOfFuel ? 'Yakıt bitti, iniş tamamlanamadı' : 'İniş tamamlanamadı', d: `Benzetim ${timeText(r.t)} sonunda araç hâlâ ${lenText(r.track[r.track.length - 1][1])} yükseklikte.` };
    const ok = Math.abs(r.vz) <= lim.vz && Math.abs(r.vh) <= lim.vh;
    if (ok) return { kind: 'good', t: 'Güvenli iniş', d: `Temas: dikey ${fmt(Math.abs(r.vz), 2)} m/s, yatay ${fmt(Math.abs(r.vh), 2)} m/s · ${fmt(r.propLeft)} kg yakıt kaldı (${timeText(Math.max(0, r.hoverS))} askıda kalma payı).` };
    return { kind: 'bad', t: r.outOfFuel ? 'Yakıt bitti: sert çarpma' : 'Sert iniş', d: `Temas: dikey ${fmt(Math.abs(r.vz), 2)} m/s (sınır ${fmt(lim.vz, 2)}), yatay ${fmt(Math.abs(r.vh), 2)} m/s (sınır ${fmt(lim.vh, 2)}).` };
  }
  render() {
    const { P, laws, out, lim } = this.res, box = this.F.f('out'); box.textContent = '';
    if (laws.length === 1) {
      const r = out[laws[0]], v = this.verdict(r, lim);
      this.steps.set(4, { summary: `${v.t} · ${fmt(r.propUsed)} kg yakıt`, kind: v.kind });
      const vd = mk('div', 'verdict ' + v.kind); vd.append(mk('div', 'vt', v.t), mk('div', 'vd', v.d)); box.appendChild(vd);
      if (r.fallback) box.appendChild(mk('div', 'hint', r.fallback));
      box.appendChild(this.table(r, lim));
      this.charts(box, [[laws[0], r]], true);
    } else {
      const sum = laws.map((k) => { const v = this.verdict(out[k], lim); return `${LAW[k]}: ${v.kind === 'good' ? '✓' : '✗'}`; }).join(' · ');
      this.steps.set(4, { summary: sum, kind: laws.every((k) => this.verdict(out[k], lim).kind === 'good') ? 'good' : 'bad' });
      const best = laws.filter((k) => this.verdict(out[k], lim).kind === 'good').sort((a, b) => out[a].propUsed - out[b].propUsed)[0];
      const vd = mk('div', 'verdict ' + (best ? 'info' : 'bad')); vd.append(mk('div', 'vt', best ? `En az yakıt: ${LAW[best]}` : 'Hiçbir yasa güvenli inemedi'),
        mk('div', 'vd', best ? `${fmt(out[best].propUsed)} kg yakıt, ${fmt(out[best].dvLoss)} m/s çekim + yönlendirme kaybı. Fark, frenleme sırasında çekime karşı harcanan itkiden gelir.` : 'Aracı, başlangıç koşulunu ya da temas ölçütünü değiştirin.'));
      box.appendChild(vd);
      box.appendChild(this.cmpTable(laws, out, lim));
      this.charts(box, laws.map((k) => [k, out[k]]), false);
    }
    box.appendChild(mk('p', 'note', 'Model sınırları: dönmeyen küresel Ay (gerçek inişte Ay\'ın dönmesi ekvatorda 4,6 m/s), düzlemsel hareket, anında yönelim (gerçekte dönme hızı sınırlı), arazi düz. ZEM/ZEV ve son iniş yasaları Apollo kapı değerlerine (yüksek kapı ~2,3 km, alçak kapı 150 m) yakındır. İdeal Δv, yüzeyde anlık frenlemenin gerektirdiği enerji alt sınırıdır; aradaki fark çekim ve yönlendirme kaybıdır.'));
  }
  table(r, lim) {
    const law = r.law, prop = this.res.P.prop, rows = [
      { head: 'Temas' },
      ['Dikey hız', `${fmt(Math.abs(r.vz), 2)} m/s`, r.landed && Math.abs(r.vz) > lim.vz ? 'bad' : null, `Sınır ${fmt(lim.vz, 2)} m/s`], ['Yatay hız', `${fmt(Math.abs(r.vh), 2)} m/s`, r.landed && Math.abs(r.vh) > lim.vh ? 'bad' : null, `Sınır ${fmt(lim.vh, 2)} m/s`],
      ['Hedeften sapma', law === 'retro' ? `${lenText(Math.abs(r.missM))} (hedefsiz yasa)` : lenText(Math.abs(r.missM))], ['İniş süresi (PDI → temas)', timeText(r.t)],
      { head: 'Yakıt ve Δv bütçesi' },
      ['Harcanan yakıt', `${fmt(r.propUsed)} kg (${pctText(r.propUsed / prop)})`], ['Kalan yakıt', `${fmt(r.propLeft)} kg`, r.propLeft < 0.02 * prop ? 'warn' : null], ['Kalan askıda kalma payı', timeText(Math.max(0, r.hoverS)), null, 'Kalan yakıtla Ay yüzeyinde askıda kalınabilecek süre'],
      ['Harcanan Δv', `${fmt(r.dvUsed)} m/s`, null, 'vₑ ln(m₀ / m_son)'], ['İdeal Δv (enerji alt sınırı)', `${fmt(r.dvIdeal)} m/s`], ['Çekim + yönlendirme kaybı', `${fmt(r.dvLoss)} m/s (${pctText(r.dvLoss / r.dvUsed)})`],
      ['Δv kapasitesi / kalan pay', `${fmt(r.dvCap)} / ${fmt(r.dvCap - r.dvUsed)} m/s`],
      { head: 'İtki ve yük' },
      ['İtki/ağırlık (başlangıç, yerel g)', fmt(r.tw0, 2)], ['En büyük ivme', `${fmt(r.accMaxG, 3)} g₀ = ${fmt(r.accMaxG * G0 / gM, 2)} g_Ay`],
      ['Kullanılan kısma aralığı', `%${fmt(100 * r.thrMinUsed)} – %${fmt(100 * r.thrMax)}`],
      { head: 'Güdüm' },
      ['Yasa', LAW[law]], ['Fazlar', r.phases.map(([p, t]) => `${p} ${timeText(t)}`).join(' · ')],
    ];
    if (law === 'zem') rows.push(['Seçilen frenleme süresi', `${fmt(r.tBrake)} s`, null, `${r.search.length} aday süre denendi; kısmaya sığan ve güvenli inen en az yakıtlı seçildi`]);
    if (law === 'opt' && r.plan) rows.push(['İlk plan: süre / yakıt', `${fmt(r.plan.tf, 1)} s / ${fmt(r.plan.fuel)} kg`], ['Yeniden çözüm (başarısız)', `${r.plan.replans} (${r.plan.fails})`], ['Çözücü süresi (toplam)', `${fmt(r.plan.ms)} ms`]);
    rows.push(['Hesap süresi', `${fmt(r.wallMs)} ms`]);
    return kvTable(rows);
  }
  cmpTable(laws, out, lim) {
    const t = mk('table', 'tbl cmp'), head = mk('tr'); head.appendChild(mk('th', null, ''));
    laws.forEach((k) => { const th = mk('th', 'num', LAW[k]); th.style.color = LAW_COL[k]; head.appendChild(th); });
    t.appendChild(head);
    const row = (name, f, tip) => { const tr = mk('tr'); if (tip) tr.title = tip; tr.appendChild(mk('td', null, name)); laws.forEach((k) => tr.appendChild(mk('td', 'num', f(out[k], k)))); t.appendChild(tr); };
    row('Sonuç', (r) => (this.verdict(r, lim).kind === 'good' ? 'güvenli' : r.landed ? 'sert' : 'inemedi'));
    row('Yakıt (kg)', (r) => fmt(r.propUsed)); row('Harcanan Δv (m/s)', (r) => fmt(r.dvUsed)); row('Kayıp Δv (m/s)', (r) => fmt(r.dvLoss), 'Harcanan − ideal (enerji alt sınırı)');
    row('Süre', (r) => timeText(r.t)); row('Dikey temas (m/s)', (r) => fmt(Math.abs(r.vz), 2)); row('Yatay temas (m/s)', (r) => fmt(Math.abs(r.vh), 2));
    row('Sapma', (r, k) => (k === 'retro' ? 'serbest' : lenText(Math.abs(r.missM)))); row('En büyük ivme (g₀)', (r) => fmt(r.accMaxG, 3)); row('Hesap (ms)', (r) => fmt(r.wallMs));
    return t;
  }
  charts(box, runs, single) {
    const add = (label, opts) => { const c = mk('canvas', 'chart'); c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); box.appendChild(c); autoPlot(c, () => opts); };
    const col = (k) => LAW_COL[k];
    const ser = (fx, fy, filt) => runs.map(([k, r]) => { const tr = filt ? r.track.filter(filt) : r.track; return { x: tr.map(fx), y: tr.map(fy), color: col(k), label: single ? null : LAW[k] }; });
    add('İniş yörüngesi: yükseklik – yer menzili', { title: 'Yörünge', series: ser((p) => p[2] / 1000, (p) => p[1] / 1000), xlabel: 'Yer menzili (km, iniş yeri 0)', ylabel: 'Yükseklik (km)', ymin: 0 });
    if (single) {
      const r = runs[0][1];
      add('Hızlar', { title: 'Hız bileşenleri', ylog: true, ymin: 0.1, series: [{ x: r.track.map((p) => p[0]), y: r.track.map((p) => Math.abs(p[3])), color: PALETTE[0], label: '|yatay|' }, { x: r.track.map((p) => p[0]), y: r.track.map((p) => Math.abs(p[4])), color: PALETTE[1], label: '|dikey|' }], xlabel: 'Zaman (s)', ylabel: 'm/s' });
      add('Kısma ve yunuslama', { title: 'Kısma ve itki yönü', series: [{ x: r.track.map((p) => p[0]), y: r.track.map((p) => 100 * p[5]), color: PALETTE[3], label: 'kısma (%)' }, { x: r.track.map((p) => p[0]), y: r.track.map((p) => Math.abs(p[7])), color: PALETTE[2], label: 'itkinin dikeyle açısı (°)' }], xlabel: 'Zaman (s)', ymin: -10, ymax: 105 });
      add('Kütle', { title: 'Kütle', series: [{ x: r.track.map((p) => p[0]), y: r.track.map((p) => p[6]), color: PALETTE[4] }], hlines: [{ y: this.res.P.m0 - this.res.P.prop, label: 'kuru kütle', color: '#9aa4b2' }], xlabel: 'Zaman (s)', ylabel: 'kg' });
      const term = r.track.filter((p) => p[1] < 2500);
      if (term.length > 3) add('Faz düzlemi: son iniş', { title: 'Faz düzlemi (son 2,5 km)', series: [{ x: term.map((p) => p[4]), y: term.map((p) => p[1]), color: PALETTE[0] }], vlines: [{ x: -this.res.lim.vz, label: 'temas sınırı', color: '#e66767' }], xlabel: 'Dikey hız (m/s)', ylabel: 'Yükseklik (m)', ymin: 0 });
      if (r.law === 'zem' && r.search) { const ok = r.search.filter((s) => s[1] != null); if (ok.length) add('Frenleme süresi araması', { title: 'Frenleme süresi araması', series: [{ x: ok.map((s) => s[0]), y: ok.map((s) => s[1]), color: PALETTE[5], dots: true, r: 2.4 }], vlines: [{ x: r.tBrake, label: 'seçilen' }], xlabel: 'Frenleme süresi (s)', ylabel: 'Yakıt (kg)' }); }
    } else {
      add('Kütle', { title: 'Kütle', series: ser((p) => p[0], (p) => p[6]), xlabel: 'Zaman (s)', ylabel: 'kg' });
      add('Kısma', { title: 'Kısma', series: ser((p) => p[0], (p) => 100 * p[5]), xlabel: 'Zaman (s)', ylabel: '%', ymin: 0, ymax: 105 });
      add('Faz düzlemi', { title: 'Faz düzlemi (son 2,5 km)', series: ser((p) => p[4], (p) => p[1], (p) => p[1] < 2500), xlabel: 'Dikey hız (m/s)', ylabel: 'Yükseklik (m)', ymin: 0 });
    }
  }
}
