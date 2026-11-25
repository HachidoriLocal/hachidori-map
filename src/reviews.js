// お店の口コミ。Supabase の REST API を fetch で直接呼ぶ（ライブラリは使わない）
const LIMIT = 50;

export const REVIEW_MAX = 300;
export const NICKNAME_MAX = 20;

export function reviewsEnabled(config) {
  return Boolean(config.supabase?.url && config.supabase?.anonKey);
}

function endpoint(config) {
  return `${config.supabase.url.replace(/\/$/, '')}/rest/v1/reviews`;
}

function headers(config) {
  return { apikey: config.supabase.anonKey, 'Content-Type': 'application/json' };
}

export async function fetchReviews(config, storeId) {
  const params = new URLSearchParams({
    select: 'id,nickname,body,created_at',
    store_id: `eq.${storeId}`,
    order: 'created_at.desc',
    limit: String(LIMIT),
  });
  const res = await fetch(`${endpoint(config)}?${params}`, { headers: headers(config) });
  if (!res.ok) throw new Error(`reviews: ${res.status}`);
  return res.json();
}

export async function postReview(config, { storeId, nickname, body }) {
  const res = await fetch(endpoint(config), {
    method: 'POST',
    headers: { ...headers(config), Prefer: 'return=representation' },
    body: JSON.stringify({ store_id: storeId, nickname: nickname || null, body }),
  });
  if (!res.ok) throw new Error(`reviews: ${res.status}`);
  const [created] = await res.json();
  return created;
}
