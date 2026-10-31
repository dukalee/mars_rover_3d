import { generateMap } from '../core/map.js';
import { createGame, send } from '../core/game.js';
import { renderMap } from './mapView.js';
import { renderHud } from './hud.js';
import { validateCommand } from '../core/command.js';
import { INITIAL_FUEL } from '../core/constants.js';

const STEP_INTERVAL_MS = 250;

export function initScreens(doc = document, onUpdate = () => {}) {
  const screens = ['title', 'sim', 'result'].map((id) => doc.getElementById(id));
  let game = null;

  function show(id) {
    screens.forEach((s) => {
      s.hidden = s.id !== id;
    });
  }

  doc.getElementById('start-button').addEventListener('click', () => {
    game = createGame(generateMap());
    renderMap(doc.getElementById('map'), game);
    renderHud(doc.getElementById('hud'), game);
    show('sim');
    doc.getElementById('command-input').focus();
    onUpdate(game);
  });

  // 결과 화면: 판정(성공/실패 클래스), 채집 슬롯, 연료 막대, 값 문구
  function setStat(el, label, value) {
    const lb = doc.createElement('span');
    lb.className = 'lb';
    lb.textContent = label;
    const val = doc.createElement('span');
    val.className = 'val';
    val.textContent = value;
    el.replaceChildren(lb, doc.createTextNode(' '), val);
  }

  function showResult(result) {
    doc.getElementById('result').className = result.status;
    doc.getElementById('result-status').textContent = result.status === 'success' ? '성공' : '실패';
    setStat(doc.getElementById('result-samples'), '채집한 샘플', `${result.collected} / ${result.total}`);
    setStat(doc.getElementById('result-fuel'), '남은 fuel', String(result.fuel));
    const slots = doc.getElementById('result-slots');
    slots.replaceChildren();
    for (let i = 0; i < result.total; i++) {
      const slot = doc.createElement('i');
      if (i < result.collected) slot.className = 'on';
      slots.appendChild(slot);
    }
    const percent = Math.min(100, Math.max(0, (result.fuel / INITIAL_FUEL) * 100));
    doc.getElementById('result-meter').style.width = `${percent}%`;
  }

  function submit() {
    const result = validateCommand(doc.getElementById('command-input').value);
    if (!result.ok) {
      renderHud(doc.getElementById('hud'), game, result.error);
      return;
    }
    const { state: finalState, steps } = send(game, result.commands);
    const input = doc.getElementById('command-input');
    const button = doc.getElementById('send-button');
    input.disabled = true;
    button.disabled = true;
    renderHud(doc.getElementById('hud'), game);
    let i = 0;

    function finish() {
      game = finalState;
      input.disabled = false;
      button.disabled = false;
      if (game.status === 'playing') {
        input.value = '';
        input.focus();
        return;
      }
      showResult(game);
      show('result');
    }

    if (steps.length === 0) {
      finish();
      return;
    }
    // 다음 스텝은 이번 스텝의 연출(onUpdate가 돌려주는 ms)이 끝난 뒤에 재생한다.
    function playStep() {
      const step = steps[i];
      game = step.state;
      i += 1;
      renderMap(doc.getElementById('map'), game);
      renderHud(doc.getElementById('hud'), game);
      const hold = Number(onUpdate(game, step.type)) || 0;
      if (i >= steps.length) {
        if (hold > 0) setTimeout(finish, hold);
        else finish();
        return;
      }
      setTimeout(playStep, Math.max(STEP_INTERVAL_MS, hold));
    }
    setTimeout(playStep, STEP_INTERVAL_MS);
  }

  doc.getElementById('send-button').addEventListener('click', submit);

  // 3D 화면이나 버튼을 눌러 포커스가 빠져도, 글자를 치면 입력창으로 돌아온다.
  doc.addEventListener('keydown', (e) => {
    const input = doc.getElementById('command-input');
    if (doc.getElementById('sim').hidden || input.disabled || doc.activeElement === input) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    input.focus();
  });

  doc.getElementById('command-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.disabled) return;
    submit();
  });

  doc.getElementById('restart-button').addEventListener('click', () => {
    game = null;
    doc.getElementById('command-input').value = '';
    show('title');
  });

  return { getGame: () => game };
}
