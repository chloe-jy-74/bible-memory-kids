/**
 * 음성 출력 추상화.
 *
 * 앱의 다른 코드는 오직 speak(text) / pause(ms) / stopSpeaking() 만 사용합니다.
 * (녹음을 일부러 건너뛰어야 하는 두 곳 — 설정의 미리듣기와 구절 듣기의 예비 낭독 —
 *  만 speakTts() 를 씁니다.)
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
 * 재생기는 앱 전체에서 둘뿐입니다 — 문장용(player) 과 구절 낭독용(versePlayer).
 *
 * 아이폰 사파리는 '손가락으로 누른 그 순간에 시작된 재생'만 열어 줍니다.
 * 그때 열리는 것은 그 <audio> 요소 하나이지 앱 전체가 아닙니다.
 * 그래서 화면마다 new Audio() 를 만들면, 손가락에서 떨어진 재생(퀴즈의 문제 낭독처럼
 * await 를 몇 번 거친 뒤에 나오는 것, 앞으로가기 스와이프로 되돌아온 구절 듣기)은
 * 누른 사람이 없는 셈이라 막힙니다.
 * 그래서 오래 사는 요소 둘을 primeSpeech() 가 첫 탭에서 함께 열어 두고 계속 다시 씁니다.
 *
 * 둘을 나눠 두는 이유: 구절 음원은 몇 분짜리 한 파일이라 재생 위치를 계속 읽어야 하는데,
 * 문장 재생기와 같은 것을 쓰면 서로 자리를 빼앗습니다.
 */
let player = null;
let versePlayer = null;

function makePlayer() {
  const audio = new Audio();
  audio.preload = 'auto';
  // 문서에 붙여 둡니다 — 받아 둔 소리를 사파리가 버리지 않게.
  // (controls 가 없는 audio 요소는 아무것도 그리지 않으므로 화면에는 보이지 않습니다.)
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(audio);
  }
  return audio;
}

function getPlayer() {
  if (!player) player = makePlayer();
  return player;
}

/** 구절 듣기 화면이 쓰는 재생기 (화면을 나갔다 다시 들어와도 같은 것을 씁니다) */
export function getVersePlayer() {
  if (!versePlayer) versePlayer = makePlayer();
  return versePlayer;
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
}

/* ── 앱으로 돌아왔을 때 ─────────────────────────── */

/**
 * 화면이 잠기거나 앱이 뒤로 가면 아이폰은 소리를 조용히 멈춥니다.
 * <audio> 는 ended 도 error 도 주지 않고, 음성(TTS)은 '일시정지'로 굳습니다.
 * 그대로 두면 소리를 기다리던 화면이 영원히 멈춰 버리므로
 * (퀴즈는 선택지도 버튼도 안 눌리고, 구절 듣기는 버튼만 '일시정지'인 채 소리가 안 납니다),
 * 앱이 다시 앞으로 나온 순간 되살립니다.
 */
const wakeHooks = new Set();

/**
 * 앱이 다시 앞으로 나왔을 때 불릴 함수를 등록합니다.
 * @returns {() => void} 등록을 푸는 함수
 */
export function onWake(fn) {
  wakeHooks.add(fn);
  return () => wakeHooks.delete(fn);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (isSpeechSupported()) {
      try { speechSynthesis.resume(); } catch (_) { /* 무시 */ }
    }
    for (const fn of [...wakeHooks]) {
      try { fn(); } catch (_) { /* 하나가 실패해도 나머지는 되살립니다 */ }
    }
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
  // 1) 녹음 재생기 — 무음을 한 번 재생해 이 요소들의 잠금을 풀어 둡니다.
  //    구절 듣기의 재생기도 여기서 함께 엽니다. 그 화면은 앞으로가기 스와이프처럼
  //    손가락과 상관없는 길로도 들어오는데, 미리 열려 있지 않으면 그때 녹음이 막혀
  //    성우 목소리 대신 기계 음성이 나옵니다.
  for (const audio of [getPlayer(), getVersePlayer()]) {
    try {
      audio.src = SILENCE;
      const started = audio.play();
      if (started && started.catch) started.catch(() => { /* 무시 */ });
    } catch (_) { /* 무시 */ }
  }

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
 * 녹음을 건너뛰고 반드시 브라우저 TTS 로 읽습니다. 쓰는 곳은 둘입니다.
 *
 *   설정 화면의 미리듣기 — speak() 을 쓰면 견본 문장에도 녹음이 있어서
 *                          목소리·속도·톤을 바꿔도 늘 같은 녹음이 재생됩니다.
 *   구절 듣기의 예비 낭독 — 녹음 재생이 실패했을 때 쓰는 길인데, 소절 중 열여덟은
 *                          퀴즈 선택지와 글자가 똑같아 speak() 로는 그 소절만
 *                          녹음으로 나갑니다. 한 구절 안에서 목소리가 튑니다.
 */
export function speakTts(text) {
  const line = cleanText(text);
  return line ? playTts(line) : Promise.resolve();
}

/** 설정 화면의 미리듣기 (= speakTts) */
export const previewVoice = speakTts;

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
 * @param {{gapMs?: number, onLine?: (index:number)=>void, tts?: boolean}} options
 *        tts: true 면 녹음을 건너뛰고 전부 브라우저 음성으로 읽습니다 (speakTts 설명 참고)
 */
export async function speakSequence(lines, { gapMs = 0, onLine = null, tts = false } = {}) {
  const say = tts ? speakTts : speak;
  for (let i = 0; i < lines.length; i++) {
    if (onLine) onLine(i);
    await say(lines[i]);
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
    let guard = 0;
    let kick = 0;

    const clearTimers = () => { clearTimeout(guard); clearTimeout(kick); };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      release(canceller);
      resolve();
    };

    const canceller = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      u.onend = null;
      u.onerror = null;
      try { speechSynthesis.cancel(); } catch (_) { /* 무시 */ }
      reject(CANCELLED);
    };

    // 브라우저가 onend를 주지 않고 멈추는 경우 대비 (Android Chrome에서 간헐적으로 발생)
    guard = setTimeout(finish, estimateMs(text) * 2);

    u.onend = finish;
    u.onerror = finish;   // 음성 오류도 '그냥 다음으로'

    takeOver(canceller);   // 앞 발화를 끊습니다 (그 안에서 cancel() 이 불립니다)

    // 한 틱 미뤄서 말합니다.
    // cancel() 은 큐를 비우는 데 시간이 걸려서, 바로 이어 speak() 하면 크롬(특히 안드로이드)이
    // 그 문장을 통째로 삼킵니다 — onend 도 오지 않아 guard 시간만큼 정적이 흐릅니다.
    kick = setTimeout(() => {
      if (settled) return;
      try {
        // 재생 도중 화면이 잠기거나 앱이 뒤로 가면 사파리는 음성을 '일시정지'로 남겨 둡니다.
        // 그대로 두면 돌아온 뒤 speak() 가 전부 조용히 무시됩니다.
        speechSynthesis.resume();
        speechSynthesis.speak(u);
      } catch (_) {
        finish();
      }
    }, 0);
  });
}

