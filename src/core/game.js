import { MAP_SIZE, INITIAL_FUEL, SEND_COST, MOVE_COST, COLLIDE_COST, COLLECT_COST } from './constants.js';
import { tileAt } from './map.js';

function reveal(revealed, cx, cy) {
  const next = new Set(revealed);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= -1 && x <= MAP_SIZE && y >= -1 && y <= MAP_SIZE) next.add(`${x},${y}`);
    }
  }
  return next;
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function createGame(map) {
  const tiles = map.tiles.map((row) => [...row]);
  const total = tiles.flat().filter((t) => t === 'sample').length;
  const { x: sx, y: sy } = map.start;

  const revealed = reveal(new Set(), sx, sy);

  return {
    map: { size: map.size, tiles, start: { ...map.start } },
    rover: { x: sx, y: sy, dir: 0 },
    fuel: INITIAL_FUEL,
    collected: 0,
    total,
    revealed,
    status: 'playing',
  };
}

export function send(state, commands) {
  if (state.status !== 'playing') return { state, steps: [] };
  if (state.fuel < SEND_COST) return { state: { ...state, status: 'fail' }, steps: [] };

  const fuel = state.fuel - SEND_COST;
  let current = { ...state, fuel, status: fuel === 0 ? 'fail' : state.status };
  const steps = [{ type: 'send', state: current }];
  if (current.status !== 'playing') return { state: current, steps };

  for (const c of commands) {
    let stop = false;
    if (c === 'L' || c === 'R') {
      const dir = (current.rover.dir + (c === 'L' ? 3 : 1)) % 4;
      current = { ...current, rover: { ...current.rover, dir } };
      steps.push({ type: 'turn', state: current });
    } else if (c === 'M') {
      const [dx, dy] = DIRS[current.rover.dir];
      const x = current.rover.x + dx;
      const y = current.rover.y + dy;
      const tile = tileAt(current.map, x, y);
      if (tile === 'ground' || tile === 'sample') {
        current = {
          ...current,
          rover: { ...current.rover, x, y },
          fuel: current.fuel - MOVE_COST,
          revealed: reveal(current.revealed, x, y),
        };
        steps.push({ type: 'move', state: current });
      } else {
        current = { ...current, fuel: current.fuel - COLLIDE_COST };
        steps.push({ type: 'blocked', state: current });
        stop = true;
      }
    } else if (c === 'C') {
      const { x, y } = current.rover;
      if (tileAt(current.map, x, y) === 'sample') {
        const tiles = current.map.tiles.map((row) => [...row]);
        tiles[y][x] = 'ground';
        current = {
          ...current,
          map: { ...current.map, tiles },
          collected: current.collected + 1,
          fuel: current.fuel - COLLECT_COST,
        };
        steps.push({ type: 'collect', state: current });
      } else {
        current = { ...current, fuel: current.fuel - COLLECT_COST };
        steps.push({ type: 'empty-collect', state: current });
      }
    }
    if (current.collected === current.total) {
      current = { ...current, status: 'success' };
      steps[steps.length - 1] = { ...steps[steps.length - 1], state: current };
      break;
    }
    if (current.fuel <= 0) {
      current = { ...current, fuel: 0, status: 'fail' };
      steps[steps.length - 1] = { ...steps[steps.length - 1], state: current };
      break;
    }
    if (stop) break;
  }
  return { state: current, steps };
}
