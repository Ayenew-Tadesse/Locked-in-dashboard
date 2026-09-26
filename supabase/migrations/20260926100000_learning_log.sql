-- Learning log and preferences.
--
-- Run after 20260926000000_init.sql (the Supabase SQL editor: paste and Run).
--
-- tasks.learning_*: what you write when you complete a task (what changed,
--   how, and what problem it solved). The Daily report PDF is built from it.
-- user_settings.preferences: small per-user settings that aren't scoring,
--   e.g. which GitHub repos the Daily report reads commits from.
-- user_settings.plan_loaded_at: when the year plan was loaded, so it isn't
--   loaded twice by accident.

alter table public.tasks
  add column learning_changed text check (char_length(learning_changed) <= 5000),
  add column learning_how text check (char_length(learning_how) <= 5000),
  add column learning_solved text check (char_length(learning_solved) <= 5000);

alter table public.user_settings
  add column preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  add column plan_loaded_at timestamptz;