/** 재생 길이를 알고 난 뒤 안전장치에 더해 주는 여유 */
const GUARD_SLACK_MS = 3000;

function playAudioFile(url, fallbackText) {
  return new Promise((resolve, reject) => {
    const audio = getPlayer();
    let settled = false;
    let guard = 0;

    /**
     * 안전장치 — 재생이 끝났는데도 끝났다고 알려주지 않는 경우를 위한 것입니다.
     *
     * 아이폰은 화면이 잠기거나 앱이 뒤로 가면 <audio> 를 조용히 멈춥니다.
     * ended 도 error 도 오지 않으므로, 이게 없으면 소리를 기다리던 화면이 영영 멈춥니다
     * (퀴즈라면 정답 체크가 켜진 채로 선택지도 '선택' 버튼도 전부 무반응).
     * playTts 에는 같은 목적의 안전장치가 있었는데 이쪽에만 없었습니다 —
     * 그런데 이 앱의 말은 거의 전부 녹음이라, 실제로는 이쪽이 훨씬 중요합니다.
     *
     * 남은 재생시간을 알게 될 때마다(메타데이터 도착, 앱 복귀) 다시 겁니다.
     */
    const rearm = () => {
      if (settled) return;
      clearTimeout(guard);
      const total = Number.isFinite(audio.duration) ? audio.duration : 0;
      const left = total ? (total - (audio.currentTime || 0)) * 1000 : 0;
      // 길이를 아직 모르면 '파일을 못 받는 경우'를 재는 것이라 넉넉히 잡습니다.
      guard = setTimeout(onGuard, left > 0 ? left + GUARD_SLACK_MS
                                           : Math.max(estimateMs(fallbackText) * 2, 8000));
    };

    const onGuard = () => {
      // 화면이 꺼져 있는 동안에는 넘어가지 않습니다 — 돌아왔을 때 이어 듣게 둡니다.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        rearm();
        return;
      }
      giveUp();
    };

    const detach = () => {
      clearTimeout(guard);
      unwake();
      audio.removeEventListener('loadedmetadata', rearm);
      audio.onended = null;
      audio.onerror = null;
    };

    // 재생기를 함께 쓰므로 이 문장은 딱 한 번만 끝나야 합니다.
    // 끝나는 길이 넷(정상 종료 / 취소 / 파일 없음 / 안전장치)이라 빗장을 여기 한 곳에 둡니다.
    const once = (fn) => () => {
      if (settled) return;
      settled = true;
      detach();
      fn();
    };

    const finish = once(() => { release(canceller); resolve(); });

    // 안전장치가 걸렸습니다. 소리부터 멈추고(안 그러면 다음 문장과 겹칩니다) 넘어갑니다.
    const giveUp = once(() => {
      try { audio.pause(); } catch (_) { /* 무시 */ }
      release(canceller);
      resolve();
    });

    const canceller = once(() => {
      try { audio.pause(); } catch (_) { /* 무시 */ }
      reject(CANCELLED);
    });

    // 파일이 없으면 조용히 TTS로 되돌아갑니다.
    const fallback = once(() => {
      release(canceller);
      playTts(fallbackText).then(resolve, reject);
    });

    // 앱으로 돌아왔는데 멈춰 있으면 이어서 재생합니다.
    const unwake = onWake(() => {
      if (settled || audio.ended || !audio.paused) return;
      const again = audio.play();
      if (again && again.catch) again.catch(giveUp);
      rearm();
    });

    // 재생기를 함께 쓰므로 앞 문장부터 확실히 끊고 시작합니다.
    // (takeOver 가 앞 문장의 canceller 를 불러 handler 를 떼고 소리를 멈춥니다.
    //  우리 handler 를 지우지 않도록 반드시 붙이기 '전'에 불러야 합니다.)
    takeOver(canceller);
    if (settled) return;   // 앞 문장을 끊는 사이에 우리도 취소됐다면 여기서 끝

    audio.onended = finish;
    audio.onerror = fallback;
    audio.addEventListener('loadedmetadata', rearm);
    audio.src = url;   // 같은 값이어도 다시 대입하면 처음부터 다시 받습니다
    rearm();
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
