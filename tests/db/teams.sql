-- Team portal tests: invitation-only sign-up, roles, visibility, assigning
-- tasks and shared milestone progress.

create function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); execute 'set role authenticated'; end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %', what; end if; raise notice 'ok - %', what; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

\set owner '''11111111-0000-0000-0000-000000000001'''
\set ana '''22222222-0000-0000-0000-000000000002'''
\set ben '''33333333-0000-0000-0000-000000000003'''

-- 1. The first account becomes the owner; others need an invitation -----
insert into auth.users (id, email, raw_user_meta_data) values (:owner, 'owner@example.com', '{"name":"Aye"}');
select pg_temp.check((select role from team_members where user_id = :owner) = 'owner', 'first account owns the new team');
do $$ begin
  insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000009', 'stranger@example.com');
  raise exception 'FAILED: uninvited sign-up accepted';
exception when insufficient_privilege then raise notice 'ok - uninvited sign-up is refused';
end $$;

select pg_temp.act_as(:owner);
insert into team_invites (team_id, email, invited_by) select team_id, 'ana@example.com', :owner from team_members where user_id = :owner;
insert into team_invites (team_id, email, invited_by) select team_id, 'ben@example.com', :owner from team_members where user_id = :owner;
reset role;
insert into auth.users (id, email, raw_user_meta_data) values (:ana, 'Ana@Example.com', '{"name":"Ana"}');
insert into auth.users (id, email, raw_user_meta_data) values (:ben, 'ben@example.com', '{"name":"Ben"}');
select pg_temp.check((select count(*) from team_members where role = 'member') = 2, 'invited colleagues join as members (email case ignored)');
select pg_temp.check((select count(*) from team_invites where accepted_at is not null) = 2, 'invitations are marked accepted');

-- 2. Members can't manage the team ------------------------------------------
select pg_temp.act_as(:ana);
do $$ begin
  insert into team_invites (team_id, email, invited_by) select team_id, 'friend@example.com', auth.uid() from team_members limit 1;
  raise exception 'FAILED: member invited someone';
exception when insufficient_privilege then raise notice 'ok - members cannot invite';
end $$;
select pg_temp.check((select count(*) from team_invites) = 0, 'members cannot see invitations');
delete from team_members where user_id = '33333333-0000-0000-0000-000000000003';
update teams set name = 'Hijacked';
reset role;
select pg_temp.check((select count(*) from team_members) = 3 and (select name from teams) = 'My team', 'members cannot remove people or rename the team');

-- 3. Team goals/milestones are shared; only the owner changes them --------
select pg_temp.act_as(:owner);
insert into quarterly_goals (title, quarter, year, progress_mode, team_id)
  select 'Ship the network', 4, 2026, 'milestones', team_id from team_members where user_id = auth.uid();
insert into milestones (title, goal_id) select 'Booking flow', id from quarterly_goals where title = 'Ship the network';
insert into milestones (title) values ('Owner private milestone');
reset role;
select pg_temp.check((select team_id is not null from milestones where title = 'Booking flow'), 'a milestone under a team goal joins the team');

select pg_temp.act_as(:ana);
select pg_temp.check((select count(*) from milestones where title = 'Booking flow') = 1, 'members see team milestones');
select pg_temp.check((select count(*) from milestones where title = 'Owner private milestone') = 0, 'members do not see the owner''s personal milestones');
update milestones set title = 'Changed by Ana' where title = 'Booking flow';
reset role;
select pg_temp.check((select count(*) from milestones where title = 'Changed by Ana') = 0, 'members cannot change team milestones');

-- 4. Tasks: private by default; the owner sees and assigns ------------------
select pg_temp.act_as(:ana);
do $$ begin
  insert into tasks (title) values ('Ana adds her own task');
  raise exception 'FAILED: a colleague added a task';
exception when insufficient_privilege then raise notice 'ok - colleagues cannot add tasks';
end $$;
reset role;
-- Tasks Ana made herself before only the owner could add them.
insert into tasks (title, milestone_id) select 'Ana: build search', id from milestones where title = 'Booking flow';
insert into tasks (title) values ('Ana: personal errand');
select pg_temp.act_as(:ana);
select pg_temp.check((select assigned_by is null from tasks where title = 'Ana: build search'), 'own tasks are not marked assigned');
update tasks set completion_percentage = 40 where title = 'Ana: build search';
select pg_temp.check((select completion_percentage = 40 from tasks where title = 'Ana: build search'), 'colleagues still update their tasks');
reset role;

