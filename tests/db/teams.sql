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
insert into tasks (title, milestone_id) select 'Ana: build search', id from milestones where title = 'Booking flow';
insert into tasks (title) values ('Ana: personal errand');
select pg_temp.check((select assigned_by is null from tasks where title = 'Ana: build search'), 'own tasks are not marked assigned');
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
