import { MAP_SIZE, VIEW_SIZE } from '../core/constants.js';
import { tileAt, toViewCoord } from '../core/map.js';

const ARROWS = ['▲', '▶', '▼', '◀'];

export function renderMap(container, state) {
  const { start } = state.map;
  const rover = toViewCoord(start, state.rover);
  container.replaceChildren();
  container.style.display = 'grid';
  container.style.gridTemplateColumns = `repeat(${VIEW_SIZE}, 1fr)`;
  for (let y = 0; y < VIEW_SIZE; y++) {
    for (let x = 0; x < VIEW_SIZE; x++) {
      const cell = container.ownerDocument.createElement('div');
      const rx = x - MAP_SIZE + start.x;
      const ry = y - MAP_SIZE + start.y;
      const kind = state.revealed.has(`${rx},${ry}`) ? tileAt(state.map, rx, ry) : 'fog';
      cell.className = `cell ${kind}`;
      if (x === rover.x && y === rover.y) cell.textContent = ARROWS[state.rover.dir];
      container.appendChild(cell);
    }
  }
}
