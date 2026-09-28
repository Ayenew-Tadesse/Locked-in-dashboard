-- One task for several people.
--
-- Run after 20261002000000_owner_adds_tasks.sql (the Supabase SQL editor: paste and Run).
--
-- When the owner assigns a task to several colleagues, each person gets their
-- own copy (own progress, files and learning log). group_id links the copies
-- so the owner can edit them together, add a person, revoke it from someone
-- or delete it for everyone. The existing policies already let only the
-- owner change members' tasks.

alter table public.tasks add column if not exists group_id uuid;
create index if not exists tasks_group on public.tasks (group_id) where group_id is not null;
