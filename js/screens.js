/**
 * 모든 화면.
 *
 *   이름 입력(첫 실행) → 메인 메뉴
 *   ├── 구절 듣기  → 월 선택 → 낭독
 *   ├── 따라 읽기  → 월 선택 → 소절 무한 반복 (따라 하기 / 이어 말하기)
 *   ├── 월별 퀴즈  → 월 선택 → 3지선다
 *   ├── 랜덤 퀴즈  → 10문제 세트
 *   ├── 동물 도감  → 12마리 수집 현황
 *   └── 설정(부모용)
 */

import { CONFIG } from './config.js';
import {
  getAllVerses, getVerse, getMonthImage, getMonthAnimalName, getRewardStickers,
} from './data.js';
import { buildMonthSet, buildRandomSet, pickPraise, pickOne } from './questions.js';
import {
  speak, pause, stopSpeaking, speakSequence, ignoreCancel,
  isSpeechSupported, hasKoreanVoice,
} from './speech.js';
import {
  ensureMic, isMicReady, getMicPermission, listenForVoice, cancelListening, releaseMic,
} from './mic.js';
import * as store from './storage.js';
import { navigate, goBack, resetTo } from './router.js';
import { el, img, topbar, wait, overlay, lockable } from './ui.js';

/* ══════════════════════════════════════════════════
   첫 실행 — 아이 이름 (부모가 한 번만)
   ══════════════════════════════════════════════════ */

function NameScreen() {
  const holder = el('div', 'pad-screen');
  holder.appendChild(el('h1', 'app-title', '유치부 성구암송'));
  holder.appendChild(el('p', 'app-subtitle', '칭찬할 때 아이 이름을 불러 줄게요'));

  const input = el('input', 'text-input');
  input.type = 'text';
  input.placeholder = '아이 이름 (예: 하은)';
  input.maxLength = 10;
  input.value = store.getChildName();
  holder.appendChild(input);

  const startBtn = el('button', 'wide-btn', '시작하기');
  startBtn.addEventListener('click', () => {
    store.setChildName(input.value);
    resetTo([{ name: 'menu', params: {} }]);
  });
  holder.appendChild(startBtn);

  const skip = el('button', 'text-btn', '이름 없이 시작');
  skip.addEventListener('click', () => {
    store.markNameAsked();
    resetTo([{ name: 'menu', params: {} }]);
  });
  holder.appendChild(skip);

  holder.appendChild(el('p', 'notice',
    '나중에 메인 화면 오른쪽 위 톱니바퀴에서 바꿀 수 있어요.'));

  return { el: holder };
}

/* ══════════════════════════════════════════════════
   메인 메뉴
   ══════════════════════════════════════════════════ */

const MENU_ITEMS = [
  { mode: 'listen', icon: '📖', label: '구절 듣기', go: () => navigate('months', { mode: 'listen' }) },
  { mode: 'repeat', icon: '🗣️', label: '따라 읽기', go: () => navigate('months', { mode: 'repeat' }) },
  { mode: 'quiz',   icon: '❓', label: '월별 퀴즈', go: () => navigate('months', { mode: 'quiz' }) },
  { mode: 'random', icon: '🎲', label: '랜덤 퀴즈', go: () => navigate('quiz', { mode: 'random' }) },
  { mode: 'book',   icon: '🐾', label: '동물 도감', go: () => navigate('book', {}) },
];

function MenuScreen() {
  const holder = el('div');

  const head = el('div', 'menu-head');
  head.appendChild(el('h1', 'app-title', '유치부 성구암송'));
  const gear = el('button', 'gear-btn', '⚙️');
  gear.setAttribute('aria-label', '설정');
  gear.addEventListener('click', () => navigate('settings', {}));
  head.appendChild(gear);
  holder.appendChild(head);

  holder.appendChild(el('p', 'app-subtitle', '판교 사랑의교회'));

  const menu = el('div', 'menu');
  for (const item of MENU_ITEMS) {
    const btn = el('button', 'menu-btn');
    btn.dataset.mode = item.mode;
    btn.appendChild(el('span', 'menu-icon', item.icon));
    btn.appendChild(el('span', 'menu-label', item.label));
    if (item.mode === 'book') {
      btn.appendChild(el('span', 'count-tag', `${store.getCollected().length} / 12`));
    }
    btn.addEventListener('click', item.go);
    menu.appendChild(btn);
  }
  holder.appendChild(menu);

  if (!isSpeechSupported() || !hasKoreanVoice()) {
    holder.appendChild(el('p', 'notice',
      '이 기기에 한국어 음성이 없어요. 소리가 안 나면 다른 브라우저(크롬·사파리)로 열어 주세요.'));
  }

  return { el: holder };
}

