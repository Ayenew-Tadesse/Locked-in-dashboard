-- Project groups, step 2: people in a group see each other's tasks on the
-- group's project (read only), for the group page.
-- Run after 20261013000000_project_groups.sql (the Supabase SQL editor: paste and Run).

-- Is the signed-in user in a group on p_project together with p_user?
create or replace function private.shares_group_project(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_groups g
      join public.project_group_members me on me.group_id = g.id and me.user_id = (select auth.uid())
      join public.project_group_members them on them.group_id = g.id and them.user_id = p_user
     where g.project_id = p_project);
$$;
grant execute on function private.shares_group_project(uuid, uuid) to authenticated;

-- An extra way to read tasks (policies add up): your group's tasks on its project.
drop policy if exists "group members: read the project's tasks" on public.tasks;
create policy "group members: read the project's tasks" on public.tasks for select to authenticated
  using (project_id is not null and private.shares_group_project(project_id, user_id));

notify pgrst, 'reload schema';
-- End of file: if you pasted this into the SQL editor, this line should be the last one.
