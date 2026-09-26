-- How each person is greeted ("Greet me as").
--
-- Run after 20260926200000_teams.sql (the Supabase SQL editor: paste and Run).
--
-- profiles.greeting: the title each person picks for themselves: mr, ms,
--   mrs, dr, or none (just their name). It's a greeting preference, not
--   gender. Empty means they haven't chosen yet, and the app asks once.
--   Teammates who can read a profile (the owner, and the person themselves)
--   see it; nothing else changes about who can read profiles.

alter table public.profiles
  add column greeting text check (greeting in ('mr', 'ms', 'mrs', 'dr', 'none'));

-- Sign-up stores the name and greeting chosen on the sign-up form. Same as
-- the version in 20260926200000_teams.sql, plus the greeting.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv public.team_invites%rowtype;
  new_team uuid;
  greet text := new.raw_user_meta_data ->> 'greeting';
begin
  if greet is not null and greet not in ('mr', 'ms', 'mrs', 'dr', 'none') then greet := null; end if;
  insert into public.profiles (id, name, email, greeting)
  values (new.id,
          left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 120),
          new.email, greet)
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;

  select * into inv from public.team_invites
   where email = lower(new.email) and accepted_at is null and revoked_at is null
   order by created_at desc limit 1;
  if found then
    insert into public.team_members (team_id, user_id, role) values (inv.team_id, new.id, inv.role)
      on conflict do nothing;
    update public.team_invites set accepted_at = now() where id = inv.id;
  elsif not exists (select 1 from public.teams) then
    insert into public.teams (name) values ('My team') returning id into new_team;
    insert into public.team_members (team_id, user_id, role) values (new_team, new.id, 'owner');
  end if;
  return new;
end $$;
