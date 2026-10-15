create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.ride_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scooter_id text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  avg_speed_kph numeric,
  max_speed_kph numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.ride_sessions enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can view own ride sessions"
on public.ride_sessions
for select
using (auth.uid() = user_id);

create policy "Users can insert own ride sessions"
on public.ride_sessions
for insert
with check (auth.uid() = user_id);
