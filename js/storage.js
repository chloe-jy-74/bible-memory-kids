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
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
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
