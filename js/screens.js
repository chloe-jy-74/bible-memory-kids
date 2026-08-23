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
  speak, pause, stopSpeaking, speakSequence, ignoreCancel, CANCELLED,
  isSpeechSupported, hasKoreanVoice, getKoreanVoices, refreshVoice,
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

    if (mode === 'quiz' && store.hasCleared(verse.month)) {
      tile.appendChild(el('div', 'tile-badge', '★'));
    }

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
  controls.appendChild(playBtn);
  body.appendChild(controls);
  holder.appendChild(body);

  let playing = false;
  let alive = true;

  function setPlaying(on) {
    playing = on;
    playBtn.classList.toggle('is-playing', on);
    playIcon.textContent = on ? '■' : '▶';
    playText.textContent = on ? '멈춤' : '듣기';
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
   * 녹음 파일 한 번 재생 + 소절 하이라이트.
   *
   * 음원은 "○월 말씀 → 본문 → 출처"가 한 파일로 이어져 있습니다.
   * verses.json 의 cues 가 소절마다 [시작, 끝] 을 음원 길이 대비 비율로 담고 있어서,
   * 재생 위치(currentTime)를 보고 지금 읽는 소절에 불을 켭니다.
   * cues 가 없으면 소절 수로 균등 분할합니다.
   */
  function playRecording(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      let ticker = 0;

      const stop = () => {
        clearInterval(ticker);
        audio.onended = audio.onerror = null;
        try { audio.pause(); } catch (_) { /* 무시 */ }
      };
      const cancel = () => { stop(); reject(CANCELLED); };
      const done = () => { stop(); release(cancel); resolve(); };

      const cues = verse.cues;
      // 부모가 설정 화면에서 맞춘 값 (없으면 기본값)
      const lead = (store.getHighlightLead() || CONFIG.timing.highlightLeadMs) / 1000;
      const follow = () => {
        const total = audio.duration || verse.audioSeconds || 0;
        if (!total) return;
        // 타이머가 80ms 마다 도는 만큼 늘 조금 늦게 옮겨집니다.
        // 살짝 앞당겨 봐서, 소리보다 뒤따라오지 않고 딱 맞아떨어지게 합니다.
        const at = (audio.currentTime + lead) / total;

        if (!cues) {
          highlight(Math.min(lineEls.length - 1, Math.floor(at * lineEls.length)));
          return;
        }
        // 출처를 읽기 시작하면 출처에 불을 켭니다.
        if (verse.refAt != null && at >= verse.refAt) { highlight(lineEls.length); return; }
        // 마지막으로 시작 지점을 지난 소절. 첫 소절 전(인트로)이면 -1 → 아무 데도 안 켜집니다.
        let now = -1;
        for (let i = 0; i < cues.length; i++) if (at >= cues[i][0]) now = i;
        highlight(now);
      };

      audio.onended = done;
      audio.onerror = cancel;   // 파일이 없으면 호출한 쪽에서 TTS 로 넘어갑니다
      takeOverListen(cancel);
      audio.play().then(() => {
        // 60fps 가 필요 없는 일이라 타이머로 따라갑니다.
        // requestAnimationFrame 과 달리 탭이 뒤로 가도 멈추지 않아 소리와 어긋나지 않습니다.
        ticker = setInterval(follow, CONFIG.timing.highlightTickMs);
        follow();
      }).catch(cancel);
    });
  }

  /** 녹음이 없을 때만 쓰는 예비 낭독 (브라우저 TTS) */
  async function speakFallback() {
    await speakSequence(verse.lines, {
      gapMs: CONFIG.timing.lineGapMs,
      onLine: highlight,
    });
    highlight(lineEls.length);
    await speak(verse.refSpeech || verse.ref);
  }

  // 멈춤 버튼과 화면 이탈이 재생 중인 음원을 끊을 수 있게 하는 고리
  let cancelCurrent = null;
  function takeOverListen(fn) { cancelCurrent = fn; }
  function release(fn) { if (cancelCurrent === fn) cancelCurrent = null; }
  function stopAll() {
    if (cancelCurrent) { const fn = cancelCurrent; cancelCurrent = null; fn(); }
    stopSpeaking();
  }

  /** 멈출 때까지 계속 반복해서 들려줍니다. */
  async function play() {
    if (playing) return;
    setPlaying(true);
    const url = getVerseAudio(month);

    try {
      while (alive) {
        clearHighlight();
        card.classList.remove('is-done');

        if (url) {
          try {
            await playRecording(url);
          } catch (err) {
            if (err === CANCELLED) throw err;
            await speakFallback();      // 녹음 재생 실패 → 예비 낭독
          }
        } else {
          await speakFallback();
        }

        clearHighlight();
        card.classList.add('is-done');
        store.markListened(month);
        await pause(CONFIG.timing.verseLoopGapMs);
      }
    } catch (err) {
      ignoreCancel(err);
    } finally {
      clearHighlight();
      setPlaying(false);
    }
  }

  playBtn.addEventListener('click', () => {
    if (playing) stopAll();   // play() 의 finally 가 상태를 되돌립니다
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
      // 성경 출처처럼 긴 선택지는 한 줄에 들어가도록 조금 작게
      const long = choice.word.length > 8 ? ' is-long' : '';
      btn.appendChild(el('span', `choice-word${long}`, choice.word));
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

  // 아이 이름
  // 읽어주는 목소리 — 기기마다 있는 음성이 달라서 부모가 직접 고를 수 있게 했습니다
  holder.appendChild(el('label', 'field-label', '읽어주는 목소리'));
  const voices = getKoreanVoices();
  if (!voices.length) {
    holder.appendChild(el('p', 'field-hint',
      '이 기기에는 한국어 음성이 없어요. 크롬이나 사파리로 열거나, 기기 설정에서 한국어 음성을 추가해 주세요.'));
  } else {
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
      speak(CONFIG.speech.sampleText).catch(ignoreCancel);   // 고르면 바로 들려줍니다
    });
    holder.appendChild(voiceSelect);
  }

  // 말하기 속도
  holder.appendChild(el('label', 'field-label', '말하기 속도'));
  const rateSeg = el('div', 'segmented');
  const nowRate = store.getSpeechRate() || CONFIG.speech.rate;
  const rateButtons = CONFIG.speech.rateOptions.map(opt => {
    const b = el('button', 'seg-btn', opt.label);
    b.classList.toggle('is-on', Math.abs(nowRate - opt.rate) < 0.001);
    b.addEventListener('click', () => {
      store.setSpeechRate(opt.rate);
      rateButtons.forEach((x, i) => x.classList.toggle('is-on', CONFIG.speech.rateOptions[i].rate === opt.rate));
      speak(CONFIG.speech.sampleText).catch(ignoreCancel);
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
      leadButtons.forEach((x, i) => x.classList.toggle('is-on', CONFIG.speech.leadOptions[i].lead === opt.lead));
    });
    leadSeg.appendChild(b);
    return b;
  });
  holder.appendChild(leadSeg);
  holder.appendChild(el('p', 'field-hint',
    '노란 칸이 소리보다 늦게 옮겨지면 「빠르게」로, 너무 앞서가면 「늦게」로 맞춰 주세요. '
    + '구절 듣기 화면에서 바로 확인됩니다.'));

  // 목소리 톤 (낮을수록 차분합니다)
  holder.appendChild(el('label', 'field-label', '목소리 톤'));
  const pitchSeg = el('div', 'segmented');
  const nowPitch = store.getSpeechPitch() || CONFIG.speech.pitch;
  const pitchButtons = CONFIG.speech.pitchOptions.map(opt => {
    const b = el('button', 'seg-btn', opt.label);
    b.classList.toggle('is-on', Math.abs(nowPitch - opt.pitch) < 0.001);
    b.addEventListener('click', () => {
      store.setSpeechPitch(opt.pitch);
      pitchButtons.forEach((x, i) => x.classList.toggle('is-on', CONFIG.speech.pitchOptions[i].pitch === opt.pitch));
      speak(CONFIG.speech.sampleText).catch(ignoreCancel);
    });
    pitchSeg.appendChild(b);
    return b;
  });
  holder.appendChild(pitchSeg);

  const preview = el('button', 'wide-btn', '🔊 들어보기');
  preview.addEventListener('click', () => speak(CONFIG.speech.sampleText).catch(ignoreCancel));
  holder.appendChild(preview);

  // 현재 월 (랜덤 퀴즈 범위)
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
  menu: MenuScreen,
  months: MonthsScreen,
  listen: ListenScreen,
  quiz: QuizScreen,
  settings: SettingsScreen,
};
