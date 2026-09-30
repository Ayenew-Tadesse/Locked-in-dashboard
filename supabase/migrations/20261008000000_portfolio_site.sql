-- Portfolio site: the structure of your GitHub portfolio in the dashboard.
--
-- Run after 20261007000000_team_admins.sql (the Supabase SQL editor: paste and Run).
--
-- 1. A storage folder for portfolio images (portrait, app screenshots): each
--    person uploads into their own folder; the images are public by address,
--    because they're meant to be seen on your portfolio. Task hand-in files
--    stay in their own private folder.
-- 2. public.portfolio_view also sends "site" (saved in
--    user_settings.preferences.portfolio.site): hero, stats, about, key
--    skills, contact and case studies, minus the sections you've switched off.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-media', 'portfolio-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "portfolio images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "portfolio images: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "portfolio images: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolio-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.portfolio_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  link public.portfolio_links%rowtype;
  uid uuid; tz text; prefs jsonb; shows jsonb; cats text[]; details jsonb; site jsonb; result jsonb;
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 200 then
    raise exception 'invalid link' using errcode = '28000';
  end if;
  select * into link from public.portfolio_links
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and revoked_at is null and (expires_at is null or expires_at > now());
  if link.id is null then raise exception 'invalid link' using errcode = '28000'; end if;
  update public.portfolio_links set views = views + 1, last_viewed_at = now() where id = link.id;
  uid := link.user_id;
  select coalesce(nullif(p.timezone, ''), 'UTC') into tz from public.profiles p where p.id = uid;
  select coalesce(s.preferences -> 'portfolio', '{}'::jsonb) into prefs from public.user_settings s where s.user_id = uid;
  prefs := coalesce(prefs, '{}'::jsonb);
  shows := coalesce(prefs -> 'show', '{}'::jsonb);
  cats := array(select jsonb_array_elements_text(coalesce(prefs -> 'categories', '[]'::jsonb)));
  details := case when jsonb_typeof(prefs -> 'details') = 'object' then prefs -> 'details' else '{}'::jsonb end;
  details := details - array_remove(array[
    case when coalesce((shows ->> 'highlights')::boolean, true) then null else 'highlights' end,
    case when coalesce((shows ->> 'experience')::boolean, true) then null else 'experience' end,
    case when coalesce((shows ->> 'skills')::boolean, true) then null else 'skills' end,
    case when coalesce((shows ->> 'skills')::boolean, true) then null else 'tools' end,
    case when coalesce((shows ->> 'skills')::boolean, true) then null else 'industries' end,
    case when coalesce((shows ->> 'process')::boolean, true) then null else 'process' end,
    case when coalesce((shows ->> 'process')::boolean, true) then null else 'methods' end,
    case when coalesce((shows ->> 'process')::boolean, true) then null else 'collaboration' end,
    case when coalesce((shows ->> 'process')::boolean, true) then null else 'different' end], null);
  -- Your portfolio site (hero, stats, about, key skills, contact, case studies),
  -- without the sections you've switched off.
  site := case when jsonb_typeof(prefs -> 'site') = 'object' then prefs -> 'site' else '{}'::jsonb end;
  site := site - array_remove(array[
    case when coalesce((shows ->> 'stats')::boolean, true) then null else 'stats' end,
    case when coalesce((shows ->> 'about')::boolean, true) then null else 'about' end,
    case when coalesce((shows ->> 'skillgroups')::boolean, true) then null else 'skills' end,
    case when coalesce((shows ->> 'contact')::boolean, true) then null else 'contact' end,
    case when coalesce((shows ->> 'cases')::boolean, true) then null else 'cases' end], null);
  select jsonb_build_object(
    'generated_at', now(),
    'site', site,
    'about', jsonb_build_object('name', (select p.name from public.profiles p where p.id = uid),
      'headline', prefs ->> 'headline', 'bio', prefs ->> 'bio', 'approach', prefs ->> 'approach',
      'links', coalesce(prefs -> 'links', '{}'::jsonb), 'details', details),
    'activity', case when coalesce((shows ->> 'activity')::boolean, true) then jsonb_build_object(
      'completed_total', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'),
      'completed_30', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'
                        and (t.completed_at at time zone tz)::date > (now() at time zone tz)::date - 30),
      'completed_90', (select count(*) from public.tasks t where t.user_id = uid and t.status = 'completed'
                        and (t.completed_at at time zone tz)::date > (now() at time zone tz)::date - 90),
      'minutes_total', (select coalesce(sum(t.actual_minutes), 0) from public.tasks t where t.user_id = uid and t.status = 'completed'),
      'today', (now() at time zone tz)::date,
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', d, 'done', n) order by d) from (
          select coalesce((t.completed_at at time zone tz)::date, t.date) d, count(*) n from public.tasks t
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
           order by t.completed_at desc nulls last limit 12) x), '[]'::jsonb)
      else null end
  ) into result;
  return result;
end $$;

revoke all on function public.portfolio_view(text) from public;
grant execute on function public.portfolio_view(text) to anon, authenticated;
-- Let the API see the new version straight away.
notify pgrst, 'reload schema';
