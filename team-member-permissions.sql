-- Run once in Supabase Dashboard -> SQL Editor.
-- The browser calls this function with the signed-in user's JWT.

create or replace function public.list_visible_team_accounts()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := (select auth.uid());
  requester_role text;
begin
  if requester_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.role::text
    into requester_role
    from public.profiles as p
   where p.id = requester_id;

  if requester_role not in ('admin', 'trainer') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id as user_id,
    coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)) as display_name,
    u.email::text as email,
    p.role::text as role
  from public.profiles as p
  join auth.users as u on u.id = p.id
  where requester_role = 'admin'
     or (requester_role = 'trainer' and p.role::text in ('parent', 'player'))
  order by
    case p.role::text when 'admin' then 1 when 'trainer' then 2 else 3 end,
    lower(coalesce(nullif(btrim(p.display_name), ''), u.email));
end;
$$;

revoke all on function public.list_visible_team_accounts() from public;
revoke all on function public.list_visible_team_accounts() from anon;
grant execute on function public.list_visible_team_accounts() to authenticated;

comment on function public.list_visible_team_accounts() is
  'Admin sees all accounts; trainer sees only parent/player accounts; all other roles are rejected.';
