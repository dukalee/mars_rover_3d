import * as THREE from 'three';
import { tileAt, toViewCoord } from '../core/map.js';
import { MAP_SIZE } from '../core/constants.js';
import { createTile, createRover, createScenery, ARM_STOW, armReach, blendPose, setArmPose } from './models.js';
import { sandTexture, skyTexture, puffTexture, makeRng } from './textures.js';

const FOV = 45;
const ELEVATION = Math.PI * 55 / 180;
// rover 주변 한쪽 3칸 반(여유 포함)이 캔버스에 들어오게 한다.
const FIT_HALF_EXTENT = 3.5;
const MIN_DISTANCE = 5;
const MIN_ELEVATION = Math.PI * 15 / 180;
const MAX_ELEVATION = Math.PI * 85 / 180;
const ORBIT_SPEED = 0.005;

const FOG_COLOR = 0xd5a47c;
// 스텝이 도착하는 간격(ms)의 초기 추정값. 실제 간격을 재서 갱신한다.
const DEFAULT_STEP_MS = 250;
const WHEEL_RADIUS = 0.12;
const COLLECT_DELAY_MS = 200;
const COLLECT_MS = 1900;
const BUMP_MS = 700;
const BUMP_LUNGE = 0.22;
// 채집 때 팔이 거치는 지점(rover 로컬 좌표): 앞쪽 바닥, 그 위, 들어 올린 위치
const ARM_GROUND = new THREE.Vector3(0, 0.14, -0.72);
const ARM_ABOVE = new THREE.Vector3(0, 0.44, -0.72);
const ARM_CARRY = new THREE.Vector3(0, 0.55, -0.3);
// 아직 공개되지 않은 칸에 안개를 깔 범위(실제 좌표)
const FOG_MARGIN = 4;
const FOG_MIN = -FOG_MARGIN;
const FOG_MAX = MAP_SIZE - 1 + FOG_MARGIN;

// 실제 좌표를 view 좌표로 바꿔 한 칸 = 1 단위, 시작 칸이 원점이 되게 배치한다.
function placeAt(object, start, pos) {
  const view = toViewCoord(start, pos);
  object.position.x = view.x - MAP_SIZE;
  object.position.z = view.y - MAP_SIZE;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
}

// 스프라이트는 geometry를 공유하므로 재질만 해제한다.
function disposeFog(group) {
  group.traverse((child) => child.material?.dispose());
}

const hashCell = (x, y) => ((x + 50) * 73856093) ^ ((y + 50) * 19349663);
const smooth = (k) => k * k * (3 - 2 * k);

