-- Locked in: productivity and milestone tracking schema.
--
-- Run once in the Supabase SQL editor (or with `supabase db push`).
-- Every table has Row Level Security: a signed-in user can only read and
-- write rows whose user_id is their own auth.uid(). See docs/ARCHITECTURE.md.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user) and settings
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 120),
  email text,
  timezone text not null default 'UTC' check (char_length(timezone) <= 64),
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  -- Overrides for the default scoring weights/targets (see app/core/scoring.js).
  scoring jsonb not null default '{}'::jsonb check (jsonb_typeof(scoring) = 'object'),
  legacy_imported_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Create the profile and settings rows whenever someone signs up.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Quarterly goals
-- ---------------------------------------------------------------------------

create table public.quarterly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  quarter smallint not null check (quarter between 1 and 4),
  year smallint not null check (year between 2000 and 2100),
  deadline date,
  target numeric not null default 100 check (target > 0),
  current_progress numeric not null default 0 check (current_progress >= 0),
  percentage_complete numeric(5, 2) not null default 0,
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'milestones')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index quarterly_goals_user_period on public.quarterly_goals (user_id, year, quarter);

-- ---------------------------------------------------------------------------
-- Milestones
-- ---------------------------------------------------------------------------

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 5000),
  category text check (char_length(category) <= 60),
  start_date date,
  deadline date,
  target numeric not null default 100 check (target > 0),
  current_progress numeric not null default 0 check (current_progress >= 0),
  percentage_complete numeric(5, 2) not null default 0,
  -- 'tasks': progress = completed related tasks / related tasks (automatic).
  -- 'manual': progress = current_progress / target.
  progress_mode text not null default 'tasks' check (progress_mode in ('manual', 'tasks')),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  check (start_date is null or deadline is null or start_date <= deadline),
  -- Composite key: a milestone can only belong to a goal of the same user.
  foreign key (goal_id, user_id) references public.quarterly_goals (id, user_id)
    on delete set null (goal_id)
);
create index milestones_user_deadline on public.milestones (user_id, deadline);
create index milestones_goal on public.milestones (goal_id);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  milestone_id uuid,
  title text not null check (char_length(title) between 1 and 300),
  description text check (char_length(description) <= 10000),
  date date not null default current_date,          -- the day the task is planned for
  due_date date,                                    -- deadline (may differ from date)
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  -- 'overdue' is not stored: it is derived (see task_overview and app/core/tasks.js).
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'cancelled')),
  category text check (char_length(category) <= 60),
  estimated_minutes integer check (estimated_minutes between 0 and 100000),
  actual_minutes integer check (actual_minutes between 0 and 100000),
  completion_percentage smallint not null default 0 check (completion_percentage between 0 and 100),
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (milestone_id, user_id) references public.milestones (id, user_id)
    on delete set null (milestone_id)
);
create index tasks_user_date on public.tasks (user_id, date);
create index tasks_user_due on public.tasks (user_id, due_date) where status not in ('completed', 'cancelled');
create index tasks_milestone on public.tasks (milestone_id);

-- ---------------------------------------------------------------------------
-- Score snapshots (calculated by app/core/scoring.js; notes are written by you)
-- ---------------------------------------------------------------------------

create table public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  score numeric(5, 1) check (score between 0 and 100),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  total_tasks integer not null default 0 check (total_tasks >= 0),
  breakdown jsonb,
  notes text check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.weekly_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  score numeric(5, 1) check (score between 0 and 100),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  total_tasks integer not null default 0 check (total_tasks >= 0),
  breakdown jsonb,
  notes text check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start),
  check (week_end = week_start + 6)
);

