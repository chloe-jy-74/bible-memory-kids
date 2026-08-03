/**
 * 음성 출력 추상화.
 *
 * 앱의 다른 코드는 오직 speak(text) / pause(ms) / stopSpeaking() 만 사용합니다.
 * 나중에 TTS → 음성파일(또는 부모 녹음)로 바꿀 때는
 * setAudioResolver() 에 함수 하나만 끼워 넣으면 됩니다. 이 파일 밖은 손대지 않습니다.
 *
 *   setAudioResolver(text => `audio/${slug(text)}.mp3`);   // 파일이 있으면 파일 재생
 *   setAudioResolver(null);                                 // 다시 TTS
 *
 * 파일이 없거나 재생에 실패하면 조용히 TTS로 되돌아갑니다 — 앱은 멈추지 않습니다.
 */

import { CONFIG } from './config.js';
import { getVoiceName, getSpeechRate } from './storage.js';

export const CANCELLED = 'cancelled';

let audioResolver = null;   // (text) => url | null
let koVoice = null;
let voicesReady = false;

/**
 * 지금 진행 중인 재생/대기를 취소하는 함수 한 개만 들고 있습니다.
 * 새 재생이 시작되거나 stopSpeaking()이 불리면 이 함수를 호출해 이전 것을 끊습니다.
 */
let cancelCurrent = null;

function takeOver(canceller) {
  const previous = cancelCurrent;
  cancelCurrent = canceller;
  if (previous) previous();
}

function release(canceller) {
  if (cancelCurrent === canceller) cancelCurrent = null;
}

/* ── 음성 목록 준비 ─────────────────────────────── */

/** 이 기기에 있는 한국어 음성 목록 (설정 화면에서 고를 수 있게) */
export function getKoreanVoices() {
  if (!isSpeechSupported()) return [];
  return (speechSynthesis.getVoices() || [])
    .filter(v => (v.lang || '').toLowerCase().startsWith('ko'));
}

/**
 * 목소리 고르기
 *   1) 부모가 설정에서 고른 목소리
 *   2) config 의 preferredVoices 순서 (부드러운 목소리 우선)
 *   3) 기기 기본 한국어 음성
 */
function loadVoices() {
  if (!isSpeechSupported()) return;
  const ko = getKoreanVoices();

  const chosen = getVoiceName();
  const byName = chosen && ko.find(v => v.name === chosen);

  const preferred = !byName && CONFIG.speech.preferredVoices
    .map(want => ko.find(v => v.name.toLowerCase().includes(want.toLowerCase())))
    .find(Boolean);

  koVoice = byName || preferred || ko.find(v => v.default) || ko[0] || null;
  voicesReady = !!koVoice;
}

/** 설정에서 목소리를 바꾼 뒤 즉시 반영 */
export function refreshVoice() {
  loadVoices();
  return koVoice ? koVoice.name : '';
}

