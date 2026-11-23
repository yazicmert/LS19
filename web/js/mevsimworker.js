// mevsim.js oran hesabı iş parçacığında (1280 × 640 × 4 dönem ≈ 0,3 sn: görev kurulurken ana iş parçacığını tutmasın)
import { mevsimOrani } from './mevsim.js';
self.onmessage = (e) => {
  const { kareler, taban } = e.data, r = mevsimOrani(kareler, taban);
  self.postMessage(r, [r.data.buffer]);
};