-- ---------------------------------------------------------------------------
-- API tokens (for Claude / other assistants). Only a SHA-256 hash is stored.
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (char_length(token_prefix) <= 16),
  scopes text[] not null default array['read']
    check (scopes <@ array['read', 'write'] and cardinality(scopes) > 0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index api_tokens_user on public.api_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Triggers: timestamps, task completion, automatic milestone/goal progress
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quarterly_goals
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.milestones
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.daily_scores
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.weekly_scores
  for each row execute function private.set_updated_at();

create or replace function private.task_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    new.completion_percentage := 100;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger task_completion before insert or update on public.tasks
  for each row execute function private.task_completion();

-- Progress is calculated in one place per table: the BEFORE triggers below.
-- When a task or milestone changes, its parent row is "touched" so its
-- trigger recalculates.

create or replace function private.goal_progress()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.progress_mode = 'milestones' then
    select coalesce(avg(percentage_complete), 0) into new.percentage_complete
      from public.milestones where goal_id = new.id and status <> 'cancelled';
  else
    new.percentage_complete := least(100, new.current_progress / new.target * 100);
  end if;
  new.percentage_complete := round(new.percentage_complete, 2);
  if new.status not in ('cancelled', 'on_hold') then
    if new.percentage_complete >= 100 then new.status := 'completed';
    elsif new.status = 'completed' and new.progress_mode = 'milestones' then new.status := 'in_progress';
    elsif new.percentage_complete > 0 and new.status = 'not_started' then new.status := 'in_progress';
    end if;
  end if;
  return new;
end $$;

create trigger goal_progress before insert or update on public.quarterly_goals
  for each row execute function private.goal_progress();

create or replace function private.milestone_progress()
returns trigger language plpgsql set search_path = '' as $$
declare
  total int;
  done int;
begin
  if new.progress_mode = 'tasks' then
    select count(*) filter (where status <> 'cancelled'), count(*) filter (where status = 'completed')
      into total, done
      from public.tasks where milestone_id = new.id;
    new.target := greatest(total, 1);
    new.current_progress := done;
  end if;
  new.percentage_complete := round(least(100, new.current_progress / new.target * 100), 2);
  if new.status not in ('cancelled', 'on_hold') then
    if new.percentage_complete >= 100 then new.status := 'completed';
    elsif new.status = 'completed' and new.progress_mode = 'tasks' then new.status := 'in_progress';
    elsif new.percentage_complete > 0 and new.status = 'not_started' then new.status := 'in_progress';
    end if;
  end if;
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger milestone_progress before insert or update on public.milestones
  for each row execute function private.milestone_progress();

-- Touch helpers (run as the calling user, so RLS still applies).
create or replace function private.touch_goal(p_goal uuid)
returns void language sql set search_path = '' as $$
  update public.quarterly_goals set updated_at = now() where id = p_goal and progress_mode = 'milestones';
$$;

create or replace function private.touch_milestone(p_milestone uuid)
returns void language sql set search_path = '' as $$
  update public.milestones set updated_at = now() where id = p_milestone and progress_mode = 'tasks';
$$;

create or replace function private.milestone_changed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.goal_id is not null
     and (tg_op = 'DELETE' or new.goal_id is distinct from old.goal_id) then
    perform private.touch_goal(old.goal_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.goal_id is not null
     and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id
          or new.percentage_complete is distinct from old.percentage_complete
          or new.status is distinct from old.status) then
    perform private.touch_goal(new.goal_id);
  end if;
  return null;
end $$;

create trigger milestone_changed after insert or update or delete on public.milestones
  for each row execute function private.milestone_changed();

create or replace function private.task_changed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.milestone_id is not null
     and (tg_op = 'DELETE' or new.milestone_id is distinct from old.milestone_id) then
    perform private.touch_milestone(old.milestone_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.milestone_id is not null
     and (tg_op = 'INSERT' or new.milestone_id is distinct from old.milestone_id
          or new.status is distinct from old.status) then
    perform private.touch_milestone(new.milestone_id);
  end if;
  return null;
end $$;

create trigger task_changed after insert or update or delete on public.tasks
  for each row execute function private.task_changed();

-- ---------------------------------------------------------------------------
-- Derived view: tasks with their effective status (including overdue)
-- ---------------------------------------------------------------------------

create view public.task_overview with (security_invoker = on) as
select
  t.*,
  case
    when t.status in ('completed', 'cancelled') then t.status
    when t.due_date is not null
         and t.due_date < (now() at time zone coalesce(p.timezone, 'UTC'))::date then 'overdue'
    else t.status
  end as effective_status
from public.tasks t
join public.profiles p on p.id = t.user_id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.quarterly_goals enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_scores enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.api_tokens enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['user_settings', 'quarterly_goals', 'milestones', 'tasks',
                           'daily_scores', 'weekly_scores', 'api_tokens'] loop
    execute format('create policy "own rows: read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Signed-out visitors (the anon role) get no table access at all.
revoke all on public.profiles, public.user_settings, public.quarterly_goals, public.milestones,
  public.tasks, public.daily_scores, public.weekly_scores, public.api_tokens, public.task_overview
  from anon;
grant select, insert, update, delete on public.user_settings, public.quarterly_goals,
  public.milestones, public.tasks, public.daily_scores, public.weekly_scores, public.api_tokens
  to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.task_overview to authenticated;
-- A token's hash may be set once; after that only name/revoked_at/expires_at change.
revoke update on public.api_tokens from authenticated;
grant update (name, revoked_at, expires_at) on public.api_tokens to authenticated;

revoke all on schema private from public, anon, authenticated;
-- Signed-in users' writes fire triggers that call the touch helpers.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- API layer for assistants (e.g. Claude). Callable with the anon key, but
-- every call needs a valid personal access token; data is limited to the
-- token owner's rows. These are the ONLY functions that bypass RLS.
-- ---------------------------------------------------------------------------

create or replace function private.resolve_token(p_token text, p_scope text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  tid uuid;
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 200 then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  select id, user_id into tid, uid
    from public.api_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and p_scope = any (scopes);
  if uid is null then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  update public.api_tokens set last_used_at = now()
   where id = tid and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return uid;
end $$;

-- Everything an assistant needs to answer questions about a date range:
-- profile, settings, tasks in range (plus all still-open tasks due before the
-- range ends, so overdue work is never missed), milestones, goals and stored
-- score notes.
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
       from public.milestones m where m.user_id = uid), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by g.year, g.quarter)
       from public.quarterly_goals g where g.user_id = uid), '[]'::jsonb),
    'daily_notes', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'notes', notes))
       from public.daily_scores where user_id = uid and notes is not null and date between p_from and p_to), '[]'::jsonb),
    'weekly_notes', coalesce((select jsonb_agg(jsonb_build_object('week_start', week_start, 'notes', notes))
       from public.weekly_scores where user_id = uid and notes is not null and week_start between p_from - 6 and p_to), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Lets an assistant with a 'write' token add a task (e.g. "plan tomorrow").
create or replace function public.api_create_task(p_token text, p_task jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.resolve_token(p_token, 'write');
  ms uuid := nullif(p_task ->> 'milestone_id', '')::uuid;
  row public.tasks%rowtype;
begin
  if ms is not null and not exists (select 1 from public.milestones where id = ms and user_id = uid) then
    raise exception 'unknown milestone' using errcode = '22023';
  end if;
  insert into public.tasks (user_id, title, description, date, due_date, priority, category,
                            estimated_minutes, notes, milestone_id)
  values (
    uid,
    p_task ->> 'title',
    p_task ->> 'description',
    coalesce((p_task ->> 'date')::date, current_date),
    (p_task ->> 'due_date')::date,
    coalesce(p_task ->> 'priority', 'medium'),
    p_task ->> 'category',
    (p_task ->> 'estimated_minutes')::int,
    p_task ->> 'notes',
    ms
  ) returning * into row;
  return to_jsonb(row) - 'user_id';
end $$;

revoke all on function public.api_snapshot(text, date, date) from public;
revoke all on function public.api_create_task(text, jsonb) from public;
grant execute on function public.api_snapshot(text, date, date) to anon, authenticated;
grant execute on function public.api_create_task(text, jsonb) to anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.touch_goal(uuid), private.touch_milestone(uuid) to authenticated;
