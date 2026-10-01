-- Project groups: people working together on one of the team's projects.
-- Run after 20261012000000_admin_permissions.sql (the Supabase SQL editor: paste and Run).
--
-- * A group has a name, one project, members and an optional lead. The owner
--   and admins with the new "manage_groups" permission create and change them.
-- * A colleague sees and works on only the projects of their groups, plus any
--   extra project the owner gives them (project_access). The owner and admins
--   see every project.
-- * Tasks can belong to a project (tasks.project_id). A colleague's task can
--   only be on a project they have access to.

-- The new admin permission (off by default).
create or replace function private.admin_defaults()
returns jsonb language sql immutable as $$
  select '{"invite": true, "cancel_invites": true, "access_requests": false, "remove_colleagues": false, "rename_team": false,
           "see_work": true, "assign_tasks": true, "edit_tasks": true, "see_admins": false,
           "edit_projects": true, "delete_projects": true, "edit_goals": false, "moderate_chat": false,
           "manage_groups": false}'::jsonb;
$$;

create table if not exists public.project_groups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  lead_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_groups_team on public.project_groups (team_id);

create table if not exists public.project_group_members (
  group_id uuid not null references public.project_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists project_group_members_user on public.project_group_members (user_id);

-- Extra projects someone may work on beyond their groups'.
create table if not exists public.project_access (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_access_user on public.project_access (user_id);

-- Tasks can belong to a project.
alter table public.tasks add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists tasks_project on public.tasks (project_id) where project_id is not null;
-- Existing tasks: linked where the category is a project's name on the person's team.
update public.tasks t set project_id = p.id
  from public.projects p join public.team_members tm on tm.team_id = p.team_id
 where t.project_id is null and tm.user_id = t.user_id and lower(btrim(t.category)) = lower(p.name);

-- May p_user work on p_project? The team's owner and admins: every project;
-- anyone else: their groups' projects and extra access.
create or replace function private.can_access_project(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p join public.team_members tm on tm.team_id = p.team_id
     where p.id = p_project and tm.user_id = p_user
       and (tm.role in ('owner', 'admin')
         or exists (select 1 from public.project_group_members gm join public.project_groups g on g.id = gm.group_id
                     where gm.user_id = p_user and g.project_id = p_project)
         or exists (select 1 from public.project_access a where a.user_id = p_user and a.project_id = p_project)));
$$;
-- Is p_user a colleague (role member)? Their tasks follow project access.
create or replace function private.is_colleague_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = p_user and role = 'member');
$$;
-- Group helpers (they read the tables directly, so the rules below don't loop).
create or replace function private.in_group(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_group_members where group_id = p_group and user_id = (select auth.uid()));
$$;
create or replace function private.group_team(p_group uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select team_id from public.project_groups where id = p_group;
$$;
grant execute on function private.can_access_project(uuid, uuid), private.is_colleague_user(uuid),
  private.in_group(uuid), private.group_team(uuid) to authenticated;

-- Projects: colleagues read only the ones they may work on.
drop policy if exists "team reads projects" on public.projects;
create policy "team reads projects" on public.projects for select to authenticated
  using (private.is_member(team_id) and (not (select private.is_colleague()) or private.can_access_project(id, (select auth.uid()))));

-- A colleague's task can only be on a project they may work on (any project for everyone else).
create or replace function private.check_task_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.project_id is not null and private.is_colleague_user(new.user_id)
     and not private.can_access_project(new.project_id, new.user_id) then
    raise exception 'This person doesn''t work on that project. Add them to its group (or give them access) first.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists check_task_project on public.tasks;
create trigger check_task_project before insert or update of project_id, user_id on public.tasks
  for each row execute function private.check_task_project();

-- Groups: the team's owner and admins see them all; colleagues see their own groups.
alter table public.project_groups enable row level security;
alter table public.project_group_members enable row level security;
alter table public.project_access enable row level security;

drop policy if exists "groups: read" on public.project_groups;
create policy "groups: read" on public.project_groups for select to authenticated
  using ((select private.is_admin(team_id)) or private.in_group(id));
drop policy if exists "groups: add" on public.project_groups;
create policy "groups: add" on public.project_groups for insert to authenticated
  with check ((select private.admin_can(team_id, 'manage_groups'))
    and exists (select 1 from public.projects p where p.id = project_id and p.team_id = project_groups.team_id));
drop policy if exists "groups: change" on public.project_groups;
create policy "groups: change" on public.project_groups for update to authenticated
  using ((select private.admin_can(team_id, 'manage_groups')))
  with check ((select private.admin_can(team_id, 'manage_groups'))
    and exists (select 1 from public.projects p where p.id = project_id and p.team_id = project_groups.team_id));
drop policy if exists "groups: delete" on public.project_groups;
create policy "groups: delete" on public.project_groups for delete to authenticated
  using ((select private.admin_can(team_id, 'manage_groups')));

drop policy if exists "group members: read" on public.project_group_members;
create policy "group members: read" on public.project_group_members for select to authenticated
  using (private.is_admin(private.group_team(group_id)) or private.in_group(group_id));
drop policy if exists "group members: add" on public.project_group_members;
create policy "group members: add" on public.project_group_members for insert to authenticated
  with check (private.admin_can(private.group_team(group_id), 'manage_groups')
    and exists (select 1 from public.team_members tm where tm.team_id = private.group_team(group_id) and tm.user_id = project_group_members.user_id));
drop policy if exists "group members: remove" on public.project_group_members;
create policy "group members: remove" on public.project_group_members for delete to authenticated
  using (private.admin_can(private.group_team(group_id), 'manage_groups'));

drop policy if exists "project access: read" on public.project_access;
create policy "project access: read" on public.project_access for select to authenticated
  using (user_id = (select auth.uid())
    or exists (select 1 from public.projects p where p.id = project_id and private.is_admin(p.team_id)));
drop policy if exists "project access: grant" on public.project_access;
create policy "project access: grant" on public.project_access for insert to authenticated
  with check (exists (select 1 from public.projects p join public.team_members tm on tm.team_id = p.team_id
    where p.id = project_id and tm.user_id = project_access.user_id and private.admin_can(p.team_id, 'manage_groups')));
drop policy if exists "project access: remove" on public.project_access;
create policy "project access: remove" on public.project_access for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and private.admin_can(p.team_id, 'manage_groups')));

grant select, insert, update, delete on public.project_groups to authenticated;
grant select, insert, delete on public.project_group_members, public.project_access to authenticated;
revoke all on public.project_groups, public.project_group_members, public.project_access from anon;

notify pgrst, 'reload schema';
-- End of file: if you pasted this into the SQL editor, this line should be the last one.
