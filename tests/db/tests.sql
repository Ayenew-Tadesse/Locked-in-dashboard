-- Database tests: automatic behaviour, Row Level Security and the API functions.
-- Any failed assertion aborts the run (ON_ERROR_STOP).

\set a '''aaaaaaaa-0000-0000-0000-000000000001'''
\set b '''bbbbbbbb-0000-0000-0000-000000000002'''

-- Helpers to act as a signed-in user, as a signed-out visitor, or as the owner.
create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role anon';
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- 1. Sign-up creates profile and settings -----------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:a, 'a@example.com', '{"name":"Alice"}'),
  (:b, 'b@example.com', '{}');
select pg_temp.check((select name from profiles where id = :a) = 'Alice', 'sign-up creates a profile with the name');
select pg_temp.check((select name from profiles where id = :b) = 'b', 'profile name falls back to the email name');
select pg_temp.check((select count(*) from user_settings) = 2, 'sign-up creates settings');

-- 2. Tasks: completion stamps ------------------------------------------------
select pg_temp.act_as(:a);
insert into tasks (title, date, due_date, priority) values ('Write tests', '2026-09-26', '2026-09-26', 'high');
select pg_temp.check((select user_id from tasks where title = 'Write tests') = :a, 'user_id defaults to the signed-in user');
update tasks set status = 'completed' where title = 'Write tests';
select pg_temp.check((select completed_at is not null and completion_percentage = 100 from tasks where title = 'Write tests'),
  'completing a task stamps completed_at and sets 100%');
update tasks set status = 'in_progress', completion_percentage = 40 where title = 'Write tests';
select pg_temp.check((select completed_at is null and completion_percentage = 40 from tasks where title = 'Write tests'),
  'reopening a task clears completed_at');

-- 3. Overdue is derived -------------------------------------------------------
insert into tasks (title, date, due_date) values ('Old task', current_date - 5, current_date - 2);
insert into tasks (title, date, due_date, status) values ('Old but done', current_date - 5, current_date - 2, 'completed');
select pg_temp.check((select effective_status from task_overview where title = 'Old task') = 'overdue', 'open past-due task is overdue');
select pg_temp.check((select effective_status from task_overview where title = 'Old but done') = 'completed', 'completed past-due task is not overdue');

-- 4. Milestones calculate progress from related tasks ------------------------
insert into milestones (title, deadline) values ('Launch portfolio', '2026-10-30');
select pg_temp.check((select percentage_complete = 0 and status = 'not_started' from milestones where title = 'Launch portfolio'),
  'new milestone starts at 0%');
insert into tasks (title, milestone_id)
  select 'Portfolio task ' || i, (select id from milestones where title = 'Launch portfolio') from generate_series(1, 4) i;
update tasks set status = 'completed' where title in ('Portfolio task 1', 'Portfolio task 2');
select pg_temp.check((select percentage_complete = 50 and status = 'in_progress' and current_progress = 2 and target = 4
  from milestones where title = 'Launch portfolio'), 'milestone is 50% with 2 of 4 tasks done');
update tasks set status = 'cancelled' where title = 'Portfolio task 4';
select pg_temp.check((select round(percentage_complete) = 67 from milestones where title = 'Launch portfolio'),
  'cancelled tasks are left out (2 of 3)');
update tasks set status = 'completed' where title = 'Portfolio task 3';
select pg_temp.check((select percentage_complete = 100 and status = 'completed' and completed_at is not null
  from milestones where title = 'Launch portfolio'), 'milestone completes automatically at 100%');
insert into tasks (title, milestone_id) values ('Late addition', (select id from milestones where title = 'Launch portfolio'));
select pg_temp.check((select percentage_complete = 75 and status = 'in_progress' and completed_at is null
  from milestones where title = 'Launch portfolio'), 'adding a task reopens an automatic milestone');

insert into milestones (title, progress_mode, target, current_progress) values ('Read 10 books', 'manual', 10, 3);
select pg_temp.check((select percentage_complete = 30 from milestones where title = 'Read 10 books'), 'manual milestone: 3 of 10 = 30%');

-- 5. Quarterly goals average their milestones --------------------------------
insert into quarterly_goals (title, quarter, year, progress_mode) values ('Ship things', 4, 2026, 'milestones');
update milestones set goal_id = (select id from quarterly_goals where title = 'Ship things');
select pg_temp.check((select percentage_complete = 52.5 from quarterly_goals where title = 'Ship things'),
  'goal = average of its milestones (75% and 30%)');