/* ══════════════════════════════════════════════════
   월 선택
   ══════════════════════════════════════════════════ */

const MODE_TITLE = { listen: '구절 듣기', repeat: '따라 읽기', quiz: '월별 퀴즈' };
const MODE_ASK = {
  listen: '몇 월 말씀을 들어볼까요?',
  repeat: '몇 월 말씀을 따라 읽어볼까요?',
  quiz: '몇 월 문제를 풀어볼까요?',
};

function MonthsScreen({ mode }) {
  const holder = el('div');
  holder.appendChild(topbar(MODE_TITLE[mode] || '', { onBack: goBack }));

  // 따라 읽기 방식 선택 (부모용 — 작게)
  if (mode === 'repeat') {
    const seg = el('div', 'segmented');
    const modes = [
      { key: 'basic', label: '따라 하기' },
      { key: 'advanced', label: '이어 말하기' },
    ];
    const buttons = modes.map(m => {
      const b = el('button', 'seg-btn', m.label);
      b.classList.toggle('is-on', store.getRepeatMode() === m.key);
      b.addEventListener('click', () => {
        store.setRepeatMode(m.key);
        buttons.forEach((x, i) => x.classList.toggle('is-on', modes[i].key === m.key));
      });
      seg.appendChild(b);
      return b;
    });
    holder.appendChild(seg);
    holder.appendChild(el('p', 'seg-hint',
      '이어 말하기: 앱이 한 소절 읽고 멈추면 아이가 다음 소절을 말합니다'));
  }

  const grid = el('div', 'month-grid');
  for (const verse of getAllVerses()) {
    const tile = el('button', 'month-tile');
    tile.setAttribute('aria-label', `${verse.month}월`);
    tile.appendChild(img(getMonthImage(verse.month)));

    const num = el('div', 'month-num');
    num.appendChild(el('span', null, String(verse.month)));
    num.appendChild(el('span', 'unit', '월'));
    tile.appendChild(num);

    if (mode === 'quiz' && store.hasCleared(verse.month)) {
      tile.appendChild(el('div', 'tile-badge', '★'));
    }

    tile.addEventListener('click', () => {
      if (mode === 'listen') navigate('listen', { month: verse.month });
      else if (mode === 'repeat') navigate('repeat', { month: verse.month });
      else navigate('quiz', { mode: 'month', month: verse.month });
    });
    grid.appendChild(tile);
  }
  holder.appendChild(grid);

  return {
    el: holder,
    onEnter() { speak(MODE_ASK[mode]).catch(ignoreCancel); },
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
  body.appendChild(el('div', 'verse-ref', verse.ref));

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
  const playText = el('span', null, '다시 듣기');
  playBtn.append(playIcon, playText);
  controls.appendChild(playBtn);
  body.appendChild(controls);
  holder.appendChild(body);

  let playing = false;

  function setPlaying(on) {
    playing = on;
    playBtn.classList.toggle('is-playing', on);
    playIcon.textContent = on ? '■' : '▶';
    playText.textContent = on ? '멈춤' : '다시 듣기';
  }

  function highlight(index) {
    lineEls.forEach((line, i) => {
      line.classList.toggle('is-active', i === index);
      line.classList.toggle('is-read', i < index);
    });
  }

  async function play() {
    setPlaying(true);
    card.classList.remove('is-done');
    highlight(-1);
    try {
      await speak(`${month}월 말씀이에요`);
      await pause(CONFIG.timing.introGapMs);
      await speakSequence(verse.lines, { gapMs: CONFIG.timing.lineGapMs, onLine: highlight });
      lineEls.forEach(line => line.classList.remove('is-active'));
      card.classList.add('is-done');
      store.markListened(month);
      await pause(CONFIG.timing.replayGapMs);
      setPlaying(false);
    } catch (err) {
      ignoreCancel(err);
      lineEls.forEach(line => line.classList.remove('is-active'));
      setPlaying(false);
    }
  }

  playBtn.addEventListener('click', () => {
    if (playing) stopSpeaking();   // play()의 catch가 상태를 되돌립니다
    else play();
  });

  return { el: holder, onEnter: play, onLeave: stopSpeaking };
}

/* ══════════════════════════════════════════════════
   2. 따라 읽기  ★핵심 기능
   ══════════════════════════════════════════════════ */

function RepeatScreen({ month }) {
  const verse = getVerse(month);
  const advanced = store.getRepeatMode() === 'advanced';

  const holder = el('div');
  const statusChip = el('div', 'status-chip', '준비 중');
  holder.appendChild(topbar(`${month}월 따라 읽기`, { onBack: goBack, right: statusChip }));

  const body = el('div', 'repeat');

  const card = el('div', 'verse-card');
  const lineEls = verse.lines.map(text => {
    const line = el('div', 'verse-line', text);
    card.appendChild(line);
    return line;
  });
  body.appendChild(card);

  // 아이 차례 표시 — 글자를 못 읽어도 '지금 내 차례'를 알 수 있게
  const stage = el('div', 'mic-stage');
  const micCircle = el('div', 'mic-circle');
  micCircle.appendChild(el('span', 'mic-icon', '🎤'));
  const micRing = el('div', 'mic-ring');
  micCircle.appendChild(micRing);
  stage.appendChild(micCircle);
  const stageText = el('div', 'stage-text', '');
  stage.appendChild(stageText);
  body.appendChild(stage);

  const roundTag = el('div', 'round-tag', '1바퀴째');
  body.appendChild(roundTag);

  holder.appendChild(body);

  let alive = true;

  /** 지금 마이크로 들을 수 있는지 — 권한을 늦게 허용해도 그때부터 반영됩니다 */
  const micOn = () => isMicReady();

  function showStatus() {
    statusChip.textContent = micOn() ? '🎤 마이크' : '자동 진행';
    statusChip.classList.toggle('is-auto', !micOn());
  }

  function markLine(index, who) {
    lineEls.forEach((line, i) => {
      line.classList.toggle('is-active', i === index && who === 'app');
      line.classList.toggle('is-turn', i === index && who === 'child');
      line.classList.toggle('is-read', i < index);
    });
  }

  function setTurn(on) {
    micCircle.classList.toggle('is-on', on);
    stageText.textContent = on
      ? (micOn() ? '따라 해 보세요' : '따라 해 보세요 (자동으로 넘어가요)')
      : '';
    if (!on) micRing.style.transform = 'scale(1)';
  }

  function showLevel(level) {
    const scale = 1 + Math.min(level * 6, 1.2);
    micRing.style.transform = `scale(${scale.toFixed(2)})`;
  }

  /** 아이 차례: 마이크가 있으면 듣고, 없으면 정해진 시간만큼 기다립니다 */
  async function childTurn(lineIndex) {
    markLine(lineIndex, 'child');
    showStatus();
    setTurn(true);
    let heard = false;

    if (micOn()) {
      await pause(CONFIG.timing.micDelayMs);          // 앱 자기 목소리 오인 방지
      if (!alive) return false;
      const result = await listenForVoice({ onLevel: showLevel });
      if (!alive || result === 'cancelled') return false;
      heard = result === 'voice';                      // 무음이어도 실패 처리하지 않음
    } else {
      await pause(CONFIG.timing.autoAdvanceMs);        // 마이크 없을 때: 조용히 다음으로
      if (!alive) return false;
    }

    setTurn(false);
    if (heard) {
      await speak(pickOne(CONFIG.repeatPraise));
      await pause(CONFIG.timing.praiseGapMs);
    }
    return heard;
  }

  /** 기본 모드: 앱이 읽고 → 아이가 따라 하고 → 다음 소절 */
  async function basicRound() {
    for (let i = 0; i < verse.lines.length; i++) {
      markLine(i, 'app');
      await speak(verse.lines[i]);
      if (!alive) return;
      await childTurn(i);
      if (!alive) return;
    }
  }

  /** 심화 모드: 앱이 한 소절 읽고 멈추면 아이가 다음 소절을 이어 말함 */
  async function advancedRound() {
    for (let i = 0; i < verse.lines.length; i += 2) {
      markLine(i, 'app');
      await speak(verse.lines[i]);
      if (!alive) return;

      const next = i + 1;
      if (next >= verse.lines.length) return;

      const heard = await childTurn(next);
      if (!alive) return;
      if (!heard && !micOn()) {
        // 자동 진행 모드에서는 앱이 대신 읽어 주고 넘어갑니다
        markLine(next, 'app');
        await speak(verse.lines[next]);
        if (!alive) return;
      }
    }
  }

  async function run() {
    // 권한 창을 안 누르고 두어도 앱이 멈추면 안 됩니다.
    // 정해진 시간이 지나면 자동 진행으로 시작하고, 나중에 허용하면 그때부터 마이크를 씁니다.
    const micReady = ensureMic();
    await Promise.race([micReady, wait(CONFIG.timing.micPermissionTimeoutMs)]);
    if (!alive) return;
    micReady.then(() => { if (alive) showStatus(); });
    showStatus();

    let round = 1;
    try {
      while (alive) {
        roundTag.textContent = `${round}바퀴째`;
        if (advanced) await advancedRound();
        else await basicRound();
        if (!alive) return;

        markLine(-1, null);
        lineEls.forEach(line => line.classList.add('is-read'));
        await speak(`${month}월 구절 다 외웠어요!`);
        await pause(CONFIG.timing.roundGapMs);
        lineEls.forEach(line => line.classList.remove('is-read'));
        round++;                                  // 뒤로가기 전까지 무한 반복
      }
    } catch (err) {
      ignoreCancel(err);
    }
  }

  /**
   * 마이크 권한 안내.
   * 브라우저 정책상 권한을 코드로 미리 켜 줄 수는 없고 사용자가 한 번은 눌러야 합니다.
   * 그래서 (1) 이미 허용된 기기는 묻지 않고 바로 시작하고,
   *        (2) 처음인 기기는 부모가 이해할 수 있게 한 번만 안내하고,
   *        (3) 거부했거나 '없이 하기'를 고른 뒤에는 다시 묻지 않습니다.
   */
  function showGate() {
    const gate = el('div', 'gate');
    const card = el('div', 'gate-card');
    card.appendChild(el('div', 'gate-icon', '🎤'));
    card.appendChild(el('div', 'gate-title', '아이 목소리를 들려주세요'));
    card.appendChild(el('p', 'gate-text',
      '따라 읽을 때 아이가 소리 내어 말하면 앱이 알아듣고 칭찬해 줘요. '
      + '아래를 누르면 브라우저가 마이크 사용을 한 번 물어봅니다. "허용"을 눌러 주세요.'));

    const allow = el('button', 'wide-btn', '🎤 마이크 켜기');
    allow.addEventListener('click', async () => {
      allow.disabled = true;
      const ok = await ensureMic();          // 반드시 사용자가 누른 자리에서 요청해야 합니다
      store.setMicChoice(ok ? '' : 'skip');  // 거부했으면 다음부터 묻지 않음
      gate.remove();
      run();
    });
    card.appendChild(allow);

    const skip = el('button', 'text-btn', '마이크 없이 하기');
    skip.addEventListener('click', () => {
      store.setMicChoice('skip');
      gate.remove();
      run();
    });
    card.appendChild(skip);

    card.appendChild(el('p', 'gate-note',
      '마이크를 켜지 않아도 됩니다. 그때는 소절마다 3초씩 기다렸다 다음으로 넘어가요.'));

    gate.appendChild(card);
    holder.appendChild(gate);
  }

  async function begin() {
    const permission = await getMicPermission();
    if (!alive) return;

    // 이미 허용한 기기는 묻지 않고 바로 시작합니다.
    // (여기서 ensureMic()을 기다리면 안 됩니다 — 응답이 없는 기기에서 화면이 멈춥니다.
    //  run() 안의 6초 안전장치가 알아서 자동 진행으로 넘겨 줍니다.)
    if (permission === 'granted') return run();
    if (permission === 'denied' || store.getMicChoice() === 'skip') return run();
    showGate();
  }

  return {
    el: holder,
    onEnter: begin,
    onLeave() {
      alive = false;
      stopSpeaking();
      cancelListening();
      releaseMic();
    },
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
      const btn = el('button', 'choice' + (current.useImages ? ' has-image' : ''));
      if (choice.image) {
        btn.appendChild(img(choice.image, 'choice-img'));
      } else {
        // 성경 출처처럼 긴 선택지는 한 줄에 들어가도록 조금 작게
        const long = choice.word.length > 8 ? ' is-long' : '';
        btn.appendChild(el('span', `choice-word${long}`, choice.word));
      }
      btn.appendChild(el('span', 'choice-icon', '🔊'));
      btn.addEventListener('click', () => onChoice(i, btn));
      choicesEl.appendChild(btn);
    });
  }

  function onChoice(i, btn) {
    if (locked || dropped.has(i) || !canTapChoice()) return;
    chosen = i;
    [...choicesEl.children].forEach((node, n) => {
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
        await speak('그림을 눌러서 들어보세요');   // 세션의 첫 문제에서만
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
    const card = overlay('reward');
    const inner = el('div', 'reward-card');
    const sticker = pickOne(getRewardStickers());
    inner.appendChild(img(sticker.src, 'reward-sticker'));
    if (current.month) inner.appendChild(img(getMonthImage(current.month), 'reward-animal'));
    card.el.appendChild(inner);

    speak(pickPraise(CONFIG.praise, store.getChildName())).catch(ignoreCancel);
    await wait(CONFIG.timing.rewardMs);          // 1.5초 안에 자동으로 다음 문제
    if (!alive) return;
    card.close();

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

    if (isRandom) {
      const card = overlay('reward');
      const inner = el('div', 'reward-card');
      inner.appendChild(img(getRewardStickers()[1].src, 'reward-sticker'));
      inner.appendChild(el('div', 'reward-text', '10문제 다 풀었어요!'));
      card.el.appendChild(inner);
      speak('우와, 열 문제를 다 풀었어요! 정말 대단해요!').catch(ignoreCancel);
      await wait(CONFIG.timing.monthCompleteMs);
      if (!alive) return;
      card.close();
      resetTo([{ name: 'menu', params: {} }]);
      return;
    }

    store.markCleared(month);
    store.collectAnimal(month);
    await showCollectScene(month, () => alive);
    if (!alive) return;
    resetTo([{ name: 'menu', params: {} }, { name: 'book', params: { justAdded: month } }]);
  }

  return {
    el: holder,
    onEnter: ask,
    onLeave() { alive = false; stopSpeaking(); },
  };
}

/** 한 달 완주 — 도감에 그 달 동물이 들어가는 장면 (기획서: 3~4초 크게) */
async function showCollectScene(month, isAlive) {
  const card = overlay('collect');
  const inner = el('div', 'collect-card');
  inner.appendChild(el('div', 'collect-title', `${month}월 동물 친구를 모았어요!`));
  inner.appendChild(img(getMonthImage(month), 'collect-animal'));

  const mini = el('div', 'book-mini');
  getAllVerses().forEach(v => {
    const slot = el('div', 'mini-slot');
    if (store.isCollected(v.month)) slot.appendChild(img(getMonthImage(v.month)));
    else slot.appendChild(el('span', 'mini-lock', '?'));
    if (v.month === month) slot.classList.add('is-new');
    mini.appendChild(slot);
  });
  inner.appendChild(mini);
  card.el.appendChild(inner);

  speak(`참 잘했어요! ${month}월 ${getMonthAnimalName(month)} 친구를 모았어요!`).catch(ignoreCancel);
  await wait(CONFIG.timing.monthCompleteMs);
  card.close();
  if (!isAlive()) return;
}

/* ══════════════════════════════════════════════════
   5. 동물 도감
   ══════════════════════════════════════════════════ */

function BookScreen({ justAdded } = {}) {
  const holder = el('div');
  const count = el('div', 'status-chip', `${store.getCollected().length} / 12`);
  holder.appendChild(topbar('동물 도감', { onBack: goBack, right: count }));

  const grid = el('div', 'book-grid');
  for (const verse of getAllVerses()) {
    const month = verse.month;
    const slot = el('button', 'book-slot');
    const got = store.isCollected(month);

    if (got) {
      slot.appendChild(img(getMonthImage(month)));
      if (month === justAdded) slot.classList.add('is-new');
    } else {
      slot.classList.add('is-empty');
      slot.appendChild(el('span', 'slot-lock', '?'));
    }

    const num = el('div', 'month-num');
    num.appendChild(el('span', null, String(month)));
    num.appendChild(el('span', 'unit', '월'));
    slot.appendChild(num);

    slot.addEventListener('click', () => {
      if (got) speak(`${month}월, ${getMonthAnimalName(month)}`).catch(ignoreCancel);
      else speak(`${month}월 퀴즈를 다 풀면 만날 수 있어요`).catch(ignoreCancel);
    });
    grid.appendChild(slot);
  }
  holder.appendChild(grid);
  holder.appendChild(el('p', 'hint', '월별 퀴즈를 끝까지 풀면 그 달 친구가 도감에 들어와요'));

  return {
    el: holder,
    onEnter() {
      const n = store.getCollected().length;
      const text = n === 0
        ? '퀴즈를 풀면 동물 친구를 모을 수 있어요'
        : `동물 친구를 ${n}마리 모았어요`;
      speak(text).catch(ignoreCancel);
    },
  };
}

/* ══════════════════════════════════════════════════
   설정 (부모용)
   ══════════════════════════════════════════════════ */

function SettingsScreen() {
  const holder = el('div', 'pad-screen');
  holder.appendChild(topbar('설정', { onBack: goBack }));
  holder.appendChild(el('p', 'settings-note', '부모님용 화면이에요'));

  // 아이 이름
  holder.appendChild(el('label', 'field-label', '아이 이름 (칭찬할 때 불러 줘요)'));
  const nameInput = el('input', 'text-input');
  nameInput.type = 'text';
  nameInput.maxLength = 10;
  nameInput.value = store.getChildName();
  nameInput.placeholder = '예: 하은';
  nameInput.addEventListener('change', () => store.setChildName(nameInput.value));
  holder.appendChild(nameInput);

  // 현재 월 (랜덤 퀴즈 범위)
  holder.appendChild(el('label', 'field-label', '지금 배우는 달 (랜덤 퀴즈 범위)'));
  const select = el('select', 'text-input');
  for (let m = 1; m <= 12; m++) {
    const opt = el('option', null, `${m}월`);
    opt.value = String(m);
    if (m === store.getCurrentMonth()) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => store.setCurrentMonth(Number(select.value)));
  holder.appendChild(select);
  holder.appendChild(el('p', 'field-hint',
    '랜덤 퀴즈는 이 달까지 배운 내용에서만 나옵니다.'));

  // 따라 읽기 방식
  holder.appendChild(el('label', 'field-label', '따라 읽기 방식'));
  const seg = el('div', 'segmented');
  const modes = [
    { key: 'basic', label: '따라 하기' },
    { key: 'advanced', label: '이어 말하기' },
  ];
  const buttons = modes.map(m => {
    const b = el('button', 'seg-btn', m.label);
    b.classList.toggle('is-on', store.getRepeatMode() === m.key);
    b.addEventListener('click', () => {
      store.setRepeatMode(m.key);
      buttons.forEach((x, i) => x.classList.toggle('is-on', modes[i].key === m.key));
    });
    seg.appendChild(b);
    return b;
  });
  holder.appendChild(seg);

  // 마이크 — '없이 하기'를 골랐던 경우에만 다시 물어볼 수 있게
  if (store.getMicChoice() === 'skip') {
    holder.appendChild(el('label', 'field-label', '마이크'));
    const again = el('button', 'wide-btn', '🎤 마이크 다시 사용하기');
    again.addEventListener('click', () => {
      store.setMicChoice('');
      again.disabled = true;
      again.textContent = '다음에 따라 읽기를 열면 물어볼게요';
    });
    holder.appendChild(again);
    holder.appendChild(el('p', 'field-hint',
      '브라우저에서 마이크를 아예 차단해 두셨다면, 주소창 왼쪽 자물쇠 아이콘에서 허용으로 바꿔 주세요.'));
  }

  // 초기화
  const reset = el('button', 'danger-btn', '진도 초기화');
  let confirming = false;
  reset.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      reset.textContent = '정말 지울까요? 한 번 더 누르세요';
      setTimeout(() => {
        confirming = false;
        reset.textContent = '진도 초기화';
      }, 4000);
      return;
    }
    store.resetAll();
    resetTo([{ name: 'menu', params: {} }]);
  });
  holder.appendChild(reset);

  holder.appendChild(el('p', 'field-hint',
    '진도는 이 기기에만 저장됩니다. 도감·완주 기록이 모두 지워집니다.'));

  return { el: holder };
}

/* ══════════════════════════════════════════════════ */

export const SCREENS = {
  name: NameScreen,
  menu: MenuScreen,
  months: MonthsScreen,
  listen: ListenScreen,
  repeat: RepeatScreen,
  quiz: QuizScreen,
  book: BookScreen,
  settings: SettingsScreen,
};
