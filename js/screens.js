/**
 * 모든 화면.
 *
 *   메인 메뉴
 *   ├── 구절 듣기  → 월 선택 → 녹음 낭독 (멈출 때까지 반복)
 *   ├── 월별 퀴즈  → 월 선택 → 글자 3지선다
 *   ├── 랜덤 퀴즈  → 10문제 세트
 *   └── 설정(부모용)
 */

import { CONFIG } from './config.js';
import { getAllVerses, getVerse, getVerseAudio, getMonthImage } from './data.js';
import { buildMonthSet, buildRandomSet, pickOne } from './questions.js';
import {
  speak, pause, stopSpeaking, speakSequence, ignoreCancel,
  getKoreanVoices, refreshVoice, previewVoice, onVoicesChanged,
} from './speech.js';
import * as store from './storage.js';
import { navigate, goBack, resetTo } from './router.js';
import { el, img, topbar, wait, overlay, lockable } from './ui.js';

/* ══════════════════════════════════════════════════
   메인 메뉴
   ══════════════════════════════════════════════════ */

const MENU_ITEMS = [
  { mode: 'listen', icon: '📖', label: '구절 듣기', go: () => navigate('months', { mode: 'listen' }) },
  { mode: 'quiz',   icon: '❓', label: '월별 퀴즈', go: () => navigate('months', { mode: 'quiz' }) },
  { mode: 'random', icon: '🎲', label: '랜덤 퀴즈', go: () => navigate('quiz', { mode: 'random' }) },
];

function MenuScreen() {
  const holder = el('div', 'home');

  // 설정은 어른만 쓰는 것이라 구석에 작게
  const gear = el('button', 'gear-btn', '⚙️');
  gear.setAttribute('aria-label', '설정');
  gear.addEventListener('click', () => navigate('settings', {}));
  holder.appendChild(gear);

  holder.appendChild(el('h1', 'app-title', '유치부 성구암송'));
  holder.appendChild(el('p', 'app-subtitle', '판교 사랑의교회'));

  const menu = el('div', 'menu');
  for (const item of MENU_ITEMS) {
    const btn = el('button', 'menu-btn');
    btn.dataset.mode = item.mode;
    const badge = el('span', 'menu-badge');
    badge.appendChild(el('span', 'menu-icon', item.icon));
    btn.appendChild(badge);
    btn.appendChild(el('span', 'menu-label', item.label));
    btn.appendChild(el('span', 'menu-arrow', '›'));
    btn.addEventListener('click', item.go);
    menu.appendChild(btn);
  }
  holder.appendChild(menu);

  return { el: holder };
}

/* ══════════════════════════════════════════════════
   월 선택
   ══════════════════════════════════════════════════ */

const MODE_TITLE = { listen: '구절 듣기', quiz: '월별 퀴즈' };
// 월 선택에 들어갈 때 거는 말. null 이면 아무 말도 하지 않습니다.
// 구절 듣기는 달만 고르면 되므로 조용히 둡니다.
const MODE_ASK = {
  listen: null,
  quiz: '몇 월 문제를 풀어볼까요?',
};

function MonthsScreen({ mode }) {
  const holder = el('div');
  holder.appendChild(topbar(MODE_TITLE[mode] || '', { onBack: goBack }));

  const grid = el('div', 'month-grid');
  for (const verse of getAllVerses()) {
    const tile = el('button', 'month-tile');
    tile.setAttribute('aria-label', `${verse.month}월`);
    tile.appendChild(img(getMonthImage(verse.month)));

    const num = el('div', 'month-num');
    num.appendChild(el('span', null, String(verse.month)));
    num.appendChild(el('span', 'unit', '월'));
    tile.appendChild(num);

    // 이미 해 본 달에 표시를 답니다 (구절 듣기는 끝까지 들은 달, 퀴즈는 완주한 달)
    const done = mode === 'quiz' ? store.hasCleared(verse.month)
                                 : store.hasListened(verse.month);
    if (done) tile.appendChild(el('div', 'tile-badge', '★'));

    tile.addEventListener('click', () => {
      if (mode === 'listen') navigate('listen', { month: verse.month });
      else navigate('quiz', { mode: 'month', month: verse.month });
    });
    grid.appendChild(tile);
  }
  holder.appendChild(grid);

  return {
    el: holder,
    onEnter() { if (MODE_ASK[mode]) speak(MODE_ASK[mode]).catch(ignoreCancel); },
  };
}

