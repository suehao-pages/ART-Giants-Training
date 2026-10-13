-- ART Giants PWA v15: editable training schedules and NRW holiday breaks.
-- Run once in Supabase SQL Editor before uploading the v15 web files.

alter table public.trainings add column if not exists client_key text;
create unique index if not exists trainings_client_key_key on public.trainings (client_key);

create table if not exists public.training_breaks (
  id uuid primary key default gen_random_uuid(),
  break_key text not null unique,
  name_de text not null,
  name_en text not null,
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'school_holiday',
  source_url text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

alter table public.training_breaks enable row level security;
drop policy if exists "members read training breaks" on public.training_breaks;
create policy "members read training breaks" on public.training_breaks
  for select to authenticated using (true);
drop policy if exists "staff manage training breaks" on public.training_breaks;
create policy "staff manage training breaks" on public.training_breaks
  for all to authenticated
  using (public.current_role() in ('trainer','admin'))
  with check (public.current_role() in ('trainer','admin'));
grant select, insert, update, delete on public.training_breaks to authenticated;

-- Official NRW school holidays. Local movable holidays can be added by an admin.
insert into public.training_breaks
  (break_key, name_de, name_en, starts_on, ends_on, kind, source_url)
values
  ('nrw-2026-sommer', 'Sommerferien', 'Summer break', '2026-07-20', '2026-09-01', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2026-herbst', 'Herbstferien', 'Autumn break', '2026-10-17', '2026-10-31', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2026-weihnachten', 'Weihnachtsferien', 'Christmas break', '2026-12-23', '2027-01-06', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2027-ostern', 'Osterferien', 'Easter break', '2027-03-22', '2027-04-03', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2027-pfingsten', 'Pfingstferien', 'Pentecost break', '2027-05-18', '2027-05-18', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2027-sommer', 'Sommerferien', 'Summer break', '2027-07-19', '2027-08-31', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2027-herbst', 'Herbstferien', 'Autumn break', '2027-10-23', '2027-11-06', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2027-weihnachten', 'Weihnachtsferien', 'Christmas break', '2027-12-24', '2028-01-08', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2028-ostern', 'Osterferien', 'Easter break', '2028-04-10', '2028-04-22', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2028-sommer', 'Sommerferien', 'Summer break', '2028-07-10', '2028-08-22', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2028-herbst', 'Herbstferien', 'Autumn break', '2028-10-23', '2028-11-04', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2028-weihnachten', 'Weihnachtsferien', 'Christmas break', '2028-12-21', '2029-01-05', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2029-ostern', 'Osterferien', 'Easter break', '2029-03-26', '2029-04-07', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2029-pfingsten', 'Pfingstferien', 'Pentecost break', '2029-05-22', '2029-05-22', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2029-sommer', 'Sommerferien', 'Summer break', '2029-07-02', '2029-08-14', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2029-herbst', 'Herbstferien', 'Autumn break', '2029-10-15', '2029-10-27', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2029-weihnachten', 'Weihnachtsferien', 'Christmas break', '2029-12-20', '2030-01-04', 'school_holiday', 'https://bass.schule.nrw/19662.htm'),
  ('nrw-2030-ostern', 'Osterferien', 'Easter break', '2030-04-15', '2030-04-27', 'school_holiday', 'https://bass.schule.nrw/19662.htm')
on conflict (break_key) do update set
  name_de = excluded.name_de,
  name_en = excluded.name_en,
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  kind = excluded.kind,
  source_url = excluded.source_url;

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
  existing_id uuid;
  created_total integer := 0;
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

  for schedule_date in
    select generated_day::date
    from generate_series(p_start_date, p_end_date, interval '1 day') generated_day
    where extract(isodow from generated_day)::smallint = any (p_weekdays)
    order by generated_day
  loop
    if exists (
      select 1 from public.training_breaks b
      where schedule_date between b.starts_on and b.ends_on
    ) then
      skipped_total := skipped_total + 1;
      continue;
    end if;

    select t.id into existing_id
    from public.trainings t
    where t.team = 'U10-3'
      and (t.starts_at at time zone 'Europe/Berlin')::date = schedule_date
    order by t.starts_at, t.id
    limit 1;

    if existing_id is null then
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
    else
      update public.trainings
      set starts_at = (schedule_date + p_start_time) at time zone 'Europe/Berlin',
          ends_at = (schedule_date + p_end_time) at time zone 'Europe/Berlin',
          venue_id = p_venue_id,
          trainer_id = auth.uid(),
          note = nullif(trim(coalesce(p_note, '')), ''),
          client_key = coalesce(client_key, 'u10-3-' || schedule_date::text),
          updated_at = now()
      where id = existing_id;
      updated_total := updated_total + 1;
    end if;
  end loop;

  return query select created_total, updated_total, skipped_total;
end;
$$;

revoke all on function public.create_training_series(date,date,time,time,smallint[],uuid,text) from public, anon;
grant execute on function public.create_training_series(date,date,time,time,smallint[],uuid,text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'training_breaks'
  ) then
    alter publication supabase_realtime add table public.training_breaks;
  end if;
end $$;

notify pgrst, 'reload schema';
