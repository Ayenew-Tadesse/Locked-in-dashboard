-- Projects (the apps: Guxo Flights, Guxo, Gexi, ...).
--
-- Run after 20260928000000_remove_member.sql (the Supabase SQL editor: paste and Run).
--
-- Each team has its projects. Everyone on the team reads them (the project
-- cards on the Overview); only the team owner adds, edits, reorders and
-- deletes them (the Projects page in the ☰ menu). Deleting a project
-- doesn't touch any tasks.
--
--   code       short route-style code, e.g. FLT
--   status     good (on track), warn (needs attention), idle (not started)
--   facts      list of short lines
--   links      {"web": url, "repo": url, "app": url}
--   checklist  list of {"id", "text", "done", "deadline"}
--   position   order of the cards

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  code text check (char_length(code) <= 8),
  category text check (char_length(category) <= 120),
  stage text check (char_length(stage) <= 120),
  status text not null default 'idle' check (status in ('good', 'warn', 'idle')),
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'),
  links jsonb not null default '{}'::jsonb check (jsonb_typeof(links) = 'object'),
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_team on public.projects (team_id, position);

create trigger set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

alter table public.projects enable row level security;
create policy "team reads projects" on public.projects
  for select to authenticated using (private.is_member(team_id));
create policy "owner adds projects" on public.projects
  for insert to authenticated with check (private.is_owner(team_id));
create policy "owner edits projects" on public.projects
  for update to authenticated using (private.is_owner(team_id)) with check (private.is_owner(team_id));
create policy "owner deletes projects" on public.projects
  for delete to authenticated using (private.is_owner(team_id));

grant select, insert, update, delete on public.projects to authenticated;