/* ══════════════════════════════════════════════════
   1. 구절 듣기
   ══════════════════════════════════════════════════ */

function ListenScreen({ month }) {
  const verse = getVerse(month);

  const holder = el('div');
  holder.appendChild(topbar(`${month}월 말씀`, { onBack: goBack }));

  const body = el('div', 'listen');
  body.appendChild(img(getMonthImage(month), 'verse-image'));
  const refEl = el('div', 'verse-ref', verse.ref);
  body.appendChild(refEl);

  const card = el('div', 'verse-card');
  const lineEls = verse.lines.map(text => {
    const line = el('div', 'verse-line', text);
    card.appendChild(line);
    return line;
  });
  body.appendChild(card);

  const controls = el('div', 'bottom-controls');
  const playBtn = el('button', 'play-btn');
  const playIcon = el('span', 'icon', '▶');
  const playText = el('span', null, '듣기');
  playBtn.append(playIcon, playText);
  controls.appendChild(el('p', 'play-hint', '낭독은 무한반복 됩니다'));
  controls.appendChild(playBtn);
  body.appendChild(controls);
  holder.appendChild(body);

  let playing = false;      // 소리가 나고 있는 중인가
  let alive = true;         // 화면이 아직 떠 있는가
  let resumeAt = 0;         // 일시정지한 자리(초). 0이면 처음부터.
  let cancelCurrent = null; // 지금 재생을 끊는 방법 (일시정지 / 화면 이탈)

  /**
   * 이 화면이 쓰는 음원 재생기 — 한 바퀴 돌 때마다 새로 만들지 않고 이것 하나만 다시 씁니다.
   *
   * 아이폰 사파리는 '손가락으로 누른 그 순간에 시작된 재생'만 열어 줍니다.
   * 바퀴마다 new Audio() 를 만들면 두 번째 바퀴는 누른 사람이 없는 셈이라 막혀서,
   * 기기(사파리 자동재생 설정·저전력 모드)에 따라 한 번만 읽고 끝나 버립니다.
   * 같은 요소는 첫 재생이 탭으로 한 번 열리고 나면 그 뒤로 계속 재생됩니다.
   * 화면에 붙여 두는 것은 받아 둔 소리를 사파리가 버리지 않게 하기 위해서입니다.
   */
  const player = new Audio();
  player.preload = 'auto';
  const audioUrl = getVerseAudio(month);
  if (audioUrl) player.src = audioUrl;
  holder.appendChild(player);

  const PAUSED = 'paused';

  function setPlaying(on) {
    playing = on;
    playBtn.classList.toggle('is-playing', on);
    playIcon.textContent = on ? '⏸' : '▶';
    playText.textContent = on ? '일시정지' : '듣기';
  }

  function highlight(index) {
    lineEls.forEach((line, i) => {
      line.classList.toggle('is-active', i === index);
      line.classList.toggle('is-read', i >= 0 && i < index);
    });
    refEl.classList.toggle('is-active', index >= lineEls.length);
  }

  function clearHighlight() {
    lineEls.forEach(line => line.classList.remove('is-active', 'is-read'));
    refEl.classList.remove('is-active');
  }

  /**
   * 음원을 from(초)부터 재생하고, 끝까지 가면 resolve.
   *
   * 재생기는 위에서 만든 player 하나뿐입니다(아이폰 사파리 때문 — player 설명 참고).
   * 일시정지·반복 모두 멈춘 '자리'만 기억해 두었다가 같은 재생기를 그 자리로 옮깁니다.
   *
   * 음원은 "○월 말씀 → 본문 → 출처"가 한 파일로 이어져 있습니다.
   * verses.json 의 cues 가 소절마다 [시작, 끝] 을 음원 길이 대비 비율로 담고 있어서,
   * 재생 위치를 보고 지금 읽는 소절에 불을 켭니다. cues 가 없으면 균등 분할합니다.
   */
  function playFrom(from) {
    return new Promise((resolve, reject) => {
      const a = player;

      let settled = false;
      let ticker = 0;
      let shown = -2;     // 마지막으로 불을 켠 소절 (-1 은 '인트로'라 실제 값입니다)

      const cues = verse.cues;
      // 부모가 설정 화면에서 맞춘 값 (없으면 기본값)
      const lead = (store.getHighlightLead() || CONFIG.timing.highlightLeadMs) / 1000;

      // 같은 재생기를 다시 쓰므로, 지난 바퀴가 남긴 자리에 그대로 서 있지 않도록 늘 옮겨 놓습니다.
      let seeked = false;
      const seek = () => {
        if (seeked || a.readyState < 1) return;
        try { a.currentTime = from; } catch (_) { /* 무시 */ }
        seeked = true;
      };
      a.addEventListener('loadedmetadata', seek);

      // 소절이 실제로 바뀔 때만 화면을 고칩니다.
      // (틱은 1초에 스물몇 번 돌지만 소절은 몇 초에 한 번 넘어갑니다.)
      const show = (index) => {
        if (index === shown) return;
        shown = index;
        highlight(index);
      };

      const follow = () => {
        if (!seeked) return;              // 자리를 옮기기 전에는 엉뚱한 소절이 켜집니다
        const total = a.duration || verse.audioSeconds || 0;
        if (!total) return;
        const at = (a.currentTime + lead) / total;

        if (!cues) {
          show(Math.min(lineEls.length - 1, Math.floor(at * lineEls.length)));
          return;
        }
        // 출처를 읽기 시작하면 출처에 불을 켭니다.
        if (verse.refAt != null && at >= verse.refAt) { show(lineEls.length); return; }
        // 마지막으로 시작 지점을 지난 소절. 첫 소절 전(인트로)이면 -1 → 아무 데도 안 켜집니다.
        let now = -1;
        for (let i = 0; i < cues.length; i++) {
          if (at < cues[i][0]) break;     // cues 는 시간순 — 더 볼 필요가 없습니다
          now = i;
        }
        show(now);
      };

      const detach = () => {
        clearInterval(ticker);
        a.removeEventListener('loadedmetadata', seek);
        a.onended = null;
        a.onerror = null;
      };
      const stopSound = () => { try { a.pause(); } catch (_) { /* 무시 */ } };

      // 재생기·타이머를 한 바퀴마다 다시 쓰므로, 이 바퀴는 딱 한 번만 끝나야 합니다.
      // 이 빗장이 없으면 늦게 도착한 취소가 '다음 바퀴'의 타이머와 소리를 꺼 버립니다
      // (버튼은 재생 중인데 소리도 노란 칸도 멎는 상태).
      const once = (fn) => () => {
        if (settled) return;
        settled = true;
        detach();
        fn();
      };

      // 일시정지: 소리는 멈추고 멈춘 자리만 기억해 둡니다.
      const halt = once(() => {
        resumeAt = seeked ? a.currentTime : from;
        stopSound();
        reject(PAUSED);
      });
      const finish = once(() => { release(halt); resolve(); });
      const fail = once(() => {
        release(halt); stopSound();
        reject(new Error('음원을 재생하지 못했습니다'));
      });

      a.onended = finish;
      a.onerror = fail;
      takeOverListen(halt);
      seek();                 // 이미 받아 둔 음원이면 소리 내기 전에 자리부터 옮깁니다
      a.play().then(() => {
        if (settled) return;  // 재생이 열리는 사이에 이미 멈췄다면 여기서 끝
        seek();               // 아직 못 받았다면 여기서(또는 loadedmetadata 에서) 옮깁니다
        ticker = setInterval(follow, CONFIG.timing.highlightTickMs);
        follow();
      }).catch(fail);
    });
  }

  /** 녹음이 없을 때만 쓰는 예비 낭독 (브라우저 TTS — 이어 듣기는 안 되고 소절부터 다시 읽습니다) */
  async function speakFallback() {
    await speakSequence(verse.lines, {
      gapMs: CONFIG.timing.lineGapMs,
      onLine: highlight,
    });
    highlight(lineEls.length);
    await speak(verse.refSpeech || verse.ref);
  }

  function takeOverListen(fn) { cancelCurrent = fn; }
  function release(fn) { if (cancelCurrent === fn) cancelCurrent = null; }

  /** 일시정지 — 멈춘 자리를 기억해 둡니다 */
  function pausePlayback() {
    if (cancelCurrent) { const fn = cancelCurrent; cancelCurrent = null; fn(); }
    stopSpeaking();          // 예비 낭독이나 반복 대기 중이었다면 그것도 멈춤
    setPlaying(false);
  }

  /** 화면을 벗어날 때 — 기억해 둔 자리까지 버립니다 */
  function stopAll() {
    pausePlayback();
    try { player.pause(); } catch (_) { /* 무시 */ }
    resumeAt = 0;
  }

  /** 멈출 때까지 계속 반복해서 들려줍니다. 일시정지했다면 그 자리에서 이어집니다. */
  async function play() {
    if (playing) return;
    setPlaying(true);

    try {
      while (alive && playing) {
        // 끝자락에서 멈췄다면 이어 들을 게 없으니 처음부터 갑니다.
        if (resumeAt > 0 && verse.audioSeconds && resumeAt > verse.audioSeconds - 0.3) resumeAt = 0;
        if (resumeAt <= 0) {
          clearHighlight();
          card.classList.remove('is-done');
        }

        if (audioUrl) {
          try {
            await playFrom(resumeAt);
          } catch (err) {
            if (err === PAUSED) return;    // 자리를 기억한 채 멈춤
            resumeAt = 0;
            await speakFallback();         // 녹음 재생 실패 → 예비 낭독
          }
        } else {
          await speakFallback();
        }

        resumeAt = 0;                      // 한 바퀴 끝 — 다음 바퀴는 처음부터
        clearHighlight();
        card.classList.add('is-done');
        store.markListened(month);
        await pause(CONFIG.timing.verseLoopGapMs);
      }
    } catch (err) {
      ignoreCancel(err);
    } finally {
      if (playing) setPlaying(false);
    }
  }

  playBtn.addEventListener('click', () => {
    if (playing) pausePlayback();
    else play();
  });

  return {
    el: holder,
    onEnter: play,
    onLeave() { alive = false; stopAll(); },
  };
}

