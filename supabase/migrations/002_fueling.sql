-- TriFuel: Fueling reference table + log
-- Run after 001_schema.sql

-- Reference table: one row per session category
create table if not exists fueling_targets_ref (
  category            text primary key,
  sport_filter        text[],           -- null = any sport
  min_duration_min    int,
  max_duration_min    int,              -- null = no upper bound
  intensity_filter    text[],           -- null = any intensity
  race_context        bool not null default false,
  -- In-session targets (per hour)
  carb_low_g_hr       int not null,
  carb_high_g_hr      int not null,
  sodium_low_mg_hr    int not null,
  sodium_high_mg_hr   int not null,
  fluid_low_ml_hr     int not null,
  fluid_high_ml_hr    int not null,
  -- Pre-session window
  pre_window_min      int not null,     -- minutes before start
  pre_carb_g          int not null,
  -- Post-session recovery
  post_carb_g         int not null,
  post_protein_g      int not null
);

-- Seed all 15 categories
insert into fueling_targets_ref values
-- Training categories (sport-agnostic)
('short_easy',        null,  0,  59,  array['Z1','Z2'], false,  20,  40,   300,  500,  400,  600,  60,  30,  40,  15),
('medium_easy',       null, 60,  89,  array['Z1','Z2'], false,  40,  60,   400,  600,  500,  700,  60,  40,  50,  20),
('long_easy',         null, 90,  null, array['Z1','Z2'], false, 60,  80,   500,  700,  600,  800,  90,  60,  80,  25),
('short_threshold',   null,  0,  59,  array['Z3','Z4'], false,  40,  60,   400,  600,  500,  700,  60,  50,  60,  20),
('medium_threshold',  null, 60,  89,  array['Z3','Z4'], false,  60,  80,   500,  700,  600,  900,  60,  60,  70,  25),
('long_threshold',    null, 90,  null, array['Z3','Z4'], false, 70,  90,   600,  900,  700,  1000, 90,  70,  90,  30),
('brick',             array['bike','run'], 0, null, null, false, 60, 80,   500,  800,  600,  900,  90,  60,  80,  25),
-- Triathlon race categories
('race_day_sprint',   null,  0,  89,  null,             true,   50,  70,   500,  800,  600,  800,  90,  60,  80,  25),
('race_day_olympic',  null, 90, 180,  null,             true,   60,  80,   600,  900,  700,  900,  90,  70,  90,  30),
('race_day_70_3',     null, 180, 360, null,             true,   70,  90,   700, 1000,  800, 1100, 120,  90, 100,  35),
('race_day_140_6',    null, 360, null, null,            true,   80, 100,   900, 1200, 1000, 1300, 120, 100, 120,  40),
-- Running race categories
('race_day_5k',       array['run'],  0,  44, null,      true,    0,  15,   100,  300,  200,  400,  45,  40,  50,  20),
('race_day_10k',      array['run'], 45,  89, null,      true,   15,  30,   200,  500,  300,  600,  60,  50,  60,  20),
('race_day_13_1',     array['run'], 90, 180, null,      true,   30,  60,   500,  800,  600,  900,  90,  60,  80,  25),
('race_day_26_2',     array['run'], 180, null, null,    true,   60,  90,   800, 1200,  900, 1200, 120,  80, 100,  35)
on conflict (category) do nothing;

-- Fueling log: what was actually consumed
create table if not exists fueling_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  workout_id  uuid references workouts(id) on delete set null,
  logged_at   timestamptz not null default now(),
  carb_g      int,
  sodium_mg   int,
  fluid_ml    int,
  notes       text
);

create index if not exists fueling_log_user on fueling_log(user_id, logged_at desc);

alter table fueling_log enable row level security;
create policy "service full access" on fueling_log using (true) with check (true);
