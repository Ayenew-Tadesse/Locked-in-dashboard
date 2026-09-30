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

## Projects (added later)

Migration `20260929000000_projects.sql` adds `projects` (per team): name, code,
category, stage, status (`good` / `warn` / `idle`), facts (list), links
(`web`, `repo`, `app`), checklist (list of `{id, text, done, deadline}`) and
position. Everyone on the team reads them; only the owner inserts, updates
and deletes (RLS with `private.is_member` / `private.is_owner`).

* The Overview shows small project cards under the Activity card, three in
  a row (name, description, checklist progress %), replacing the original
  app buttons. Tapping one opens its full details; the owner can tick
  checklist items there. `description` comes from
  `20260930000000_project_description.sql` (existing rows start with their
  category); before it's run, saves skip the description.
* The owner's **Projects** page (☰ menu) adds, edits, reorders and deletes them.
* The first time the owner opens the app with the table in place, the
  original dashboard's apps and their checklists are copied in once
  (`user_settings.preferences.projectsSeeded`), so deleting them all later
  doesn't bring them back.
* Before the migration is run, the original app buttons stay and the
  Projects page explains the update that's needed.

## Files on finished tasks (added later)

Migration `20261001000000_task_files.sql` adds a private Storage bucket,
`task-files` (10 MB per file), and `task_files` listing each file against its
task. Files live at `<user id>/<task id>/<file>`.

* A colleague finishing a task the owner assigned gets **Hand in**: at least
  one file plus the learning log. The database refuses to complete such a
  task without a file (`private.require_task_file`); the owner completing it
  isn't held to this, and people's own tasks need no files.
* Storage and `task_files` policies: people upload only into their own
  folder and only for their own tasks; they and their team owner can read
  them; other members can't. Links to open files are signed and expire.
* Files show on the task, on the owner's Team page, and in both Daily report PDFs.
* Removing a member deletes their files too.

## Only the owner adds tasks (added later)

Migration `20261002000000_owner_adds_tasks.sql` replaces the tasks insert
policy: a colleague (a team `member`, `private.is_colleague()`) can't create
tasks; the owner adds their own and assigns tasks to members; someone not on
a team adds their own. Colleagues still update their tasks (progress,
status, files, learning log).

* The app hides every way to add a task for colleagues (`state.canAddTasks`):
  the New task tile, + New task, quick-add boxes, + Task on milestones and the
  old checklist's add box.
* Colleagues don't see the year countdown on the Activity card; instead each
  open task the owner assigned them with a deadline shows a live countdown to
  the end of that day (`countdownText`).
* Colleagues get the Overview's Tasks card too, read-only: their own tasks as
  Available (not started or in progress) and Completed, with the Day / Week /
  Month / Quarter switch but no tick, status, delete, edit or Daily report.

## Team card on the Overview (added later)

Under the Tasks card, the owner sees a Team card (`app/views/team-card.js`):
everyone on the team with their initials, display name and role (Owner /
Colleague), owner first. Tapping a person opens their Team page. Colleagues
don't see it. On phones it sits between Tasks and Activity.

## One task for several people (added later)

The owner can tick several people in **Assign to**; each gets their own copy
of the task (own progress, files, learning log). Migration
`20261003000000_task_groups.sql` adds `tasks.group_id`, which links the
copies. Tasks → **Assigned by me** lists every task the owner pushed, one
card per assignment with each person's status: **+ Add person**, **Edit**
(shared fields on every copy; progress stays), **Revoke** (one person's
copy) and **Delete task** (every copy). Before the migration, copies are
saved without the link and each is managed on its own.

## Team chat (added later)

Migration `20261004000000_team_chat.sql` adds `messages` (team, sender,
optional recipient, body). A message without a recipient is the team's
group chat; with one, it's a one-to-one chat. RLS: team members read the
group chat and their own direct messages, write only as themselves to their
own team (and only to someone on it), and delete only their own messages.
The table is added to the `supabase_realtime` publication so new messages
arrive live (Realtime applies the same policies).

`app/ui/chat.js` pins a **Team chat** bar to the bottom of the screen (on
wider screens, docked bottom right). Tap it or drag it up for the tray;
drag down or Esc closes it. Group first, then a chip per person, each with
its unread count; the bar shows the total. What you've read is remembered
per device (localStorage). Messages don't redraw the page: state emits
`li:messages` and only the chat repaints. Hidden until there's a colleague,
and before the migration is run.

## Portfolio for hiring managers (added later)

`portfolio.html` is a separate page a hiring manager opens from a private
link, `portfolio.html#t=<secret>` (the secret stays after `#`, so it never
reaches a server log). It calls `public.portfolio_view(secret)` from
migration `20261005000000_portfolio.sql`: a SECURITY DEFINER function that
checks the link (SHA-256 hash, not revoked, not expired), counts the view and
returns a prepared summary of the owner's own work only: about (name,
headline, bio, approach, contact links), activity (finished tasks, 30/90 days,
hours, a 26-week map, weekly scores), projects, milestones, quarterly goals
and recent finished tasks with a learning log. It never returns files,
private notes or colleagues' data. `portfolio_links` rows are the owner's
only (RLS); anon has no table access.

The owner manages it on ☰ → Portfolio (`app/views/portfolio.js`): headline,
bio, approach, links, which sections show and which task categories feed
"How I work" (saved in `user_settings.preferences.portfolio`), share links
(create: shown once; switch off; views and last opened), and a live preview.
`app/core/portfolio.js` builds the same summary in the browser for the
preview and `?demo=1`; `app/portfolio/render.js` draws it for both.

