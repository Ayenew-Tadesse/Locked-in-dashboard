# Aye-Noow's Locked in

A personal build dashboard for the sibling-app network (Guxo Flights, Guxo, Gexi),
extended into a productivity and milestone tracker backed by a real database.

## The original dashboard (unchanged)

- Daily motivation quote (365 quotes, one per day, animated)
- Score rings for today, week, month and quarter
- Countdown to Sep 23, 2027
- GitHub-style activity heatmap with per-day notes, missed days in red
- App tabs with a dropdown of details and checklists
- Objective roadmap by quarter
- Today's checklist and daily reports

## Productivity tracking (with Supabase)

- **Tasks:** title, description, date, deadline, priority, status (Not Started,
  In Progress, Completed, Cancelled; *Overdue* is automatic), category,
  estimated and actual time, completion %, notes, and a link to a milestone
- **Today:** counts, completion, daily score with a full breakdown, time
  worked, tasks due, overdue work (move it to today in one click),
  today's milestones, notes
- **Week / Quarter:** totals, scores, a daily or weekly chart, best day, days
  to improve, quarterly goals with progress bars, milestones and approaching deadlines
- **Milestones:** start date, deadline, target, automatic progress from
  related tasks (or manual), on-track / behind-schedule pace
- **Calendar:** month view; click a day to see, add and edit its tasks, deadlines and milestones
- **Analytics:** daily and weekly trends, completion rate, time by category, goal progress
- **Search and filters:** by text, date range, status, priority, category, deadline and milestone
- **Warnings:** overdue, deadlines and milestones approaching, quarter ending,
  low completion. At most three, each dismissible for the day.
- **Year plan to launch (Sep 23, 2027):** quarterly goals, all 23 roadmap milestones, and a ticket for every
  weekday morning (Oct–Dec in full; later months get week-by-week plans, turned into daily tickets monthly).
  Each ticket explains the Goal, How it works, Steps and Done when. See `app/plan/year-plan.js`.
- **Learning log and Daily report PDF:** completing a task asks what changed, how, and what problem it solved;
  the Daily report's **Download PDF** turns that, the ticket's notes and the day's GitHub commits into a PDF.
- **Team portal:** colleagues sign in with their own accounts (invitation only). Members see their own work and
  the team's goals and milestones; the owner's **Team** page shows everyone's progress, their learning logs and
  daily reports, and lets the owner assign tasks and manage invitations.
- **Transparent scoring:** the formula is shown and editable in Settings; see [docs/SCORING.md](docs/SCORING.md)
- **API for Claude:** token-protected `/api/v1` endpoints; see [docs/API.md](docs/API.md)
- **Your data:** stored in Postgres with Row Level Security, synced across
  devices, with a JSON export and a one-time import of the original dashboard's history

The original cards stay on the Overview page and are fed from the database:
the rings show the new scores, and ticking Today's checklist completes the real task.

## Run modes

| Mode | When | What you get |
| --- | --- | --- |
| Supabase | `config.js` has a Supabase URL (the Vercel build writes it) | Sign-in, all features, data saved in the database |
| Original | No `config.js` (claude.ai artifact, GitHub Pages, opening the file) | Exactly the original dashboard with its password screen |
| Demo | Add `?demo=1` to the URL | All features with sample data held in memory. Nothing is saved. |
| History preview | Add `?demo=history` to the URL | All features showing your tracking history from the original dashboard (Sep 23–25 checklists, daily reports) and the year plan, loaded through the same "Set up my year" step the real app uses. Nothing is saved. |

A deployment without a database can open in a preview mode by default: build with
`DEMO_MODE=history` (or `DEMO_MODE=sample`).

**GitHub Pages** serves this repository as-is, using the root `config.js`. It is set
to the history preview, behind the original password screen. Replace its line with
your Supabase URL and publishable key (see the comments in the file) to save for real.
Previews keep the password screen; with a database, Supabase sign-in replaces it.

## Getting started

```bash
cp .env.example .env     # add SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173 (or http://localhost:5173/?demo=1)
npm test                 # unit tests
```

Full setup (Supabase project, tables, auth, Vercel, custom domain):
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Project layout

```
index.html                   the original dashboard (+ a small bridge to the app)
app/                         productivity app (ES modules, no build step)
  core/                      dates, task rules, scoring, insights (shared with the API)
  views/                     Overview, Today, Tasks, Calendar, Week, Quarter, Milestones, Analytics, Settings
  ui/                        task rows/forms, charts, dialogs, sign-in
  store.js, state.js         data layer (Supabase or demo) and app state
api/v1/                      Vercel functions for the Claude API
server/api.js                API handlers
supabase/migrations/         database schema, triggers, RLS policies, API functions
scripts/                     build (writes dist/ and config.js), local server
tests/                       unit, database, browser (e2e) and integration tests
docs/                        architecture, scoring, API, deployment, testing
app/plan/                    the year plan and "Set up my year"
app/report/                  daily report PDF (jsPDF is shipped in app/vendor/, MIT licence)
scripts/stamp.mjs            version-stamps files so every device loads each update
tools/set-password.mjs       password for the original lock screen
```

Design notes and the database diagram: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
