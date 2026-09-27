-- Only the team owner adds tasks.
--
-- Run after 20261001000000_task_files.sql (the Supabase SQL editor: paste and Run).
--
-- Colleagues work on the tasks the owner assigns them (progress, status,
-- files, learning log) but can't create new ones. The owner can still add
-- tasks for themselves and assign tasks to members; someone who isn't on a
-- team keeps adding their own.

-- Is the signed-in user a colleague (a member, not the owner, of a team)?
create or replace function private.is_colleague()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = (select auth.uid()) and role = 'member');
$$;

drop policy "own or assign: insert" on public.tasks;
create policy "owner adds tasks: insert" on public.tasks for insert to authenticated
  with check ((user_id = (select auth.uid()) and not (select private.is_colleague()))
              or (select private.owns_member(user_id)));

grant execute on function private.is_colleague() to authenticated;
