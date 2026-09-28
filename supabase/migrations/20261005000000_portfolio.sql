-- Portfolio for hiring managers.
--
-- Run after 20261004000000_team_chat.sql (the Supabase SQL editor: paste and Run).
--
-- You create private share links (like API tokens: only a SHA-256 hash of
-- the link's secret is stored). Anyone with a link can open portfolio.html,
-- which calls public.portfolio_view(secret). That function is the only way
-- in: it returns a prepared summary of YOUR work (activity, projects,
-- milestones, plan, and learning logs from finished tasks), following the
-- choices saved in user_settings.preferences.portfolio. It never returns
-- files, private notes, scores per day or anything about colleagues.
-- Links can expire or be revoked; each records how often it was opened.

create table public.portfolio_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (char_length(token_prefix) <= 16),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  views integer not null default 0
);
create index portfolio_links_user on public.portfolio_links (user_id);

alter table public.portfolio_links enable row level security;
create policy "own links: read" on public.portfolio_links for select to authenticated using (user_id = (select auth.uid()));
create policy "own links: add" on public.portfolio_links for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own links: change" on public.portfolio_links for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own links: delete" on public.portfolio_links for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.portfolio_links from anon;
grant select, insert, delete on public.portfolio_links to authenticated;
-- The hash is set once; afterwards only the name, expiry and revocation change.
grant update (name, expires_at, revoked_at) on public.portfolio_links to authenticated;

-- The summary a hiring manager sees. Callable without signing in, but only
-- with a valid, unexpired, unrevoked link secret.
create or replace function public.portfolio_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  link public.portfolio_links%rowtype;
  uid uuid;
  tz text;
  prefs jsonb;
  shows jsonb;
  cats text[];
  result jsonb;
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 200 then
    raise exception 'invalid link' using errcode = '28000';
  end if;
  select * into link from public.portfolio_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and revoked_at is null and (expires_at is null or expires_at > now());
  if link.id is null then
    raise exception 'invalid link' using errcode = '28000';
  end if;
  update public.portfolio_links set views = views + 1, last_viewed_at = now() where id = link.id;
  uid := link.user_id;

  select coalesce(nullif(p.timezone, ''), 'UTC') into tz from public.profiles p where p.id = uid;
  select coalesce(s.preferences -> 'portfolio', '{}'::jsonb) into prefs from public.user_settings s where s.user_id = uid;
  prefs := coalesce(prefs, '{}'::jsonb);
  shows := coalesce(prefs -> 'show', '{}'::jsonb);
  cats := array(select jsonb_array_elements_text(coalesce(prefs -> 'categories', '[]'::jsonb)));

  select jsonb_build_object(
    'generated_at', now(),
    'about', jsonb_build_object(
      'name', (select p.name from public.profiles p where p.id = uid),
      'headline', prefs ->> 'headline',
      'bio', prefs ->> 'bio',
      'approach', prefs ->> 'approach',
      'links', coalesce(prefs -> 'links', '{}'::jsonb)),
    'activity', case when coalesce((shows ->> 'activity')::boolean, true) then jsonb_build_object(
      'completed_total', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'),
      'completed_30', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'
                        and (t.completed_at at time zone tz)::date > (now() at time zone tz)::date - 30),
      'completed_90', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'
                        and (t.completed_at at time zone tz)::date > (now() at time zone tz)::date - 90),
      'minutes_total', (select coalesce(sum(t.actual_minutes), 0) from public.tasks t where t.user_id = uid and t.status = 'completed'),
      'today', (now() at time zone tz)::date,
      -- Finished tasks per day for the last 26 weeks (the heatmap).
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'done', n) order by d) from (
          select coalesce((t.completed_at at time zone tz)::date, t.date) d, count(*) n
            from public.tasks t
           where t.user_id = uid and t.status = 'completed'
             and coalesce((t.completed_at at time zone tz)::date, t.date) > (now() at time zone tz)::date - 182
           group by 1) x), '[]'::jsonb),
      'weeks', coalesce((select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'score', w.score) order by w.week_start) from (
          select week_start, score from public.weekly_scores where user_id = uid and score is not null
           order by week_start desc limit 12) w), '[]'::jsonb))
      else null end,
    'projects', case when coalesce((shows ->> 'projects')::boolean, true) then coalesce((
        select jsonb_agg(jsonb_build_object('name', pr.name, 'code', pr.code, 'description', to_jsonb(pr) ->> 'description',
               'category', pr.category, 'stage', pr.stage, 'status', pr.status, 'links', pr.links, 'checklist', pr.checklist)
               order by pr.position, pr.created_at)
          from public.projects pr
         where exists (select 1 from public.team_members m where m.team_id = pr.team_id and m.user_id = uid and m.role = 'owner')), '[]'::jsonb)
      else null end,
    'milestones', case when coalesce((shows ->> 'milestones')::boolean, true) then coalesce((
        select jsonb_agg(jsonb_build_object('title', ms.title, 'description', ms.description, 'category', ms.category,
               'status', ms.status, 'pct', round(ms.percentage_complete), 'start_date', ms.start_date, 'deadline', ms.deadline,
               'completed_at', ms.completed_at) order by ms.deadline nulls last, ms.created_at)
          from public.milestones ms where ms.user_id = uid and ms.status <> 'cancelled'), '[]'::jsonb)
      else null end,
    'plan', case when coalesce((shows ->> 'plan')::boolean, true) then coalesce((
        select jsonb_agg(jsonb_build_object('title', g.title, 'quarter', g.quarter, 'year', g.year, 'status', g.status,
               'pct', round(g.percentage_complete)) order by g.year, g.quarter)
          from public.quarterly_goals g where g.user_id = uid and g.status <> 'cancelled'), '[]'::jsonb)
      else null end,
    -- How the work was done: recent finished tasks that have a learning log.
    'work', case when coalesce((shows ->> 'logs')::boolean, true) then coalesce((
        select jsonb_agg(w order by w ->> 'day' desc) from (
          select jsonb_build_object('title', t.title, 'category', t.category,
                 'day', coalesce((t.completed_at at time zone tz)::date, t.date),
                 'milestone', (select ms.title from public.milestones ms where ms.id = t.milestone_id),
                 'minutes', t.actual_minutes,
                 'changed', t.learning_changed, 'how', t.learning_how, 'solved', t.learning_solved) w
            from public.tasks t
           where t.user_id = uid and t.status = 'completed'
             and coalesce(t.learning_changed, t.learning_how, t.learning_solved) is not null
             and (cardinality(cats) = 0 or t.category = any (cats))
           order by t.completed_at desc nulls last
           limit 12) x), '[]'::jsonb)
      else null end
  ) into result;
  return result;
end $$;

revoke all on function public.portfolio_view(text) from public;
grant execute on function public.portfolio_view(text) to anon, authenticated;
