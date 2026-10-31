import { initScreens } from './ui/screens.js';
import { createScene } from './view3d/scene.js';
import { initTelemetry } from './ui/telemetry.js';
import { MAP_SIZE, SAMPLE_COUNT, INITIAL_FUEL } from './core/constants.js';

// 타이틀의 임무 브리핑 표는 상수에서 채운다.
document.getElementById('brief-map').textContent = `${MAP_SIZE} × ${MAP_SIZE}`;
document.getElementById('brief-samples').textContent = String(SAMPLE_COUNT);
document.getElementById('brief-fuel').textContent = String(INITIAL_FUEL);

initTelemetry(document.getElementById('telemetry'));

let scene3d = null;
let sceneTried = false;
initScreens(document, (game, event) => {
  if (!sceneTried) {
    sceneTried = true;
    scene3d = createScene(document.getElementById('view3d'));
  }
  // 3D 연출이 끝날 때까지 필요한 시간(ms)을 돌려주어 다음 스텝이 기다리게 한다.
  return scene3d ? scene3d.render(game, event) : 0;
});
