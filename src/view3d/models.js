import * as THREE from 'three';
import { sandTexture, rockTexture, makeRng } from './textures.js';

const GROUND_HEIGHT = 0.1;

function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, color, options = {}) {
  return mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options }));
}

function tint(rng, base = 1, spread = 0.2) {
  const v = base + (rng() - 0.5) * spread;
  return new THREE.Color(v, v, v);
}

// 반지름 1인 울퉁불퉁한 덩어리. 같은 위치의 꼭짓점은 같은 변위를 받아 틈이 생기지 않는다.
function lumpyGeometry(rng, amp = 0.35, detail = 2) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const p = [rng() * 10, rng() * 10, rng() * 10, rng() * 10];
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 4.1 + p[0]) * Math.cos(v.y * 3.7 + p[1])
      + 0.6 * Math.sin(v.z * 6.3 + p[2] + v.x * 2)
      + 0.3 * Math.sin((v.x + v.y + v.z) * 11 + p[3]);
    v.multiplyScalar(1 + (amp * n) / 2);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function rockMaterial(rng, color) {
  const material = new THREE.MeshStandardMaterial({
    map: rockTexture(),
    bumpMap: rockTexture(),
    bumpScale: 2,
    roughness: 1,
    flatShading: true,
  });
  material.color = color ?? tint(rng, 1, 0.3);
  return material;
}

function boulder(rng, radius, color) {
  const m = mesh(lumpyGeometry(rng), rockMaterial(rng, color));
  m.scale.set(radius * (0.9 + rng() * 0.3), radius * (0.65 + rng() * 0.25), radius * (0.9 + rng() * 0.3));
  m.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
  return m;
}

function groundSlab(rng) {
  const geometry = new THREE.BoxGeometry(1, GROUND_HEIGHT, 1);
  // 칸마다 텍스처 위치를 다르게 해서 같은 무늬가 반복돼 보이지 않게 한다.
  const ou = rng();
  const ov = rng();
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov);
  const material = new THREE.MeshStandardMaterial({
    map: sandTexture(),
    bumpMap: sandTexture(),
    bumpScale: 1.2,
    roughness: 1,
    color: tint(rng, 1, 0.14),
  });
  const ground = mesh(geometry, material);
  ground.castShadow = false;
  ground.position.y = -GROUND_HEIGHT / 2;
  return ground;
}

function pebbles(rng, group) {
  const count = Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const pebble = mesh(lumpyGeometry(rng, 0.4, 0), rockMaterial(rng));
    const r = 0.03 + rng() * 0.04;
    pebble.scale.set(r, r * 0.7, r);
    pebble.position.set((rng() - 0.5) * 0.8, r * 0.3, (rng() - 0.5) * 0.8);
    group.add(pebble);
  }
}

// 광석: 어두운 모암에서 자라난 청록색 수정 군집
const CRYSTAL_SEGMENTS = 6;

function crystal(rng, material) {
  const height = 0.22 + rng() * 0.28;
  const radius = 0.04 + rng() * 0.035;
  const group = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(radius * 0.8, radius, height, CRYSTAL_SEGMENTS), material);
  body.position.y = height / 2;
  const tip = mesh(new THREE.ConeGeometry(radius * 0.8, radius * 1.8, CRYSTAL_SEGMENTS), material);
  tip.position.y = height + radius * 0.9;
  group.add(body, tip);
  return group;
}

export function createOre(rng) {
  const ore = new THREE.Group();
  ore.name = 'ore';
  const base = boulder(rng, 0.26, new THREE.Color(0.55, 0.5, 0.48));
  base.position.y = 0.02;
  ore.add(base);

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x41f0e0,
    emissive: 0x0b9f94,
    emissiveIntensity: 0.9,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 1,
    flatShading: true,
    transparent: true,
    opacity: 0.93,
  });
  const count = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const c = crystal(rng, material);
    const angle = (i / count) * Math.PI * 2 + rng() * 0.6;
    const spread = i === 0 ? 0 : 0.07 + rng() * 0.08;
    c.position.set(Math.cos(angle) * spread, 0.1, Math.sin(angle) * spread);
    const lean = i === 0 ? 0.05 : 0.3 + rng() * 0.3;
    c.rotation.set(Math.sin(angle) * lean, rng() * Math.PI, -Math.cos(angle) * lean);
    ore.add(c);
  }
  return ore;
}

