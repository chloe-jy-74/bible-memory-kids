/**
 * 시작점. 데이터를 불러오고 첫 화면을 띄웁니다.
 * 화면 내용은 js/screens.js, 화면 전환은 js/router.js 에 있습니다.
 */

import { findClip, loadData } from './data.js';
import { SCREENS } from './screens.js';
import { setScreens, start } from './router.js';
import { primeSpeech, setAudioResolver } from './speech.js';
import { el } from './ui.js';

const screenEl = document.getElementById('screen');

// iOS/사파리는 사용자가 화면을 처음 누른 순간에만 음성을 열어 줍니다.
window.addEventListener('pointerdown', () => primeSpeech(), { once: true });

registerServiceWorker();

/**
 * 캐시 관리는 sw.js 가 맡습니다 (규칙은 그 파일 맨 위에).
 * 서비스워커가 없거나 등록에 실패해도 앱은 그대로 동작합니다 — 캐시만 브라우저 기본이 됩니다.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // 새 서비스워커가 자리를 넘겨받으면 한 번만 새로고침합니다.
  // 이미 떠 있는 화면은 옛 js 를 들고 있어서, 새 데이터와 섞이면 어긋나기 때문입니다.
  // (맨 처음 설치될 때는 섞일 옛 코드가 없으므로 새로고침하지 않습니다.)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });

  // 첫 화면이 먼저 뜨도록 로딩이 끝난 뒤에 등록합니다.
  // (이 파일은 모듈이라 load 보다 먼저 실행됩니다 — 이벤트를 놓칠 일이 없습니다.)
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })   // 상대경로 — 하위 폴더 배포도 그대로 됩니다
      .catch(err => console.warn('서비스워커 등록 실패 (앱은 그대로 동작합니다)', err));
  }, { once: true });
}

async function boot() {
  screenEl.innerHTML = '';
  screenEl.appendChild(el('div', 'loading', '불러오는 중…'));

  try {
    await loadData();
  } catch (err) {
    console.error(err);
    screenEl.innerHTML = '';
    screenEl.appendChild(el('p', 'notice',
      '자료를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.'));
    return;
  }

  // 문항·선택지는 구절 음원과 같은 목소리(ElevenLabs Faye)로 미리 녹음해 두었습니다.
  // 목록에 없는 문장만 브라우저 TTS 로 읽습니다.
  setAudioResolver(findClip);

  setScreens(SCREENS, screenEl);
  start('menu', {});
}

boot();
