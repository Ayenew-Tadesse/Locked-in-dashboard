-- Admin permissions: the owner chooses, per admin, what that admin may do.
-- Run after 20261011000000_access_requests.sql (the Supabase SQL editor: paste and Run).
--
-- team_members.permissions holds an admin's choices ({"rename_team": true, …});
-- anything not set uses the default below (today's admin access). The owner
-- can always do everything; colleagues nothing extra. Never grantable: making
-- or removing admins, changing permissions, the owner's own work.
--
--   invite             invite colleagues                  (default on)
--   cancel_invites     cancel invitations                 (on)
--   access_requests    see and answer access requests     (off)
--   remove_colleagues  remove colleagues from the team    (off)
--   rename_team        rename the team                    (off)
--   see_work           see colleagues' tasks, files, scores (on)
--   assign_tasks       assign tasks to colleagues         (on)
--   edit_tasks         edit and delete colleagues' tasks  (on)
--   see_admins         see other admins' work (read only) (off)
--   edit_projects      add and edit projects              (on)
--   delete_projects    delete projects                    (on)
--   edit_goals         edit team goals and milestones     (off)
--   moderate_chat      delete others' team chat messages  (off)

alter table public.team_members add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.team_members drop constraint if exists team_members_permissions_object;
alter table public.team_members add constraint team_members_permissions_object check (jsonb_typeof(permissions) = 'object');

create or replace function private.admin_defaults()
returns jsonb language sql immutable as $$
  select '{"invite": true, "cancel_invites": true, "access_requests": false, "remove_colleagues": false, "rename_team": false,
           "see_work": true, "assign_tasks": true, "edit_tasks": true, "see_admins": false,
           "edit_projects": true, "delete_projects": true, "edit_goals": false, "moderate_chat": false}'::jsonb;
$$;

-- An admin's permission (their choice, else the default; unknown names are off).
create or replace function private.perm(p_perms jsonb, p_name text)
returns boolean language sql immutable as $$
  select case when private.admin_defaults() ? p_name
    then coalesce((p_perms ->> p_name)::boolean, (private.admin_defaults() ->> p_name)::boolean) else false end;
$$;

-- May the signed-in user do p_name in p_team? The owner always; an admin when allowed.
create or replace function private.admin_can(p_team uuid, p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members
    where team_id = p_team and user_id = (select auth.uid())
      and (role = 'owner' or (role = 'admin' and private.perm(permissions, p_name))));
$$;

-- Does the signed-in user see p_user's work (tasks, files, scores)? The owner
-- sees everyone; an admin sees colleagues (see_work) and other admins (see_admins).
create or replace function private.sees_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members o
    join public.team_members m on m.team_id = o.team_id
    where o.user_id = (select auth.uid()) and m.user_id = p_user
      and (o.role = 'owner'
        or (o.role = 'admin' and m.role = 'member' and private.perm(o.permissions, 'see_work'))
        or (o.role = 'admin' and m.role = 'admin' and m.user_id <> o.user_id and private.perm(o.permissions, 'see_admins'))));
$$;

-- Does the signed-in user change and remove p_user's tasks and files? The
-- owner for everyone; an admin for colleagues (edit_tasks).
create or replace function private.owns_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members o
    join public.team_members m on m.team_id = o.team_id
    where o.user_id = (select auth.uid()) and m.user_id = p_user
      and (o.role = 'owner' or (o.role = 'admin' and m.role = 'member' and private.perm(o.permissions, 'edit_tasks'))));
$$;

-- Can the signed-in user give p_user a task? The owner anyone; an admin colleagues (assign_tasks).
create or replace function private.assigns_to(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members o
    join public.team_members m on m.team_id = o.team_id
    where o.user_id = (select auth.uid()) and m.user_id = p_user
      and (o.role = 'owner' or (o.role = 'admin' and m.role = 'member' and private.perm(o.permissions, 'assign_tasks'))));
$$;
grant execute on function private.admin_defaults(), private.perm(jsonb, text), private.admin_can(uuid, text),
  private.sees_member(uuid), private.owns_member(uuid), private.assigns_to(uuid) to authenticated;

-- Seeing work: tasks, files, stored files, score snapshots.
drop policy if exists "own or member's: read" on public.tasks;
create policy "own or member's: read" on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) or (select private.sees_member(user_id)));
drop policy if exists "owner adds tasks: insert" on public.tasks;
create policy "owner adds tasks: insert" on public.tasks for insert to authenticated
  with check ((user_id = (select auth.uid()) and not (select private.is_colleague()))
              or (select private.assigns_to(user_id)));
drop policy if exists "own or member's files: read" on public.task_files;
create policy "own or member's files: read" on public.task_files
  for select to authenticated using (user_id = (select auth.uid()) or private.sees_member(user_id));
drop policy if exists "task files: read own or member's" on storage.objects;
create policy "task files: read own or member's" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-files' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or private.sees_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists "owner reads members' scores" on public.daily_scores;
create policy "owner reads members' scores" on public.daily_scores for select to authenticated
  using ((select private.sees_member(user_id)));
drop policy if exists "owner reads members' scores" on public.weekly_scores;
create policy "owner reads members' scores" on public.weekly_scores for select to authenticated
  using ((select private.sees_member(user_id)));

-- Invitations.
drop policy if exists "owner and admins: read invites" on public.team_invites;
create policy "owner and admins: read invites" on public.team_invites for select to authenticated
  using ((select private.admin_can(team_id, 'invite')) or (select private.admin_can(team_id, 'cancel_invites')));
drop policy if exists "owner and admins: invite" on public.team_invites;
create policy "owner and admins: invite" on public.team_invites for insert to authenticated with check (
  invited_by = (select auth.uid())
  and ((select private.is_owner(team_id)) or ((select private.admin_can(team_id, 'invite')) and role = 'member')));
