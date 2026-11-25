// お店の詳細カード（スマホ: 下部シート / 768px以上: 右側パネル）
// 構成はハチドリアプリのデモ（hachidori-app-demo）の店舗詳細に合わせている
import { genreOf, icon } from './genres.js';
import { storage, escapeHtml } from './storage.js';
import { reviewsEnabled, fetchReviews, postReview, REVIEW_MAX, NICKNAME_MAX } from './reviews.js';

const WIDE = '(min-width: 768px)';

function stars(rating) {
  const filled = Math.round(Math.max(0, Math.min(5, Number(rating) || 0)));
  return Array.from({ length: 5 }, (_, i) => icon('star', `icon star${i < filled ? ' is-filled' : ''}`)).join('');
}

function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function createCard({ sheetEl, backdropEl, config, track, onClose }) {
  const showReviews = reviewsEnabled(config);
  const wants = new Set(storage.get('want', []));
  let current = null;
  let lastFocus = null;

  // 人数はダミーの wantCount に、自分が押した分を足して見せる（v0 はサーバー集計なし）
  function wantRow(store) {
    const on = wants.has(store.id);
    const count = (store.wantCount ?? 0) + (on ? 1 : 0);
    return `
      <button type="button" class="want-btn${on ? ' is-on' : ''}" data-want aria-pressed="${on}">
        ${icon('bookmark', 'icon want-btn__icon')}
        <span>${on ? '行ってみたい！' : '行ってみたい'}</span>
      </button>
      ${store.wantCount != null ? `<span class="want-count">${count}人が行ってみたい</span>` : ''}`;
  }

  // 記事はハチドリ電力のインタビューだけを出す。古い形式（articleUrl だけ）のデータもインタビューとして扱う
  function interviewsOf(store) {
    if (store.articles?.length) return store.articles.filter((a) => a.kind === 'interview');
    return store.articleUrl ? [{ kind: 'interview', title: 'インタビュー記事を読む', url: store.articleUrl, thumbnail: null }] : [];
  }

  function renderInterview(article, index) {
    const inner = `
      ${article.thumbnail ? `<span class="interview-card__thumb"><img src="${escapeHtml(article.thumbnail)}" alt="" loading="lazy" decoding="async"></span>` : ''}
      <span class="interview-card__text">
        <span class="interview-card__label">INTERVIEW<span>ハチドリ電力 取材</span></span>
        <span class="interview-card__title">${escapeHtml(article.title)}</span>
        ${article.lead ? `<span class="interview-card__lead">${escapeHtml(article.lead)}</span>` : ''}
        <span class="interview-card__more">${article.url ? `記事を読む${icon('external')}` : 'サンプルのため記事はありません'}</span>
      </span>`;
    return article.url
      ? `<a class="interview-card" href="${escapeHtml(article.url)}" target="_blank" rel="noopener" data-article="${index}">${inner}</a>`
      : `<div class="interview-card is-disabled">${inner}</div>`;
  }

  // 口コミの欄。一覧は開いたあとに読み込む
  function renderReviewsSection() {
    if (!showReviews) return '';
    return `
      <section class="reviews">
        <h3 class="section-head">みんなの口コミ</h3>
        <form class="review-form" data-review-form novalidate>
          <label class="visually-hidden" for="review-body">口コミ</label>
          <textarea id="review-body" class="review-form__body" name="body" rows="3" maxlength="${REVIEW_MAX}"
            placeholder="行ってみた感想や、お店のおすすめを書いてみてください"></textarea>
          <div class="review-form__row">
            <label class="visually-hidden" for="review-nickname">ニックネーム</label>
            <input id="review-nickname" class="review-form__nickname" name="nickname" maxlength="${NICKNAME_MAX}"
              autocomplete="nickname" placeholder="ニックネーム（なくてもOK）" value="${escapeHtml(storage.get('nickname', ''))}">
            <button type="submit" class="review-form__submit">投稿する</button>
          </div>
          <p class="review-form__note">
            <span>書いた口コミは、だれでも見られます</span>
            <span class="review-form__count" data-review-count>0/${REVIEW_MAX}</span>
          </p>
          <p class="review-form__error" data-review-error role="alert" hidden></p>
        </form>
        <ul class="review-list" data-review-list aria-live="polite">
          <li class="review-list__status">読み込んでいます…</li>
        </ul>
      </section>`;
  }

  function renderReview(review) {
    return `
      <li class="review">
        <p class="review__meta">
          <span class="review__name">${escapeHtml(review.nickname || 'ゲスト')}</span>
          <time class="review__date" datetime="${escapeHtml(review.created_at)}">${formatDate(review.created_at)}</time>
        </p>
        <p class="review__body">${escapeHtml(review.body)}</p>
      </li>`;
  }

  let reviews = [];

  function renderReviewList(status) {
    const listEl = sheetEl.querySelector('[data-review-list]');
    if (!listEl) return;
    if (status) listEl.innerHTML = `<li class="review-list__status">${status}</li>`;
    else if (!reviews.length) listEl.innerHTML = '<li class="review-list__status">まだ口コミはありません。最初のひとことを書いてみませんか</li>';
    else listEl.innerHTML = reviews.map(renderReview).join('');
  }

  async function loadReviews(storeId) {
    reviews = [];
    try {
      const items = await fetchReviews(config, storeId);
      if (current?.id !== storeId) return; // 読み込み中に別のお店を開いた
      reviews = items;
      renderReviewList();
    } catch (err) {
      console.error(err);
      if (current?.id === storeId) renderReviewList('口コミを読み込めませんでした。少し時間をおいて、もう一度開いてみてください');
    }
  }

  function updateCount(form) {
    form.querySelector('[data-review-count]').textContent = `${form.body.value.length}/${REVIEW_MAX}`;
  }

  async function submitReview(form) {
    const storeId = current.id;
    const body = form.body.value.trim();
    const nickname = form.nickname.value.trim();
    const errorEl = form.querySelector('[data-review-error]');
    const button = form.querySelector('[type="submit"]');
    errorEl.hidden = true;
    if (!body) {
      errorEl.textContent = '口コミを入力してください';
      errorEl.hidden = false;
      form.body.focus();
      return;
    }
    button.disabled = true;
    try {
      const created = await postReview(config, { storeId, nickname, body });
      storage.set('nickname', nickname);
      track('review_post', { store_id: storeId, length: body.length });
      if (current?.id !== storeId) return;
      reviews = [created, ...reviews];
      renderReviewList();
      form.body.value = '';
      updateCount(form);
    } catch (err) {
      console.error(err);
      if (current?.id !== storeId) return;
      errorEl.textContent = '投稿できませんでした。少し時間をおいて、もう一度お試しください';
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  function infoRow(name, label, value, note = '') {
    return `
      <div class="info__row">
        <span class="info__bar" aria-hidden="true"></span>
        ${icon(name, 'icon info__icon')}
        <div class="info__body">
          <dt>${label}</dt>
          <dd>${escapeHtml(value)}${note ? `<span class="info__note">${note}</span>` : ''}</dd>
        </div>
      </div>`;
  }

  function render(store) {
    const genre = genreOf(store.genre);
    const genreStyle = `--genre:${genre.color};--genre-fg:${genre.fg}`;
    const placeholder = `<div class="sheet__placeholder" style="${genreStyle}">${icon(genre.id, 'icon sheet__placeholder-icon')}</div>`;
    const media = store.photo
      ? `<img class="sheet__photo" src="${escapeHtml(store.photo)}" alt="" decoding="async">${placeholder}`
      : placeholder;
    const tags = [
      ...(store.tags ?? []).map((t) => `<li class="tag">${escapeHtml(t)}</li>`),
      ...(store.ecoTags ?? []).map((t) => `<li class="tag tag--eco">${icon('leaf')}${escapeHtml(t)}</li>`),
    ].join('');
    // 架空のお店なので、住所は市区町村まで・電話番号は出さない（要件定義書 5-3）
    const info = [
      infoRow('place', '住所', `${store.prefecture}${store.city}`, store.isSample ? 'サンプルのため番地は非表示' : ''),
      store.isSample ? infoRow('phone', '電話番号', '―', 'サンプルのため非表示') : '',
    ].join('');
    const interviews = interviewsOf(store);

    return `
      <div class="sheet__media${store.photo ? ' has-photo' : ''}">
        ${media}
        <div class="sheet__handle" aria-hidden="true"></div>
        <button type="button" class="sheet__close" data-close aria-label="閉じる">${icon('close')}</button>
      </div>
      <div class="sheet__body">
        <div class="sheet__tags">
          ${store.isSample ? '<span class="badge-sample">サンプル</span>' : ''}
          <span class="cat-tag">${genre.label}</span>
        </div>

        <div class="sheet__heading">
          <div class="sheet__heading-main">
            <h2 class="sheet__name" id="sheet-title">${escapeHtml(store.name)}</h2>
            ${store.rating != null ? `
              <p class="rating">
                <span class="rating__stars" aria-hidden="true">${stars(store.rating)}</span>
                <span class="rating__num">${Number(store.rating).toFixed(1)}</span>
                <span class="rating__count">（${store.reviews ?? 0}件・${store.isSample ? 'サンプルの評価です' : 'Google マップより'}）</span>
              </p>` : ''}
          </div>
        </div>

        <div class="want-row">${wantRow(store)}</div>

        ${store.description ? `<p class="sheet__description">${escapeHtml(store.description)}</p>` : ''}
        ${tags ? `<ul class="tags" aria-label="お店の特徴">${tags}</ul>` : ''}

        <dl class="info">${info}</dl>

        <section class="story">
          <h3 class="section-head">なぜハチドリ電力を選んだのか</h3>
          <blockquote class="story__quote">「${escapeHtml(store.reason)}」</blockquote>
          ${store.story ? `<p class="story__body">${escapeHtml(store.story)}</p>` : ''}
        </section>

        ${interviews.length ? `
          <section class="interview">
            <h3 class="section-head">ハチドリ電力のインタビュー</h3>
            ${interviews.map((article, index) => renderInterview(article, index)).join('')}
          </section>` : ''}

        ${renderReviewsSection()}
      </div>`;
  }

  function open(store) {
    if (!current) lastFocus = document.activeElement;
    current = store;
    sheetEl.innerHTML = render(store);
    // 写真が読み込めなければ、ジャンル色のイラストに切り替える
    sheetEl.querySelector('.sheet__photo')?.addEventListener('error', (e) => {
      e.target.closest('.sheet__media').classList.remove('has-photo');
      e.target.remove();
    });
    sheetEl.scrollTop = 0;
    sheetEl.classList.add('is-open');
    backdropEl.classList.add('is-open');
    sheetEl.querySelector('[data-close]').focus({ preventScroll: true });
    track('card_view', { store_id: store.id });
    if (showReviews) loadReviews(store.id);
  }

  function close() {
    if (!current) return;
    current = null;
    sheetEl.classList.remove('is-open');
    backdropEl.classList.remove('is-open');
    lastFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }

  function toggleWant() {
    const id = current.id;
    const on = !wants.has(id);
    if (on) wants.add(id); else wants.delete(id);
    storage.set('want', [...wants]);
    sheetEl.querySelector('.want-row').innerHTML = wantRow(current);
    sheetEl.querySelector('[data-want]').focus({ preventScroll: true });
    track(on ? 'want_to_go_on' : 'want_to_go_off', { store_id: id });
  }

  sheetEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-want]')) toggleWant();
    else if (e.target.closest('[data-article]')) {
      track('article_click', { store_id: current.id, article_index: Number(e.target.closest('[data-article]').dataset.article) });
    }
  });
  sheetEl.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-review-form]');
    if (!form) return;
    e.preventDefault();
    submitReview(form);
  });
  sheetEl.addEventListener('input', (e) => {
    const form = e.target.closest('[data-review-form]');
    if (form && e.target.name === 'body') updateCount(form);
  });
  backdropEl.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // 下にスワイプして閉じる（スマホのみ。中身が一番上までスクロールされているときだけ）
  let startY = null;
  let dy = 0;
  sheetEl.addEventListener('touchstart', (e) => {
    // 口コミを入力しているときは、スワイプで閉じない
    if (window.matchMedia(WIDE).matches || sheetEl.scrollTop > 0 || e.target.closest('form')) return;
    startY = e.touches[0].clientY;
    dy = 0;
    sheetEl.style.transition = 'none';
  }, { passive: true });
  sheetEl.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    sheetEl.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheetEl.addEventListener('touchend', () => {
    if (startY === null) return;
    startY = null;
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
    if (dy > 80) close();
  });

  return { open, close };
}
