// オンラインのお店（実店舗がなく、ネットショップで販売しているお店）の一覧
import { genreOf, icon } from './genres.js';
import { escapeHtml } from './storage.js';

export function createOnlineList(el, { onSelect }) {
  let stores = [];
  let currentGenre = 'all';

  function renderItem(store) {
    const genre = genreOf(store.genre);
    const genreStyle = `--genre:${genre.color};--genre-fg:${genre.fg}`;
    return `
      <li>
        <button type="button" class="online-item" data-store="${escapeHtml(store.id)}">
          <span class="online-item__thumb" style="${genreStyle}">
            ${icon(genre.id, 'icon online-item__icon')}
            ${store.photo ? `<img src="${escapeHtml(store.photo)}" alt="" loading="lazy" decoding="async">` : ''}
          </span>
          <span class="online-item__text">
            <span class="online-item__tags">
              ${store.isSample ? '<span class="badge-sample">サンプル</span>' : ''}
              <span class="cat-tag">${genre.label}</span>
            </span>
            <span class="online-item__name">${escapeHtml(store.name)}</span>
            ${store.description ? `<span class="online-item__description">${escapeHtml(store.description)}</span>` : ''}
          </span>
        </button>
      </li>`;
  }

  function render() {
    const list = stores.filter((s) => currentGenre === 'all' || s.genre === currentGenre);
    el.innerHTML = list.length
      ? `<ul class="online-list">${list.map(renderItem).join('')}</ul>`
      : '<p class="online-empty">このジャンルのオンラインのお店は、まだありません</p>';
    // 写真が読み込めなければ、ジャンル色のアイコンだけにする
    el.querySelectorAll('.online-item__thumb img').forEach((img) => {
      img.addEventListener('error', () => img.remove());
    });
  }

  el.addEventListener('click', (e) => {
    const item = e.target.closest('[data-store]');
    if (!item) return;
    const store = stores.find((s) => s.id === item.dataset.store);
    if (store) onSelect(store);
  });

  return {
    setStores(list) {
      stores = list;
      render();
    },
    filter(genre) {
      currentGenre = genre;
      render();
    },
  };
}
