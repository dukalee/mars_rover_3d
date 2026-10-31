// 우주공학 화면 분위기용 텔레메트리: 의미 없는 수치가 계속 바뀌어 보인다. 게임 규칙과 무관하다.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pad = (n, width) => String(Math.trunc(n)).padStart(width, '0');
const signed = (v, digits) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(digits)}`;

// 한 줄에 놓일 필드들. step이 값을 갱신하고 fmt가 고정 폭 문자열로 바꾼다.
function createFields(rng) {
  const walk = (v, size, lo, hi) => clamp(v + (rng() - 0.5) * 2 * size, lo, hi);
  const hex = () => Array.from({ length: 8 }, () => Math.floor(rng() * 16).toString(16)).join('').toUpperCase();
  return [
    [
      { label: 'SOL', value: 147, step: (v) => v, fmt: (v) => pad(v, 4) },
      { label: 'LTST', value: 14 * 3600 + 32 * 60, step: (v, dt) => v + dt / 1000, fmt: (v) => `${pad(v / 3600 % 24, 2)}:${pad(v / 60 % 60, 2)}:${pad(v % 60, 2)}` },
      { label: 'TLM', value: 0, step: hex, fmt: (v) => `0x${v}` },
      { label: 'PKT', value: 4821, step: (v) => v + 1 + Math.floor(rng() * 3), fmt: (v) => pad(v, 6) },
    ],
    [
      { label: 'BAT', value: 98.4, step: (v) => walk(v, 0.03, 92, 100), fmt: (v) => `${v.toFixed(2)}%` },
      { label: 'TEMP', value: -62.8, step: (v) => walk(v, 0.4, -72, -55), fmt: (v) => `${signed(v, 1)}°C` },
      { label: 'RSSI', value: -87, step: (v) => walk(v, 1.5, -96, -78), fmt: (v) => `${signed(Math.round(v), 0)}dBm` },
      { label: 'PITCH', value: 2.1, step: (v) => walk(v, 0.25, -6, 6), fmt: (v) => `${signed(v, 1)}°` },
      { label: 'ROLL', value: -0.4, step: (v) => walk(v, 0.25, -6, 6), fmt: (v) => `${signed(v, 1)}°` },
    ],
  ];
}

// el 안에 두 줄의 필드를 만들고 intervalMs마다 값을 바꾼다. 멈추는 함수를 돌려준다.
export function initTelemetry(el, { intervalMs = 180, rng = Math.random } = {}) {
  const doc = el.ownerDocument;
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tickMs = reduced ? 1000 : intervalMs;
  const rows = createFields(rng);
  const cells = [];

  el.replaceChildren();
  for (const fields of rows) {
    const row = doc.createElement('div');
    row.className = 'tm-row';
    for (const field of fields) {
      const item = doc.createElement('span');
      item.className = 'tm';
      const label = doc.createElement('b');
      label.textContent = field.label;
      const value = doc.createElement('i');
      item.append(label, value);
      row.appendChild(item);
      cells.push({ field, value });
    }
    el.appendChild(row);
  }

  function tick() {
    for (const cell of cells) {
      cell.field.value = cell.field.step(cell.field.value, tickMs);
      cell.value.textContent = cell.field.fmt(cell.field.value);
    }
  }
  tick();
  const timer = setInterval(tick, tickMs);
  return () => clearInterval(timer);
}
