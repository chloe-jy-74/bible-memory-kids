/**
 * 마이크 — 아이가 소리를 냈는지만 봅니다. 발음 채점은 하지 않습니다(기획서 9장).
 *
 * 권한이 없거나 기기가 지원하지 않으면 조용히 실패만 알려 주고,
 * 화면 쪽에서 '자동 진행 모드'로 넘어갑니다. 앱은 어떤 경우에도 멈추지 않습니다.
 */

import { CONFIG } from './config.js';

let stream = null;
let audioCtx = null;
let analyser = null;
let buffer = null;
let unavailable = false;   // 권한 거부 / 미지원 — 한 번 실패하면 다시 묻지 않음
let cancelCurrent = null;

/** 마이크를 준비합니다. 성공하면 true, 권한이 없거나 못 쓰면 false */
export function ensureMic() {
  if (analyser) return Promise.resolve(true);
  if (unavailable) return Promise.resolve(false);
  // 여러 곳에서 동시에 불러도 권한 요청은 한 번만 나가게 합니다
  if (!pending) pending = request().finally(() => { pending = null; });
  return pending;
}

let pending = null;

async function request() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    unavailable = true;
    return false;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (_) {
    unavailable = true;   // 거부·차단·HTTPS 아님 등 — 이유를 구분하지 않고 자동 진행으로
    return false;
  }

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    buffer = new Float32Array(analyser.fftSize);
    return true;
  } catch (_) {
    unavailable = true;
    releaseMic();
    return false;
  }
}

export function isMicUnavailable() {
  return unavailable;
}

/** 지금 바로 들을 수 있는 상태인지 (권한을 늦게 허용한 경우까지 반영) */
export function isMicReady() {
  return !!analyser;
}

/**
 * 이 기기가 마이크 권한을 이미 갖고 있는지 확인합니다.
 * 브라우저는 권한을 코드로 미리 켜 줄 수 없고, 사용자가 한 번은 눌러야 합니다.
 * 다만 '이미 허용됨'인 경우에는 묻는 화면 없이 바로 시작할 수 있습니다.
 * @returns {Promise<'granted'|'denied'|'prompt'|'unknown'>}
 */
export async function getMicPermission() {
  if (unavailable) return 'denied';
  if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
  try {
    // 답이 없는 브라우저가 있어 오래 기다리지 않습니다. 조회는 어디까지나 참고용입니다.
    const status = await Promise.race([
      navigator.permissions.query({ name: 'microphone' }),
      new Promise(resolve => setTimeout(() => resolve(null), 1000)),
    ]);
    return status ? status.state : 'unknown';   // granted / denied / prompt
  } catch (_) {
    return 'unknown';         // 사파리는 microphone 조회를 지원하지 않습니다
  }
}

/**
 * 소리가 날 때까지 듣습니다.
 * @returns {Promise<'voice'|'timeout'|'cancelled'>}
 *   voice   — 일정 볼륨이 holdMs 이상 지속됨
 *   timeout — timeoutMs 동안 조용함 (실패 아님, 그냥 다음으로)
 */
export function listenForVoice({
  holdMs = CONFIG.timing.micVoiceHoldMs,
  timeoutMs = CONFIG.timing.micSilenceTimeoutMs,
  onLevel = null,
} = {}) {
  cancelListening();

  if (!analyser) return Promise.resolve('timeout');

  return new Promise(resolve => {
    const startedAt = performance.now();
    let voiceStart = 0;      // 소리가 시작된 시각 (0이면 조용한 상태)
    let lastLoud = 0;        // 마지막으로 소리가 크게 난 시각
    let frame = 0;

    const done = (result) => {
      cancelAnimationFrame(frame);
      if (cancelCurrent === stop) cancelCurrent = null;
      resolve(result);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      resolve('cancelled');
    };
    cancelCurrent = stop;

    const tick = () => {
      const now = performance.now();
      const level = readLevel();
      if (onLevel) onLevel(level);

      if (level >= CONFIG.mic.rmsThreshold) {
        if (!voiceStart) voiceStart = now;
        lastLoud = now;
        if (now - voiceStart >= holdMs) return done('voice');
      } else if (voiceStart && now - lastLoud > CONFIG.mic.silenceToleranceMs) {
        voiceStart = 0;   // 잠깐 끊긴 게 아니라 멈춘 것 → 처음부터 다시
      }

      if (now - startedAt >= timeoutMs) return done('timeout');
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}

export function cancelListening() {
  const stop = cancelCurrent;
  cancelCurrent = null;
  if (stop) stop();
}

/** 화면을 벗어날 때 마이크를 놓아 줍니다 (녹음 표시등이 계속 켜져 있지 않도록) */
export function releaseMic() {
  cancelListening();
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (audioCtx) {
    try { audioCtx.close(); } catch (_) { /* 무시 */ }
    audioCtx = null;
  }
  analyser = null;
  buffer = null;
}

function readLevel() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);   // RMS (0~1)
}