// 칸 하나: 땅 위(y=0 이상)에 종류별 물체를 얹은 그룹. 칸 중심이 그룹 원점이다.
// seed가 같으면 같은 모양이 나온다.
export function createTile(kind, seed = 0) {
  const group = new THREE.Group();
  group.name = 'tile';
  group.userData.kind = kind;
  const rng = makeRng(seed * 7919 + 13);

  if (kind === 'border') {
    // 절벽 같은 바위벽: 기반 위에 울퉁불퉁한 바위 덩어리를 겹쳐 쌓는다.
    const wallColor = new THREE.Color(0.78, 0.6, 0.5);
    const base = mesh(new THREE.BoxGeometry(1, 0.4, 1), rockMaterial(rng, wallColor));
    base.position.y = 0.2;
    group.add(base);
    for (let i = 0; i < 4; i++) {
      const blob = boulder(rng, 0.3 + rng() * 0.14, wallColor);
      blob.position.set((rng() - 0.5) * 0.55, 0.3 + rng() * 0.2, (rng() - 0.5) * 0.55);
      group.add(blob);
    }
    return group;
  }

  group.add(groundSlab(rng));

  // 칸 테두리 격자선: 칸마다 하나씩 그리면 공개된 영역에만 격자가 보인다.
  const grid = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: 0x4a2412, transparent: true, opacity: 0.4 }),
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.004;
  group.add(grid);

  if (kind === 'rock') {
    const main = boulder(rng, 0.34);
    main.position.set((rng() - 0.5) * 0.1, 0.18, (rng() - 0.5) * 0.1);
    group.add(main);
    for (let i = 0; i < 2; i++) {
      const small = boulder(rng, 0.12 + rng() * 0.08);
      small.position.set((rng() - 0.5) * 0.7, 0.07, (rng() - 0.5) * 0.7);
      group.add(small);
    }
  } else {
    if (kind === 'sample') {
      const ore = createOre(rng);
      ore.position.y = 0.02;
      group.add(ore);
    }
    pebbles(rng, group);
  }
  return group;
}

export function createRover() {
  const rover = new THREE.Group();
  rover.name = 'rover';

  const body = box(0.5, 0.2, 0.7, 0xe8e8e8, { roughness: 0.4, metalness: 0.3 });
  body.position.y = 0.25;
  rover.add(body);

  const wheelGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  rover.userData.wheels = [];
  for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
    const wheel = mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.12, z);
    // 구르는 것이 보이도록 트레드(돌기)와 허브를 단다. 바퀴와 함께 회전한다.
    const lugMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const lug = mesh(new THREE.BoxGeometry(0.02, 0.11, 0.05), lugMaterial);
      const angle = (i / 10) * Math.PI * 2;
      lug.position.set(Math.cos(angle) * 0.125, 0, Math.sin(angle) * 0.125);
      lug.rotation.y = -angle;
      wheel.add(lug);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.115, 8), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.7, roughness: 0.3 }));
    wheel.add(hub);
    rover.add(wheel);
    rover.userData.wheels.push(wheel);
  }

  // 방향 표시: 앞(-z, 북쪽)을 가리키는 노란 막대
  const nose = box(0.1, 0.1, 0.25, 0xffd400);
  nose.position.set(0, 0.4, -0.2);
  rover.add(nose);

  // 태양광 패널(뒤쪽), 마스트와 카메라(앞쪽)
  const panel = box(0.6, 0.02, 0.3, 0x1c3a73, { roughness: 0.3, metalness: 0.6 });
  panel.position.set(0, 0.38, 0.2);
  rover.add(panel);
  const mast = box(0.04, 0.3, 0.04, 0x999999, { metalness: 0.7, roughness: 0.4 });
  mast.position.set(0, 0.5, -0.2);
  rover.add(mast);
  const eye = box(0.12, 0.08, 0.08, 0x222222, { metalness: 0.5, roughness: 0.3 });
  eye.position.set(0, 0.68, -0.2);
  rover.add(eye);
  buildArm(rover);
  setArmPose(rover, ARM_STOW);
  return rover;
}

// ---- 로봇 팔: 어깨(yaw+lift) → 팔꿈치(bend) → 손목 → 집게 ----
const ARM_SHOULDER = new THREE.Vector3(0.17, 0.37, -0.25);
const ARM_L1 = 0.32;
const ARM_L2 = 0.3;
const ARM_GRIP = 0.1; // 손목에서 집게 끝(tip)까지

