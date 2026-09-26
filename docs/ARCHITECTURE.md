# Architecture

This document covers Phase 1 (what the repository contained before this work)
and Phase 2 (the database design), plus the decisions behind them.

## Phase 1: what was already here

| Item | Finding |
| --- | --- |
| Framework | None. Plain HTML, CSS and ES5-style JavaScript in one file, no build step, no dependencies. |
| Files | `index.html` (about 2,700 lines: roughly 1,000 of CSS, 50 of markup, 1,600 of JS), `tools/set-password.mjs`, `README.md`. |
| Hosting | Published as a Claude artifact and viewable as a static page (e.g. GitHub Pages). |
| Styling | Dark-only theme built on CSS custom properties (`--bg`, `--surface`, `--accent`, `--good`, `--orange`, `--red`…), IBM Plex Sans/Mono and Big Shoulders Display from Google Fonts, 12px-radius cards, two-column grid at ≥1200px and one column below. |
| Components | Password gate, Log out button, greeting with journey counter, quote of the day (365 quotes, typed animation), **Your score** card (four animated rings: Today, Week, Month, Quarter across two pages), **Today's checklist**, **Daily report** (day-by-day with prev/next), **Activity** heatmap (GitHub style, 53 weeks, tooltips), countdown to Sep 23 2027, app chips (Guxo Flights, Guxo, Gexi) with details and checklists, **Objective** roadmap (four quarters with checklists). |
| Current scoring | A day is "active" only when its checklist exists and every item is done. Week = active days ÷ 5; month = ÷ 20; quarter = ÷ 20 × months. Today = share of today's checklist done. |
| Data storage | Hard-coded `FALLBACK_*` snapshots in the page, replaced at runtime by the Claude artifact database (`window.claude.use("db")`) when the page is opened inside claude.ai. Outside claude.ai nothing persists, and edits made there are lost on reload. |
| Security | The password gate compares a SHA-256 hash in the browser. It hides the page but is not access control: all data is in the page source. |

What that means for the new requirements:

* There is no real persistence outside claude.ai, and nothing works across devices, which the backup requirement needs.
* Tasks are just `{id, text, done}`. There are no dates, priorities, status, time or notes.
* The password gate can't protect data held in a database.
* Scoring only counts days where every task is done. It is transparent but narrow.

## Recommendation

1. **Keep the existing page and extend it rather than rebuild it.** `index.html` keeps
   every card, animation and the legacy data path. New features load from
   separate modules (`app/`) and stylesheet (`app/app.css`) that reuse the same
   design tokens.
2. **No framework, no bundler.** The project is vanilla JS, and adding React/Vite
   would amount to a rewrite. The new code is modern ES modules the browser loads
   directly. The only build step writes `config.js` (the public Supabase URL
   and anon key) from environment variables and copies files to `dist/`.
3. **Supabase** (Postgres + Auth + Row Level Security) for storage and login.
4. **Three run modes, chosen automatically:**
   * *Supabase mode*: `config.js` exists with a Supabase URL. Supabase Auth
     replaces the password gate, and all data comes from the database.
   * *Legacy mode*: no config, e.g. inside claude.ai or GitHub Pages. The page
     behaves exactly as before.
   * *Demo mode* (`?demo=1`): an in-memory sample dataset for trying the UI and
     for automated tests. Nothing is saved.
5. **The existing cards are fed from the database in Supabase mode.** Today's
   checklist, heatmap, greeting and daily report read real tasks, and the four
   score rings show the new daily/weekly/monthly/quarterly scores.
6. **One scoring implementation** (`app/core/scoring.js`), shared by the browser
   and the server API, so Claude sees exactly the numbers you see.
7. **A token-protected read API for Claude** (`/api/v1/*` on Vercel). It never
   uses the service-role key: it passes a personal access token to
   `SECURITY DEFINER` database functions that resolve the token to one user
   and return only that user's rows.

## Phase 2: database design

### Changes from the requested schema (and why)

