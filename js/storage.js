/**
 * 진도 저장 (localStorage, 기기별). 서버 없음.
 * 저장이 막힌 브라우저(사파리 시크릿 모드 등)에서도 앱은 그대로 동작합니다.
 */

import { CONFIG } from './config.js';

const DEFAULT_STATE = {
  voiceName: '',        // 부모가 고른 목소리 이름 (''이면 자동으로 부드러운 목소리 선택)
  speechRate: 0,        // 부모가 고른 말하기 속도 (0이면 config 기본값)
  speechPitch: 0,       // 부모가 고른 목소리 톤 (0이면 config 기본값)
  highlightLead: 0,     // 노란 칸을 소리보다 앞당기는 정도, ms (0이면 config 기본값)
  listened: [],         // 구절 듣기를 끝까지 들은 월 번호들
  cleared: [],          // 월별 퀴즈를 완주한 월 번호들
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return { ...DEFAULT_STATE };
    return normalize(JSON.parse(raw));   // 빠진 값은 normalize 가 기본값으로 채웁니다
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

/**
 * 저장값이 깨져 있어도 앱은 그대로 떠야 합니다.
 * JSON 은 읽혔지만 타입이 어긋난 경우(예: listened 가 null)를 기본값으로 되돌립니다 —
 * 이걸 그냥 두면 월 선택 화면이 그리다 말고 빈 채로 남고, 새로고침해도 계속 깨집니다.
 *
 * 어떤 값이 있어야 하는지는 DEFAULT_STATE 하나만 봅니다.
 * 설정을 새로 추가할 때 여기를 같이 고칠 필요가 없습니다.
 */
function normalize(s) {
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_STATE)) {
    const v = s[key];
    if (Array.isArray(fallback)) {
      out[key] = Array.isArray(v) ? v.filter(Number.isInteger) : [...fallback];
    } else if (typeof fallback === 'number') {
      out[key] = typeof v === 'number' && isFinite(v) ? v : fallback;
    } else {
      out[key] = typeof v === typeof fallback ? v : fallback;
    }
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch (_) { /* 저장 실패해도 앱은 계속 동작 */ }
}

/* ── 목소리 ────────────────────────────────────── */

export function getVoiceName() {
  return state.voiceName;
}

export function setVoiceName(name) {
  state.voiceName = name || '';
  save();
}

export function getHighlightLead() {
  return state.highlightLead;   // 0이면 config 기본값을 씁니다
}

export function setHighlightLead(ms) {
  state.highlightLead = ms || 0;
  save();
}

export function getSpeechRate() {
  return state.speechRate;    // 0이면 config 기본값을 씁니다
}

export function setSpeechRate(rate) {
  state.speechRate = rate || 0;
  save();
}

export function getSpeechPitch() {
  return state.speechPitch;   // 0이면 config 기본값을 씁니다
}

export function setSpeechPitch(pitch) {
  state.speechPitch = pitch || 0;
  save();
}

/* ── 진도 ──────────────────────────────────────── */

export function markListened(month) {
  addOnce('listened', month);
}

export function hasListened(month) {
  return state.listened.includes(month);
}

export function markCleared(month) {
  addOnce('cleared', month);
}

export function hasCleared(month) {
  return state.cleared.includes(month);
}

/**
 * '진도 초기화' — 들은 달·완주한 달 기록만 지웁니다.
 * 부모가 귀로 맞춘 목소리·속도·톤·노란 칸 타이밍은 그대로 둡니다
 * (버튼 이름이 '진도'이므로 그 이상을 지우면 안 됩니다).
 */
export function resetProgress() {
  state.listened = [];
  state.cleared = [];
  save();
}

function addOnce(key, value) {
  if (!state[key].includes(value)) {
    state[key].push(value);
    save();
  }
}
