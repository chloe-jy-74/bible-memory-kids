/**
 * 음성 출력 추상화.
 *
 * 앱의 다른 코드는 오직 speak(text) / pause(ms) / stopSpeaking() 만 사용합니다.
 * (설정 화면의 미리듣기만 예외로 previewVoice() 를 써서 녹음을 건너뜁니다.)
 * 나중에 TTS → 음성파일(또는 부모 녹음)로 바꿀 때는
 * setAudioResolver() 에 함수 하나만 끼워 넣으면 됩니다. 이 파일 밖은 손대지 않습니다.
 *
 *   setAudioResolver(text => `audio/${slug(text)}.mp3`);   // 파일이 있으면 파일 재생
 *   setAudioResolver(null);                                 // 다시 TTS
 *
 * 파일이 없거나 재생에 실패하면 조용히 TTS로 되돌아갑니다 — 앱은 멈추지 않습니다.
 */

import { CONFIG } from './config.js';
import { getVoiceName, getSpeechRate, getSpeechPitch } from './storage.js';

export const CANCELLED = 'cancelled';

let audioResolver = null;   // (text) => url | null
let koVoice = null;

/**
 * 녹음 재생기 — 문장마다 새로 만들지 않고 이것 하나만 계속 다시 씁니다.
 *
 * 아이폰 사파리는 '손가락으로 누른 그 순간에 시작된 재생'만 열어 줍니다.
 * 문장마다 new Audio() 를 만들면 탭에서 떨어진 문장(퀴즈의 문제 낭독처럼
 * await 를 몇 번 거친 뒤에 나오는 것)은 누른 사람이 없는 셈이라 막힙니다.
 * 같은 요소는 첫 재생이 탭으로 한 번 열리고 나면 그 뒤로 계속 재생됩니다.
 * (구절 듣기 화면도 같은 이유로 자기 재생기 하나를 재사용합니다.)
 */
let player = null;

function getPlayer() {
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
    // 문서에 붙여 둡니다 — 받아 둔 소리를 사파리가 버리지 않게.
    // (controls 가 없는 audio 요소는 아무것도 그리지 않으므로 화면에는 보이지 않습니다.)
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(player);
    }
  }
  return player;
}

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

function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

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
}

/** 설정에서 목소리를 바꾼 뒤 즉시 반영 */
export function refreshVoice() {
  loadVoices();
  return koVoice ? koVoice.name : '';
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener('voiceschanged', loadVoices);

  // 앱으로 돌아왔을 때 음성이 '일시정지'로 굳어 있으면 풀어 줍니다 (사파리).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    try { speechSynthesis.resume(); } catch (_) { /* 무시 */ }
  });
}

/**
 * 기기의 음성 목록이 늦게 도착할 때 다시 그릴 수 있게 알려 줍니다 (설정 화면).
 * 안드로이드 크롬은 목록을 비동기로 받아와서, 앱을 막 켰을 때는 빈 목록이 옵니다.
 * @returns {() => void} 구독을 끊는 함수
 */
export function onVoicesChanged(fn) {
  if (!isSpeechSupported()) return () => {};
  speechSynthesis.addEventListener('voiceschanged', fn);
  return () => speechSynthesis.removeEventListener('voiceschanged', fn);
}

/* ── 공개 API ───────────────────────────────────── */

/** 나중에 음성파일로 교체할 때 쓰는 유일한 접점 */
export function setAudioResolver(fn) {
  audioResolver = typeof fn === 'function' ? fn : null;
}

/** 아주 짧은 무음 wav — 재생기를 여는 용도로만 씁니다 */
const SILENCE = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgIC'
  + 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'
  + 'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

/**
 * iOS/Safari는 사용자가 화면을 처음 누른 순간에만 소리를 열어줍니다.
 * 첫 탭에서 한 번 호출해 두면 이후 자동 재생이 됩니다.
 *
 * 이 앱의 말은 대부분 녹음 파일이므로 TTS 뿐 아니라 녹음 재생기도 함께 열어야 합니다.
 * 둘은 서로 다른 잠금이라 하나만 열면 나머지가 막힙니다.
 */
