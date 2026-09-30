-- Let a personal token mark your tasks complete (for Claude).
-- Run after 20261008000000_portfolio_site.sql (the Supabase SQL editor: paste and Run).
--
-- Tokens get a third permission, 'complete': it can mark one of the token
-- owner's own open tasks complete, by its id or its exact title, and nothing
-- else (no reading, adding, editing or deleting). Called through Supabase's
-- REST API with the public key: POST /rest/v1/rpc/api_complete_task.

alter table public.api_tokens drop constraint if exists api_tokens_scopes_check;
alter table public.api_tokens add constraint api_tokens_scopes_check
  check (scopes <@ array['read', 'write', 'complete'] and cardinality(scopes) > 0);

create or replace function public.api_complete_task(p_token text, p_task_id uuid default null, p_title text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.resolve_token(p_token, 'complete');
  wanted text := lower(btrim(coalesce(p_title, '')));
  matches int;
  row public.tasks%rowtype;
begin
  if p_task_id is null and wanted = '' then
    raise exception 'give the task''s id or title' using errcode = '22023';
  end if;
  if p_task_id is not null then
    select * into row from public.tasks where id = p_task_id and user_id = uid;
  else
    select count(*) into matches from public.tasks
     where user_id = uid and lower(btrim(title)) = wanted and status not in ('completed', 'cancelled');
    if matches > 1 then
      raise exception 'more than one open task is called "%": use its id', btrim(p_title) using errcode = '22023';
    end if;
    select * into row from public.tasks
     where user_id = uid and lower(btrim(title)) = wanted
     order by (status in ('completed', 'cancelled')), updated_at desc limit 1;
  end if;
  if row.id is null then
    raise exception 'no task found' using errcode = 'P0002';
  end if;
  if row.status = 'completed' then
    return (to_jsonb(row) - 'user_id') || '{"already_completed": true}';
  end if;
  if row.status = 'cancelled' then
    raise exception 'that task was cancelled' using errcode = '22023';
  end if;
  -- Same rule as the app: a task someone assigned you needs a file first.
  if row.assigned_by is not null and row.assigned_by <> uid
     and not exists (select 1 from public.task_files f where f.task_id = row.id) then
    raise exception 'Attach at least one file before finishing a task you were assigned.' using errcode = '23514';
  end if;
  update public.tasks set status = 'completed' where id = row.id returning * into row;
  return to_jsonb(row) - 'user_id';
end $$;

revoke all on function public.api_complete_task(text, uuid, text) from public;
grant execute on function public.api_complete_task(text, uuid, text) to anon, authenticated;
