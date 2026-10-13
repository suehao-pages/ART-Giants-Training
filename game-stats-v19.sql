-- ART Giants PWA v19: click-based game statistics and player photos in game attendance.
-- Run once in Supabase SQL Editor after the earlier migration files.

alter table public.player_game_stats
  add column if not exists shot_attempts smallint not null default 0
  check (shot_attempts between 0 and 300);

alter table public.player_game_stats
  add column if not exists shots_made smallint not null default 0
  check (shots_made between 0 and 300);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_game_stats_made_lte_attempts'
      and conrelid = 'public.player_game_stats'::regclass
  ) then
    alter table public.player_game_stats
      add constraint player_game_stats_made_lte_attempts
      check (shots_made <= shot_attempts);
  end if;
end
$$;

-- Signed-in team members may see the basic player identity that belongs to a
-- game response. Contact details are deliberately not returned here. Opening
-- the player card still goes through get_player_profile_for_viewer(), whose
-- privacy rules expose contact data only to trainers and administrators.
create or replace function public.list_game_attendees()
returns table (
  game_id uuid,
  user_id uuid,
  player_id uuid,
  first_name text,
  avatar_url text,
  status public.attendance_status
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
         r.status
    from public.game_rsvps r
    left join public.players p on p.owner_id = r.user_id
    left join public.profiles pr on pr.id = r.user_id
   where auth.uid() is not null;
$$;

revoke all on function public.list_game_attendees() from public, anon;
grant execute on function public.list_game_attendees() to authenticated;

notify pgrst, 'reload schema';
