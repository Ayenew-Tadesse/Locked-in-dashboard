-- Team admins.
--
-- Run after 20261006000000_portfolio_details.sql (the Supabase SQL editor: paste and Run).
--
-- A third role between the owner and colleagues:
--   owner   manages everyone; the only one who makes or removes admins,
--           removes people completely, renames the team, edits team goals/milestones
--   admin   manages colleagues: sees their tasks, files and scores; assigns,
--           edits and removes their tasks; invites colleagues; manages projects;
--           adds their own tasks. Doesn't see the owner's or other admins' work.
--   member  (a colleague) works on the tasks they're given
--
-- private.owns_member(user) now means "manages": the owner manages everyone
-- on the team, an admin manages its colleagues. Every rule built on it
-- (tasks, task files, storage, score snapshots) follows.

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('owner', 'admin', 'member'));
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check check (role in ('member', 'admin'));

-- Owner or admin of the team.
create or replace function private.is_admin(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = (select auth.uid()) and role in ('owner', 'admin'));
$$;
grant execute on function private.is_admin(uuid) to authenticated;

-- Does the signed-in user manage p_user? The owner manages everyone on the
-- team; an admin manages colleagues (role 'member').
create or replace function private.owns_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members o
    join public.team_members m on m.team_id = o.team_id
    where o.user_id = (select auth.uid()) and m.user_id = p_user
      and (o.role = 'owner' or (o.role = 'admin' and m.role = 'member')));
$$;

-- Invitations: the owner and admins see and cancel them; admins invite colleagues only.
drop policy "owner manages invites: read" on public.team_invites;
drop policy "owner manages invites: add" on public.team_invites;
drop policy "owner manages invites: revoke" on public.team_invites;
create policy "owner and admins: read invites" on public.team_invites
  for select to authenticated using ((select private.is_admin(team_id)));
create policy "owner and admins: invite" on public.team_invites
  for insert to authenticated with check (
    invited_by = (select auth.uid())
    and ((select private.is_owner(team_id)) or ((select private.is_admin(team_id)) and role = 'member')));
create policy "owner and admins: cancel invites" on public.team_invites
  for update to authenticated using ((select private.is_admin(team_id))) with check ((select private.is_admin(team_id)));

-- Projects: the owner and admins add, edit and delete them.
drop policy "owner adds projects" on public.projects;
drop policy "owner edits projects" on public.projects;
drop policy "owner deletes projects" on public.projects;
create policy "owner and admins: add projects" on public.projects
  for insert to authenticated with check (private.is_admin(team_id));
create policy "owner and admins: edit projects" on public.projects
  for update to authenticated using (private.is_admin(team_id)) with check (private.is_admin(team_id));
create policy "owner and admins: delete projects" on public.projects
  for delete to authenticated using (private.is_admin(team_id));

-- Make someone an admin, or a colleague again. Owner only; the owner's own
-- role can't be changed this way.
create or replace function public.set_member_role(member uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team uuid;
begin
  if new_role not in ('admin', 'member') then
    raise exception 'The role must be admin or member.' using errcode = '22023';
  end if;
  select tm.team_id into team from public.team_members tm
   where tm.user_id = member and tm.role <> 'owner'
     and exists (select 1 from public.team_members o where o.team_id = tm.team_id and o.user_id = me and o.role = 'owner');
  if team is null then
    raise exception 'Only the team owner can change this person''s role.' using errcode = '42501';
  end if;
  update public.team_members set role = new_role where team_id = team and user_id = member;
end $$;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;

notify pgrst, 'reload schema';
