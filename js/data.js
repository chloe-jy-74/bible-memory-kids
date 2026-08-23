/**
 * 데이터 로딩 — 구절 / 문항 / 그림 매핑.
 * 구절과 문항은 JSON 파일에만 있으므로, 내용 수정은 코드를 건드리지 않고 가능합니다.
 */

const VERSES_URL = 'data/verses.json';
const QUESTIONS_URL = 'data/questions.json';
const IMAGES_URL = 'assets/images.json';
const AUDIO_INDEX_URL = 'data/audio-index.json';

let verses = null;         // month(1~12) → 구절 객체
let imagesByFile = null;   // 파일 경로 → 그림 정보
let monthly = [];          // 월별 문항
let general = [];          // 종합 문항
let clipByText = null;     // 읽을 문장 → 녹음 파일

export async function loadData() {
  const [versesJson, questionsJson, imagesJson, audioJson] = await Promise.all([
    fetchJson(VERSES_URL),
    fetchJson(QUESTIONS_URL),
    fetchJson(IMAGES_URL),
    fetchJson(AUDIO_INDEX_URL),
  ]);

  verses = new Map(versesJson.months.map(v => [v.month, v]));
  imagesByFile = new Map(imagesJson.images.map(i => [i.file, i]));
  monthly = questionsJson.monthly;
  general = questionsJson.general;
  clipByText = new Map(Object.entries(audioJson.clips)
    .map(([text, file]) => [text, `assets/${audioJson.dir}${file}`]));
}

/**
 * 문항·선택지 녹음 파일 찾기 (구절 음원과 같은 목소리로 미리 만들어 둔 것).
 * speech.js 의 setAudioResolver 가 speak() 할 때마다 이걸 부릅니다.
 * 없는 문장이면 null → 브라우저 TTS 로 넘어갑니다.
 */
export function findClip(text) {
  return clipByText ? clipByText.get(text) || null : null;
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

/** 그 달의 그림 경로 */
export function getMonthImage(month) {
  return imageUrl(getVerse(month).animal);
}

/** 그 달 구절의 녹음 파일 경로 */
export function getVerseAudio(month) {
  const v = getVerse(month);
  return v && v.audio ? `assets/${v.audio}` : null;
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



function imageUrl(file) {
  return `assets/${file}`;
}
