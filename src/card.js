// お店の詳細カード（スマホ: 下部シート / 768px以上: 右側パネル）
// 構成はハチドリアプリのデモ（hachidori-app-demo）の店舗詳細に合わせている
import { genreOf, icon } from './genres.js';
import { storage, escapeHtml } from './storage.js';
import { reviewsEnabled, fetchReviews, postReview, REVIEW_MAX, NICKNAME_MAX } from './reviews.js';
import { createCarousel } from './carousel.js';

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
  function wantCountText(store) {
    if (store.wantCount == null) return '';
    return `${store.wantCount + (wants.has(store.id) ? 1 : 0)}人が行ってみたい`;
  }

  function wantButton(store) {
    const on = wants.has(store.id);
    return `
      <button type="button" class="want-btn${on ? ' is-on' : ''}" data-want aria-pressed="${on}">
        ${icon('bookmark', 'icon want-btn__icon')}
        <span>${on ? '行ってみたい！' : '行ってみたい'}</span>
      </button>`;
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

  // コメント。ボタンの下の枠の中で1件ずつ自動で切り替えて見せ、書くときは「コメントする」で入力欄を開く
  let comments = [];
  let carousel = null;

  // 名前の頭文字の丸いアイコン。色は名前ごとに決まった組み合わせから選ぶ
  const AVATAR_COLORS = [
    ['#DCF2F0', '#015147'],
    ['#FAD560', '#1A1A1A'],
    ['#C4E4AE', '#1A1A1A'],
    ['#F0EBDC', '#1F2D44'],
    ['#E57967', '#1A1A1A'],
  ];
  function avatarColor(name) {
    const sum = [...name].reduce((acc, c) => acc + c.codePointAt(0), 0);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
  }

  function renderCommentForm() {
    if (!showReviews) return '';
    return `
      <form id="comment-form" class="comment-form" data-comment-form novalidate hidden>
        <label class="visually-hidden" for="comment-body">コメント</label>
        <textarea id="comment-body" class="comment-form__body" name="body" rows="3" maxlength="${REVIEW_MAX}"
          placeholder="行ってみた感想や、お店のおすすめを書いてみてください"></textarea>
        <div class="comment-form__row">
          <label class="visually-hidden" for="comment-nickname">ニックネーム</label>
          <input id="comment-nickname" class="comment-form__nickname" name="nickname" maxlength="${NICKNAME_MAX}"
            autocomplete="nickname" placeholder="ニックネーム（なくてもOK）" value="${escapeHtml(storage.get('nickname', ''))}">
          <button type="submit" class="comment-form__submit">投稿する</button>
        </div>
        <p class="comment-form__note">
          <span>書いたコメントは、だれでも見られます</span>
          <span class="comment-form__count" data-comment-count>0/${REVIEW_MAX}</span>
        </p>
        <p class="comment-form__error" data-comment-error role="alert" hidden></p>
      </form>`;
  }

  function renderCommentsSection() {
    if (!showReviews) return '';
    return `
      <section class="comments" aria-labelledby="comments-title">
        <h3 class="comments__title" id="comments-title">${icon('comment')}みんなのコメント</h3>
        <div data-comments><p class="comments__status">読み込んでいます…</p></div>
      </section>`;
  }

  function renderCommentCard(comment) {
    const name = comment.nickname || 'ハチドリさん';
    const [bg, fg] = avatarColor(name);
    return `
      <li class="comment-card">
        <div class="comment-card__head">
          <span class="comment-card__avatar" style="background:${bg};color:${fg}" aria-hidden="true">${escapeHtml([...name][0])}</span>
          <div class="comment-card__who">
            <p class="comment-card__name">${escapeHtml(name)}</p>
            <time class="comment-card__date" datetime="${escapeHtml(comment.created_at)}">${formatDate(comment.created_at)}</time>
          </div>
        </div>
        <p class="comment-card__body">${escapeHtml(comment.body)}</p>
      </li>`;
  }

  function renderComments(status) {
    const el = sheetEl.querySelector('[data-comments]');
    if (!el) return;
    carousel?.stop();
    carousel = null;
    if (status || !comments.length) {
      el.innerHTML = `<p class="comments__status">${status || 'まだコメントはありません。最初のコメントを書いてみませんか'}</p>`;
      return;
    }
    el.innerHTML = `
      <ul class="comments__track" data-comments-track>${comments.map(renderCommentCard).join('')}</ul>
      ${comments.length > 1 ? `<div class="comments__dots" aria-hidden="true">${comments.map(() => '<span></span>').join('')}</div>` : ''}`;
    carousel = createCarousel(el.querySelector('[data-comments-track]'), el.querySelector('.comments__dots'));
  }

  async function loadComments(storeId) {
    comments = [];
    try {
      const items = await fetchReviews(config, storeId);
      if (current?.id !== storeId) return; // 読み込み中に別のお店を開いた
      comments = items;
      renderComments();
    } catch (err) {
      console.error(err);
      if (current?.id === storeId) renderComments('コメントを読み込めませんでした。少し時間をおいて、もう一度開いてみてください');
    }
  }

  function toggleCommentForm() {
    const form = sheetEl.querySelector('[data-comment-form]');
    const button = sheetEl.querySelector('[data-comment-toggle]');
    const opening = form.hidden;
    form.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) {
      form.body.focus();
      track('comment_open', { store_id: current.id });
    }
  }

  function updateCount(form) {
    form.querySelector('[data-comment-count]').textContent = `${form.body.value.length}/${REVIEW_MAX}`;
  }

  async function submitComment(form) {
    const storeId = current.id;
    const body = form.body.value.trim();
    const nickname = form.nickname.value.trim();
    const errorEl = form.querySelector('[data-comment-error]');
    const button = form.querySelector('[type="submit"]');
    errorEl.hidden = true;
    if (!body) {
      errorEl.textContent = 'コメントを入力してください';
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
      // 送ったコメントを枠の先頭に出す
      comments = [created, ...comments];
      renderComments();
      form.body.value = '';
      updateCount(form);
      toggleCommentForm();
    } catch (err) {
      console.error(err);
      if (current?.id !== storeId) return;
      errorEl.textContent = '投稿できませんでした。少し時間をおいて、もう一度お試しください';
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  // オンラインのお店のネットショップへのリンク。URL がないサンプルはリンクなしで出す
  function shopLink(store) {
    return /^https?:\/\//.test(store.shopUrl || '')
      ? `<a class="shop-link" href="${escapeHtml(store.shopUrl)}" target="_blank" rel="noopener" data-shop>${icon('cart')}ショップを見る${icon('external')}</a>`
      : `<p class="shop-link is-disabled">${icon('cart')}ショップを見る<span>サンプルのためリンクはありません</span></p>`;
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
    // 「素泊まり可」などの特徴タグは出さず、エコの取り組みだけを出す
    const tags = (store.ecoTags ?? []).map((t) => `<li class="tag tag--eco">${icon('leaf')}${escapeHtml(t)}</li>`).join('');
    // 架空のお店なので、住所は市区町村まで・電話番号は出さない（要件定義書 5-3）
    // オンラインのお店は、住所も拠点も出さない
    const info = store.online
      ? ''
      : [
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
            ${store.wantCount != null ? `<p class="want-count" data-want-count>${wantCountText(store)}</p>` : ''}
          </div>
        </div>

        <div class="want-row">
          ${wantButton(store)}
          ${showReviews ? `
            <button type="button" class="want-btn" data-comment-toggle aria-expanded="false" aria-controls="comment-form">
              ${icon('comment', 'icon want-btn__icon')}
              <span>コメントする</span>
            </button>` : ''}
        </div>
        ${renderCommentForm()}
        ${renderCommentsSection()}

        ${store.description ? `<p class="sheet__description">${escapeHtml(store.description)}</p>` : ''}
        ${tags ? `<ul class="tags" aria-label="お店の特徴">${tags}</ul>` : ''}
        ${store.online ? shopLink(store) : ''}

        ${info ? `<dl class="info">${info}</dl>` : ''}

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

      </div>`;
  }

  function open(store) {
    if (!current) lastFocus = document.activeElement;
    carousel?.stop();
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
    if (showReviews) loadComments(store.id);
  }

  function close() {
    if (!current) return;
    current = null;
    carousel?.stop();
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
    sheetEl.querySelector('[data-want]').outerHTML = wantButton(current);
    const countEl = sheetEl.querySelector('[data-want-count]');
    if (countEl) countEl.textContent = wantCountText(current);
    sheetEl.querySelector('[data-want]').focus({ preventScroll: true });
    track(on ? 'want_to_go_on' : 'want_to_go_off', { store_id: id });
  }

  sheetEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-want]')) toggleWant();
    else if (e.target.closest('[data-comment-toggle]')) toggleCommentForm();
    else if (e.target.closest('[data-shop]')) track('shop_click', { store_id: current.id });
    else if (e.target.closest('[data-article]')) {
      track('article_click', { store_id: current.id, article_index: Number(e.target.closest('[data-article]').dataset.article) });
    }
  });
  sheetEl.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();
    submitComment(form);
  });
  sheetEl.addEventListener('input', (e) => {
    const form = e.target.closest('[data-comment-form]');
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
    // コメントを入力しているときと、コメントを横にスワイプしているときは閉じない
    if (window.matchMedia(WIDE).matches || sheetEl.scrollTop > 0 || e.target.closest('form, [data-comments-track]')) return;
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
