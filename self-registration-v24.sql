-- ART Giants U10-3 · secure parent self-registration and staff approval
-- Existing accounts remain approved. Only accounts created after this script
-- start in the pending state.

begin;

alter table public.profiles
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

-- Preserve every existing account and all existing app data.
update public.profiles
set approval_status = 'approved',
    approved_at = coalesce(approved_at, created_at, now())
where approval_status is null;

alter table public.profiles
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_approval_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_approval_status_check
      check (approval_status in ('pending', 'approved'));
  end if;
end
$$;

create index if not exists profiles_approval_status_idx
  on public.profiles (approval_status, role);

-- Every future Auth signup receives the parent role and must be approved.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role, approval_status)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
    'parent',
    'pending'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- A pending profile intentionally has no effective application role.
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.approval_status = 'approved'
$$;

revoke all on function public.current_role() from public;
revoke all on function public.current_role() from anon;
grant execute on function public.current_role() to authenticated;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
  )
$$;

revoke all on function app_private.is_approved_member() from public;
revoke all on function app_private.is_approved_member() from anon;
grant execute on function app_private.is_approved_member() to authenticated;

-- Restrictive policies are combined with the existing feature-specific RLS
-- rules. They add the approval gate without replacing any current permission.
drop policy if exists "approved members only" on public.attendance;
create policy "approved members only" on public.attendance
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.game_rsvps;
create policy "approved members only" on public.game_rsvps
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.game_standings;
create policy "approved members only" on public.game_standings
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.game_sync_logs;
create policy "approved members only" on public.game_sync_logs
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.games;
create policy "approved members only" on public.games
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.player_game_stats;
create policy "approved members only" on public.player_game_stats
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.players;
create policy "approved members only" on public.players
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.training_breaks;
create policy "approved members only" on public.training_breaks
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.trainings;
create policy "approved members only" on public.trainings
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

drop policy if exists "approved members only" on public.venues;
create policy "approved members only" on public.venues
  as restrictive for all to authenticated
  using ((select app_private.is_approved_member()))
  with check ((select app_private.is_approved_member()));

-- Pending users may read only their own profile so the app can display the
-- approval status. Approved members retain the current profile visibility.
drop policy if exists "approved members or own pending profile" on public.profiles;
create policy "approved members or own pending profile" on public.profiles
  as restrictive for select to authenticated
  using (
    (select app_private.is_approved_member())
    or id = (select auth.uid())
  );

create or replace function public.list_visible_team_accounts_v2()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  approval_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  requester_role text;
begin
  select p.role::text
  into requester_role
  from public.profiles p
  where p.id = requester_id
    and p.approval_status = 'approved';

  if requester_role not in ('admin', 'trainer') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)),
    u.email::text,
    p.role::text,
    p.approval_status,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where requester_role = 'admin'
     or (requester_role = 'trainer' and p.role::text in ('parent', 'player'))
  order by
    case p.approval_status when 'pending' then 0 else 1 end,
    case p.role::text when 'admin' then 1 when 'trainer' then 2 else 3 end,
    lower(coalesce(nullif(btrim(p.display_name), ''), u.email));
end;
$$;

revoke all on function public.list_visible_team_accounts_v2() from public;
revoke all on function public.list_visible_team_accounts_v2() from anon;
grant execute on function public.list_visible_team_accounts_v2() to authenticated;

create or replace function public.approve_team_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  requester_role text;
  target_role text;
begin
  select p.role::text
  into requester_role
  from public.profiles p
  where p.id = requester_id
    and p.approval_status = 'approved';

  if requester_role not in ('admin', 'trainer') then
    raise exception 'Coach or administrator access required' using errcode = '42501';
  end if;

  select p.role::text
  into target_role
  from public.profiles p
  where p.id = target_user_id;

  if not found then
    raise exception 'Account profile not found' using errcode = 'P0002';
  end if;

  if target_role = 'admin'
     or (requester_role = 'trainer' and target_role not in ('parent', 'player')) then
    raise exception 'This account cannot be approved by the current user' using errcode = '42501';
  end if;

  update public.profiles
  set approval_status = 'approved',
      approved_at = now(),
      approved_by = requester_id
  where id = target_user_id
    and approval_status = 'pending';
end;
$$;

revoke all on function public.approve_team_account(uuid) from public;
revoke all on function public.approve_team_account(uuid) from anon;
grant execute on function public.approve_team_account(uuid) to authenticated;

commit;
