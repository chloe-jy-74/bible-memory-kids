/** 화면 만들 때 쓰는 작은 도구들 */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function img(src, className) {
  const node = el('img', className);
  node.src = src;
  node.alt = '';        // 그림에 한글 라벨이 인쇄되어 있어 화면에 글자를 따로 얹지 않습니다
  node.draggable = false;
  return node;
}

/**
 * 상단 바 (뒤로가기 + 제목 + 오른쪽 슬롯)
 */
export function topbar(title, { onBack, right } = {}) {
  const bar = el('div', 'topbar');
  if (onBack) {
    const back = el('button', 'back-btn', '←');
    back.setAttribute('aria-label', '뒤로가기');
    back.addEventListener('click', onBack);
    bar.appendChild(back);
  }
  bar.appendChild(el('div', 'topbar-title', title));
  if (right) {
    right.classList.add('topbar-right');
    bar.appendChild(right);
  }
  return bar;
}

/** 음성과 무관한 순수 대기 (화면 타이머용). speech.js 의 pause() 와 달리 음성 재생을 끊지 않습니다. */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 화면 위에 덮는 연출 판. close() 로 걷어냅니다. */
export function overlay(className = '') {
  const layer = el('div', `overlay ${className}`.trim());
  document.body.appendChild(layer);
  // 다음 프레임에 클래스를 붙여 등장 애니메이션이 실행되게 함
  requestAnimationFrame(() => layer.classList.add('is-on'));
  return {
    el: layer,
    close() {
      layer.remove();
    },
  };
}

/** 남아 있는 연출 판을 모두 걷어냅니다 (화면 이동 시) */
export function clearOverlays() {
  document.querySelectorAll('.overlay').forEach(n => n.remove());
}

/** 연타 방지용 잠금 헬퍼 */
export function lockable(ms) {
  let until = 0;
  return () => {
    const now = performance.now();
    if (now < until) return false;
    until = now + ms;
    return true;
  };
}