select pg_temp.act_as(:ben);
select pg_temp.check((select count(*) from tasks) = 0, 'members cannot see each other''s tasks');
do $$ begin
  insert into tasks (user_id, title) values ('22222222-0000-0000-0000-000000000002', 'Ben assigns Ana');
  raise exception 'FAILED: member assigned a task';
exception when insufficient_privilege then raise notice 'ok - members cannot assign tasks';
end $$;
select pg_temp.check((select count(*) from profiles) = 3, 'teammates can see each other''s names');
reset role;

select pg_temp.act_as(:owner);
select pg_temp.check((select count(*) from tasks where user_id = '22222222-0000-0000-0000-000000000002') = 2, 'the owner sees members'' tasks');
insert into tasks (title) values ('Owner: own task');
select pg_temp.check(exists (select 1 from tasks where title = 'Owner: own task'), 'the owner adds their own tasks');
delete from tasks where title = 'Owner: own task';
insert into tasks (user_id, title, milestone_id)
  select '33333333-0000-0000-0000-000000000003', 'Ben: build results', id from milestones where title = 'Booking flow';
select pg_temp.check((select assigned_by = '11111111-0000-0000-0000-000000000001' from tasks where title = 'Ben: build results'), 'assigned tasks record who assigned them');
do $$ begin
  insert into tasks (user_id, title, milestone_id)
    select '33333333-0000-0000-0000-000000000003', 'bad link', id from milestones where title = 'Owner private milestone';
  raise exception 'FAILED: linked a member task to a personal milestone';
exception when foreign_key_violation then raise notice 'ok - a member''s task can''t use the owner''s personal milestone';
end $$;
reset role;

select pg_temp.act_as(:ben);
select pg_temp.check((select count(*) from tasks) = 1, 'the assignee sees the assigned task');
-- Assigned work is handed in with a file (see section 10).
insert into task_files (task_id, path, name) select id, auth.uid()::text || '/' || id::text || '/results.png', 'results.png' from tasks where title = 'Ben: build results';
update tasks set status = 'completed' where title = 'Ben: build results';
reset role;

-- 5. Progress counts everyone's work on a team milestone ----------------------
select pg_temp.check((select percentage_complete = 50 and status = 'in_progress' from milestones where title = 'Booking flow'),
  'milestone counts tasks from all members (1 of 2 done)');
select pg_temp.check((select percentage_complete = 50 from quarterly_goals where title = 'Ship the network'), 'team goal follows');
select pg_temp.act_as(:ana);
update tasks set status = 'completed' where title = 'Ana: build search';
reset role;
select pg_temp.check((select status = 'completed' from milestones where title = 'Booking flow'), 'a member''s completion finishes the team milestone');

-- 6. Scores: owner reads members' snapshots, members don't read each other's --
select pg_temp.act_as(:ana);
insert into daily_scores (date, score, completed_tasks, total_tasks) values ('2026-09-28', 90, 1, 1);
reset role;
select pg_temp.act_as(:ben);
select pg_temp.check((select count(*) from daily_scores) = 0, 'members cannot see each other''s scores');
reset role;
select pg_temp.act_as(:owner);
select pg_temp.check((select count(*) from daily_scores) = 1, 'the owner sees members'' scores');
-- The owner removes Ben; Ben's tasks leave the owner's view.
delete from team_members where user_id = '33333333-0000-0000-0000-000000000003';
select pg_temp.check((select count(*) from tasks where user_id = '33333333-0000-0000-0000-000000000003') = 0, 'removed members'' tasks are no longer visible');
reset role;

-- 7. Names and "Greet me as" ---------------------------------------------
select pg_temp.act_as(:owner);
insert into team_invites (team_id, email, invited_by) select team_id, 'cara@example.com', :owner from team_members where user_id = :owner;
insert into team_invites (team_id, email, invited_by) select team_id, 'dan@example.com', :owner from team_members where user_id = :owner;
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('44444444-0000-0000-0000-000000000004', 'cara@example.com', '{"name":"  Cara Lee ","greeting":"ms"}');
insert into auth.users (id, email, raw_user_meta_data) values ('55555555-0000-0000-0000-000000000005', 'dan@example.com', '{"name":"","greeting":"queen"}');
select pg_temp.check((select name = 'Cara Lee' and greeting = 'ms' from profiles where email = 'cara@example.com'), 'sign-up stores the chosen name and greeting');
select pg_temp.check((select name = 'dan' and greeting is null from profiles where email = 'dan@example.com'), 'a blank name falls back to the email name; an unknown greeting is ignored');
select pg_temp.check((select greeting is null from profiles where id = :ana), 'accounts without a choice have no greeting yet (the app asks)');
select pg_temp.act_as(:ana);
update profiles set name = 'Ana Silva', greeting = 'dr' where id = auth.uid();
update profiles set greeting = 'mr' where email = 'cara@example.com';
do $$ begin
  update profiles set greeting = 'queen' where id = auth.uid();
  raise exception 'FAILED: invalid greeting saved';