| Requested | Implemented | Reason |
| --- | --- | --- |
| `users` table with name/email | `profiles` (1:1 with Supabase's `auth.users`) | Supabase Auth owns emails and passwords. `profiles` holds name, email copy and timezone, and is created automatically on sign-up. |
| Task `status` includes *Overdue* | Stored: `not_started`, `in_progress`, `completed`, `cancelled`. **Overdue is derived** (`due_date` before today and not completed/cancelled). | A stored "overdue" goes stale the moment a date passes, so no job has to flip it and it can never be wrong. It's exposed as `effective_status` in the `task_overview` view and in the app/API. |
| (none) | `tasks.milestone_id` | Milestones need related tasks, and milestone completion is calculated from them. |
| (none) | `milestones.goal_id`, `milestones.start_date`, `progress_mode` | Links milestones to quarterly goals. `start_date` was requested for milestones. `progress_mode` chooses automatic (from tasks) or manual progress. |
| (none) | `quarterly_goals.progress_mode` | A goal can track a manual number or the average of its milestones. |
| (none) | `daily_scores.breakdown`, `weekly_scores.breakdown` (jsonb) | Stores how each score was calculated, so it stays explainable later. |
| (none) | `user_settings` | Scoring weights and targets, editable in Settings. |
| (none) | `api_tokens` | Hashed personal access tokens for the Claude API layer. |

Cross-table links use composite foreign keys (`(milestone_id, user_id)` →
`milestones(id, user_id)`). A task can therefore never point at another user's
milestone, even though foreign-key checks bypass RLS.

### Tables and relationships

```
auth.users (Supabase)
    │ 1:1 (trigger creates on sign-up)
    ▼
profiles ──1:1── user_settings
    │
    ├──< quarterly_goals (quarter, year)
    │        │ 1:n (goal_id, optional)
    │        ▼
    ├──< milestones
    │        │ 1:n (milestone_id, optional)
    │        ▼
    ├──< tasks
    ├──< daily_scores   (unique user_id+date)
    ├──< weekly_scores  (unique user_id+week_start)
    └──< api_tokens     (sha256 hash only)
```

| Table | Key columns |
| --- | --- |
| `profiles` | id (= auth user id), name, email, timezone, created_at |
| `user_settings` | user_id, scoring (jsonb overrides), legacy_imported_at, updated_at |
| `tasks` | id, user_id, milestone_id, title, description, date, due_date, priority, status, category, estimated_minutes, actual_minutes, completion_percentage, notes, created_at, updated_at, completed_at |
| `daily_scores` | id, user_id, date, score, completed_tasks, total_tasks, breakdown, notes, updated_at |
| `weekly_scores` | id, user_id, week_start, week_end, score, completed_tasks, total_tasks, breakdown, notes, updated_at |
| `quarterly_goals` | id, user_id, title, description, quarter, year, deadline, target, current_progress, percentage_complete, progress_mode, status, notes, created_at, updated_at |
| `milestones` | id, user_id, goal_id, title, description, category, start_date, deadline, target, current_progress, percentage_complete, progress_mode, status, priority, notes, created_at, updated_at, completed_at |
| `api_tokens` | id, user_id, name, token_hash, token_prefix, scopes, created_at, last_used_at, expires_at, revoked_at |

### Automatic behaviour in the database

* `updated_at` is maintained on every table.
* Tasks: setting status to `completed` stamps `completed_at` and sets 100%.
  Leaving `completed` clears `completed_at`.
* Milestones in `tasks` mode: `target` = related tasks (excluding cancelled),
  `current_progress` = completed ones, and `percentage_complete` is recalculated
  whenever a related task changes. In `manual` mode, % = current ÷ target.
  Reaching 100% marks the milestone completed; any progress moves
  `not_started` to `in_progress`.
* Quarterly goals in `milestones` mode average their milestones' percentages.
  In `manual` mode, % = current ÷ target.

### Security model

* RLS is enabled on every table. Every policy is `user_id = auth.uid()` for
  select, insert, update and delete, and `anon` has no table privileges.
* The browser only ever has the public anon key. The service-role key is not
  used anywhere in this project.
* Claude/API access goes through personal access tokens: 256-bit random,
  shown once, stored as SHA-256. Scopes are `read` and optionally `write`
  (create tasks only). They can be revoked and have optional expiry. The
  database functions `api_snapshot` / `api_create_task` check the token and
  scope and return only that user's data.

### Scoring

Documented in [SCORING.md](SCORING.md) and shown in the app under
**Settings → Scoring formula**.

## Team portal (added later)

Migration `20260926200000_teams.sql` adds `teams`, `team_members` (role
`owner` or `member`) and `team_invites`, plus `team_id` on goals and
milestones and `assigned_by` on tasks.

| Who | Sees | Can change |
| --- | --- | --- |
| Member | own tasks, scores, learning logs; team goals and milestones; teammates' names | own tasks and notes |
| Owner | everything a member sees, plus every member's tasks, scores and learning logs; open invitations | team goals/milestones, members' tasks (assigning), invitations, members, team name |
| Signed-out visitor | nothing | nothing |

* Sign-up is by invitation: a trigger on `auth.users` refuses any email
  that isn't invited, except the very first account, which becomes the owner.
* Membership checks are small `SECURITY DEFINER` helpers
  (`private.is_member`, `is_owner`, `owns_member`, `shares_team`) used by the
  RLS policies.
* A task may link its person's own milestone or a team milestone of their
  team (trigger check). Milestone and goal progress count everyone's tasks.
* All of it is covered by `tests/db/teams.sql` and `tests/integration/team.mjs`.

## Names and greetings (added later)

Migration `20260927000000_greeting.sql` adds `profiles.greeting`: the title
each person picks for themselves (`mr`, `ms`, `mrs`, `dr` or `none`). It's a
greeting preference, not gender, so nobody is asked for or guessed at.

* Sign-up asks for a name and "Greet me as"; both are stored by the sign-up trigger.
* Accounts without a greeting (created before this) are asked once after sign-in.
* The heading, Team page, "Assigned by" labels and PDFs use the name with the
  title (`app/core/people.js`), never the email address.
* Each person changes their own in Settings → Profile; the owner can read them
  but not change them (the existing profile policies).

## Removing a member (added later)

Migration `20260928000000_remove_member.sql` adds
`public.remove_member_completely(member)`. The owner's **Remove from team**
button calls it after they type the person's name. It checks that the caller
owns the member's team, cancels open invitations for their email, and deletes
their auth account, which cascades to their profile, tasks, scores, learning
logs, notes, settings, personal milestones/goals, tokens and membership. Team
milestone progress is recalculated by the task triggers. It can't be undone,
and they can only return if invited again. Covered by `tests/db/teams.sql`.
