-- Teams: a portal where colleagues sign in with their own accounts.
--
-- Run after the two earlier migrations.
--
-- Rules:
--   * Sign-up is by invitation only. The first account becomes the team
--     owner; after that, only emails the owner has invited can sign up.
--   * Roles: owner and member.
--   * Members see their own tasks, scores and learning logs, plus the team's
--     goals and milestones. The owner also sees every member's tasks, scores
--     and profiles (the Team page), and can assign tasks to members.
--   * Team goals and milestones (team_id set) are shared; only the owner
--     changes them. Personal goals/milestones (team_id null) stay private.
--   * Milestone and goal progress counts everyone's tasks on a team
--     milestone, whoever did them.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My team' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user on public.team_members (user_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'member' check (role in ('member')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
-- One open invitation per email.
create unique index team_invites_open_email on public.team_invites (email) where accepted_at is null and revoked_at is null;

alter table public.quarterly_goals add column team_id uuid references public.teams (id) on delete set null;
alter table public.milestones add column team_id uuid references public.teams (id) on delete set null;
alter table public.tasks add column assigned_by uuid references public.profiles (id) on delete set null;
create index milestones_team on public.milestones (team_id);
create index quarterly_goals_team on public.quarterly_goals (team_id);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies can use them without
-- recursion; they only answer yes/no about the signed-in user).
-- ---------------------------------------------------------------------------

create or replace function private.is_member(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = (select auth.uid()));
$$;

create or replace function private.is_owner(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = (select auth.uid()) and role = 'owner');
$$;

-- Is the signed-in user the owner of a team that p_user belongs to?
create or replace function private.owns_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members o
    join public.team_members m on m.team_id = o.team_id
    where o.user_id = (select auth.uid()) and o.role = 'owner' and m.user_id = p_user);
$$;

-- Does the signed-in user share a team with p_user?
create or replace function private.shares_team(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members a
    join public.team_members b on b.team_id = a.team_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user);
$$;

grant execute on function private.is_member(uuid), private.is_owner(uuid), private.owns_member(uuid),
  private.shares_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitation-only sign-up
-- ---------------------------------------------------------------------------

create or replace function private.check_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The very first account is allowed (it becomes the team owner).
  if not exists (select 1 from public.teams) and not exists (select 1 from public.profiles) then
    return new;
  end if;
  if new.email is null or not exists (
    select 1 from public.team_invites
     where email = lower(new.email) and accepted_at is null and revoked_at is null) then
    raise exception 'Sign-up is by invitation only. Ask your team owner to invite this email.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger check_signup before insert on auth.users
  for each row execute function private.check_signup();

-- Sign-up now also joins the team: the first account creates it as owner;
-- invited accounts join with their invited role.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv public.team_invites%rowtype;
  new_team uuid;
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;

  select * into inv from public.team_invites
   where email = lower(new.email) and accepted_at is null and revoked_at is null
   order by created_at desc limit 1;
  if found then
    insert into public.team_members (team_id, user_id, role) values (inv.team_id, new.id, inv.role)
      on conflict do nothing;
    update public.team_invites set accepted_at = now() where id = inv.id;
  elsif not exists (select 1 from public.teams) then
    insert into public.teams (name) values ('My team') returning id into new_team;
    insert into public.team_members (team_id, user_id, role) values (new_team, new.id, 'owner');
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Existing data: put existing accounts in a team (the earliest becomes the
-- owner) and share the owner's goals and milestones with it.
-- ---------------------------------------------------------------------------

do $$
declare
  first_user uuid;
  t uuid;
begin
  select id into first_user from public.profiles order by created_at, id limit 1;
  if first_user is null then return; end if;
  insert into public.teams (name) values ('My team') returning id into t;
  insert into public.team_members (team_id, user_id, role)
    select t, id, case when id = first_user then 'owner' else 'member' end from public.profiles;
  update public.quarterly_goals set team_id = t where user_id = first_user;
  update public.milestones set team_id = t where user_id = first_user;
end $$;

-- ---------------------------------------------------------------------------
-- Links: tasks may point at their own milestones or at a team milestone of
-- a team the task's person belongs to (checked by trigger, since a foreign
-- key can't express "or").
-- ---------------------------------------------------------------------------

alter table public.tasks drop constraint tasks_milestone_id_user_id_fkey;
alter table public.tasks add constraint tasks_milestone_id_fkey
  foreign key (milestone_id) references public.milestones (id) on delete set null;
alter table public.milestones drop constraint milestones_goal_id_user_id_fkey;
alter table public.milestones add constraint milestones_goal_id_fkey
  foreign key (goal_id) references public.quarterly_goals (id) on delete set null;

