-- ART Giants v17: protected reset for the U10-3 practice schedule.
-- Run once in Supabase SQL Editor after the v15 and v16 migrations.

create or replace function public.clear_all_trainings()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  viewer_role text;
  deleted_total integer := 0;
begin
  select role::text
    into viewer_role
  from public.profiles
  where id = auth.uid();

  if viewer_role not in ('admin', 'trainer') then
    raise exception 'Only admins and trainers may clear the practice schedule';
  end if;

  delete from public.attendance
  where training_id in (
    select id from public.trainings where team = 'U10-3'
  );

  with deleted as (
    delete from public.trainings
    where team = 'U10-3'
    returning id
  )
  select count(*)::integer into deleted_total from deleted;

  return deleted_total;
end;
$$;

revoke all on function public.clear_all_trainings() from public, anon;
grant execute on function public.clear_all_trainings() to authenticated;

notify pgrst, 'reload schema';