Profile details (`preferences.portfolio.details`, migration
`20261006000000_portfolio_details.sql`): title, years, location, open to
(remote/hybrid/relocation), roles wanted, experience (role, company, years,
summary), highlights, industries, process steps, research methods, working
with developers and product, what I bring, skills and tools. The page shows
them first: highlights and experience, then projects, how I work, skills,
activity, milestones and the plan. Fields of switched-off sections are
removed inside `portfolio_view`, so they never reach a visitor.

## Portfolio site layout (added later)

`preferences.portfolio.site` holds a full portfolio website: hero, portrait,
social links, resume, stats, About paragraphs, skill groups, contact rows and
case studies (overview, process, problem, personas, competitive table,
insight, IA, user flow, solution, UI style guide, outcome, screenshots). On
☰ → Portfolio, **Import from GitHub** (`app/portfolio/import.js`) reads the
`index.html` of a GitHub portfolio repo, parses it with DOMParser and uploads
its embedded images to the public `portfolio-media` bucket (own folder only,
migration `20261008000000_portfolio_site.sql`). Everything is editable in
`app/views/portfolio-site.js`. When a site exists, `app/portfolio/site.js`
draws it (home page plus one page per case, `#t=…&case=<id>`) and mixes in
the live dashboard sections; case studies linked to a project show its live
progress. `portfolio_view` removes site sections that are switched off.

**One editor card.** `app/views/portfolio-site.js` draws "Edit portfolio":
sections you open and close (introduction with open-to and roles wanted,
numbers, about, highlights and experience, key skills, case studies, how I
work, contact and social, sections to show) and one Save (also in the top
bar, marked "Save •" while there are unsaved changes). `site` is the source;
`draftSite()` fills it from the older fields the first time (title → role,
headline → intro, bio → about, years → a stat, skills/tools → skill groups,
links and social → one contact list), and every save writes those older
fields back in step. Case studies are cards: tap to edit (delete is in the
editor), drag onto another to swap (mouse anywhere on the card, touch by the
grip, Ctrl/⌘ + arrow keys); they save straight away.

**Plan-year quarters.** `app/core/quarters.js`: with a plan year
(`preferences.year` = { start, end }, set in Settings → My year; owners who
loaded the year plan default to `PLAN_YEAR`, Sep 22, 2026 → Sep 23, 2027) Q1
runs from the start to the end of the calendar quarter that's mostly inside
it, Q2–Q4 follow the calendar and Q4 ends on the last day; the next year
starts the day after. `"calendar"` (or no plan) keeps calendar quarters.
`state.year` / `state.quarterAt()` drive the Tasks card's Quarter tab, the
Quarter page and goal form, the quarter ring and score (`scoreQuarterOf`),
analytics, warnings, milestone labels and the portfolio's plan (the year is
copied into `site.year`). Goals keep their stored calendar quarter: a goal
belongs to the plan quarter containing its calendar quarter's first day
(`goalInQuarter`), and new goals are stored under the calendar quarter of the
plan quarter's last day (`storageQuarter`), so no data changes. The Objective
card (`LockedInLegacy.objective`) now shows the plan year's four quarters,
each with its goals' milestones (ticked when completed, linked to the
milestone), instead of the original fixed roadmap checklist.

**GitHub commits on the Activity map.** `app/github.js` asks GitHub's
public commit search (`app/core/github.js`, keyless, public repos only) for
the last 90 days of `author:<username>` commits when the dashboard opens and
every 10 minutes (cached 10 minutes in localStorage). The username is set in
Settings → GitHub (empty switches it off); by default the owner uses this
site's `<user>.github.io` account. `feedLegacy()` adds the commits to that
day's contributions (listed first, by repo) and passes `commitDays`; the
Activity map treats a day with commits as active (green, streak, daily
report status), like a finished checklist. Private repos would need a
server-side token.

**Resume.** ☰ → Resume (`app/views/resume.js`) edits
`preferences.portfolio.site.cv` section by section (header and contact links,
summary, core skills, selected projects, front-end development, experience,
education, certification, additional, sections to show), with a live
preview; entries and rows reorder by their grip (`app/ui/sortable.js`: mouse,
touch or arrow keys). It starts from the resume the owner wrote.
`app/portfolio/resume.js` draws it as a classic white-paper resume for both
the dashboard and the portfolio: the Resume button opens
`portfolio.html#t=…&page=resume` on the same private link (no SQL:
`portfolio_view` already sends `site`), and Download PDF prints only the
resume (`html.cv-print`).

**Edit | Save | Preview on web** sit in the Portfolio page's top bar
(`#li-pagebar-actions`). Preview on web opens `portfolio.html` in a named tab
through a private link of your own ("My preview (you)", one hour, kept in
`localStorage`, reused while valid and left out of the share-link list), so it
is exactly what a hiring manager sees. Every portfolio save posts on the
`lockedin-portfolio` BroadcastChannel and the preview tab reloads
`portfolio_view`; in demo mode the tab asks the dashboard for the data instead.

## Team admins (added later)

Migration `20261007000000_team_admins.sql` adds a third role, `admin`.
`private.owns_member(user)` now means "manages": the owner manages everyone
on the team, an admin manages colleagues (role `member`). Everything built
on it follows: tasks (see, assign, edit, delete), task files and storage,
score snapshots. `private.is_admin(team)` (owner or admin) lets admins read
and cancel invitations, invite colleagues (only the owner invites admins)
and manage projects. Owner only: `public.set_member_role(member, role)`,
removing someone completely, renaming the team, team goals and milestones.
Admins don't see the owner's or other admins' tasks. In the app,
`state.isManager` (owner or admin) gates the Team tab and page, the Team
card, assigning and "Assigned by me", and Projects; `managesPerson(m)` limits
lists to the people you manage.

