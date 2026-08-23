/**
 * 문항 준비 — 화면에 내보내기 직전의 가공을 여기서만 합니다.
 *
 *  · 선택지 순서를 매번 섞습니다 (데이터에는 정답이 항상 0번으로 들어 있음).
 *  · 선택지는 글자만 보여 줍니다. 문항도 선택지도 눌러서 소리로 들을 수 있으므로
 *    그림이 없어도 글을 모르는 아이가 풀 수 있습니다.
 */

import { CONFIG } from './config.js';
import {
  getMonthlyQuestions, getAllMonthlyQuestions, getGeneralQuestions,
} from './data.js';
import { getCurrentMonth } from './storage.js';

/** 문항 하나를 화면용으로 가공 */
export function prepareQuestion(q) {
  const order = shuffle(q.choices.map((_, i) => i));

  return {
    id: q.id,
    month: q.month || q.about || null,   // 보상 그림에 쓸 달
    display: q.display,
    speech: q.speech || q.display,
    choices: order.map(i => ({ word: q.choices[i] })),
    answer: order.indexOf(q.answer),
  };
}

/** 월별 퀴즈 한 세트 (기획서 순서 그대로, 선택지만 섞임) */
export function buildMonthSet(month) {
  return getMonthlyQuestions(month).map(prepareQuestion);
}

/**
 * 랜덤 퀴즈 한 세트 (10문제).
 * 이번 달 50% + 이전에 배운 달 50%. 아직 안 배운 달은 제외합니다.
 */
export function buildRandomSet() {
  const current = getCurrentMonth();
  const size = CONFIG.quiz.randomSetSize;
  const wantCurrent = Math.round(size * CONFIG.quiz.randomCurrentMonthRatio);

  const currentPool = shuffle(getMonthlyQuestions(current));
  const earlierPool = shuffle([
    ...getAllMonthlyQuestions().filter(q => q.month < current),
    ...getGeneralQuestions().filter(g => g.about <= current),
  ]);

  const picked = [
    ...currentPool.slice(0, wantCurrent),
    ...earlierPool.slice(0, size - wantCurrent),
  ];

  // 한쪽이 모자라면 (예: 1월이라 이전 달이 없음) 남은 문제로 채웁니다.
  if (picked.length < size) {
    const rest = [...currentPool, ...earlierPool].filter(q => !picked.includes(q));
    picked.push(...rest.slice(0, size - picked.length));
  }

  return shuffle(picked).map(prepareQuestion);
}


export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}