// WebGL을 쓸 수 없으면 null을 반환한다(2D 게임은 계속 진행).
export function createScene(container) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 9, 26);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const target = new THREE.Vector3();
  let azimuth = 0;
  let shakeAmp = 0; // 충돌 때 카메라 흔들림 크기
  let elevation = ELEVATION;

  // 가로세로비에 맞춰 거리를 정하고 target(rover)을 바라본다.
  function updateCamera() {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const distance = Math.max(MIN_DISTANCE, FIT_HALF_EXTENT / (tan * camera.aspect));
    camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    if (shakeAmp > 0) {
      camera.position.x += (Math.random() - 0.5) * 2 * shakeAmp;
      camera.position.y += (Math.random() - 0.5) * 2 * shakeAmp;
      camera.position.z += (Math.random() - 0.5) * 2 * shakeAmp;
    }
    camera.lookAt(target);
    // 그림자 범위가 rover를 따라가게 한다.
    light.position.set(target.x + 5, target.y + 10, target.z + 5);
    light.target.position.copy(target);
  }

  scene.add(new THREE.HemisphereLight(0xffe4c8, 0x8a5a3a, 0.95));
  const light = new THREE.DirectionalLight(0xfff0dc, 2.6);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -8;
  light.shadow.camera.right = 8;
  light.shadow.camera.top = 8;
  light.shadow.camera.bottom = -8;
  light.shadow.camera.near = 1;
  light.shadow.camera.far = 30;
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.02;
  scene.add(light, light.target);

  // 끝없는 사막: 칸 바깥에도 같은 모래가 펼쳐지고 먼 곳은 안개에 묻힌다.
  const desertTexture = sandTexture().clone();
  desertTexture.repeat.set(160, 160);
  desertTexture.needsUpdate = true;
  const desert = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({
      map: desertTexture, bumpMap: desertTexture, bumpScale: 1.2, roughness: 1, color: new THREE.Color(0.85, 0.85, 0.85),
    }),
  );
  desert.rotation.x = -Math.PI / 2;
  desert.position.y = -0.06;
  desert.receiveShadow = true;
  // 배경 바위는 맵 바깥에 둔다: 맵 대각선 절반보다 멀리서 시작한다.
  const scenery = createScenery(7, MAP_SIZE * 0.75 + 7);
  scene.add(desert, scenery);

  const puffMap = puffTexture();
  const tiles = new Map();
  const fogCells = new Map();
  const effects = [];
  let rover = null;
  let currentStart = null;
  let lastState = null;
  // 스텝마다 경로점을 쌓아 두고 일정한 속도로 이어서 달린다(스텝마다 멈추지 않는다).
  const queue = [];
  let lastYaw = 0;
  let stepMs = DEFAULT_STEP_MS;
  let lastRenderAt = null;
  let lastTime = null;
  let rafId = null;

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    updateCamera();
    if (lastState) renderer.render(scene, camera);
  }

  function createFogCell(start, x, y) {
    const rng = makeRng(hashCell(x, y));
    const group = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffMap, color: 0xe6b996, transparent: true, opacity: 0.85, depthWrite: false,
      }));
      sprite.position.set((rng() - 0.5) * 0.6, 0.35 + rng() * 0.5, (rng() - 0.5) * 0.6);
      sprite.scale.setScalar(1.5 + rng() * 0.7);
      group.add(sprite);
    }
    placeAt(group, start, { x, y });
    return group;
  }

  // ---- 애니메이션 ----
  // 효과 하나: { delay, duration, update(k), end() }. k는 0~1.
  function addEffect(effect) {
    effects.push({ ...effect, t0: performance.now() + (effect.delay ?? 0), started: !effect.waitIdle });
    startLoop();
  }

  function fadeOutFog(group) {
    addEffect({
      duration: 600,
      update(k) {
        for (const sprite of group.children) {
          sprite.material.opacity = 0.85 * (1 - smooth(k));
          sprite.scale.setScalar(sprite.scale.x * (1 + 0.004));
        }
      },
      end() {
        scene.remove(group);
        disposeFog(group);
      },
    });
  }

  // 청록색 파동과 파편이 퍼지는 연출
  function playBurst(x, y, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x66fff0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    scene.add(ring);

    const rng = makeRng(Math.floor(x * 131 + z * 71) + 5);
    const shards = [];
    for (let i = 0; i < 12; i++) {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.025 + rng() * 0.02),
        new THREE.MeshBasicMaterial({ color: 0x8ffff2, transparent: true, opacity: 0 }),
      );
      const a = rng() * Math.PI * 2;
      const speed = 0.4 + rng() * 0.7;
      shard.userData.v = new THREE.Vector3(Math.cos(a) * speed, 1.2 + rng() * 1.0, Math.sin(a) * speed);
      shard.position.set(x, y, z);
      scene.add(shard);
      shards.push(shard);
    }
    const duration = 700;
    let last = 0;
    addEffect({
      duration,
      update(k) {
        const dt = (k - last) * (duration / 1000);
        last = k;
        ring.scale.setScalar(0.2 + k * 0.9);
        ring.material.opacity = 0.8 * (1 - k);
        for (const shard of shards) {
          const v = shard.userData.v;
          v.y -= 4 * dt;
          shard.position.addScaledVector(v, dt);
          shard.rotation.x += dt * 6;
          shard.material.opacity = Math.max(0, 1 - k * k);
        }
      },
      end() {
        for (const object of [ring, ...shards]) {
          scene.remove(object);
          disposeObject(object);
        }
      },
    });
  }

  // 먼지와 불꽃이 튀는 충돌 지점 연출
  function playImpact(point) {
    const rng = makeRng(Math.floor(point.x * 97 + point.z * 53) + 11);
    const dust = [];
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: puffMap, color: 0xd9b48a, transparent: true, opacity: 0, depthWrite: false,
      }));
      sprite.position.set(point.x + (rng() - 0.5) * 0.4, 0.12, point.z + (rng() - 0.5) * 0.4);
      sprite.userData.v = new THREE.Vector3((rng() - 0.5) * 0.7, 0.25 + rng() * 0.3, (rng() - 0.5) * 0.7);
      scene.add(sprite);
      dust.push(sprite);
    }
    const sparks = [];
    for (let i = 0; i < 8; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.02 + rng() * 0.015),
        new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 1 }),
      );
      spark.position.set(point.x, 0.2, point.z);
      spark.userData.v = new THREE.Vector3((rng() - 0.5) * 2.2, 0.8 + rng() * 1.2, (rng() - 0.5) * 2.2);
      scene.add(spark);
      sparks.push(spark);
    }
    const duration = 650;
    let last = 0;
    addEffect({
      duration,
      update(k) {
        const dt = (k - last) * (duration / 1000);
        last = k;
        for (const sprite of dust) {
          sprite.position.addScaledVector(sprite.userData.v, dt);
          sprite.scale.setScalar(0.3 + k * 0.9);
          sprite.material.opacity = 0.65 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
        }
        for (const spark of sparks) {
          const v = spark.userData.v;
          v.y -= 5 * dt;
          spark.position.addScaledVector(v, dt);
          spark.material.opacity = Math.max(0, 1 - k * 1.6);
        }
      },
      end() {
        for (const sprite of dust) {
          scene.remove(sprite);
          sprite.material.dispose();
        }
        for (const spark of sparks) {
          scene.remove(spark);
          disposeObject(spark);
        }
      },
    });
  }

  // 충돌: 로버가 장애물 쪽으로 들이받았다가 튕겨 나와 흔들리며 멈춘다.
  function playBump() {
    const base = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const side = new THREE.Vector3();
    let hit = false;
    let ready = false;
    addEffect({
      duration: BUMP_MS,
      waitIdle: true,
      update(k) {
        if (!ready) {
          ready = true;
          base.copy(rover.position);
          forward.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rover.rotation.y);
          side.set(-forward.z, 0, forward.x);
        }
        // 0~0.2: 앞으로 돌진, 이후: 감쇠하며 되튕김
        const lunge = k < 0.2 ? BUMP_LUNGE * smooth(k / 0.2) : BUMP_LUNGE * Math.exp(-(k - 0.2) * 6) * Math.cos((k - 0.2) * 16);
        const wobble = k < 0.2 ? 0 : 0.025 * Math.sin((k - 0.2) * 70) * (1 - k);
        rover.position.copy(base).addScaledVector(forward, lunge).addScaledVector(side, wobble);
        if (!hit && k >= 0.2) {
          hit = true;
          const point = base.clone().addScaledVector(forward, 0.5);
          playImpact(point);
        }
        shakeAmp = k >= 0.2 ? 0.07 * (1 - (k - 0.2) / 0.8) : 0;
      },
      end() {
        shakeAmp = 0;
        rover.position.copy(base);
      },
    });
  }

  // 채집: rover의 로봇 팔이 펼쳐져 광석을 집어 올리고, 접히면서 차체에 수납한다.
  function playCollect(ore, x, z) {
    const startPos = new THREE.Vector3(x, 0.02, z);
    ore.position.copy(startPos);
    scene.add(ore);
    const arm = rover.userData.arm;
    const tipPos = new THREE.Vector3();
    const groundPos = new THREE.Vector3();
    let sparked = false;

    addEffect({
      delay: COLLECT_DELAY_MS,
      duration: COLLECT_MS,
      waitIdle: true,
      update(k) {
        // 팔 목표와 펼침 정도: 펼치기 → 내리기 → 집기 → 들어 올리기 → 접기
        let target = ARM_ABOVE;
        let reach = 1;
        let grip = 1;
        if (k < 0.18) {
          reach = smooth(k / 0.18);
        } else if (k < 0.38) {
          target = ARM_ABOVE.clone().lerp(ARM_GROUND, smooth((k - 0.18) / 0.2));
        } else if (k < 0.48) {
          target = ARM_GROUND;
          grip = 1 - smooth((k - 0.38) / 0.1);
        } else if (k < 0.68) {
          target = ARM_GROUND.clone().lerp(ARM_CARRY, smooth((k - 0.48) / 0.2));
          grip = 0;
        } else {
          target = ARM_CARRY;
          reach = 1 - smooth(Math.min(1, (k - 0.68) / 0.26));
          grip = 0;
        }
        const pose = blendPose(ARM_STOW, armReach(target), reach);
        pose.grip = grip;
        setArmPose(rover, pose);
        rover.updateMatrixWorld(true);

        // 광석: 앞쪽 바닥으로 튀어 나오고, 집힌 뒤에는 집게를 따라가며 작아진다.
        groundPos.copy(ARM_GROUND);
        rover.localToWorld(groundPos);
        groundPos.y = 0.02;
        let scale = 1;
        if (k < 0.38) {
          const s = smooth(Math.min(1, k / 0.2));
          ore.position.lerpVectors(startPos, groundPos, s);
          ore.position.y += Math.sin(s * Math.PI) * 0.18;
          ore.rotation.y = s * Math.PI;
        } else {
          scale = k < 0.68 ? 1 - 0.4 * smooth((k - 0.48) / 0.2) : 0.6 * (1 - smooth(Math.max(0, (k - 0.8) / 0.12)));
          arm.tip.getWorldPosition(tipPos);
          ore.position.set(tipPos.x, tipPos.y - 0.12 * scale, tipPos.z);
        }
        ore.scale.setScalar(Math.max(0.001, scale));
        if (!sparked && k >= 0.43) {
          sparked = true;
          playBurst(groundPos.x, 0.2, groundPos.z);
        }
      },
      end() {
        setArmPose(rover, ARM_STOW);
        scene.remove(ore);
        disposeObject(ore);
      },
    });
  }

  function tick(now) {
    rafId = null;
    let busy = false;

    const dt = Math.min(0.05, (now - (lastTime ?? now - 16)) / 1000);
    lastTime = now;
    if (queue.length > 0) {
      // 한 칸 = 스텝 간격, 90도 = 스텝 간격의 속도. 경로점이 밀리면 조금 빨리 달려 따라잡는다.
      const catchUp = 1 + 0.35 * (queue.length - 1);
      const stepSec = stepMs / 1000;
      let moveBudget = (catchUp * dt) / stepSec;
      let turnBudget = (catchUp * dt * Math.PI / 2) / stepSec;
      const prev = rover.position.clone();
      const prevYaw = rover.rotation.y;
      while (queue.length > 0) {
        const goal = queue[0];
        const gap = goal.pos.clone().sub(rover.position);
        const dist = gap.length();
        if (dist <= moveBudget) {
          rover.position.copy(goal.pos);
          moveBudget -= dist;
        } else {
          rover.position.addScaledVector(gap, moveBudget / dist);
          moveBudget = 0;
        }
        // 회전은 가속·감속(ease)을 주어 부드럽게 돈다. 진행도 p는 남은 각도 기준으로 쌓는다.
        if (goal.from === undefined) {
          goal.from = rover.rotation.y;
          goal.p = 0;
        }
        const total = Math.abs(goal.yaw - goal.from);
        if (total < 1e-6) {
          goal.p = 1;
        } else {
          const use = Math.min((1 - goal.p) * total, turnBudget);
          goal.p += use / total;
          turnBudget -= use;
        }
        rover.rotation.y = goal.from + (goal.yaw - goal.from) * smooth(Math.min(1, goal.p));
        const arrived = rover.position.distanceTo(goal.pos) < 1e-6 && goal.p >= 1;
        if (!arrived) break;
        queue.shift();
        if (moveBudget <= 0 && turnBudget <= 0) break;
      }
      // 바퀴는 미끄러지지 않고 구른다: 바퀴가 지난 거리 = 앞으로 간 거리 ± 회전에 따른 좌우 차이
      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rover.rotation.y);
      const rolled = rover.position.clone().sub(prev).dot(forward);
      const dyaw = rover.rotation.y - prevYaw;
      for (const wheel of rover.userData.wheels) {
        wheel.rotation.x -= (rolled + dyaw * wheel.position.x) / WHEEL_RADIUS;
      }
      if (queue.length > 0) busy = true;
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      // 채집 같은 연출은 로버가 목표에 도착해 멈춘 뒤에 시작한다.
      if (effect.waitIdle && !effect.started) {
        if (queue.length > 0) {
          busy = true;
          continue;
        }
        effect.started = true;
        effect.t0 = now + (effect.delay ?? 0);
      }
      if (now < effect.t0) {
        busy = true;
        continue;
      }
      const k = Math.min(1, (now - effect.t0) / effect.duration);
      effect.update(k);
      if (k >= 1) {
        effect.end();
        effects.splice(i, 1);
      } else {
        busy = true;
      }
    }

    target.copy(rover.position);
    updateCamera();
    renderer.render(scene, camera);
    if (busy) startLoop();
    else lastTime = null;
  }

  function startLoop() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function render(state, event) {
    lastState = state;
    // 채집하면 map 객체가 바뀌지만 start는 유지된다. 새 게임이면 start 객체가 다르다.
    const isNewGame = state.map.start !== currentStart;
    if (isNewGame) {
      for (const tile of tiles.values()) {
        scene.remove(tile);
        disposeObject(tile);
      }
      tiles.clear();
      for (const group of fogCells.values()) {
        scene.remove(group);
        disposeFog(group);
      }
      fogCells.clear();
      for (const effect of effects) effect.end();
      effects.length = 0;
      if (rover) {
        scene.remove(rover);
        disposeObject(rover);
      }
      rover = createRover();
      scene.add(rover);
      currentStart = state.map.start;
      // 월드 좌표는 start가 원점이므로 맵 중심은 시작 칸에 따라 달라진다.
      scenery.position.set((MAP_SIZE - 1) / 2 - state.map.start.x, 0, (MAP_SIZE - 1) / 2 - state.map.start.y);
      for (let y = FOG_MIN; y <= FOG_MAX; y++) {
        for (let x = FOG_MIN; x <= FOG_MAX; x++) {
          const key = `${x},${y}`;
          if (state.revealed.has(key)) continue;
          const group = createFogCell(state.map.start, x, y);
          scene.add(group);
          fogCells.set(key, group);
        }
      }
    }
    const { start } = state.map;
    let holdMs = 0;
    if (event === 'blocked') {
      playBump();
      holdMs = BUMP_MS;
    }
    for (const key of state.revealed) {
      const [x, y] = key.split(',').map(Number);
      const kind = tileAt(state.map, x, y);
      const old = tiles.get(key);
      if (old && old.userData.kind === kind) continue;
      const tile = createTile(kind, hashCell(x, y));
      placeAt(tile, start, { x, y });
      if (old) {
        scene.remove(old);
        // 샘플을 채집하면 광석을 떼어 내 채집 연출에 쓴다.
        const ore = old.userData.kind === 'sample' ? old.getObjectByName('ore') : null;
        if (ore) {
          playCollect(ore, old.position.x, old.position.z);
          holdMs = COLLECT_DELAY_MS + COLLECT_MS;
        }
        disposeObject(old);
      }
      scene.add(tile);
      tiles.set(key, tile);
    }
    for (const [key, group] of fogCells) {
      if (!state.revealed.has(key)) continue;
      fogCells.delete(key);
      fadeOutFog(group);
    }

    // 스텝이 도착하는 간격을 재서 이동 속도에 쓴다. 오래 쉬었다 온 첫 스텝은 무시한다.
    const arrivedAt = performance.now();
    if (lastRenderAt !== null && arrivedAt - lastRenderAt < 1000) {
      stepMs = Math.min(600, Math.max(80, (stepMs + (arrivedAt - lastRenderAt)) / 2));
    }
    lastRenderAt = arrivedAt;

    const goal = new THREE.Object3D();
    placeAt(goal, start, state.rover);
    const toYaw = -state.rover.dir * Math.PI / 2;
    if (isNewGame) {
      queue.length = 0;
      lastYaw = toYaw;
      rover.position.copy(goal.position);
      rover.rotation.y = toYaw;
    } else {
      // 가장 가까운 방향으로 돌도록, 직전 목표 각도에 가장 가까운 등가 각도를 고른다.
      const turn = ((toYaw - lastYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      lastYaw += turn;
      queue.push({ pos: goal.position.clone(), yaw: lastYaw });
    }
    target.copy(rover.position);
    updateCamera();
    renderer.render(scene, camera);
    startLoop();
    return holdMs;
  }

  // 우클릭 드래그로 rover 주위를 회전한다(좌우: 방위, 상하: 고도).
  const canvas = renderer.domElement;
  let orbiting = false;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 2) return;
    orbiting = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!orbiting) return;
    azimuth -= e.movementX * ORBIT_SPEED;
    elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation + e.movementY * ORBIT_SPEED));
    updateCamera();
    renderer.render(scene, camera);
  });
  const stopOrbit = (e) => {
    if (!orbiting) return;
    orbiting = false;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  canvas.addEventListener('pointerup', stopOrbit);
  canvas.addEventListener('pointercancel', stopOrbit);

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(container);
  resize();
  return { scene, camera, renderer, tiles, render };
}
