-- Access requests: someone who isn't invited can ask to join; the team owner
-- sees the request on the Team page and approves (an invitation is created)
-- or declines it.
-- Run after 20261010000000_api_complete_task_header.sql (the Supabase SQL editor: paste and Run).
--
-- Anyone, signed in or not, can send a request through request_access(), but
-- nobody except a team owner can read them. Abuse limits: one open request
-- per email, short fields, and at most 50 open requests at a time.

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text check (char_length(name) <= 80),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision text check (decision in ('approved', 'declined')),
  decided_by uuid references public.profiles (id) on delete set null
);
create unique index if not exists access_requests_open_email on public.access_requests (email) where decided_at is null;

alter table public.access_requests enable row level security;
-- Owners read them; changes go through decide_access_request() only. No
-- insert, update or delete policies: nobody writes the table directly.
drop policy if exists "owners read access requests" on public.access_requests;
create policy "owners read access requests" on public.access_requests for select to authenticated
  using (exists (select 1 from public.team_members where user_id = (select auth.uid()) and role = 'owner'));
revoke all on public.access_requests from anon;
grant select on public.access_requests to authenticated;

-- Ask for access. Returns 'requested', or 'invited' when the email already has
-- an open invitation (sign up straight away). Says 'requested' for an email
-- that already has an account too, without storing anything (no hints about
-- who has one).
create or replace function public.request_access(p_email text, p_name text default null, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  n text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  t text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_invites where email = e and accepted_at is null and revoked_at is null) then
    return 'invited';
  end if;
  if exists (select 1 from public.profiles where lower(email) = e) then
    return 'requested';
  end if;
  if exists (select 1 from public.access_requests where email = e and decided_at is null) then
    update public.access_requests set name = coalesce(n, name), note = coalesce(t, note) where email = e and decided_at is null;
    return 'requested';
  end if;
  if (select count(*) from public.access_requests where decided_at is null) >= 50 then
    raise exception 'Too many requests are waiting. Please try again later.' using errcode = '53400';
  end if;
  insert into public.access_requests (email, name, note) values (e, n, t);
  return 'requested';
end $$;

-- Owner: approve (invite them to your team, as a colleague) or decline.
create or replace function public.decide_access_request(p_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  team uuid;
  req public.access_requests%rowtype;
begin
  select team_id into team from public.team_members where user_id = me and role = 'owner' limit 1;
  if team is null then
    raise exception 'Only the team owner can answer access requests.' using errcode = '42501';
  end if;
  select * into req from public.access_requests where id = p_id and decided_at is null for update;
  if req.id is null then
    raise exception 'That request was already answered.' using errcode = 'P0002';
  end if;
  if p_approve and not exists (select 1 from public.team_invites where email = req.email and accepted_at is null and revoked_at is null) then
    insert into public.team_invites (team_id, email, invited_by) values (team, req.email, me);
  end if;
  update public.access_requests
     set decided_at = now(), decision = case when p_approve then 'approved' else 'declined' end, decided_by = me
   where id = req.id returning * into req;
  return to_jsonb(req);
end $$;

revoke all on function public.request_access(text, text, text) from public;
revoke all on function public.decide_access_request(uuid, boolean) from public;
grant execute on function public.request_access(text, text, text) to anon, authenticated;
grant execute on function public.decide_access_request(uuid, boolean) to authenticated;