exception when check_violation then raise notice 'ok - only the listed greetings are allowed';
end $$;
reset role;
select pg_temp.check((select name = 'Ana Silva' and greeting = 'dr' from profiles where id = :ana), 'each person sets their own name and greeting');
select pg_temp.check((select greeting = 'ms' from profiles where email = 'cara@example.com'), 'members cannot change someone else''s greeting');
select pg_temp.act_as(:owner);
select pg_temp.check((select greeting from profiles where id = :ana) = 'dr', 'the owner sees each member''s name and greeting');
reset role;

-- 8. Removing a member completely ----------------------------------------
-- Cara (a member) has a task on the team milestone, a score and a token.
select pg_temp.act_as('44444444-0000-0000-0000-000000000004');
reset role; -- an older task of Cara's (colleagues can't add tasks now)
insert into tasks (title, date, milestone_id, status) select 'Cara task', '2026-09-28', id, 'completed' from milestones where title = 'Booking flow';
select pg_temp.act_as('44444444-0000-0000-0000-000000000004');
insert into daily_scores (date, score, completed_tasks, total_tasks) values ('2026-09-28', 100, 1, 1);
reset role;
select pg_temp.act_as(:owner);
insert into tasks (title, date, user_id) values ('Assigned to Cara', '2026-09-29', '44444444-0000-0000-0000-000000000004');
insert into team_invites (team_id, email, invited_by) select team_id, 'cara@example.com', :owner from team_members where user_id = :owner;
reset role;
select target as before_target from milestones where title = 'Booking flow' \gset

select pg_temp.act_as(:ana);
do $$ begin
  perform remove_member_completely('44444444-0000-0000-0000-000000000004');
  raise exception 'FAILED: a member removed someone';
exception when insufficient_privilege then raise notice 'ok - members cannot remove people';
end $$;
reset role;
select pg_temp.act_as(:owner);
do $$ begin
  perform remove_member_completely(auth.uid());
  raise exception 'FAILED: owner removed themselves';
exception when insufficient_privilege then raise notice 'ok - the owner cannot remove themselves';
end $$;
select remove_member_completely('44444444-0000-0000-0000-000000000004');
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = '44444444-0000-0000-0000-000000000004'), 'the account is deleted (they can''t sign in)');
select pg_temp.check(not exists (select 1 from profiles where id = '44444444-0000-0000-0000-000000000004')
  and not exists (select 1 from tasks where user_id = '44444444-0000-0000-0000-000000000004')
  and not exists (select 1 from daily_scores where user_id = '44444444-0000-0000-0000-000000000004')
  and not exists (select 1 from team_members where user_id = '44444444-0000-0000-0000-000000000004'), 'their tasks, scores, profile and membership are deleted');
select pg_temp.check((select target from milestones where title = 'Booking flow') = :before_target - 1, 'team milestone progress is recalculated without them');
select pg_temp.check((select count(*) from team_invites where email = 'cara@example.com' and accepted_at is null and revoked_at is null) = 0, 'open invitations for their email are cancelled');
select pg_temp.check(exists (select 1 from profiles where id = :ana), 'other members are untouched');
do $$ begin
  insert into auth.users (id, email) values ('66666666-0000-0000-0000-000000000006', 'cara@example.com');
  raise exception 'FAILED: removed member signed up again uninvited';
exception when insufficient_privilege then raise notice 'ok - they can''t sign up again unless invited';
end $$;
select pg_temp.act_as(:owner);
do $$ begin
  perform remove_member_completely('44444444-0000-0000-0000-000000000004');
  raise exception 'FAILED: removing a missing person succeeded';
exception when insufficient_privilege then raise notice 'ok - removing someone not on the team is refused';
end $$;
reset role;
select pg_temp.act_as('');
do $$ begin
  perform remove_member_completely('22222222-0000-0000-0000-000000000002');
  raise exception 'FAILED';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot remove anyone';
end $$;
reset role;

-- 9. Projects: the team reads them, only the owner changes them -----------
select pg_temp.act_as(:owner);
insert into projects (team_id, name, code, status, facts, links, checklist, position)
  select team_id, 'Guxo Flights', 'FLT', 'good', '["First case study drafted"]', '{"web":"https://example.com"}',
         '[{"id":"t1","text":"Navigation","done":true}]', 0 from team_members where user_id = auth.uid();
