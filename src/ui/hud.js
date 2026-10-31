// 사용자가 입력할 수 있는 명령과 연료 비용 (docs/spec.md)
const COMMANDS = [
  ['L', '좌회전', '연료 0'],
  ['R', '우회전', '연료 0'],
  ['M', '전진', '연료 -1'],
  ['C', '채집', '연료 -1'],
];

export function renderHud(container, state, error = '') {
  const doc = container.ownerDocument;
  const parts = [
    ['fuel', `연료 ${state.fuel}`],
    ['samples', `${state.collected}/${state.total}`],
    ['commands', ''],
    ['error', error],
  ];
  container.replaceChildren();
  for (const [name, text] of parts) {
    const el = doc.createElement('div');
    el.className = name;
    if (name === 'fuel') {
      const label = doc.createElement('div');
      label.className = 'fuel-label';
      label.textContent = text;
      const bar = doc.createElement('div');
      bar.className = 'fuel-bar';
      const fill = doc.createElement('div');
      fill.className = 'fuel-fill';
      fill.style.width = `${Math.min(100, Math.max(0, state.fuel))}%`;
      bar.appendChild(fill);
      el.append(label, bar);
    } else if (name === 'samples') {
      const gem = doc.createElement('div');
      gem.className = 'mineral-gem';
      const count = doc.createElement('div');
      count.className = 'mineral-count';
      count.textContent = text;
      const slots = doc.createElement('div');
      slots.className = 'mineral-slots';
      for (let i = 0; i < state.total; i++) {
        const slot = doc.createElement('i');
        if (i < state.collected) slot.className = 'on';
        slots.appendChild(slot);
      }
      el.append(gem, count, slots);
    } else if (name === 'commands') {
      for (const [key, label, cost] of COMMANDS) {
        const item = doc.createElement('div');
        item.className = 'command';
        for (const [cls, value] of [['command-key', key], ['command-label', label], ['command-cost', cost]]) {
          const span = doc.createElement('span');
          span.className = cls;
          span.textContent = value;
          item.appendChild(span);
        }
        el.appendChild(item);
      }
      // 명령이 아닌 비용 항목: SEND(전송)와 충돌(바위·테두리)
      for (const [cls, keyCls, key, label, cost, tip] of [
        ['command-send', 'send-key', 'SEND', '전송', '연료 -3', 'Enter로도 전송 · 명령을 순서대로 실행'],
        ['command-hit', 'hit-key', '!', '충돌', '연료 -2', '바위·테두리에 부딪힘: 이동 비용 대신 2, 남은 명령은 취소'],
      ]) {
        const item = doc.createElement('div');
        item.className = `command ${cls}`;
        item.title = tip;
        for (const [c, value] of [[keyCls, key], ['command-label', label], ['command-cost', cost]]) {
          const span = doc.createElement('span');
          span.className = c;
          span.textContent = value;
          item.appendChild(span);
        }
        el.appendChild(item);
      }
    } else {
      el.textContent = text;
    }
    container.appendChild(el);
  }
}
