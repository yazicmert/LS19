// Canlı efemerisi kur: JPL çekirdekleri + Dünya yönelim verisi -> motor sağlayıcısı
import * as E from './engine.js';
import * as EO from './earth.js';
import { SPKKernel, PCKKernel } from './jplkernel.js';
import { LiveEphemeris, BODIES, IS, IE, IM } from './ephem.js';

// sağlayıcıyı değiştirmeden kaynak kur (Canlı Gökyüzü kendi efemerisini Ay görevininkinden ayrı tutar)
export function makeLiveSource(spkBuf, pckBuf, eoData, tStart) {
  EO.loadEarthOrientation(eoData);
  const spk = spkBuf instanceof SPKKernel ? spkBuf : new SPKKernel(spkBuf), pck = pckBuf instanceof PCKKernel ? pckBuf : new PCKKernel(pckBuf);
  const et0 = tStart + (E.jdTdb(0) - 2451545.0) * 86400;
  const L = new LiveEphemeris(spk, pck, et0);
  const prov = E.liveProvider(L, EO, { IS, IE, IM, GM: BODIES.map((b) => b.gm) });
  return { L, spk, pck, et0, prov, tStart };
}
export function makeLive(spkBuf, pckBuf, eoData, tStart) {
  const s = makeLiveSource(spkBuf, pckBuf, eoData, tStart);
  E.setProvider(s.prov);
  return s;
}
export const etOf = (t) => t + (E.jdTdb(0) - 2451545.0) * 86400;
