-- TriFuel: PostgreSQL functions + nightly pg_cron job
-- Run after 002_fueling.sql

-- HR-TSS formula: TSS = (duration_hr * avg_hr * duration_hr) / (threshold_hr * 3600) * 100
-- Simplified: TSS = (duration_sec / 3600) * (avg_hr / threshold_hr)^2 * 100
create or replace function compute_tss(p_workout_id uuid)
returns numeric language plpgsql as $$
declare
  v_duration_sec  int;
  v_avg_hr        int;
  v_threshold_hr  int;
  v_tss           numeric;
begin
  select w.duration_sec, w.avg_hr_bpm, u.threshold_hr_bpm
    into v_duration_sec, v_avg_hr, v_threshold_hr
    from workouts w
    join users u on u.id = w.user_id
   where w.id = p_workout_id;

  if v_avg_hr is null or v_threshold_hr is null or v_threshold_hr = 0 then
    return null;
  end if;

  v_tss := (v_duration_sec::numeric / 3600)
           * power(v_avg_hr::numeric / v_threshold_hr, 2)
           * 100;

  update workouts set tss_estimate = round(v_tss, 2) where id = p_workout_id;
  return round(v_tss, 2);
end;
$$;

-- Rebuild daily_metrics for one user using exponential-weighted averages.
-- CTL τ = 42 days, ATL τ = 7 days, TSB = CTL - ATL
create or replace function recompute_training_load(p_user_id uuid)
returns void language plpgsql as $$
declare
  v_ctl     numeric := 0;
  v_atl     numeric := 0;
  v_alpha_ctl numeric := 2.0 / (42 + 1);
  v_alpha_atl numeric := 2.0 / (7  + 1);
  v_day     date;
  v_tss     numeric;
  v_start   date;
  v_end     date := current_date;
begin
  -- Start from the first workout date
  select min(started_at::date) into v_start from workouts where user_id = p_user_id;
  if v_start is null then return; end if;

  -- Delete and rebuild from scratch
  delete from daily_metrics where user_id = p_user_id;

  v_day := v_start;
  while v_day <= v_end loop
    -- Sum TSS for all workouts on this day
    select coalesce(sum(tss_estimate), 0)
      into v_tss
      from workouts
     where user_id = p_user_id
       and started_at::date = v_day;

    v_ctl := v_ctl + v_alpha_ctl * (v_tss - v_ctl);
    v_atl := v_atl + v_alpha_atl * (v_tss - v_atl);

    insert into daily_metrics(user_id, date, ctl, atl, tsb)
    values (p_user_id, v_day, round(v_ctl,2), round(v_atl,2), round(v_ctl - v_atl, 2))
    on conflict (user_id, date) do update
      set ctl = excluded.ctl, atl = excluded.atl, tsb = excluded.tsb;

    v_day := v_day + 1;
  end loop;
end;
$$;

-- Race readiness: returns a JSON summary for a given race
create or replace function get_race_readiness(p_race_id uuid)
returns jsonb language plpgsql as $$
declare
  v_race       race_plans%rowtype;
  v_ctl        numeric;
  v_atl        numeric;
  v_tsb        numeric;
  v_peak_ctl   numeric;
  v_ramp_rate  numeric;
  v_readiness  int;
  v_notes      text[] := array[]::text[];
begin
  select * into v_race from race_plans where id = p_race_id;
  if not found then return null; end if;

  -- Get metrics on the race date (or latest available if race is in future)
  select ctl, atl, tsb
    into v_ctl, v_atl, v_tsb
    from daily_metrics
   where user_id = v_race.user_id
     and date <= v_race.race_date
   order by date desc
   limit 1;

  -- Peak CTL in last 90 days
  select max(ctl) into v_peak_ctl
    from daily_metrics
   where user_id = v_race.user_id
     and date >= current_date - 90;

  -- Ramp rate: average daily CTL change over last 28 days
  select (max(ctl) - min(ctl)) / 28.0 into v_ramp_rate
    from daily_metrics
   where user_id = v_race.user_id
     and date >= current_date - 28;

  -- Score: base 50, +25 for positive TSB heading into race, +25 for fitness
  v_readiness := 50;
  if v_tsb > 5  then v_readiness := v_readiness + 15; end if;
  if v_tsb > 15 then v_readiness := v_readiness + 10; end if;
  if v_ctl > coalesce(v_peak_ctl, 0) * 0.9 then v_readiness := v_readiness + 15; end if;
  if v_ramp_rate between 0.5 and 2.0 then v_readiness := v_readiness + 10; end if;

  -- Notes
  if coalesce(v_tsb, 0) < -20 then
    v_notes := array_append(v_notes, 'TSB very negative — consider extra rest before race day.');
  end if;
  if coalesce(v_ramp_rate, 0) > 3 then
    v_notes := array_append(v_notes, 'Ramp rate high — injury risk elevated.');
  end if;
  if coalesce(v_ctl, 0) < 30 then
    v_notes := array_append(v_notes, 'Fitness base (CTL) is low for this race distance.');
  end if;

  return jsonb_build_object(
    'race_id',       p_race_id,
    'race_name',     v_race.name,
    'race_date',     v_race.race_date,
    'days_out',      (v_race.race_date - current_date),
    'ctl',           coalesce(v_ctl, 0),
    'atl',           coalesce(v_atl, 0),
    'tsb',           coalesce(v_tsb, 0),
    'readiness_pct', least(v_readiness, 100),
    'notes',         v_notes
  );
end;
$$;

-- Nightly pg_cron job — uncomment after enabling pg_cron extension in Supabase dashboard
-- (Database → Extensions → pg_cron → Enable)
--
-- select cron.schedule(
--   'nightly-training-load',
--   '0 3 * * *',
--   $$
--     select recompute_training_load(id) from users;
--   $$
-- );
