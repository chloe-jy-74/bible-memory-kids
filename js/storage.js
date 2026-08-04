/**
 * 진도 저장 (localStorage, 기기별). 서버 없음.
 * 저장이 막힌 브라우저(사파리 시크릿 모드 등)에서도 앱은 그대로 동작합니다.
 */

import { CONFIG } from './config.js';

const DEFAULT_STATE = {
  childName: '',        // 칭찬 음성에 쓰는 아이 이름 (없으면 이름 없는 문장만 사용)
  nameAsked: false,     // 첫 실행 때 이름을 물어봤는지
  currentMonth: null,   // 랜덤 퀴즈 범위 기준. null이면 오늘 날짜의 월
  repeatMode: 'basic',  // 따라 읽기 방식: 'basic'(따라 하기) | 'advanced'(이어 말하기)
  micChoice: '',        // '' 아직 안 물어봄 | 'granted' 허용함 | 'skip' 마이크 없이 쓰기로 함
  voiceName: '',        // 부모가 고른 목소리 이름 (''이면 자동으로 부드러운 목소리 선택)
  speechRate: 0,        // 부모가 고른 말하기 속도 (0이면 config 기본값)
  collected: [],        // 도감에 모은 월 번호들
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

export function getState() {
  return { ...state };
}

/* ── 아이 이름 ─────────────────────────────────── */

export function getChildName() {
  return state.childName;
}

export function setChildName(name) {
  state.childName = (name || '').trim().slice(0, 10);
  state.nameAsked = true;
  save();
}

export function isNameAsked() {
  return state.nameAsked;
}

export function markNameAsked() {
  state.nameAsked = true;
  save();
}

/* ── 현재 월 (랜덤 퀴즈 범위) ──────────────────── */

export function getCurrentMonth() {
  return state.currentMonth || (new Date().getMonth() + 1);
}

export function setCurrentMonth(month) {
  state.currentMonth = month;
  save();
}

/* ── 따라 읽기 방식 ────────────────────────────── */

export function getRepeatMode() {
  return state.repeatMode;
}

export function setRepeatMode(mode) {
  state.repeatMode = mode === 'advanced' ? 'advanced' : 'basic';
  save();
}

/* ── 목소리 ────────────────────────────────────── */

export function getVoiceName() {
  return state.voiceName;
}

export function setVoiceName(name) {
  state.voiceName = name || '';
  save();
}

export function getSpeechRate() {
  return state.speechRate;    // 0이면 config 기본값을 씁니다
}

export function setSpeechRate(rate) {
  state.speechRate = rate || 0;
  save();
}

/* ── 마이크 ────────────────────────────────────── */

export function getMicChoice() {
  return state.micChoice;
}

export function setMicChoice(choice) {
  state.micChoice = choice;   // 'skip' 이면 다음부터 묻지 않고 자동 진행으로 시작
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

/** 도감에 새로 모았으면 true (연출용), 이미 있었으면 false */
export function collectAnimal(month) {
  if (state.collected.includes(month)) return false;
  state.collected.push(month);
  save();
  return true;
}

export function isCollected(month) {
  return state.collected.includes(month);
}

export function getCollected() {
  return [...state.collected];
}

export function resetAll() {
  state = { ...DEFAULT_STATE, nameAsked: true, childName: state.childName };
  save();
}

function addOnce(key, value) {
  if (!state[key].includes(value)) {
    state[key].push(value);
    save();
  }
}
