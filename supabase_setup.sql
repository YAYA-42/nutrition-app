-- ====== إعداد قاعدة بيانات صحّتي ======
-- شغّل هذا في Supabase → SQL Editor → New query → Run

-- جدول بيانات المستخدم (كل مستخدم صف واحد)
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb,
  updated_at timestamptz default now()
);

-- تفعيل حماية الصفوف (كل مستخدم يشوف بياناته فقط)
alter table public.user_data enable row level security;

-- سياسات الأمان
drop policy if exists "own_select" on public.user_data;
create policy "own_select" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "own_insert" on public.user_data;
create policy "own_insert" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "own_update" on public.user_data;
create policy "own_update" on public.user_data
  for update using (auth.uid() = user_id);
