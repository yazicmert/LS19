// Görev olaylarından manevra başına Δv (m/s): hem canlı panel hem arka plandaki nominal koşu kullanır
export const DV_KEYS = ['TLI', 'MCC-1', 'MCC-2', 'MCC-3', 'LOI', 'DOI', 'PDI'];
export const DV_KEYS_HALO = ['TLI', 'MCC-1', 'MCC-2', 'MCC-3', 'NRI', 'SK', 'DEP', 'LLOI', 'DOI', 'PDI'];
// design: tasarım nesnesi (ya da profil adı); Dünya park yörüngesinde yükseltme yakışı varsa 'RAISE' satırı eklenir
export const dvKeys = (design) => {
  const d = design && typeof design === 'object' ? design : { profile: design };
  return [...(d.RAISE ? ['RAISE'] : []), ...(d.profile === 'HALO' ? DV_KEYS_HALO : DV_KEYS)];
};
export const DV_NAMES = { RAISE: 'Yörünge yükseltme (park)', TLI: 'TLI', 'MCC-1': 'MCC-1', 'MCC-2': 'MCC-2', 'MCC-3': 'MCC-3', LOI: 'LOI', NRI: 'Halo girişi (NRI)', SK: 'İstasyon tutma',
  DEP: "Halo'dan ayrılış", LLOI: 'LLO girişi', DOI: 'DOI', PDI: 'PDI (motorlu iniş)' };
export function dvFromEvents(events) {
  const ev = (k) => events.find((e) => e.key === k);
  const diff = (a, b) => (ev(a) && ev(b) ? (ev(b).dv - ev(a).dv) * 1000 : null);
  const mcc = (k) => ev(k)?.dvm ?? (ev(k + '_SKIP') ? 0 : null);
  const sk = events.filter((e) => /^SK-\d+$/.test(e.key)), skSkip = events.some((e) => /^SK-\d+_SKIP$/.test(e.key));
  const raise = events.filter((e) => /^RAISE-\d+$/.test(e.key)).map((e) => ev(e.key + '_CUT') ? (ev(e.key + '_CUT').dv - e.dv) * 1000 : null);
  return { RAISE: raise.length && raise.every((x) => x != null) ? raise.reduce((a, b) => a + b, 0) : null, TLI: diff('TLI', 'TLI_CUT'), 'MCC-1': mcc('MCC-1'), 'MCC-2': mcc('MCC-2'), 'MCC-3': mcc('MCC-3'),
    LOI: diff('LOI', 'LOI_END'), LLOI: diff('LOI', 'LOI_END'), NRI: diff('NRI', 'NRI_END'),
    SK: sk.length ? sk.reduce((s, e) => s + (e.dvm || 0), 0) : (skSkip ? 0 : null), DEP: ev('DEP')?.dvm ?? null,
    DOI: diff('DOI', 'DOI_END'), PDI: diff('PDI', 'INDI') };
}
