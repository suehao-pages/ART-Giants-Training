-- ART Giants PWA v20: private absence reasons for game responses.
-- Run once in Supabase SQL Editor after game-stats-v19.sql.

-- A parent/player can read the full row (including note) only for the account's
-- own response. Staff may read all rows. Everyone else gets the privacy-safe
-- team view through list_game_attendees() below.
drop policy if exists "members read game rsvps" on public.game_rsvps;
drop policy if exists "members read own or staff game rsvps" on public.game_rsvps;
create policy "members read own or staff game rsvps" on public.game_rsvps
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.current_role() in ('trainer', 'admin')
  );

-- The return shape changes in v20, so PostgreSQL requires the old function to
-- be removed before it can be recreated with the additional column.
drop function if exists public.list_game_attendees();

create function public.list_game_attendees()
returns table (
  game_id uuid,
  user_id uuid,
  player_id uuid,
  first_name text,
  avatar_url text,
  status public.attendance_status,
  absence_reason text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select r.game_id,
         r.user_id,
         p.id as player_id,
         coalesce(
           nullif(btrim(p.first_name), ''),
           nullif(btrim(pr.display_name), ''),
           'Teammitglied'
         ) as first_name,
         p.avatar_url,
         r.status,
         case
           when r.status = 'no'
             and public.current_role() in ('trainer', 'admin')
           then nullif(btrim(r.note), '')
           else null
         end as absence_reason
    from public.game_rsvps r
    left join public.players p on p.owner_id = r.user_id
    left join public.profiles pr on pr.id = r.user_id
   where auth.uid() is not null;
$$;

revoke all on function public.list_game_attendees() from public, anon;
grant execute on function public.list_game_attendees() to authenticated;

notify pgrst, 'reload schema';