insert into projects (team_id, name, position) select team_id, 'Gexi', 1 from team_members where user_id = auth.uid();
update projects set stage = 'Building' where name = 'Gexi';
reset role;
select pg_temp.check((select stage from projects where name = 'Gexi') = 'Building', 'the owner adds and edits projects');

select pg_temp.act_as(:ana);
select pg_temp.check((select count(*) from projects) = 2, 'members see the team''s projects');
update projects set name = 'Hacked' where name = 'Gexi';
delete from projects;
do $$ begin
  insert into projects (team_id, name) select team_id, 'Member project' from team_members where user_id = auth.uid();
  raise exception 'FAILED: member added a project';
exception when insufficient_privilege then raise notice 'ok - members cannot add projects';
end $$;
reset role;
select pg_temp.check((select count(*) from projects) = 2 and not exists (select 1 from projects where name = 'Hacked'), 'members cannot edit or delete projects');

do $$ begin
  insert into projects (team_id, name, status) select id, 'Bad', 'great' from teams limit 1;
  raise exception 'FAILED: bad status accepted';
exception when check_violation then raise notice 'ok - only good / warn / idle statuses';
end $$;

select pg_temp.act_as('');
select pg_temp.check((select count(*) from projects) = 0, 'signed-out visitors see no projects');
reset role;
select pg_temp.act_as(:owner);
delete from projects where name = 'Gexi';
reset role;
select pg_temp.check((select count(*) from projects) = 1, 'the owner deletes projects');

-- 10. Files for finished tasks ---------------------------------------------
select pg_temp.act_as(:owner);
insert into tasks (title, date, user_id) values ('Design the payment screen', '2026-10-01', :ana);
insert into tasks (title, date) values ('Owner own task', '2026-10-01');
reset role;
select id as pay_task from tasks where title = 'Design the payment screen' \gset
select id as own_task from tasks where title = 'Owner own task' \gset

select pg_temp.act_as(:ana);
do $$ begin
  update tasks set status = 'completed' where title = 'Design the payment screen';
  raise exception 'FAILED: finished without a file';
exception when check_violation then raise notice 'ok - an assigned task needs a file before it can be finished';
end $$;
-- Upload into her own folder, list it, then finish.
insert into storage.objects (bucket_id, name) values ('task-files', :ana || '/' || :'pay_task' || '/a1-screen.png');
insert into task_files (task_id, path, name, size, mime) values (:'pay_task', :ana || '/' || :'pay_task' || '/a1-screen.png', 'screen.png', 1200, 'image/png');
update tasks set status = 'completed' where title = 'Design the payment screen';
select pg_temp.check((select status from tasks where title = 'Design the payment screen') = 'completed', 'with a file attached, the task can be finished');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('task-files', '11111111-0000-0000-0000-000000000001/x/evil.png');
  raise exception 'FAILED: uploaded into the owner''s folder';
exception when insufficient_privilege then raise notice 'ok - people can only upload into their own folder';
end $$;
reset role;
select pg_temp.act_as(:ana);
do $$ begin
  insert into task_files (task_id, path, name) values ('00000000-0000-0000-0000-000000000000', '22222222-0000-0000-0000-000000000002/x/y.png', 'y.png');
  raise exception 'FAILED: file row for someone else''s task';
exception when insufficient_privilege or foreign_key_violation then raise notice 'ok - files can only be listed on your own tasks';
end $$;
reset role;

select pg_temp.act_as(:owner);
select pg_temp.check((select count(*) from task_files where task_id = :'pay_task') = 1, 'the owner sees the member''s files');
select pg_temp.check((select count(*) from storage.objects where bucket_id = 'task-files') = 1, 'the owner can open the member''s file');
-- The owner's own tasks don't need files.
update tasks set status = 'completed' where id = :'own_task';
select pg_temp.check((select status from tasks where id = :'own_task') = 'completed', 'your own tasks need no file');
reset role;
-- Ben (another member) sees none of it.
insert into team_invites (team_id, email) select team_id, 'ben2@example.com' from team_members where user_id = :owner;
insert into auth.users (id, email) values ('77777777-0000-0000-0000-000000000007', 'ben2@example.com');
select pg_temp.act_as('77777777-0000-0000-0000-000000000007');
select pg_temp.check((select count(*) from task_files) = 0 and (select count(*) from storage.objects) = 0, 'other members can''t see anyone''s files');
reset role;
select pg_temp.act_as(:owner);
delete from storage.objects where name like :ana || '/%';
delete from task_files where user_id = :ana;
reset role;
select pg_temp.check((select count(*) from storage.objects) = 0 and (select count(*) from task_files where user_id = :ana) = 0, 'the owner can delete a member''s files');
