-- ============================================================
-- supabase/schema.sql
-- Supabase Dashboard > SQL Editor に貼り付けて実行
-- ============================================================

-- ── 玩家設定檔 ───────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique,
  avatar        text not null default 'warrior',
  color_id      text not null default 'blue',
  join_leaderboard boolean not null default true,   -- 是否加入排行榜
  created_at    timestamptz not null default now()
);

-- 建立新用戶時自動建立 profile（由 trigger 觸發）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, avatar, color_id, join_leaderboard)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    coalesce(new.raw_user_meta_data->>'avatar',  'warrior'),
    coalesce(new.raw_user_meta_data->>'color_id', 'blue'),
    (new.raw_user_meta_data->>'join_leaderboard')::boolean
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 對戰紀錄 ─────────────────────────────────────────────────
create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  played_at        timestamptz not null default now(),
  duration_seconds int not null,
  total_rounds     int not null,

  -- 藍方
  blue_player_id   uuid references public.profiles(id) on delete set null,
  blue_name        text not null,
  blue_score       int  not null,
  blue_kills       int  not null default 0,
  blue_units_lost  int  not null default 0,
  blue_towns_held  int  not null default 0,

  -- 紅方
  red_player_id    uuid references public.profiles(id) on delete set null,
  red_name         text not null,
  red_score        int  not null,
  red_kills        int  not null default 0,
  red_units_lost   int  not null default 0,
  red_towns_held   int  not null default 0,

  winner           text not null check (winner in ('blue', 'red'))
);

-- ── 排行榜 View（自動計算）────────────────────────────────────
create or replace view public.leaderboard as
select
  p.id              as profile_id,
  p.username,
  p.avatar,
  p.color_id,
  count(*)          as total_games,
  sum(case when
    (m.winner = 'blue' and m.blue_player_id = p.id) or
    (m.winner = 'red'  and m.red_player_id  = p.id)
    then 1 else 0 end)               as wins,
  sum(case when
    (m.winner = 'red'  and m.blue_player_id = p.id) or
    (m.winner = 'blue' and m.red_player_id  = p.id)
    then 1 else 0 end)               as losses,
  round(
    sum(case when
      (m.winner = 'blue' and m.blue_player_id = p.id) or
      (m.winner = 'red'  and m.red_player_id  = p.id)
      then 1.0 else 0 end) / count(*) * 100, 1
  )                                  as win_rate,
  max(case when m.blue_player_id = p.id then m.blue_score
           when m.red_player_id  = p.id then m.red_score
           else 0 end)               as best_score,
  sum(case when m.blue_player_id = p.id then m.blue_score
           when m.red_player_id  = p.id then m.red_score
           else 0 end)               as total_score
from public.profiles p
join public.matches m
  on m.blue_player_id = p.id or m.red_player_id = p.id
where p.join_leaderboard = true
group by p.id, p.username, p.avatar, p.color_id
order by wins desc, win_rate desc;

-- ── Row Level Security ───────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.matches   enable row level security;

-- profiles: 自己可讀寫，其他人只能讀
create policy "profiles_read_all"  on public.profiles for select using (true);
create policy "profiles_write_own" on public.profiles for update using (auth.uid() = id);

-- matches: 所有人可讀，登入用戶可寫
create policy "matches_read_all"   on public.matches for select using (true);
create policy "matches_insert_auth" on public.matches for insert with check (
  auth.uid() = blue_player_id or auth.uid() = red_player_id
);
