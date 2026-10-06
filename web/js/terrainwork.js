// İniş arazisi üreticisi (Web Worker): terraingen.js'in saf sayısal kodunu çalıştırır; ham dizileri aktararak (kopyasız) ana iş parçacığına verir.
import { terrainArrays, detailNormalData } from './terraingen.js';

self.onmessage = (e) => {
  const { dem, siteLatDeg, siteLonDeg, R_M, hSite, N } = e.data;
  const a = terrainArrays(dem, siteLatDeg, siteLonDeg, R_M, hSite, N), detailSize = 512, detail = detailNormalData(detailSize);
  self.postMessage({ ...a, detail, detailSize }, [a.pos.buffer, a.uv.buffer, a.uv1.buffer, a.col.buffer, a.idx.buffer, a.nor.buffer, detail.buffer]);
};
