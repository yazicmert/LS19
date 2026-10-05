// Node için tarayıcıdaki importmap'in karşılığı (index.html): 'three' → lib/three.module.js, 'three/addons/…' → lib/addons/…, 'number-flow' → lib/number-flow.esm.js.
// Kullanım (test dosyasında, ilgili modülleri içe aktarmadan önce): import { register } from 'node:module'; register('./importmap_loader.mjs', import.meta.url);
const lib = new URL('../lib/', import.meta.url);
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('three.module.js', lib).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('addons/' + specifier.slice('three/addons/'.length), lib).href, shortCircuit: true };
  if (specifier === 'number-flow') return { url: new URL('number-flow.esm.js', lib).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