/* ══════════════════════════════════════════════════
   3~4. 퀴즈 (월별 / 랜덤 공용)
   ══════════════════════════════════════════════════ */

function QuizScreen({ mode, month }) {
  const isRandom = mode === 'random';
  const set = isRandom ? buildRandomSet() : buildMonthSet(month);

  const holder = el('div');
  holder.appendChild(topbar(isRandom ? '랜덤 퀴즈' : `${month}월 퀴즈`, { onBack: goBack }));

  const body = el('div', 'quiz');

  const progress = el('div', 'progress');
  const dots = set.map(() => {
    const d = el('span', 'dot');
    progress.appendChild(d);
    return d;
  });
  body.appendChild(progress);

  const questionEl = el('div', 'question');
  body.appendChild(questionEl);
  body.appendChild(el('p', 'hint', '각 선택지를 누르면 읽어줍니다'));

  const choicesEl = el('div', 'choices');
  body.appendChild(choicesEl);

  const bottom = el('div', 'bottom-controls');
  const selectBtn = el('button', 'select-btn is-hidden');
  selectBtn.appendChild(el('span', 'check', '✓'));
  selectBtn.appendChild(el('span', 'select-label', '선택'));
  bottom.appendChild(selectBtn);
  body.appendChild(bottom);

  holder.appendChild(body);

  let alive = true;
  let index = 0;
  let current = null;
  let chosen = null;
  let locked = false;
  const dropped = new Set();       // 이미 틀려서 흐려진 선택지
  // 연타 방지는 버튼마다 따로 겁니다.
  // (하나로 묶으면 선택지를 누른 직후 '선택'을 누른 게 씹힙니다)
  const canTapChoice = lockable(CONFIG.timing.tapLockMs);
  const canTapSelect = lockable(CONFIG.timing.tapLockMs);

  function paint() {
    current = set[index];
    chosen = null;
    dropped.clear();
    locked = false;

    dots.forEach((d, i) => {
      d.classList.toggle('is-done', i < index);
      d.classList.toggle('is-now', i === index);
    });

    questionEl.textContent = current.display;
    choicesEl.innerHTML = '';
    selectBtn.classList.add('is-hidden');

    current.choices.forEach((choice, i) => {
      const btn = el('button', 'choice');
      // 길이와 상관없이 모든 선택지를 같은 크기로. 긴 것은 두 줄로 접힙니다.
      btn.appendChild(el('span', 'choice-word', choice.word));
      btn.appendChild(el('span', 'choice-icon', '🔊'));
      btn.addEventListener('click', () => onChoice(i, btn));
      choicesEl.appendChild(btn);
    });
  }

  function onChoice(i, btn) {
    if (locked || dropped.has(i) || !canTapChoice()) return;
    chosen = i;
    [...choicesEl.children].forEach((node, n) => {
      if (dropped.has(n)) return;   // 이미 틀린 칸은 흐린 채로 둡니다 (🔊 가 되살아나면 눌러도 되는 줄 압니다)
      node.classList.toggle('is-picked', n === i);
      node.querySelector('.choice-icon').textContent = n === i ? '✓' : '🔊';
    });
    selectBtn.classList.remove('is-hidden');   // 하나라도 고르면 '선택' 버튼 등장
    speak(current.choices[i].word).catch(ignoreCancel);   // 몇 번을 눌러 들어도 안전
  }

  async function ask() {
    paint();
    try {
      if (index === 0) {
        await speak('문제를 잘 듣고, 답을 눌러 보세요.');   // 세션의 첫 문제에서만
        await pause(CONFIG.timing.questionGapMs);
      }
      await speak(current.speech);
    } catch (err) {
      ignoreCancel(err);
    }
  }

  selectBtn.addEventListener('click', async () => {
    if (locked || chosen === null || !canTapSelect()) return;
    locked = true;
    const picked = chosen;

    if (picked === current.answer) await onCorrect();
    else await onWrong(picked);
  });

  async function onCorrect() {
    // 보상 연출(스티커·그림)은 넣지 않습니다. 칭찬 한 마디만 끝까지 들려주고 다음 문제로.
    try {
      await speak(CONFIG.correctVoice);
    } catch (err) {
      ignoreCancel(err);   // 도중에 화면을 나가면 여기로 옵니다
    }
    if (!alive) return;
    await wait(CONFIG.timing.rewardMs);
    if (!alive) return;

    index++;
    if (index >= set.length) finish();
    else ask();
  }

  async function onWrong(picked) {
    // 오답에는 연출을 넣지 않습니다. 틀린 칸만 흐려지고 남은 것 중에서 다시 고릅니다.
    dropped.add(picked);
    chosen = null;
    const node = choicesEl.children[picked];
    node.classList.remove('is-picked');
    node.classList.add('is-out');
    node.querySelector('.choice-icon').textContent = '';
    selectBtn.classList.add('is-hidden');

    speak(pickOne(CONFIG.wrongVoice)).catch(ignoreCancel);
    await wait(CONFIG.timing.wrongFeedbackMs);
    if (!alive) return;
    locked = false;
  }

  async function finish() {
    dots.forEach(d => { d.classList.add('is-done'); d.classList.remove('is-now'); });

    // 다 풀었다는 표시만 조용히 보여 주고 메뉴로 돌아갑니다 (소리 없음).
    if (!isRandom) store.markCleared(month);
    const card = overlay('reward');
    card.el.appendChild(el('div', 'done-text', '다 풀었어요!'));
    await wait(CONFIG.timing.monthCompleteMs);
    if (!alive) return;
    card.close();
    resetTo([{ name: 'menu', params: {} }]);
  }

  return {
    el: holder,
    onEnter: ask,
    onLeave() { alive = false; stopSpeaking(); },
  };
}

