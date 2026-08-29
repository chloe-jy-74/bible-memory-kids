/**
 * 화면 전환.
 *
 * 각 화면은 { el, onEnter?, onLeave? } 를 돌려주는 함수입니다.
 * 화면을 떠날 때는 항상 음성·마이크·연출을 정리합니다.
 */

import { stopSpeaking, ignoreCancel } from './speech.js';
import { clearOverlays } from './ui.js';

/**
 * 방문한 화면을 전부 들고 있고(stack), 지금 보고 있는 자리만 index 로 가리킵니다.
 * 뒤로가기는 index 를 내리고 앞으로가기는 올릴 뿐, 화면을 버리지 않습니다.
 * 그래서 브라우저의 앞으로가기(아이폰 오른쪽 가장자리 스와이프)도 제대로 복원됩니다.
 *
 * 브라우저 히스토리 항목마다 { depth: index } 를 심어 두고, popstate 에서 그 값을
 * 그대로 읽습니다 — 어느 방향으로 움직였는지 추측하지 않습니다.
 */
let screens = {};
let mount = null;
const stack = [];
let index = -1;
let leaveCurrent = null;
let navigating = false;   // history.back() 이 돌아오기 전의 연타 막기
let unlatch = 0;
let rewinding = false;    // 히스토리를 되감는 중 (아래 rewind() 만 켭니다)

/** 히스토리를 steps 칸 되감습니다. 비동기 — popstate 로 돌아옵니다. */
function rewind(steps) {
  rewinding = true;
  history.go(-steps);
}

/**
 * 히스토리 항목의 state 는 새로고침을 넘어 그대로 남습니다.
 * 이전 방문이 남긴 depth 를 이번 방문의 것으로 착각하면 앱 밖으로 나가 버리므로,
 * 이번에 켠 앱이 남긴 항목인지 구분할 표식을 함께 심어 둡니다.
 */
const SESSION = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function mark(depth) {
  return { depth, sid: SESSION };
}

/** 이번에 켠 앱이 남긴 항목이면 그 깊이를, 아니면 null */
function depthOf(state) {
  if (!state || state.sid !== SESSION || typeof state.depth !== 'number') return null;
  return state.depth;
}

export function setScreens(map, mountEl) {
  screens = map;
  mount = mountEl;
}

function render() {
  const { name, params } = stack[index] || {};
  if (!mount || typeof screens[name] !== 'function') {
    // setScreens() 가 안 된 라우터를 부른 경우. 보통은 같은 모듈이 두 벌 로드됐다는 뜻입니다
    // (import 경로가 서로 달라서 — 예: './router.js' 와 './router.js?v=1').
    console.error(`화면 "${name}" 을 열 수 없습니다. router.js 가 두 번 로드됐는지 확인하세요.`);
    return;
  }
  if (leaveCurrent) { leaveCurrent(); leaveCurrent = null; }
  stopSpeaking();
  clearOverlays();
  mount.innerHTML = '';

  const view = screens[name](params || {});
  mount.appendChild(view.el);
  leaveCurrent = view.onLeave || null;
  mount.scrollTop = 0;
  window.scrollTo(0, 0);
  // onEnter 는 대부분 async 입니다. 안에서 난 오류를 여기서 받지 않으면
  // 콘솔에도 안 남는 채로 화면만 멎습니다.
  if (view.onEnter) {
    const entered = view.onEnter();
    if (entered && entered.catch) entered.catch(ignoreCancel);
  }
}

/** 같은 화면인가 (연타로 같은 곳에 두 번 들어가는 것을 막는 데 씁니다) */
function isSame(entry, name, params) {
  if (!entry || entry.name !== name) return false;
  const a = entry.params || {};
  const b = params || {};
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}

export function start(name, params) {
  stack.length = 0;
  stack.push({ name, params });
  index = 0;
  history.replaceState(mark(0), '');
  render();
}

export function navigate(name, params) {
  // 유아가 버튼을 두 번 두드리면(touch-action: manipulation 이라 더블탭도 click 두 번입니다)
  // 같은 화면이 히스토리에 두 번 쌓여, 뒤로가기를 눌러도 화면이 그대로인 것처럼 보입니다.
  // 지금 보고 있는 화면과 같은 곳이면 아무것도 하지 않습니다.
  if (isSame(stack[index], name, params)) return;

  // 뒤로 간 자리에서 새로 이동하면 앞쪽에 남아 있던 화면들은 버립니다 (브라우저와 같은 규칙).
  stack.length = index + 1;
  stack.push({ name, params });
  index = stack.length - 1;
  history.pushState(mark(index), '');
  render();
}

export function goBack() {
  // history.back() 은 popstate 가 올 때까지 시간이 걸립니다.
  // 그 사이에 한 번 더 눌리면 두 칸이 되감겨 앱 밖으로 나가 버립니다.
  if (navigating || index <= 0) return;
  navigating = true;
  clearTimeout(unlatch);
  unlatch = setTimeout(() => { navigating = false; }, 1000);   // popstate 가 안 오는 경우 대비
  history.back();
}

/** 스택을 통째로 갈아끼웁니다 (퀴즈 완주 후 메뉴로 보낼 때 등) */
export function resetTo(entries) {
  // replaceState 는 지금 항목만 바꿉니다. 쌓아 둔 히스토리를 그대로 두면
  // 뒤로가기를 눌러도 아무 일이 없다가 갑자기 앱 밖으로 나갑니다.
  // 실제로 히스토리를 되감아 브라우저와 앱의 깊이를 다시 맞춥니다.
  const steps = index;
  stack.length = 0;
  stack.push(...entries);
  index = stack.length - 1;

  if (steps > 0) {
    rewind(steps);
    return;
  }
  history.replaceState(mark(index), '');
  render();
}

window.addEventListener('popstate', (event) => {
  navigating = false;
  clearTimeout(unlatch);

  if (rewinding) {
    // rewind() 로 부른 되감기가 도착했습니다. 지금 화면의 깊이로 다시 표시해 둡니다.
    rewinding = false;
    history.replaceState(mark(index), '');
    render();
    return;
  }

  const depth = depthOf(event.state);

  // 이번에 켠 앱이 남긴 항목이 아닙니다 (새로고침 전에 쌓인 것 등).
  // 함부로 움직이면 앱 밖으로 나가므로, 지금 화면으로 표시만 고쳐 두고 그대로 둡니다.
  if (depth === null) {
    history.replaceState(mark(index), '');
    return;
  }

  // resetTo 가 버린 앞쪽 항목입니다. 실제 화면 자리로 되감아 히스토리를 다시 맞춥니다.
  if (depth >= stack.length) {
    rewind(depth - index);
    return;
  }

  if (depth === index) return;
  index = depth;
  render();
});