// 접어서 차체 위에 눕혀 둔 자세
export const ARM_STOW = { yaw: 0, lift: 3.04, bend: -2.89, down: 0, grip: 0 };

function buildArm(rover) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, metalness: 0.5, roughness: 0.5 });
  const joint = (r) => mesh(new THREE.SphereGeometry(r, 12, 10), dark);

  const shoulder = new THREE.Group();
  shoulder.position.copy(ARM_SHOULDER);
  shoulder.rotation.order = 'YXZ';
  shoulder.add(joint(0.042));
  const upper = mesh(new THREE.BoxGeometry(0.045, 0.045, ARM_L1), metal);
  upper.position.z = -ARM_L1 / 2;
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.z = -ARM_L1;
  elbow.add(joint(0.036));
  const fore = mesh(new THREE.BoxGeometry(0.038, 0.038, ARM_L2), metal);
  fore.position.z = -ARM_L2 / 2;
  elbow.add(fore);
  shoulder.add(elbow);

  const wrist = new THREE.Group();
  wrist.position.z = -ARM_L2;
  wrist.add(joint(0.03));
  const palm = mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04), dark);
  palm.position.z = -0.02;
  wrist.add(palm);
  const fingers = [-1, 1].map((side) => {
    const finger = mesh(new THREE.BoxGeometry(0.014, 0.03, 0.075), metal);
    finger.position.z = -0.075;
    finger.userData.side = side;
    wrist.add(finger);
    return finger;
  });
  const tip = new THREE.Object3D();
  tip.position.z = -ARM_GRIP;
  wrist.add(tip);
  elbow.add(wrist);

  rover.add(shoulder);
  rover.userData.arm = { shoulder, elbow, wrist, fingers, tip };
}

// 집게 끝이 target(rover 로컬 좌표)에 아래를 향해 닿는 자세를 구한다(2링크 역기구학, 팔꿈치 위).
export function armReach(target) {
  const dx = target.x - ARM_SHOULDER.x;
  const dz = target.z - ARM_SHOULDER.z;
  const v = target.y + ARM_GRIP - ARM_SHOULDER.y;
  const h = Math.hypot(dx, dz);
  const d = Math.min(ARM_L1 + ARM_L2 - 0.005, Math.max(0.12, Math.hypot(h, v)));
  const interior = Math.acos(THREE.MathUtils.clamp((ARM_L1 ** 2 + ARM_L2 ** 2 - d ** 2) / (2 * ARM_L1 * ARM_L2), -1, 1));
  const base = Math.acos(THREE.MathUtils.clamp((ARM_L1 ** 2 + d ** 2 - ARM_L2 ** 2) / (2 * ARM_L1 * d), -1, 1));
  return { yaw: Math.atan2(-dx, -dz), lift: Math.atan2(v, h) + base, bend: -(Math.PI - interior), down: 1, grip: 1 };
}

export function blendPose(a, b, w) {
  const mixKey = (key) => a[key] + (b[key] - a[key]) * w;
  return { yaw: mixKey('yaw'), lift: mixKey('lift'), bend: mixKey('bend'), down: mixKey('down'), grip: mixKey('grip') };
}

// grip: 0 닫힘 ~ 1 열림. down: 0이면 팔과 같은 방향, 1이면 집게가 수직 아래를 향한다.
export function setArmPose(rover, pose) {
  const { shoulder, elbow, wrist, fingers } = rover.userData.arm;
  shoulder.rotation.set(pose.lift, pose.yaw, 0);
  elbow.rotation.x = pose.bend;
  wrist.rotation.x = pose.down * (-Math.PI / 2 - pose.lift - pose.bend);
  for (const finger of fingers) finger.position.x = finger.userData.side * (0.014 + pose.grip * 0.034);
}

// 먼 지평선의 바위 언덕들: 안개 속에 실루엣으로 보이는 배경 장식이다.
export function createScenery(seed = 7, minRadius = 11) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  group.name = 'scenery';
  const tone = new THREE.Color(0.85, 0.62, 0.52);
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + rng() * 0.3;
    const radius = minRadius + rng() * 10;
    const rock = boulder(rng, 1.4 + rng() * 2.6, tone);
    rock.castShadow = false;
    rock.scale.y *= 1.3;
    rock.position.set(Math.cos(angle) * radius, 0.3 + rng() * 0.6, Math.sin(angle) * radius);
    group.add(rock);
  }
  return group;
}