update milestones set current_progress = 10 where title = 'Read 10 books';
select pg_temp.check((select percentage_complete = 87.5 from quarterly_goals where title = 'Ship things'),
  'goal updates when a milestone changes');
insert into quarterly_goals (title, quarter, year, target, current_progress) values ('Run 100 km', 4, 2026, 100, 45);
select pg_temp.check((select percentage_complete = 45 and status = 'in_progress' from quarterly_goals where title = 'Run 100 km'),
  'manual goal: 45 of 100 = 45%');

-- 6. Deleting a milestone keeps its tasks -------------------------------------
delete from milestones where title = 'Read 10 books';
select pg_temp.check((select percentage_complete = 75 from quarterly_goals where title = 'Ship things'),
  'goal recalculates when a milestone is deleted');

-- 7. Row Level Security -------------------------------------------------------
select pg_temp.act_as(:b);
select pg_temp.check((select count(*) from tasks) = 0, 'user B sees none of A''s tasks');
select pg_temp.check((select count(*) from milestones) = 0, 'user B sees none of A''s milestones');
select pg_temp.check((select count(*) from profiles) = 1, 'user B sees only their own profile');
update tasks set title = 'hacked';
delete from tasks;
reset role;
select pg_temp.check((select count(*) from tasks where title = 'hacked') = 0 and (select count(*) from tasks) = 8,
  'user B cannot update or delete A''s tasks');

select pg_temp.act_as(:b);
do $$ begin
  insert into tasks (user_id, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'sneaky');
  raise exception 'FAILED: B inserted a task for A';
exception when insufficient_privilege then raise notice 'ok - B cannot insert rows for A';
end $$;
reset role;
select set_config('test.a_ms', (select id::text from milestones where title = 'Launch portfolio'), false);
select pg_temp.act_as(:b);
do $$ begin
  insert into tasks (title, milestone_id) values ('link', current_setting('test.a_ms')::uuid);
  raise exception 'FAILED: B linked a task to A''s milestone';
exception when foreign_key_violation then raise notice 'ok - B cannot link a task to A''s milestone';
end $$;
do $$ begin
  update profiles set name = 'x' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if (select count(*) from profiles where name = 'x') > 0 then raise exception 'FAILED: B renamed A'; end if;
  raise notice 'ok - B cannot edit A''s profile';
end $$;

select pg_temp.act_anon();
do $$ begin
  perform count(*) from tasks;
  raise exception 'FAILED: anon read tasks';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read tasks';
end $$;
reset role;

-- 8. Scores: one row per day / week -------------------------------------------
select pg_temp.act_as(:a);
insert into daily_scores (date, score, completed_tasks, total_tasks) values ('2026-09-26', 80, 4, 5);
insert into daily_scores (date, score, completed_tasks, total_tasks, notes) values ('2026-09-26', 90, 5, 5, 'Good day')
  on conflict (user_id, date) do update set score = excluded.score, notes = excluded.notes;
select pg_temp.check((select score = 90 and notes = 'Good day' from daily_scores where date = '2026-09-26'), 'daily score upserts by date');
do $$ begin
  insert into weekly_scores (week_start, week_end) values ('2026-09-21', '2026-09-28');
  raise exception 'FAILED: bad week accepted';
exception when check_violation then raise notice 'ok - a week must span exactly 7 days';
end $$;

-- 9. API tokens and the assistant API ------------------------------------------
insert into api_tokens (name, token_hash, token_prefix, scopes) values
  ('Claude read', encode(sha256('lki_read_token_for_tests_0123456789'::bytea), 'hex'), 'lki_read', array['read']),
  ('Claude write', encode(sha256('lki_write_token_for_tests_0123456789'::bytea), 'hex'), 'lki_writ', array['read', 'write']);
do $$ begin
  update api_tokens set token_hash = repeat('0', 64);
  raise exception 'FAILED: token hash was changed';
exception when insufficient_privilege then raise notice 'ok - a token''s hash cannot be changed';
end $$;
reset role;

select pg_temp.act_anon();
select pg_temp.check(
  jsonb_array_length(api_snapshot('lki_read_token_for_tests_0123456789', current_date - 30, current_date + 30) -> 'tasks') = 8,
  'api_snapshot returns the token owner''s tasks');
