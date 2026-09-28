-- Team chat: a group chat for the whole team and one-to-one chats.
--
-- Run after 20261003000000_task_groups.sql (the Supabase SQL editor: paste and Run).
--
-- recipient_id null: a group message, readable by everyone on the team.
-- recipient_id set: a direct message, readable only by its sender and recipient.
-- People can only write as themselves, only to their own team (and only to
-- someone on it), and can delete their own messages. New messages arrive
-- live (Supabase Realtime), still filtered by these rules.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (recipient_id is null or recipient_id <> sender_id)
);
create index messages_team_time on public.messages (team_id, created_at);
create index messages_recipient on public.messages (recipient_id) where recipient_id is not null;

alter table public.messages enable row level security;
create policy "team chat: read group and own direct messages" on public.messages
  for select to authenticated using (
    (select private.is_member(team_id))
    and (recipient_id is null or sender_id = (select auth.uid()) or recipient_id = (select auth.uid())));
create policy "team chat: write as yourself to your team" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and (select private.is_member(team_id))
    and (recipient_id is null or exists (
      select 1 from public.team_members m where m.team_id = messages.team_id and m.user_id = messages.recipient_id)));
create policy "team chat: delete your own messages" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));
grant select, insert, delete on public.messages to authenticated;

-- Live updates (Supabase Realtime). Skipped where there's no Realtime publication.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