/** 지금 쓰고 있는 목소리 이름 */
export function getCurrentVoiceName() {
  return koVoice ? koVoice.name : '';
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

/* ── 공개 API ───────────────────────────────────── */

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 한국어 음성이 하나도 없는 기기인지 (부모용 안내 문구에 사용) */
export function hasKoreanVoice() {
  return voicesReady;
}

/** 나중에 음성파일로 교체할 때 쓰는 유일한 접점 */
export function setAudioResolver(fn) {
  audioResolver = typeof fn === 'function' ? fn : null;
}

/**
 * iOS/Safari는 사용자가 화면을 처음 누른 순간에만 음성을 열어줍니다.
 * 첫 탭에서 한 번 호출해 두면 이후 자동 재생이 됩니다.
 */
export function primeSpeech() {
  if (!isSpeechSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.lang = CONFIG.speech.lang;
    speechSynthesis.speak(u);
  } catch (_) { /* 무시 */ }
}

/**
 * 텍스트를 소리로 읽습니다.
 * @returns {Promise<void>} 다 읽으면 resolve, 도중에 끊기면 CANCELLED로 reject
 */
export function speak(text) {
  const clean = (text ?? '').toString().trim();
  if (!clean) return Promise.resolve();

  const url = audioResolver ? audioResolver(clean) : null;
  return url ? playAudioFile(url, clean) : playTts(clean);
}

/** speak() 사이의 쉬는 시간. 화면을 벗어나면 함께 취소됩니다. */
export function pause(ms) {
  return new Promise((resolve, reject) => {
    const canceller = () => {
      clearTimeout(timer);
      reject(CANCELLED);
    };
    const timer = setTimeout(() => {
      release(canceller);
      resolve();
    }, ms);
    takeOver(canceller);
  });
}

/** 재생 중인 소리를 즉시 멈춥니다 (화면 이동·뒤로가기 시 필수) */
export function stopSpeaking() {
  takeOver(null);
  if (isSpeechSupported()) {
    try { speechSynthesis.cancel(); } catch (_) { /* 무시 */ }
  }
}

/**
 * 여러 소절을 순서대로 읽습니다.
 * @param {string[]} lines
 * @param {{gapMs?: number, onLine?: (index:number)=>void}} options
 */
export async function speakSequence(lines, { gapMs = 0, onLine = null } = {}) {
  for (let i = 0; i < lines.length; i++) {
    if (onLine) onLine(i);
    await speak(lines[i]);
    if (gapMs && i < lines.length - 1) await pause(gapMs);
  }
}

/** CANCELLED만 조용히 삼키고 진짜 오류는 콘솔에 남깁니다. */
export function ignoreCancel(err) {
  if (err !== CANCELLED) console.error(err);
}

/* ── 내부 구현 ──────────────────────────────────── */

function playTts(text) {
  // 음성을 아예 못 쓰는 기기여도 앱이 멈추면 안 됩니다. 읽을 시간만큼 기다리고 넘어갑니다.
  if (!isSpeechSupported()) return pause(estimateMs(text));

  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.speech.lang;
    u.rate = currentRate();
    u.pitch = CONFIG.speech.pitch;
    u.volume = CONFIG.speech.volume;
    if (koVoice) u.voice = koVoice;

    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      release(canceller);
      resolve();
    };

    const canceller = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      u.onend = null;
      u.onerror = null;
      try { speechSynthesis.cancel(); } catch (_) { /* 무시 */ }
      reject(CANCELLED);
    };

    // 브라우저가 onend를 주지 않고 멈추는 경우 대비 (Android Chrome에서 간헐적으로 발생)
    const guard = setTimeout(finish, estimateMs(text) * 2);

    u.onend = finish;
    u.onerror = finish;   // 음성 오류도 '그냥 다음으로'

    takeOver(canceller);

    try {
      speechSynthesis.cancel();   // 앞 발화가 큐에 남아 있으면 정리
      speechSynthesis.speak(u);
    } catch (_) {
      finish();
    }
  });
}

function playAudioFile(url, fallbackText) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      release(canceller);
      resolve();
    };

    const canceller = () => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch (_) { /* 무시 */ }
      reject(CANCELLED);
    };

    const fallback = () => {
      if (settled) return;
      settled = true;
      release(canceller);
      // 파일이 없으면 조용히 TTS로 되돌아갑니다.
      playTts(fallbackText).then(resolve, reject);
    };

    audio.onended = finish;
    audio.onerror = fallback;

    takeOver(canceller);
    audio.play().catch(fallback);
  });
}

/** 부모가 설정에서 고른 속도가 있으면 그것을, 없으면 기본값을 씁니다 */
function currentRate() {
  return getSpeechRate() || CONFIG.speech.rate;
}

function estimateMs(text) {
  const { charMs, padMs } = CONFIG.speech;
  return (text.length * charMs) / (currentRate() || 1) + padMs;
}
