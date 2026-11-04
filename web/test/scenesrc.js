// scene.js birkaç modüle bölündü (World sınıfı + gölgelendiriciler, yardımcılar, kalkış sahnesi, kamera, yüzey): kaynağı okuyan sözleşme testleri
// hepsini tek metin olarak görür. Yeni bir scene parçası eklenince yalnız bu liste güncellenir.
import fs from 'fs';
export const SCENE_PARTS = ['scene.js', 'bodyshaders.js', 'scenegeom.js', 'ascentview.js', 'camerarig.js', 'skyview.js', 'planets.js', 'surfaceview.js'];
export const sceneSrc = () => SCENE_PARTS.map((f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')).join('\n');
