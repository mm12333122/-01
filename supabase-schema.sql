-- 在 Supabase Dashboard 的 SQL Editor 中完整运行本脚本。
create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(), title text not null check (length(trim(title)) > 0), lecture_date date not null,
  start_time text not null, end_time text not null default '', location text not null default '', poster_image text,
  remark text not null default '', registration_count integer check (registration_count is null or registration_count >= 0),
  created_at timestamptz not null default now(), unique (title, lecture_date, start_time, end_time, location)
);
do $$ begin alter table public.lectures add column if not exists remark text not null default ''; exception when others then null; end $$;
alter table public.lectures add column if not exists registration_count integer;
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(), lecture_id uuid not null references public.lectures(id) on delete cascade,
  user_id text not null check (user_id in ('A', 'B', 'C')), checkin_time timestamptz not null default now(),
  data_count numeric not null check (data_count >= 0), remark text not null default '', unique (lecture_id, user_id)
);
create index if not exists lectures_date_start_idx on public.lectures (lecture_date, start_time);
create index if not exists checkins_lecture_idx on public.checkins (lecture_id);
alter table public.lectures enable row level security;
alter table public.checkins enable row level security;
-- 当前 MVP 无账号系统，允许持有 anon key 的客户端读写。正式上线前请接入 Auth 并收紧策略。
drop policy if exists "mvp public lecture access" on public.lectures;
create policy "mvp public lecture access" on public.lectures for all to anon using (true) with check (true);
drop policy if exists "mvp public checkin access" on public.checkins;
create policy "mvp public checkin access" on public.checkins for all to anon using (true) with check (true);
alter publication supabase_realtime add table public.lectures;
alter publication supabase_realtime add table public.checkins;
