-- 仅为 lectures 表添加 remark 列的补丁脚本
alter table if exists public.lectures add column if not exists remark text not null default '';
