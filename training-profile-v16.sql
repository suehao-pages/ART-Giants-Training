-- ART Giants PWA v16: schedule corrections and privacy-aware player cards.
-- Run once in Supabase SQL Editor after training-schedule-v15.sql.

alter table public.players add column if not exists birth_date date;
alter table public.players add column if not exists avatar_url text;
alter table public.players add column if not exists contact text;

-- Input mode creates missing dates only. Existing dates are deliberately left
-- untouched so corrections can happen only through the confirmed flow below.
create or replace function public.create_training_series(
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_end_time time,
  p_weekdays smallint[],
  p_venue_id uuid,
  p_note text default null
)
returns table (created_count integer, updated_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  schedule_date date;
  created_total integer := 0;
  skipped_total integer := 0;
begin
  if public.current_role() not in ('trainer','admin') then
    raise exception 'Coach or administrator access required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 370 then
    raise exception 'Date range may not exceed 370 days' using errcode = '22023';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0
     or exists (select 1 from unnest(p_weekdays) day_number where day_number not between 1 and 5) then
    raise exception 'Select at least one weekday from Monday to Friday' using errcode = '22023';
  end if;
  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'Venue not found' using errcode = '22023';
  end if;

  for schedule_date in
    select generated_day::date
    from generate_series(p_start_date, p_end_date, interval '1 day') generated_day
    where extract(isodow from generated_day)::smallint = any (p_weekdays)
    order by generated_day
  loop
    if exists (
      select 1 from public.training_breaks b
      where schedule_date between b.starts_on and b.ends_on
    ) or exists (
      select 1 from public.trainings t
      where t.team = 'U10-3'
        and (t.starts_at at time zone 'Europe/Berlin')::date = schedule_date
    ) then
      skipped_total := skipped_total + 1;
      continue;
    end if;

    insert into public.trainings
      (client_key, team, starts_at, ends_at, venue_id, trainer_id, status, note, updated_at)
    values
      ('u10-3-' || schedule_date::text,
       'U10-3',
       (schedule_date + p_start_time) at time zone 'Europe/Berlin',
       (schedule_date + p_end_time) at time zone 'Europe/Berlin',
       p_venue_id,
       auth.uid(),
       'draft',
       nullif(trim(coalesce(p_note, '')), ''),
       now());
    created_total := created_total + 1;
  end loop;

  return query select created_total, 0, skipped_total;
end;
$$;

revoke all on function public.create_training_series(date,date,time,time,smallint[],uuid,text) from public, anon;
grant execute on function public.create_training_series(date,date,time,time,smallint[],uuid,text) to authenticated;

create or replace function public.update_training_series(
  p_start_date date,
  p_end_date date,
  p_start_time time,
  p_end_time time,
  p_weekdays smallint[],
  p_venue_id uuid,
  p_note text default null
)
returns table (updated_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  updated_total integer := 0;
  skipped_total integer := 0;
begin
  if public.current_role() not in ('trainer','admin') then
    raise exception 'Coach or administrator access required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 370 then
    raise exception 'Date range may not exceed 370 days' using errcode = '22023';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'End time must be after start time' using errcode = '22023';
  end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0
     or exists (select 1 from unnest(p_weekdays) day_number where day_number not between 1 and 5) then
    raise exception 'Select at least one weekday from Monday to Friday' using errcode = '22023';
  end if;
  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception 'Venue not found' using errcode = '22023';
  end if;

  with matching as (
    select t.id,
           (t.starts_at at time zone 'Europe/Berlin')::date as local_date
    from public.trainings t
    where t.team = 'U10-3'
      and (t.starts_at at time zone 'Europe/Berlin')::date between p_start_date and p_end_date
      and extract(isodow from t.starts_at at time zone 'Europe/Berlin')::smallint = any (p_weekdays)
  ), updated as (
    update public.trainings t
    set starts_at = (m.local_date + p_start_time) at time zone 'Europe/Berlin',
        ends_at = (m.local_date + p_end_time) at time zone 'Europe/Berlin',
        venue_id = p_venue_id,
        trainer_id = auth.uid(),
        note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    from matching m
    where t.id = m.id
      and not exists (
        select 1 from public.training_breaks b
        where m.local_date between b.starts_on and b.ends_on
      )
    returning t.id
  )
  select count(*)::integer into updated_total from updated;

  select count(*)::integer into skipped_total
  from public.trainings t
  where t.team = 'U10-3'
    and (t.starts_at at time zone 'Europe/Berlin')::date between p_start_date and p_end_date
    and extract(isodow from t.starts_at at time zone 'Europe/Berlin')::smallint = any (p_weekdays)
    and exists (
      select 1 from public.training_breaks b
      where (t.starts_at at time zone 'Europe/Berlin')::date between b.starts_on and b.ends_on
    );

  return query select updated_total, skipped_total;
end;
$$;

revoke all on function public.update_training_series(date,date,time,time,smallint[],uuid,text) from public, anon;
grant execute on function public.update_training_series(date,date,time,time,smallint[],uuid,text) to authenticated;

-- Every signed-in team member may open a safe player card. Contact information
-- is returned only to trainers and administrators. The date of birth itself is
-- never returned; only the current age is calculated on the server.
create or replace function public.get_player_profile_for_viewer(target_player_id uuid)
returns table (
  player_id uuid,
  first_name text,
  age integer,
  height_cm smallint,
  weight_kg numeric,
  dominant_hand text,
  avatar_url text,
  contact text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.first_name,
         case when p.birth_date is null then null
              else extract(year from age(current_date, p.birth_date))::integer end,
         p.height_cm,
         p.weight_kg,
         p.dominant_hand,
         p.avatar_url,
         case when public.current_role() in ('trainer','admin') then p.contact else null end
  from public.players p
  where p.id = target_player_id
    and p.team = 'U10-3';
end;
$$;

revoke all on function public.get_player_profile_for_viewer(uuid) from public, anon;
grant execute on function public.get_player_profile_for_viewer(uuid) to authenticated;

notify pgrst, 'reload schema';