select pg_temp.check(
  (api_snapshot('lki_read_token_for_tests_0123456789', current_date, current_date) -> 'profile' ->> 'name') = 'Alice',
  'api_snapshot includes the profile');
select pg_temp.check(
  (select bool_and(not (t ? 'user_id')) from jsonb_array_elements(
    api_snapshot('lki_read_token_for_tests_0123456789', current_date - 30, current_date + 30) -> 'tasks') t),
  'api_snapshot does not leak user ids');
do $$ begin
  perform api_snapshot('lki_wrong_token_000000000000000000', current_date, current_date);
  raise exception 'FAILED: wrong token accepted';
exception when invalid_authorization_specification then raise notice 'ok - a wrong token is rejected';
end $$;
do $$ begin
  perform api_snapshot('lki_read_token_for_tests_0123456789', current_date - 500, current_date);
  raise exception 'FAILED: huge range accepted';
exception when invalid_parameter_value then raise notice 'ok - date ranges are limited';
end $$;
do $$ begin
  perform api_create_task('lki_read_token_for_tests_0123456789', '{"title":"x"}');
  raise exception 'FAILED: read token created a task';
exception when invalid_authorization_specification then raise notice 'ok - a read-only token cannot create tasks';
end $$;
select pg_temp.check(
  (api_create_task('lki_write_token_for_tests_0123456789', '{"title":"Plan from Claude","priority":"high","date":"2026-09-27"}') ->> 'title') = 'Plan from Claude',
  'a write token can create a task');
do $$ begin
  perform api_create_task('lki_write_token_for_tests_0123456789',
    jsonb_build_object('title', 'x', 'milestone_id', gen_random_uuid()));
  raise exception 'FAILED: unknown milestone accepted';
exception when invalid_parameter_value then raise notice 'ok - API tasks can only link the owner''s milestones';
end $$;
do $$ begin
  perform count(*) from api_tokens;
  raise exception 'FAILED: anon read api_tokens';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read tokens';
end $$;
do $$ begin
  perform private.resolve_token('lki_read_token_for_tests_0123456789', 'read');
  raise exception 'FAILED: anon called a private function';
exception when insufficient_privilege then raise notice 'ok - private functions are not callable';
end $$;
reset role;
select pg_temp.check((select user_id = :a from tasks where title = 'Plan from Claude'), 'API-created task belongs to the token owner');
select pg_temp.check((select last_used_at is not null from api_tokens where name = 'Claude read'), 'token use is recorded');

select pg_temp.act_as(:a);
update api_tokens set revoked_at = now() where name = 'Claude read';
select pg_temp.act_anon();
do $$ begin
  perform api_snapshot('lki_read_token_for_tests_0123456789', current_date, current_date);
  raise exception 'FAILED: revoked token accepted';
exception when invalid_authorization_specification then raise notice 'ok - a revoked token is rejected';
end $$;
reset role;

-- 10. Deleting an account removes all of its data --------------------------------
delete from auth.users where id = :a;
select pg_temp.check((select count(*) from tasks) = 0 and (select count(*) from milestones) = 0
  and (select count(*) from api_tokens) = 0, 'deleting a user removes their data');

-- 11. Learning log and preferences (second migration) --------------------------
-- Sign-up is invitation-only now (teams migration): invite c first.
insert into team_invites (team_id, email) select id, 'c@example.com' from teams limit 1;
insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-000000000003', 'c@example.com');
select pg_temp.act_as('cccccccc-0000-0000-0000-000000000003');
insert into tasks (title, status, learning_changed, learning_how, learning_solved)
  values ('Wire the store', 'completed', 'Added a booking store', 'Zustand slice per step', 'Screens no longer pass props five levels deep');
select pg_temp.check((select learning_solved from tasks where title = 'Wire the store') like 'Screens no longer%', 'tasks keep a learning log');
update user_settings set preferences = '{"githubRepos":["Ayenew-Tadesse/Guxo-Flights"]}', plan_loaded_at = now();
select pg_temp.check((select preferences -> 'githubRepos' ->> 0 from user_settings) = 'Ayenew-Tadesse/Guxo-Flights', 'preferences are saved');
do $$ begin
  update user_settings set preferences = '[]'::jsonb;
  raise exception 'FAILED: non-object preferences accepted';
exception when check_violation then raise notice 'ok - preferences must be an object';
end $$;
select pg_temp.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from tasks where title = 'Wire the store') = 0, 'learning logs stay private to their owner');
reset role;
