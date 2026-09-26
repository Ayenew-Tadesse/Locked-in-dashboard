-- Removing a colleague completely.
--
-- Run after 20260927000000_greeting.sql (the Supabase SQL editor: paste and Run).
--
-- public.remove_member_completely(member): the team owner deletes a member's
-- account and everything in it. Deleting the auth user cascades through
-- profiles to their tasks, scores, learning logs, daily notes, settings,
-- personal milestones/goals, API tokens and team membership. Team milestone
-- and goal progress is recalculated by the existing task triggers. Open
-- invitations for their email are cancelled, so they can only come back if
-- invited again. It can't be undone.
--
-- The browser can't delete accounts (it only has the publishable key); this
-- function can, and it checks first that the caller owns the member's team.

create or replace function public.remove_member_completely(member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team uuid;
  member_email text;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if member = me then
    raise exception 'You can''t remove yourself.' using errcode = '42501';
  end if;
  select tm.team_id into team from public.team_members tm
   where tm.user_id = member
     and exists (select 1 from public.team_members o where o.team_id = tm.team_id and o.user_id = me and o.role = 'owner');
  if team is null then
    raise exception 'Only the team owner can remove this person.' using errcode = '42501';
  end if;

  select email into member_email from auth.users where id = member;
  update public.team_invites set revoked_at = now()
   where team_id = team and email = lower(member_email) and accepted_at is null and revoked_at is null;
  delete from auth.users where id = member;
end $$;

revoke all on function public.remove_member_completely(uuid) from public, anon;
grant execute on function public.remove_member_completely(uuid) to authenticated;
