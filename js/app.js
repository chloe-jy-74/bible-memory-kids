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