create or replace function private.check_task_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m
     where m.id = new.milestone_id
       and (m.user_id = new.user_id
            or (m.team_id is not null and exists (
                  select 1 from public.team_members tm where tm.team_id = m.team_id and tm.user_id = new.user_id)))) then
    raise exception 'That milestone isn''t available to this person' using errcode = '23503';
  end if;
  return new;
end $$;

create or replace function private.check_milestone_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.goal_id is not null and not exists (
    select 1 from public.quarterly_goals g
     where g.id = new.goal_id
       and (g.user_id = new.user_id or (g.team_id is not null and g.team_id = new.team_id))) then
    raise exception 'That goal isn''t available to this milestone' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger check_links before insert or update of milestone_id, user_id on public.tasks
  for each row execute function private.check_task_link();
create trigger check_links before insert or update of goal_id, user_id, team_id on public.milestones
  for each row execute function private.check_milestone_link();

-- Tasks assigned to a member are stamped with who assigned them.
create or replace function private.stamp_assigner()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.assigned_by := case when new.user_id is distinct from auth.uid() and auth.uid() is not null then auth.uid() else null end;
  else
    new.assigned_by := old.assigned_by; -- can't be rewritten
  end if;
  return new;
end $$;
create trigger stamp_assigner before insert or update on public.tasks
  for each row execute function private.stamp_assigner();

-- ---------------------------------------------------------------------------
-- Progress counts everyone's tasks on a milestone. These run with elevated
-- rights because a member can't read teammates' tasks or change the owner's
-- milestone rows; they only recalculate the one row they're given.
-- ---------------------------------------------------------------------------

alter function private.milestone_progress() security definer;
alter function private.goal_progress() security definer;
alter function private.touch_goal(uuid) security definer;
alter function private.touch_milestone(uuid) security definer;

-- A milestone's team comes from its goal when it has one.
create or replace function private.inherit_team()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.goal_id is not null and new.team_id is null then
    select team_id into new.team_id from public.quarterly_goals where id = new.goal_id;
  end if;
  return new;
end $$;
create trigger inherit_team before insert or update of goal_id on public.milestones
  for each row execute function private.inherit_team();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

create policy "members read their team" on public.teams
  for select to authenticated using ((select private.is_member(id)));
create policy "owner renames the team" on public.teams
  for update to authenticated using ((select private.is_owner(id))) with check ((select private.is_owner(id)));

create policy "members see the team list" on public.team_members
  for select to authenticated using ((select private.is_member(team_id)));
create policy "owner removes members" on public.team_members
  for delete to authenticated using ((select private.is_owner(team_id)) and user_id <> (select auth.uid()));

create policy "owner manages invites: read" on public.team_invites
  for select to authenticated using ((select private.is_owner(team_id)));
create policy "owner manages invites: add" on public.team_invites
  for insert to authenticated with check ((select private.is_owner(team_id)) and invited_by = (select auth.uid()));
create policy "owner manages invites: revoke" on public.team_invites
  for update to authenticated using ((select private.is_owner(team_id))) with check ((select private.is_owner(team_id)));

grant select, update on public.teams to authenticated;
grant select, delete on public.team_members to authenticated;
grant select, insert, update on public.team_invites to authenticated;
revoke all on public.teams, public.team_members, public.team_invites from anon;

-- Profiles: teammates can see each other's names.
create policy "teammates: read" on public.profiles
  for select to authenticated using ((select private.shares_team(id)));

-- Goals and milestones: personal rows stay private; team rows are read by
-- members and changed by the owner.
drop policy "own rows: read" on public.quarterly_goals;
drop policy "own rows: insert" on public.quarterly_goals;
drop policy "own rows: update" on public.quarterly_goals;
drop policy "own rows: delete" on public.quarterly_goals;
drop policy "own rows: read" on public.milestones;
drop policy "own rows: insert" on public.milestones;
drop policy "own rows: update" on public.milestones;
drop policy "own rows: delete" on public.milestones;

do $$
declare t text;
begin
  foreach t in array array['quarterly_goals', 'milestones'] loop
    execute format($f$create policy "own or team: read" on public.%I for select to authenticated
      using (user_id = (select auth.uid()) or (team_id is not null and (select private.is_member(team_id))))$f$, t);
    execute format($f$create policy "own or owned team: insert" on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()) and (team_id is null or (select private.is_owner(team_id))))$f$, t);
    execute format($f$create policy "own or owned team: update" on public.%I for update to authenticated
      using (case when team_id is null then user_id = (select auth.uid()) else (select private.is_owner(team_id)) end)
      with check (case when team_id is null then user_id = (select auth.uid()) else (select private.is_owner(team_id)) end)$f$, t);
    execute format($f$create policy "own or owned team: delete" on public.%I for delete to authenticated
      using (case when team_id is null then user_id = (select auth.uid()) else (select private.is_owner(team_id)) end)$f$, t);
  end loop;
