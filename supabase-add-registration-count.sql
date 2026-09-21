-- 在 Supabase SQL Editor 运行一次，为现有讲座添加可选报名数。
alter table public.lectures add column if not exists registration_count integer;
alter table public.lectures drop constraint if exists lectures_registration_count_check;
alter table public.lectures add constraint lectures_registration_count_check check (registration_count is null or registration_count >= 0);