/* ══════════════════════════════════════════════════
   설정 (부모용)
   ══════════════════════════════════════════════════ */

function SettingsScreen() {
  const holder = el('div', 'pad-screen');
  holder.appendChild(topbar('설정', { onBack: goBack }));
  holder.appendChild(el('p', 'settings-note', '부모님용 화면이에요'));

  // 고른 목소리·속도·톤을 바로 귀로 확인할 수 있게, 손댈 때마다 견본 문장을 들려줍니다
  const playSample = () => previewVoice(CONFIG.speech.sampleText).catch(ignoreCancel);

  holder.appendChild(el('label', 'field-label', '예비 목소리'));
  holder.appendChild(el('p', 'field-hint',
    '앱의 말은 모두 녹음된 목소리예요. 아래 설정은 녹음을 못 불러왔을 때만 쓰입니다.'));
  // 안드로이드 크롬은 음성 목록을 늦게 받아옵니다. 앱을 막 켜고 바로 들어오면 목록이 비어 있어서,
  // 목록이 도착하면(voiceschanged) 이 칸만 다시 그립니다.
  const voiceBox = el('div');
  holder.appendChild(voiceBox);

  function renderVoices() {
    const voices = getKoreanVoices();
    // 목록을 한 번 그린 뒤에는 다시 그리지 않습니다.
    // (고르는 중에 select 가 손가락 밑에서 닫히면 안 되니까요. 또 안드로이드 크롬은
    //  voiceschanged 를 여러 번 보내면서 잠깐 빈 목록을 주기도 하는데,
    //  그때 이미 그려 둔 목록이 '음성이 없어요' 로 바뀌면 안 됩니다.)
    if (voiceBox.querySelector('select')) return;
    voiceBox.innerHTML = '';
    if (!voices.length) {
      voiceBox.appendChild(el('p', 'field-hint',
        '이 기기에는 한국어 음성이 없어요. 앱은 녹음으로 말하므로 그대로 쓰셔도 됩니다.'));
      return;
    }
    const voiceSelect = el('select', 'text-input');
    const auto = el('option', null, '자동 (부드러운 목소리 먼저)');
    auto.value = '';
    voiceSelect.appendChild(auto);
    voices.forEach(v => {
      const opt = el('option', null, v.name);
      opt.value = v.name;
      if (v.name === store.getVoiceName()) opt.selected = true;
      voiceSelect.appendChild(opt);
    });
    voiceSelect.addEventListener('change', () => {
      store.setVoiceName(voiceSelect.value);
      refreshVoice();
      playSample();   // 고르면 바로 들려줍니다
    });
    voiceBox.appendChild(voiceSelect);
  }
  renderVoices();
  const stopWatchingVoices = onVoicesChanged(renderVoices);

  // 예비 목소리의 말하기 속도
  holder.appendChild(el('label', 'field-label', '예비 목소리 속도'));
  const rateSeg = el('div', 'segmented');
  const nowRate = store.getSpeechRate() || CONFIG.speech.rate;
  const rateButtons = CONFIG.speech.rateOptions.map(opt => {
    const b = el('button', 'seg-btn', opt.label);
    b.classList.toggle('is-on', Math.abs(nowRate - opt.rate) < 0.001);
    b.addEventListener('click', () => {
      store.setSpeechRate(opt.rate);
      rateButtons.forEach(x => x.classList.toggle('is-on', x === b));
      playSample();
    });
    rateSeg.appendChild(b);
    return b;
  });
  holder.appendChild(rateSeg);

  // 노란 칸 타이밍 (구절 듣기)
  holder.appendChild(el('label', 'field-label', '노란 칸 타이밍 (구절 듣기)'));
  const leadSeg = el('div', 'segmented');
  const nowLead = store.getHighlightLead() || CONFIG.timing.highlightLeadMs;
  const leadButtons = CONFIG.speech.leadOptions.map(opt => {
    const b = el('button', 'seg-btn', opt.label);
    b.classList.toggle('is-on', nowLead === opt.lead);
    b.addEventListener('click', () => {
      store.setHighlightLead(opt.lead);
      leadButtons.forEach(x => x.classList.toggle('is-on', x === b));
    });
    leadSeg.appendChild(b);
    return b;
  });
  holder.appendChild(leadSeg);
  holder.appendChild(el('p', 'field-hint',
    '노란 칸이 소리보다 늦게 옮겨지면 「빠르게」로, 너무 앞서가면 「늦게」로 맞춰 주세요. '
    + '구절 듣기 화면에서 바로 확인됩니다.'));

  // 예비 목소리의 톤 (낮을수록 차분합니다)
  holder.appendChild(el('label', 'field-label', '예비 목소리 톤'));
  const pitchSeg = el('div', 'segmented');
  const nowPitch = store.getSpeechPitch() || CONFIG.speech.pitch;
  const pitchButtons = CONFIG.speech.pitchOptions.map(opt => {
    const b = el('button', 'seg-btn', opt.label);
    b.classList.toggle('is-on', Math.abs(nowPitch - opt.pitch) < 0.001);
    b.addEventListener('click', () => {
      store.setSpeechPitch(opt.pitch);
      pitchButtons.forEach(x => x.classList.toggle('is-on', x === b));
      playSample();
    });
    pitchSeg.appendChild(b);
    return b;
  });
  holder.appendChild(pitchSeg);

  const preview = el('button', 'wide-btn', '🔊 들어보기');
  preview.addEventListener('click', playSample);
  holder.appendChild(preview);

  // 초기화
  const reset = el('button', 'danger-btn', '진도 초기화');
  let confirming = false;
  let confirmTimer = 0;
  reset.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      reset.textContent = '정말 지울까요? 한 번 더 누르세요';
      confirmTimer = setTimeout(() => {
        confirming = false;
        reset.textContent = '진도 초기화';
      }, 4000);
      return;
    }
    clearTimeout(confirmTimer);
    store.resetProgress();
    resetTo([{ name: 'menu', params: {} }]);
  });
  holder.appendChild(reset);

  holder.appendChild(el('p', 'field-hint',
    '들은 달과 완주한 달 기록만 지웁니다. 이 기기에만 저장되며, '
    + '위에서 맞춘 목소리·속도·타이밍 설정은 그대로 남습니다.'));

  return {
    el: holder,
    onLeave() {
      stopWatchingVoices();
      clearTimeout(confirmTimer);
    },
  };
}

/* ══════════════════════════════════════════════════ */

export const SCREENS = {
  menu: MenuScreen,
  months: MonthsScreen,
  listen: ListenScreen,
  quiz: QuizScreen,
  settings: SettingsScreen,
};
