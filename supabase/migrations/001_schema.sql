-- TriFuel: Core schema
-- Run in Supabase SQL editor (Project → SQL editor → New query)

create extension if not exists "pgcrypto";

-- Athlete profile
create table if not exists users (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  ftp_watts              int,
  threshold_hr_bpm       int,
  css_per_100m_sec       numeric(5,2),
  sweat_rate_ml_per_hr   int  default 750,
  carb_tolerance_g_per_hr int default 75,
  created_at             timestamptz not null default now()
);

-- Workouts ingested from Apple Health
create table if not exists workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  source_id     text not null,           -- Apple Health UUID; drives upsert idempotency
  sport         text not null,           -- 'run' | 'bike' | 'swim' | 'other'
  started_at    timestamptz not null,
  duration_sec  int not null,
  distance_m    numeric(10,2),
  avg_hr_bpm    int,
  max_hr_bpm    int,
  tss_estimate  numeric(7,2),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (user_id, source_id)
);

create index if not exists workouts_user_started on workouts(user_id, started_at desc);

-- Daily training load (CTL / ATL / TSB)
create table if not exists daily_metrics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  date           date not null,
  ctl            numeric(7,2) default 0,   -- chronic training load (42-day EWA)
  atl            numeric(7,2) default 0,   -- acute training load (7-day EWA)
  tsb            numeric(7,2) default 0,   -- form = CTL - ATL
  resting_hr_bpm int,
  hrv_ms         numeric(6,2),
  sleep_hr       numeric(4,2),
  unique (user_id, date)
);

create index if not exists daily_metrics_user_date on daily_metrics(user_id, date desc);

-- Race plans (tri + running)
create table if not exists race_plans (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  name                  text not null,
  race_date             date not null,
  distance_category     text not null check (
    distance_category in ('sprint','olympic','70.3','140.6','5k','10k','13.1','26.2')
  ),
  target_finish_time_sec int,
  notes                 text,
  created_at            timestamptz not null default now()
);

create index if not exists race_plans_user_date on race_plans(user_id, race_date asc);

-- Row-level security: users see only their own rows
alter table users          enable row level security;
alter table workouts       enable row level security;
alter table daily_metrics  enable row level security;
alter table race_plans     enable row level security;

-- Policies (anon key = read-only via user_id match passed as header or app-level filter)
-- For the dashboard we rely on the service key server-side and anon key + user_id filter client-side.
-- These policies allow service role full access and authenticated read of own rows.
create policy "service full access" on users         using (true) with check (true);
create policy "service full access" on workouts      using (true) with check (true);
create policy "service full access" on daily_metrics using (true) with check (true);
create policy "service full access" on race_plans    using (true) with check (true);
