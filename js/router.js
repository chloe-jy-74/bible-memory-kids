/**
 * 화면 전환.
 *
 * 각 화면은 { el, onEnter?, onLeave? } 를 돌려주는 함수입니다.
 * 화면을 떠날 때는 항상 음성·마이크·연출을 정리합니다.
 */

import { stopSpeaking } from './speech.js';
import { clearOverlays } from './ui.js';

let screens = {};
let mount = null;
const stack = [];
let leaveCurrent = null;

export function setScreens(map, mountEl) {
  screens = map;
  mount = mountEl;
}

function render() {
  if (leaveCurrent) { leaveCurrent(); leaveCurrent = null; }
  stopSpeaking();
  clearOverlays();
  mount.innerHTML = '';

  const { name, params } = stack[stack.length - 1];
  const view = screens[name](params || {});
  mount.appendChild(view.el);
  leaveCurrent = view.onLeave || null;
  mount.scrollTop = 0;
  window.scrollTo(0, 0);
  if (view.onEnter) view.onEnter();
}

export function start(name, params) {
  history.replaceState({ depth: 1 }, '');
  stack.push({ name, params });
  render();
}

export function navigate(name, params) {
  stack.push({ name, params });
  history.pushState({ depth: stack.length }, '');
  render();
}

export function goBack() {
  if (stack.length > 1) history.back();
}

/** 스택을 통째로 갈아끼웁니다 (퀴즈 완주 후 도감으로 보낼 때 등) */
export function resetTo(entries) {
  stack.length = 0;
  stack.push(...entries);
  history.replaceState({ depth: stack.length }, '');
  render();
}

window.addEventListener('popstate', () => {
  if (stack.length > 1) {
    stack.pop();
    render();
  }
});
