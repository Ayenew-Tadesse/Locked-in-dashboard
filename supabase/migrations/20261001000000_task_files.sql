-- Files for finished tasks.
--
-- Run after 20260930000000_project_description.sql (the Supabase SQL editor: paste and Run).
--
-- When a colleague finishes a task the owner assigned them, they attach at
-- least one file (screenshots, documents, designs...). Files live in a
-- private Storage bucket, "task-files", at <user id>/<task id>/<file>.
--
-- Who can do what:
--   the person who did the task: upload to their own folder, see and delete their files
--   the team owner: see (and, when removing someone, delete) their members' files
--   everyone else: nothing
-- task_files lists each file (name, size, type) against its task.
-- Completing an assigned task without a file is refused by the database.

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 10485760)
on conflict (id) do nothing;

create table public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path text not null unique check (char_length(path) <= 500),
  name text not null check (char_length(name) between 1 and 255),
  size bigint check (size >= 0 and size <= 10485760),
  mime text check (char_length(mime) <= 150),
  created_at timestamptz not null default now()
);
create index task_files_task on public.task_files (task_id);

alter table public.task_files enable row level security;
create policy "own or member's files: read" on public.task_files
  for select to authenticated using (user_id = (select auth.uid()) or private.owns_member(user_id));
create policy "own files on own tasks: add" on public.task_files
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and path like (select auth.uid())::text || '/' || task_id::text || '/%'
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));
create policy "own or member's files: delete" on public.task_files
  for delete to authenticated using (user_id = (select auth.uid()) or private.owns_member(user_id));
grant select, insert, delete on public.task_files to authenticated;

-- Storage: each person's folder is theirs; the owner can read and delete members' files.
create policy "task files: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "task files: read own or member's" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-files' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or private.owns_member(((storage.foldername(name))[1])::uuid)));
create policy "task files: delete own or member's" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-files' and ((storage.foldername(name))[1] = (select auth.uid())::text
         or private.owns_member(((storage.foldername(name))[1])::uuid)));

-- A colleague completing a task the owner assigned must attach a file first.
-- (The owner completing it themselves isn't held to this.)
create or replace function private.require_task_file()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.assigned_by is not null and new.assigned_by <> new.user_id
     and (select auth.uid()) = new.user_id
     and not exists (select 1 from public.task_files f where f.task_id = new.id) then
    raise exception 'Attach at least one file before finishing a task you were assigned.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger require_task_file before update of status on public.tasks
  for each row execute function private.require_task_file();