end $$;

-- Tasks: your own, plus the owner can see, assign, change and remove
-- members' tasks.
drop policy "own rows: read" on public.tasks;
drop policy "own rows: insert" on public.tasks;
drop policy "own rows: update" on public.tasks;
drop policy "own rows: delete" on public.tasks;
create policy "own or member's: read" on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) or (select private.owns_member(user_id)));
create policy "own or assign: insert" on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()) or (select private.owns_member(user_id)));
create policy "own or member's: update" on public.tasks for update to authenticated
  using (user_id = (select auth.uid()) or (select private.owns_member(user_id)))
  with check (user_id = (select auth.uid()) or (select private.owns_member(user_id)));
create policy "own or member's: delete" on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.owns_member(user_id)));

-- Score snapshots: the owner can read members' (for the Team page).
create policy "owner reads members' scores" on public.daily_scores for select to authenticated
  using ((select private.owns_member(user_id)));
create policy "owner reads members' scores" on public.weekly_scores for select to authenticated
  using ((select private.owns_member(user_id)));

-- ---------------------------------------------------------------------------
-- The assistant API also returns team goals and milestones.
-- ---------------------------------------------------------------------------

create or replace function public.api_snapshot(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.resolve_token(p_token, 'read');
  result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'date range must be 0-400 days' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'profile', (select jsonb_build_object('name', name, 'timezone', timezone) from public.profiles where id = uid),
    'settings', (select scoring from public.user_settings where user_id = uid),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.date, t.created_at)
       from public.tasks t
      where t.user_id = uid
        and ((t.date between p_from and p_to)
          or (t.due_date between p_from and p_to)
          or (t.completed_at::date between p_from and p_to)
          or (t.status not in ('completed', 'cancelled') and t.due_date < p_to))), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.deadline nulls last)
       from public.milestones m
      where m.user_id = uid
         or (m.team_id is not null and exists (select 1 from public.team_members tm where tm.team_id = m.team_id and tm.user_id = uid))), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by g.year, g.quarter)
       from public.quarterly_goals g
      where g.user_id = uid
         or (g.team_id is not null and exists (select 1 from public.team_members tm where tm.team_id = g.team_id and tm.user_id = uid))), '[]'::jsonb),
    'daily_notes', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'notes', notes))
       from public.daily_scores where user_id = uid and notes is not null and date between p_from and p_to), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(jsonb_build_object('week_start', week_start, 'notes', notes))
       from public.weekly_scores where user_id = uid and notes is not null and week_start between p_from - 6 and p_to), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- api_create_task: tasks may link team milestones too.
create or replace function public.api_create_task(p_token text, p_task jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.resolve_token(p_token, 'write');
  ms uuid := nullif(p_task ->> 'milestone_id', '')::uuid;
  row public.tasks%rowtype;
begin
  if ms is not null and not exists (
    select 1 from public.milestones m where m.id = ms
      and (m.user_id = uid or (m.team_id is not null and exists (
        select 1 from public.team_members tm where tm.team_id = m.team_id and tm.user_id = uid)))) then
    raise exception 'unknown milestone' using errcode = '22023';
  end if;
  insert into public.tasks (user_id, title, description, date, due_date, priority, category,
                            estimated_minutes, notes, milestone_id)
  values (uid, p_task ->> 'title', p_task ->> 'description', coalesce((p_task ->> 'date')::date, current_date),
    (p_task ->> 'due_date')::date, coalesce(p_task ->> 'priority', 'medium'), p_task ->> 'category',
    (p_task ->> 'estimated_minutes')::int, p_task ->> 'notes', ms)
  returning * into row;
  return to_jsonb(row) - 'user_id';
end $$;

revoke all on function public.api_snapshot(text, date, date) from public;
revoke all on function public.api_create_task(text, jsonb) from public;
grant execute on function public.api_snapshot(text, date, date) to anon, authenticated;
grant execute on function public.api_create_task(text, jsonb) to anon, authenticated;
revoke all on function private.check_signup(), private.check_task_link(), private.check_milestone_link(), private.inherit_team(), private.stamp_assigner()
  from public, anon, authenticated;
