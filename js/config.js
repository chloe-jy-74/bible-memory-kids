/**
 * 앱 전체 설정값 — 조정할 숫자는 전부 이 파일에만 있습니다.
 * (화면 크기·색상 같은 시각 요소는 css/style.css 맨 위 :root 변수에 모아두었습니다.)
 */

export const CONFIG = {
  /* ── 음성 (TTS) ────────────────────────────────── */
  speech: {
    lang: 'ko-KR',
    // 나긋나긋하게 들리도록: 조금 느리게 + 조금 낮은 톤.
    // (기획서 값은 rate 0.85였고, 설정 화면에서 부모가 속도·톤을 바꿀 수 있습니다)
    rate: 0.78,
    pitch: 0.92,
    volume: 1.0,

    // 부모가 고르지 않았을 때 이 순서대로 부드러운 목소리를 먼저 찾습니다.
    // 기기에 없는 이름은 그냥 건너뜁니다. (아이폰·맥 '유나', 안드로이드 구글 음성, 윈도우 'Heami')
    preferredVoices: [
      '유나', 'Yuna',
      'Google 한국의', '한국어 여성', 'Heami',
      'Sora', 'Shelley', 'Sandy', 'Flo',
    ],
    // 설정 화면의 말하기 속도 선택지
    rateOptions: [
      { key: 'slow', label: '천천히', rate: 0.68 },
      { key: 'normal', label: '보통', rate: 0.78 },
      { key: 'fast', label: '조금 빠르게', rate: 0.90 },
    ],
    // 설정 화면의 목소리 톤 선택지 (낮을수록 차분하고 나긋나긋합니다)
    pitchOptions: [
      { key: 'low', label: '낮게', pitch: 0.82 },
      { key: 'normal', label: '보통', pitch: 0.92 },
      { key: 'high', label: '높게', pitch: 1.05 },
    ],
    sampleText: '하나님이 세상을 이처럼 사랑하사',
    // 설정 화면의 '노란 칸 타이밍' 선택지 (값이 클수록 더 먼저 켜집니다)
    leadOptions: [
      { key: 'late',  label: '늦게',   lead: 50 },
      { key: 'normal', label: '보통',  lead: 150 },
      { key: 'early', label: '빠르게', lead: 250 },
      { key: 'earliest', label: '더 빠르게', lead: 350 },
    ],
    // 브라우저가 onend 이벤트를 안 주고 멈추는 경우를 대비한 안전장치.
    // 예상 재생시간(글자수 × charMs + padMs)의 2배가 지나면 강제로 다음 단계 진행.
    // 실측(맥 크롬, 유나 음성, rate 0.85): 17글자 = 2.75초 ≒ 글자당 162ms
    charMs: 140,
    padMs: 1200,
  },

  /* ── 타이밍 (밀리초) ───────────────────────────── */
  timing: {
    lineGapMs: 400,            // 낭독할 때 소절과 소절 사이 쉬는 시간
    verseLoopGapMs: 1800,      // 구절 듣기: 한 번 다 듣고 다시 처음으로 돌아가기까지
    highlightTickMs: 40,       // 재생 위치를 보고 소절 강조를 옮기는 주기
    /**
     * 노란 칸을 소리보다 이만큼(ms) 먼저 켭니다.
     * 브라우저가 알려주는 재생 위치는 실제로 들리는 소리보다 조금 뒤처지는데,
     * 그 정도가 기기·브라우저마다 달라서 부모가 설정 화면에서 귀로 맞출 수 있습니다.
     */
    highlightLeadMs: 150,

    // 퀴즈
    rewardMs: 400,             // 칭찬이 끝나고 다음 문제까지 쉬는 시간
    wrongFeedbackMs: 900,      // 오답 피드백 시간
    monthCompleteMs: 2000,     // 한 세트를 다 풀었을 때 '다 풀었어요' 표시 시간
    questionGapMs: 300,        // 문제와 문제 사이

    tapLockMs: 250,            // 유아 연타 방지
  },

  /* ── 퀴즈 규칙 ─────────────────────────────────── */
  quiz: {
    choiceCount: 3,
    randomSetSize: 10,   // 랜덤 퀴즈 한 세트 문항 수 (월별 문항 51개 중에서 뽑음)
  },

  /* ── 음성 문구 ─────────────────────────────────── */
  // 바꾸면 같은 목소리로 음원을 새로 뽑아 data/audio-index.json 에 넣어야 합니다.
  // (없는 문장은 브라우저 TTS 로 나가서 다른 목소리로 들립니다 — README 참고)
  correctVoice: '정말 잘했어요!',
  // 오답일 때 (연출 없이 부드럽게 한 번만)
  wrongVoice: ['다시 한번 골라 볼까요?', '괜찮아요, 다시 골라 봐요.'],

  /* ── 저장소 키 ─────────────────────────────────── */
  storageKey: 'bible-memory-v1',
};

/** 개발 편의: 브라우저 콘솔에서 window.CONFIG 로 확인 가능 */
if (typeof window !== 'undefined') window.CONFIG = CONFIG;
