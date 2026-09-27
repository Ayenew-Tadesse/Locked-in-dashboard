-- A short description for each project, shown on its Overview card.
--
-- Run after 20260929000000_projects.sql (the Supabase SQL editor: paste and Run).
-- Existing projects start with their category as the description.

alter table public.projects
  add column description text check (char_length(description) <= 300);

update public.projects set description = category where description is null;
