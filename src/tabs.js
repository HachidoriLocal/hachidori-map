// 画面下のタブ（マップ／オンライン）。タブと表示する面は aria-controls で結びつける
export function createTabs(el, { onChange }) {
  const tabs = [...el.querySelectorAll('[role="tab"]')];

  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    onChange(tab.dataset.tab);
  }

  el.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab && tab.getAttribute('aria-selected') !== 'true') select(tab);
  });

  // 左右キーでタブを移る
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    select(next);
  });
}
