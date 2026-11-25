// コメントを1件ずつ自動で切り替えるカルーセル。指やマウスで触っている間は止まる
// 並びはCSSの scroll-snap で1件ずつ止まるので、指でスワイプしても同じ位置にそろう
const INTERVAL = 4500; // 次のコメントへ進むまで（ms）
const RESUME_AFTER = 5000; // 触り終えてから自動で進むのを再開するまで（ms）

export function createCarousel(trackEl, dotsEl) {
  const items = [...trackEl.children];
  const dots = dotsEl ? [...dotsEl.children] : [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  let holding = false;
  let pausedUntil = 0;

  const leftOf = (item) => item.offsetLeft - items[0].offsetLeft;

  function currentIndex() {
    let best = 0;
    items.forEach((item, i) => {
      if (Math.abs(leftOf(item) - trackEl.scrollLeft) < Math.abs(leftOf(items[best]) - trackEl.scrollLeft)) best = i;
    });
    return best;
  }

  function updateDots() {
    const index = currentIndex();
    dots.forEach((dot, i) => dot.classList.toggle('is-current', i === index));
  }

  function goTo(index) {
    trackEl.scrollTo({ left: leftOf(items[index]), behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function tick() {
    if (holding || performance.now() < pausedUntil) return;
    goTo((currentIndex() + 1) % items.length);
  }

  const hold = () => { holding = true; };
  const release = () => {
    holding = false;
    pausedUntil = performance.now() + RESUME_AFTER;
  };

  trackEl.addEventListener('scroll', updateDots, { passive: true });
  trackEl.addEventListener('touchstart', hold, { passive: true });
  trackEl.addEventListener('touchend', release);
  trackEl.addEventListener('touchcancel', release);
  trackEl.addEventListener('mouseenter', hold);
  trackEl.addEventListener('mouseleave', release);
  trackEl.addEventListener('focusin', hold);
  trackEl.addEventListener('focusout', release);

  updateDots();
  // 動きを減らす設定の端末では、自動では進めない（指で送るだけ）
  if (items.length > 1 && !reduceMotion) timer = setInterval(tick, INTERVAL);

  return {
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
