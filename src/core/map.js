import { MAP_SIZE, ROCK_COUNT, SAMPLE_COUNT } from './constants.js';

function layout(rng) {
  const tiles = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill('ground'));
  const pick = (n) => Math.floor(rng() * n);
  const start = { x: pick(MAP_SIZE), y: pick(MAP_SIZE) };

  const free = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (x !== start.x || y !== start.y) free.push({ x, y });
    }
  }
  for (const kind of [...Array(ROCK_COUNT).fill('rock'), ...Array(SAMPLE_COUNT).fill('sample')]) {
    const [cell] = free.splice(pick(free.length), 1);
    tiles[cell.y][cell.x] = kind;
  }

  return { size: MAP_SIZE, tiles, start };
}

function allSamplesReachable({ tiles, start }) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_SIZE || ny >= MAP_SIZE) continue;
      if (tiles[ny][nx] === 'rock' || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push({ x: nx, y: ny });
    }
  }
  return tiles.every((row, y) => row.every((t, x) => t !== 'sample' || seen.has(`${x},${y}`)));
}

export function generateMap(rng = Math.random) {
  let map;
  do {
    map = layout(rng);
  } while (!allSamplesReachable(map));
  return map;
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return 'border';
  return map.tiles[y][x];
}

export function toViewCoord(start, { x, y }) {
  return { x: x + MAP_SIZE - start.x, y: y + MAP_SIZE - start.y };
}
