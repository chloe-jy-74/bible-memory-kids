/**
 * 서비스워커 — 캐시 관리.
 *
 * 이게 없으면 GitHub Pages 의 기본 캐시(max-age=600) 때문에
 * "새 data/*.json + 옛 js/*.js" 가 최대 10분간 섞여 돌아갑니다.
 * 화면은 떠 있는데 문제가 안 나오거나 그림이 비는 식으로 조용히 어긋납니다.
 *
 * 규칙은 세 가지입니다.
 *
 *   코드·데이터 (html/js/css/json)  → 네트워크 우선. 인터넷이 되면 언제나 최신을 씁니다.
 *                                     따라서 js 와 json 이 서로 다른 세대로 섞이지 않습니다.
 *                                     인터넷이 끊기면 캐시에 있는 것으로 그대로 돌아갑니다.
 *   그림 (png 등)                   → 캐시 우선. 파일명이 바뀌지 않는 한 내용도 안 바뀌므로
 *                                     한 번 받으면 다시 받지 않습니다.
 *   소리 (mp3)                      → 브라우저가 늘 구간 요청(Range)으로 가져가므로 따로 다룹니다.
 *                                     인터넷이 되면 네트워크 응답을 손대지 않고 그대로 넘기고
 *                                     (재생 동작이 서비스워커 없을 때와 똑같도록),
 *                                     그 응답을 복사해 캐시에만 넣어 둡니다.
 *                                     인터넷이 끊기면 그 캐시에서 꺼내 들려줍니다.
 *
 * ── 배포할 때 ─────────────────────────────────
 * 파일을 고쳐 올린 뒤 아래 VERSION 의 숫자를 올리세요. 옛 캐시가 정리됩니다.
 * 코드·데이터만 고쳤다면 깜빡해도 치명적이지 않습니다 — 어차피 네트워크 우선이라 최신이 옵니다.
 * 다만 소리·그림을 같은 이름으로 고쳐 올렸다면 VERSION 을 꼭 올리세요.
 * 캐시 우선이라, 이미 받아 둔 기기는 VERSION 이 바뀌지 않는 한 옛 파일을 계속 씁니다.
 */

const VERSION = 'v1';
const CACHE = `bible-memory-${VERSION}`;

