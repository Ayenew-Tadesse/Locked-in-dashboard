-- Project groups, step 3: a chat for each group.
-- Run after 20261014000000_group_work.sql (the Supabase SQL editor: paste and Run).
--
-- messages.group_id set: a message to one project group, readable by its
-- members and the team owner; only members (and the owner) write there.
-- Team messages (no group, no recipient) and direct messages are unchanged.

alter table public.messages add column if not exists group_id uuid references public.project_groups (id) on delete cascade;
alter table public.messages drop constraint if exists messages_group_or_direct;
alter table public.messages add constraint messages_group_or_direct check (group_id is null or recipient_id is null);
create index if not exists messages_group on public.messages (group_id) where group_id is not null;

drop policy if exists "team chat: read group and own direct messages" on public.messages;
create policy "team chat: read group and own direct messages" on public.messages for select to authenticated using (
  (select private.is_member(team_id))
  and (
    (recipient_id is null and group_id is null)
    or sender_id = (select auth.uid()) or recipient_id = (select auth.uid())
    or (group_id is not null and (private.in_group(group_id) or (select private.is_owner(team_id))))));

drop policy if exists "team chat: write as yourself to your team" on public.messages;
create policy "team chat: write as yourself to your team" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and (select private.is_member(team_id))
  and (recipient_id is null or exists (
    select 1 from public.team_members m where m.team_id = messages.team_id and m.user_id = messages.recipient_id))
  and (group_id is null or (private.group_team(group_id) = team_id and (private.in_group(group_id) or (select private.is_owner(team_id))))));

notify pgrst, 'reload schema';
-- End of file: if you pasted this into the SQL editor, this line should be the last one.