drop policy if exists "owner and admins: cancel invites" on public.team_invites;
create policy "owner and admins: cancel invites" on public.team_invites for update to authenticated
  using ((select private.admin_can(team_id, 'cancel_invites'))) with check ((select private.admin_can(team_id, 'cancel_invites')));

-- Projects.
drop policy if exists "owner and admins: add projects" on public.projects;
create policy "owner and admins: add projects" on public.projects
  for insert to authenticated with check (private.admin_can(team_id, 'edit_projects'));
drop policy if exists "owner and admins: edit projects" on public.projects;
create policy "owner and admins: edit projects" on public.projects
  for update to authenticated using (private.admin_can(team_id, 'edit_projects')) with check (private.admin_can(team_id, 'edit_projects'));
drop policy if exists "owner and admins: delete projects" on public.projects;
create policy "owner and admins: delete projects" on public.projects
  for delete to authenticated using (private.admin_can(team_id, 'delete_projects'));

-- Renaming the team.
drop policy if exists "owner renames the team" on public.teams;
create policy "owner renames the team" on public.teams
  for update to authenticated using ((select private.admin_can(id, 'rename_team'))) with check ((select private.admin_can(id, 'rename_team')));

-- Team goals and milestones (personal ones stay their owner's).
do $$
declare t text;
begin
  foreach t in array array['quarterly_goals', 'milestones'] loop
    execute format('drop policy if exists "own or owned team: insert" on public.%I', t);
    execute format('drop policy if exists "own or owned team: update" on public.%I', t);
    execute format('drop policy if exists "own or owned team: delete" on public.%I', t);
    execute format($f$create policy "own or owned team: insert" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) and (team_id is null or (select private.admin_can(team_id, 'edit_goals'))))$f$, t);
    execute format($f$create policy "own or owned team: update" on public.%I for update to authenticated
      using (case when team_id is null then user_id = (select auth.uid()) else (select private.admin_can(team_id, 'edit_goals')) end)
      with check (case when team_id is null then user_id = (select auth.uid()) else (select private.admin_can(team_id, 'edit_goals')) end)$f$, t);
    execute format($f$create policy "own or owned team: delete" on public.%I for delete to authenticated
      using (case when team_id is null then user_id = (select auth.uid()) else (select private.admin_can(team_id, 'edit_goals')) end)$f$, t);
  end loop;
end $$;

-- Team chat: your own messages, and (moderate_chat) anyone's message to the whole team.
drop policy if exists "team chat: delete your own messages" on public.messages;
create policy "team chat: delete your own messages" on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) or (recipient_id is null and (select private.admin_can(team_id, 'moderate_chat'))));

-- Access requests: the owner, and admins allowed to answer them.
drop policy if exists "owners read access requests" on public.access_requests;
create policy "owners read access requests" on public.access_requests for select to authenticated
  using (exists (select 1 from public.team_members tm where tm.user_id = (select auth.uid())
    and (tm.role = 'owner' or (tm.role = 'admin' and private.perm(tm.permissions, 'access_requests')))));

create or replace function public.decide_access_request(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team uuid;
  req public.access_requests%rowtype;
begin
  select team_id into team from public.team_members
   where user_id = me and (role = 'owner' or (role = 'admin' and private.perm(permissions, 'access_requests'))) limit 1;
  if team is null then
    raise exception 'Only the team owner can answer access requests.' using errcode = '42501';
  end if;
  select * into req from public.access_requests where id = p_id and decided_at is null for update;
  if req.id is null then
    raise exception 'That request was already answered.' using errcode = 'P0002';
  end if;
  if p_approve and not exists (select 1 from public.team_invites where email = req.email and accepted_at is null and revoked_at is null) then
    insert into public.team_invites (team_id, email, invited_by) values (team, req.email, me);
  end if;
  update public.access_requests
     set decided_at = now(), decision = case when p_approve then 'approved' else 'declined' end, decided_by = me
   where id = req.id returning * into req;
  return to_jsonb(req);
end $$;

-- Removing someone: the owner anyone (but themselves); an admin colleagues (remove_colleagues).
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
   where tm.user_id = member and tm.role <> 'owner'
     and exists (select 1 from public.team_members o where o.team_id = tm.team_id and o.user_id = me
       and (o.role = 'owner' or (o.role = 'admin' and tm.role = 'member' and private.perm(o.permissions, 'remove_colleagues'))));
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

-- The owner sets an admin's permissions (p_member null: every admin on the team).
-- Only the names above are kept, as true/false.
create or replace function public.set_admin_permissions(p_member uuid, p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team uuid;
  clean jsonb;
  n int;
begin
  select team_id into team from public.team_members where user_id = me and role = 'owner' limit 1;
  if team is null then
    raise exception 'Only the team owner can change admin permissions.' using errcode = '42501';
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Permissions must be a list of names and true/false.' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(k, (p_permissions ->> k)::boolean), '{}'::jsonb) into clean
    from jsonb_object_keys(private.admin_defaults()) k
   where p_permissions ? k and jsonb_typeof(p_permissions -> k) = 'boolean';
  update public.team_members set permissions = clean
   where team_id = team and role = 'admin' and (p_member is null or user_id = p_member);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That person isn''t an admin on your team.' using errcode = 'P0002';
  end if;
  return clean;
end $$;
revoke all on function public.set_admin_permissions(uuid, jsonb) from public, anon;
grant execute on function public.set_admin_permissions(uuid, jsonb) to authenticated;

-- Nobody changes team_members directly (roles and permissions go through the functions above).
revoke update on public.team_members from authenticated;

notify pgrst, 'reload schema';
