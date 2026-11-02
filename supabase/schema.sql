-- 小秘書 Phase 1 資料表
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行一次即可。
-- 每張表都開啟 Row Level Security：登入的人只能讀寫自己的資料。

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  raw text not null,                       -- 使用者原始輸入，永遠保留
  parsed jsonb,                            -- 解析結果（含待確認欄位、使用哪種解析）
  status text not null default 'pending' check (status in ('pending','confirmed','discarded')),
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  kind text not null default 'task' check (kind in ('task','event')),
  status text not null default 'todo' check (status in ('todo','doing','waiting','done','cancelled')),
  date date,
  time time,
  date_role text not null default 'scheduled' check (date_role in ('scheduled','due')),
  project text,
  tags text[] not null default '{}',
  notes text default '',
  raw text,
  source_inbox_id uuid references public.inbox_items on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.life_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'life' check (kind in ('life','idea')),
  text text not null,
  occurred_on date not null default current_date,
  project text,
  tags text[] not null default '{}',
  raw text,
  source_inbox_id uuid references public.inbox_items on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  actor text not null default 'user' check (actor in ('user','ai','system')),
  action text not null,
  level smallint not null check (level between 0 and 3),   -- 對應 01_REQUIREMENTS 操作風險分級
  target_table text,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_date on public.tasks (user_id, date);
create index if not exists life_logs_user_day on public.life_logs (user_id, occurred_on desc);
create index if not exists inbox_user_status on public.inbox_items (user_id, status);
create index if not exists activity_user_time on public.activity_logs (user_id, created_at desc);

-- 自動更新 updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['inbox_items','tasks','life_logs','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- 操作紀錄只能新增與讀取，不能被修改或刪除
drop policy if exists "own rows" on public.activity_logs;
create policy "read own" on public.activity_logs for select to authenticated using (user_id = auth.uid());
create policy "insert own" on public.activity_logs for insert to authenticated with check (user_id = auth.uid());
