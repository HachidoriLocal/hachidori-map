-- お店の口コミ（コメント）を保存するテーブル
-- Supabase の SQL Editor に貼り付けて、一度だけ実行する

create table public.reviews (
  id bigint generated always as identity primary key,
  store_id text not null check (char_length(store_id) between 1 and 64),
  -- ニックネームは任意。空なら画面では「ゲスト」と出す
  nickname text check (nickname is null or char_length(nickname) between 1 and 20),
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);

create index reviews_store_id_created_at_idx on public.reviews (store_id, created_at desc);

-- 誰でも読めて、誰でも書ける。書き換え・削除は管理画面（Table Editor）からだけ行う
alter table public.reviews enable row level security;

create policy "誰でも口コミを読める" on public.reviews
  for select to anon using (true);

create policy "誰でも口コミを書ける" on public.reviews
  for insert to anon with check (true);

-- 書くときに指定できるのは、お店・ニックネーム・本文だけ（投稿日時は書き換えさせない）
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon;
grant insert (store_id, nickname, body) on public.reviews to anon;

-- 荒らし対策：全体で 5 分に 30 件を超える投稿は受け付けない
create function public.reviews_throttle() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.reviews where created_at > now() - interval '5 minutes') >= 30 then
    raise exception 'too many reviews';
  end if;
  return new;
end;
$$;

create trigger reviews_throttle
  before insert on public.reviews
  for each row execute function public.reviews_throttle();
