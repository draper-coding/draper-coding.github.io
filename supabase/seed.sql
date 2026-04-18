-- TriFuel: Seed your athlete profile
-- Run after all migrations. Update values to match your actual numbers.

insert into users (
  id,
  name,
  ftp_watts,
  threshold_hr_bpm,
  css_per_100m_sec,
  sweat_rate_ml_per_hr,
  carb_tolerance_g_per_hr
) values (
  -- Keep this UUID; it's your user_id — paste it into dashboard/js/config.js and your MCP env
  '00000000-0000-0000-0000-000000000001',
  'Noah Draper',
  240,          -- swap in your actual FTP (Watts)
  162,          -- swap in your lactate threshold HR (bpm)
  1.72,         -- CSS in sec/100m (e.g. 1:43/100m = 103 sec → 1.72 min)
  800,          -- sweat rate ml/hr (weigh yourself before/after a 1-hr ride to measure)
  75            -- carb gut tolerance g/hr (start here; bump 5g every few long sessions)
)
on conflict (id) do update
  set name                   = excluded.name,
      ftp_watts              = excluded.ftp_watts,
      threshold_hr_bpm       = excluded.threshold_hr_bpm,
      css_per_100m_sec       = excluded.css_per_100m_sec,
      sweat_rate_ml_per_hr   = excluded.sweat_rate_ml_per_hr,
      carb_tolerance_g_per_hr = excluded.carb_tolerance_g_per_hr;

-- Example upcoming races (optional — add your actual races)
insert into race_plans (user_id, name, race_date, distance_category, target_finish_time_sec, notes)
values
  ('00000000-0000-0000-0000-000000000001', 'Mojo Tri Olympic',  '2026-08-15', 'olympic', 7200,  'A-race — peak for this'),
  ('00000000-0000-0000-0000-000000000001', 'Spring 10K',        '2026-05-10', '10k',     2700,  'Fitness test / B-race'),
  ('00000000-0000-0000-0000-000000000001', 'Fall Half Marathon', '2026-10-18', '13.1',   6600,  'Run-focused build')
on conflict do nothing;
