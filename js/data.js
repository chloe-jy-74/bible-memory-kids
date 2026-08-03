/**
 * 데이터 로딩 — 구절 / 문항 / 그림 매핑.
 * 구절과 문항은 JSON 파일에만 있으므로, 내용 수정은 코드를 건드리지 않고 가능합니다.
 */

const VERSES_URL = 'data/verses.json';
const QUESTIONS_URL = 'data/questions.json';
const IMAGES_URL = 'assets/images.json';

let verses = null;         // month(1~12) → 구절 객체
let imagesByLabel = null;  // 한글 라벨 → 그림 정보
let imagesByFile = null;   // 파일 경로 → 그림 정보
let monthly = [];          // 월별 문항
let general = [];          // 종합 문항 (랜덤 퀴즈 전용)

export async function loadData() {
  const [versesJson, questionsJson, imagesJson] = await Promise.all([
    fetchJson(VERSES_URL),
    fetchJson(QUESTIONS_URL),
    fetchJson(IMAGES_URL),
  ]);

  verses = new Map(versesJson.months.map(v => [v.month, v]));
  imagesByLabel = new Map(imagesJson.images.map(i => [i.label, i]));
  imagesByFile = new Map(imagesJson.images.map(i => [i.file, i]));
  monthly = questionsJson.monthly;
  general = questionsJson.general;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} 를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

/* ── 구절 ──────────────────────────────────────── */

export function getAllVerses() {
  return [...verses.values()];
}

export function getVerse(month) {
  return verses.get(month);
}

/** 그 달의 도감 동물 그림 경로 */
export function getMonthImage(month) {
  return imageUrl(getVerse(month).animal);
}

/** 그 달의 도감 동물 이름 (음성으로 읽어줄 때만 사용 — 화면에는 그림에 인쇄된 것으로 충분) */
export function getMonthAnimalName(month) {
  const found = imagesByFile.get(getVerse(month).animal);
  return found ? found.label : '';
}

/* ── 문항 ──────────────────────────────────────── */

export function getMonthlyQuestions(month) {
  return monthly.filter(q => q.month === month);
}

export function getAllMonthlyQuestions() {
  return monthly;
}

export function getGeneralQuestions() {
  return general;
}

/* ── 그림 ──────────────────────────────────────── */

/**
 * 한글 라벨로 그림 찾기. 대응 그림이 없는 선택지(성경 출처·월 이름 등)는 null.
 * @returns {{src: string, label: string, note: string|null}|null}
 */
export function findImage(label) {
  const found = imagesByLabel.get(label);
  if (!found) return null;
  return { src: imageUrl(found.file), label: found.label, note: found.note };
}

/** 보상 스티커 (별·트로피·하트·무지개) */
export function getRewardStickers() {
  return [...imagesByLabel.values()]
    .filter(i => i.category === '보상')
    .map(i => ({ src: imageUrl(i.file), label: i.label }));
}

function imageUrl(file) {
  return `assets/${file}`;
}