export function primeSpeech() {
  // 1) 녹음 재생기 — 무음을 한 번 재생해 이 요소의 잠금을 풀어 둡니다
  try {
    const audio = getPlayer();
    audio.src = SILENCE;
    const started = audio.play();
    if (started && started.catch) started.catch(() => { /* 무시 */ });
  } catch (_) { /* 무시 */ }

  // 2) 브라우저 음성(TTS)
  if (!isSpeechSupported()) return;
  try {
    // 공백만 있는 문장은 크롬이 end 를 주지 않고 speaking 상태로 굳는 경우가 있습니다.
    const u = new SpeechSynthesisUtterance('.');
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
  const line = cleanText(text);
  if (!line) return Promise.resolve();

  const url = audioResolver ? audioResolver(line) : null;
  return url ? playAudioFile(url, line) : playTts(line);
}

/**
 * 설정 화면의 미리듣기 전용 — 녹음 파일을 건너뛰고 반드시 TTS 로 읽습니다.
 * speak() 을 쓰면 견본 문장에도 녹음이 있어서, 목소리·속도·톤을 바꿔도
 * 늘 같은 녹음이 재생돼 설정이 아무 효과 없어 보입니다.
 */
export function previewVoice(text) {
  const line = cleanText(text);
  return line ? playTts(line) : Promise.resolve();
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

/** 읽을 문장 다듬기. 이 형태 그대로 녹음 파일을 찾는 열쇠로도 쓰입니다. */
function cleanText(text) {
  return (text ?? '').toString().trim();
}

function playTts(text) {
  // 음성을 아예 못 쓰는 기기여도 앱이 멈추면 안 됩니다. 읽을 시간만큼 기다리고 넘어갑니다.
  if (!isSpeechSupported()) return pause(estimateMs(text));

  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CONFIG.speech.lang;
    u.rate = currentRate();
    u.pitch = currentPitch();
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
      // 재생 도중 화면이 잠기거나 앱이 뒤로 가면 사파리는 음성을 '일시정지'로 남겨 둡니다.
      // 그대로 두면 돌아온 뒤 speak() 가 전부 조용히 무시됩니다.
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    } catch (_) {
      finish();
    }
  });
}

function playAudioFile(url, fallbackText) {
  return new Promise((resolve, reject) => {
    const audio = getPlayer();
    let settled = false;

    const detach = () => {
      audio.onended = null;
      audio.onerror = null;
    };

    // 재생기를 함께 쓰므로 이 문장은 딱 한 번만 끝나야 합니다.
    // 끝나는 길이 셋(정상 종료 / 취소 / 파일 없음)이라 빗장을 여기 한 곳에 둡니다.
    const once = (fn) => () => {
      if (settled) return;
      settled = true;
      detach();
      fn();
    };

    const finish = once(() => { release(canceller); resolve(); });

    const canceller = once(() => {
      try { audio.pause(); } catch (_) { /* 무시 */ }
      reject(CANCELLED);
    });

    // 파일이 없으면 조용히 TTS로 되돌아갑니다.
    const fallback = once(() => {
      release(canceller);
      playTts(fallbackText).then(resolve, reject);
    });

    // 재생기를 함께 쓰므로 앞 문장부터 확실히 끊고 시작합니다.
    // (takeOver 가 앞 문장의 canceller 를 불러 handler 를 떼고 소리를 멈춥니다.
    //  우리 handler 를 지우지 않도록 반드시 붙이기 '전'에 불러야 합니다.)
    takeOver(canceller);
    if (settled) return;   // 앞 문장을 끊는 사이에 우리도 취소됐다면 여기서 끝

    audio.onended = finish;
    audio.onerror = fallback;
    audio.src = url;   // 같은 값이어도 다시 대입하면 처음부터 다시 받습니다
    audio.play().catch(fallback);
  });
}

/** 부모가 설정에서 고른 값이 있으면 그것을, 없으면 기본값을 씁니다 */
function currentRate() {
  return getSpeechRate() || CONFIG.speech.rate;
}

function currentPitch() {
  return getSpeechPitch() || CONFIG.speech.pitch;
}

function estimateMs(text) {
  const { charMs, padMs } = CONFIG.speech;
  return (text.length * charMs) / (currentRate() || 1) + padMs;
}
