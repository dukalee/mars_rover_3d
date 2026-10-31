import * as THREE from 'three';

// 시드 가능한 난수 (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OCTAVES = [4, 8, 16, 32, 64];

// 가장자리가 이어지는(periodic) 값 노이즈를 여러 옥타브로 합친 fbm. u, v는 [0, 1).
function makeFbm(rng) {
  const grids = OCTAVES.map((n) => ({ n, data: Float32Array.from({ length: n * n }, rng) }));
  return (u, v) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const { n, data } of grids) {
      const x = u * n;
      const y = v * n;
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const at = (a, b) => data[(b % n) * n + (a % n)];
      const top = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
      const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
      sum += (top + (bottom - top) * sy) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));

function makeTexture(size, seed, shade) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const rng = makeRng(seed);
  const fbm = makeFbm(rng);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = shade(x / size, y / size, fbm(x / size, y / size), rng());
      const k = (y * size + x) * 4;
      image.data[k] = r;
      image.data[k + 1] = g;
      image.data[k + 2] = b;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

let sand = null;
let rock = null;

// 붉은 화성 모래: 바람 물결 무늬 + 알갱이
export function sandTexture() {
  sand ??= makeTexture(512, 11, (u, v, n, grain) => {
    const ripple = 0.5 + 0.5 * Math.sin(2 * Math.PI * (7 * u + 2.5 * (n - 0.5)));
    const t = clamp01(0.7 * n + 0.22 * ripple + 0.08 * (grain - 0.5) + 0.05);
    return mix([128, 66, 38], [214, 148, 96], t);
  });
  return sand;
}

// 거친 현무암 느낌의 바위: 층리 + 얼룩 + 알갱이
export function rockTexture() {
  rock ??= makeTexture(512, 29, (u, v, n, grain) => {
    const strata = 0.5 + 0.5 * Math.sin(2 * Math.PI * (6 * v + 1.6 * (n - 0.5)));
    const t = clamp01(0.65 * n + 0.2 * strata + 0.15 * (grain - 0.5));
    return mix([62, 50, 44], [152, 128, 110], t);
  });
  return rock;
}

// 하늘 배경: 위쪽은 탁한 분홍빛, 지평선 쪽은 butterscotch
export function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#8d6a62');
  gradient.addColorStop(0.55, '#c99472');
  gradient.addColorStop(1, '#dfb085');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 안개 덩어리용 부드러운 원형 그라데이션
export function puffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