/** 처음 켤 때 미리 받아 두는 앱의 뼈대. 소리·그림은 무겁기 때문에 여기 넣지 않고 쓸 때 받습니다. */
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',   // ?v= 없이 넣어 둡니다 — CSS 버전을 올려도 이 파일은 안 고쳐도 됩니다
  './js/app.js',
  './js/config.js',
  './js/data.js',
  './js/questions.js',
  './js/router.js',
  './js/screens.js',
  './js/speech.js',
  './js/storage.js',
  './js/ui.js',
  './data/verses.json',
  './data/questions.json',
  './data/audio-index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 하나가 실패해도 설치 자체는 되게 합니다 (파일 하나 때문에 앱 전체가 막히면 안 됩니다).
    // no-cache 는 서버에 다시 물어보되 바뀐 게 없으면 304 만 받습니다
    // ('reload' 로 하면 방금 화면이 받아 온 파일까지 전부 다시 내려받습니다).
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'no-cache' })).catch(() => { /* 무시 */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => (n === CACHE ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

const isMedia = (path) => /\.(mp3|png|jpg|jpeg|webp|svg|ico)$/i.test(path);

/** 캐시에서 꺼내기 (?v= 같은 표식은 무시하고 같은 파일로 봅니다) */
const fromCache = (req) => caches.match(req, { ignoreSearch: true });

/**
 * 캐시에 넣기 — 무엇을 담을지 정하는 규칙은 여기 한 곳입니다.
 * 응답을 기다리게 하지 않으려고 결과를 기다리지 않고 넘어갑니다.
 */
function putInCache(req, res) {
  if (!res || !res.ok || res.type !== 'basic') return;
  const copy = res.clone();
  caches.open(CACHE)
    .then(cache => cache.put(req, copy))
    .catch(() => { /* 캐시에 못 넣어도 화면은 그대로 뜹니다 */ });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 브라우저는 mp3 를 <audio> 로 재생할 때 늘 구간 요청(Range)으로 가져갑니다.
  // 그래서 소리는 이 길로만 들어옵니다 — 따로 다뤄야 캐시에 담깁니다.
  if (req.headers.has('range')) {
    event.respondWith(rangeRequest(event));
    return;
  }

  event.respondWith(isMedia(url.pathname) ? cacheFirst(req) : networkFirst(req));
});

/**
 * 구간 요청 — 인터넷이 되면 네트워크가 준 응답을 손대지 않고 그대로 넘깁니다.
 * (재생 동작은 서비스워커가 없을 때와 똑같습니다. 여기서 응답을 만들어 내면
 *  기기에 따라 소리가 안 나는 사고가 나므로, 평소에는 아무것도 하지 않습니다.)
 *
 * 다만 브라우저가 부탁한 구간이 '파일 전체'(bytes=0-)면 — 소리를 켤 때 늘 그렇습니다 —
 * 그 응답을 복사해 캐시에 넣어 둡니다. 따로 더 받는 게 아니라 이미 받은 것을 두는 것뿐입니다.
 * 그래야 인터넷이 끊겼을 때 캐시에서 꺼내 들려줄 수 있습니다.
 */
async function rangeRequest(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (isWholeFile(req) && (res.status === 206 || res.status === 200)) {
      const copy = res.clone();
      event.waitUntil((async () => {
        // 이미 담아 둔 소리면 아무것도 하지 않습니다.
        // (한 곡을 반복해 듣는 화면이라, 이게 없으면 바퀴마다 파일 전체를
        //  메모리에 펼쳐 같은 내용을 다시 씁니다.)
        if (await fromCache(new Request(req.url))) return;
        const body = await copy.arrayBuffer();
        const cache = await caches.open(CACHE);
        await cache.put(new Request(req.url), new Response(body, {
          status: 200,
          headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' },
        }));
      })().catch(() => { /* 캐시에 못 넣어도 재생은 됩니다 */ }));
    }
    return res;
  } catch (_) {
    // 인터넷이 끊겼습니다. 받아 둔 게 있으면 거기서 잘라 돌려줍니다.
    const built = await rangeFromCache(req);
    if (built) return built;
    throw new Error('오프라인이고 캐시에도 없습니다');
  }
}

const isWholeFile = (req) => /^bytes=0-$/.test(req.headers.get('range') || '');

async function rangeFromCache(req) {
  const hit = await fromCache(new Request(req.url));
  if (!hit) return null;

  const buf = await hit.arrayBuffer();
  const span = parseRange(req.headers.get('range'), buf.byteLength);
  if (!span) return null;

  const { start, end } = span;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

/** "bytes=0-", "bytes=100-200", "bytes=-500" 를 실제 구간으로 바꿉니다 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!m || (m[1] === '' && m[2] === '')) return null;

  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);

  if (start === null) {                 // 뒤에서 n 바이트
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end > size - 1) {
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) return null;
  return { start, end };
}

/** 코드·데이터 — 인터넷이 되면 언제나 최신 */
async function networkFirst(req) {
  try {
    // no-cache: 브라우저의 10분짜리 캐시를 건너뛰고 서버에 다시 물어봅니다.
    // 바뀐 게 없으면 서버가 304 만 돌려주므로 값은 거의 들지 않습니다.
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    // 서버에 닿긴 했지만 파일이 없거나(404, 배포 중) 로그인 화면이 대신 온 경우입니다.
    // 이건 '최신'이 아니라 사고이므로, 받아 둔 게 있으면 그걸 씁니다.
    if (!res.ok) {
      const hit = await fromCache(req);
      if (hit) return hit;
    }
    putInCache(req, res);
    return res;
  } catch (_) {
    const hit = await fromCache(req);
    if (hit) return hit;
    throw new Error('오프라인이고 캐시에도 없습니다');
  }
}

/** 소리·그림 — 한 번 받으면 다시 받지 않음 */
async function cacheFirst(req) {
  const hit = await fromCache(req);
  if (hit) return hit;

  // no-cache: 브라우저가 들고 있던 10분짜리 옛 사본을 캐시에 못 박지 않도록,
  // 처음 받을 때 한 번은 서버에 확인합니다 (한 번 담으면 다시 받지 않으므로 여기뿐입니다).
  const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  putInCache(req, res);
  return res;
}
