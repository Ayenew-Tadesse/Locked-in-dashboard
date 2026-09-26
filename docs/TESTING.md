# Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit | `npm test` | Dates, overdue logic, filters, the scoring formula (including the worked example in SCORING.md), weekly/quarterly maths, milestone pace, warnings, planning, and every API endpoint (with a mocked database) |
| Database | `npm run test:db` (needs PostgreSQL 15+) | The migrations on a real Postgres, and the team portal (invitation-only sign-up, roles, who sees what, assigning, shared progress): sign-up trigger, task completion stamps, derived overdue, automatic milestone/goal progress, **Row Level Security between two users**, signed-out access, cross-user foreign keys, API token scopes/revocation/expiry, cascade delete |
| Browser | `npm run test:e2e` (needs Playwright + Chromium) | Demo mode in Chromium: add/edit/complete/delete tasks with every field, status changes, overdue detection and filtering, milestones auto-completing, calendar, week navigation, quarter goals, search/filters, scoring settings, API token shown once, no sideways scrolling at phone width (375px) on every page, and the original dashboard unchanged when no database is configured |
| Integration | `node tests/integration/store-api.mjs`, `node tests/integration/team.mjs` | The app's Supabase data layer and the Claude API against the real schema through PostgREST (the server Supabase uses): persistence, triggers, notes, settings, the history import, RLS, and API tokens end to end |

## Database tests

```bash
tests/db/run.sh   # creates a throwaway database "lockedin_test"
```

`tests/db/supabase-stub.sql` recreates the parts of Supabase the migration
relies on (`auth.users`, `auth.uid()`, the `anon` and `authenticated` roles).

## Integration test setup

```bash
tests/db/run.sh
psql -d lockedin_test -c "create role authenticator login password 'pw' noinherit;
  grant anon, authenticated to authenticator;
  insert into auth.users (id,email,raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','me@example.com', jsonb_build_object('name','Me'));"
# Sign-up is by invitation: for store-api.mjs, invite and add the second user.
psql -d lockedin_test -c "insert into team_invites (team_id, email) select id, 'other@example.com' from teams;
  insert into auth.users (id,email) values ('22222222-2222-2222-2222-222222222222','other@example.com');"
# PostgREST v12 config: db-uri = postgres://authenticator:pw@localhost:5432/lockedin_test,
# db-anon-role = anon, server-port = 3010,
# jwt-secret = a-very-long-test-secret-for-local-postgrest-only-000
postgrest postgrest.conf &
npm i --no-save @supabase/supabase-js
node tests/integration/store-api.mjs
# team.mjs needs a fresh database with only me@example.com signed up:
node tests/integration/team.mjs
```
