# Setup and deployment

About 20 minutes end to end. You need a GitHub account (you have one), a free
[Supabase](https://supabase.com) account and a free [Vercel](https://vercel.com)
account. Menu names below match the Supabase and Vercel dashboards at the
time of writing; if one has moved, search the dashboard for the same words.

## 1. Environment variables

Only two variables are needed, and both are **public** values:

| Name | Where to find it | Used by |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL (`https://<ref>.supabase.co`) | Build (written into `config.js`) and the `/api/v1` functions |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → **publishable** key (`sb_publishable_…`), or the legacy **anon** key | Same |

Never use the **secret / service_role** key anywhere in this project. The
build stops if you paste one by mistake. The anon/publishable key is designed
to be visible in the browser: Row Level Security is what protects your data.

For local builds, copy `.env.example` to `.env` and fill it in (`.env` is
git-ignored).

## 2. Create the Supabase project

1. Sign in at supabase.com → **New project**.
2. Pick a name (e.g. `locked-in`), a strong database password (save it in
   a password manager) and the region closest to you.
3. Wait about a minute for it to start.

## 3. Create the database tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the whole of
   [`supabase/migrations/20260926000000_init.sql`](../supabase/migrations/20260926000000_init.sql)
   and click **Run**. It should say *Success. No rows returned.*
3. Open another **New query**, paste
   [`supabase/migrations/20260926100000_learning_log.sql`](../supabase/migrations/20260926100000_learning_log.sql)
   (the Learning log and preferences) and click **Run**.
4. Do the same with
   [`supabase/migrations/20260926200000_teams.sql`](../supabase/migrations/20260926200000_teams.sql)
   (the team portal), then
   [`supabase/migrations/20260927000000_greeting.sql`](../supabase/migrations/20260927000000_greeting.sql)
   (names and "Greet me as"), then
   [`supabase/migrations/20260928000000_remove_member.sql`](../supabase/migrations/20260928000000_remove_member.sql)
   (removing a member completely), then
   [`supabase/migrations/20260929000000_projects.sql`](../supabase/migrations/20260929000000_projects.sql)
   (projects), then
   [`supabase/migrations/20260930000000_project_description.sql`](../supabase/migrations/20260930000000_project_description.sql)
   (project descriptions), then
   [`supabase/migrations/20261001000000_task_files.sql`](../supabase/migrations/20261001000000_task_files.sql)
   (files shared on finished tasks; it also creates the private `task-files` Storage bucket), then
   [`supabase/migrations/20261002000000_owner_adds_tasks.sql`](../supabase/migrations/20261002000000_owner_adds_tasks.sql)
   (only the team owner adds tasks), then
   [`supabase/migrations/20261003000000_task_groups.sql`](../supabase/migrations/20261003000000_task_groups.sql)
   (one task for several people), then
   [`supabase/migrations/20261004000000_team_chat.sql`](../supabase/migrations/20261004000000_team_chat.sql)
   (team chat; it also turns on live updates for the `messages` table), then
   [`supabase/migrations/20261005000000_portfolio.sql`](../supabase/migrations/20261005000000_portfolio.sql)
   (portfolio share links for hiring managers), then
   [`supabase/migrations/20261006000000_portfolio_details.sql`](../supabase/migrations/20261006000000_portfolio_details.sql)
   (profile details on the portfolio), then
   [`supabase/migrations/20261007000000_team_admins.sql`](../supabase/migrations/20261007000000_team_admins.sql)
   (team admins), then
   [`supabase/migrations/20261008000000_portfolio_site.sql`](../supabase/migrations/20261008000000_portfolio_site.sql)
   (portfolio site layout and the public `portfolio-media` image bucket), then
   [`supabase/migrations/20261009000000_api_complete_task.sql`](../supabase/migrations/20261009000000_api_complete_task.sql)
   and [`20261010000000_api_complete_task_header.sql`](../supabase/migrations/20261010000000_api_complete_task_header.sql)
   (tokens that mark tasks complete), then
   [`supabase/migrations/20261011000000_access_requests.sql`](../supabase/migrations/20261011000000_access_requests.sql)
   (people who aren't invited can ask to join; the owner approves on the Team page), then
   [`supabase/migrations/20261012000000_admin_permissions.sql`](../supabase/migrations/20261012000000_admin_permissions.sql)
   (Team → Admin management: what each admin may do), then
   [`supabase/migrations/20261013000000_project_groups.sql`](../supabase/migrations/20261013000000_project_groups.sql)
   (project groups: colleagues work only on their groups' projects), then
   [`supabase/migrations/20261014000000_group_work.sql`](../supabase/migrations/20261014000000_group_work.sql)
   (people in a group see each other's tasks on its project, read only). Run the files in this order.
3. Check **Table Editor**. You should see `profiles`, `user_settings`, `tasks`,
   `milestones`, `quarterly_goals`, `daily_scores`, `weekly_scores` and
   `api_tokens`, each marked with RLS enabled.

(If you use the Supabase CLI instead: `supabase link` then `supabase db push`.)

## 4. Configure authentication

1. **Authentication → Sign In / Providers → Email**: keep Email enabled. Leave
   "Confirm email" on (recommended).
2. **Authentication → URL Configuration**:
   * **Site URL**: your deployed address, e.g. `https://locked-in.vercel.app`
     (update it after step 6 and again if you add a custom domain).
   * **Redirect URLs**: add the same URL, plus `http://localhost:5173` for local testing.
3. Open the site and **create your account first**. The first account
   becomes the team **owner**; every later sign-up needs an invitation.
4. Leave **Allow new users to sign up** switched on: the database itself
   refuses any email you haven't invited (Team page → Invite colleagues).

### Access requests
Someone who isn't invited can press **Request access** (on the sign-up error,
or "Not invited? Request access" on the sign-in screen). The team owner sees a
badge on the **Team** tab and a notice when the dashboard opens; **Approve**
invites them as a colleague (they then sign up with that email), **Decline**
drops the request. Only the owner can see requests.

### Admin management
Team → **Admin management** (owner only): pick an admin and tick what they may
do: invitations, access requests, removing colleagues, renaming the team,
seeing and assigning colleagues' work, other admins' work, projects, team
goals and milestones, and deleting team chat messages. **Copy to all admins**
and **Reset to defaults** (today's admin access) are there too. The database
enforces each box; admins see their own list, read only, on the Team page.
Nobody but the owner can make or remove admins or change these settings.

### Project groups
Team → **Project groups** (owner, and admins with "Create and manage project
groups"): **+ New group** → a name, one project, members and an optional
lead. Colleagues see and are assigned tasks only on their groups' projects;
give someone another project on their page (**Give access…**). The owner and
admins see every project. Tasks have a **Project** field that offers only
projects the person works on; the database enforces it. Each group has a
page (☰ → **Project groups**, or the group's name on the Team page): the
project's progress, its people, and everyone's open and recent work on it,
read only.

### Inviting colleagues
1. Team → **Invite colleagues** → enter their email → **Invite**.
2. Send them the site's address (the **Copy sign-up link** button). They
   choose **Create an account** with that exact email.
3. They appear on your Team page as members. They see their own work and
   the team's goals and milestones; you see everyone's progress and can
   assign them tasks.

Your sign-in session stays on each device until you log out. All data lives
in the database, so clearing browser data, switching computers or using your
phone just means signing in again. Nothing is lost.

## 5. Connect GitHub to Vercel

1. Sign in at vercel.com with GitHub.
2. **Add New… → Project** → import `Ayenew-Tadesse/Locked-in-dashboard`
   (grant Vercel access to the repo if asked).
3. Framework preset: **Other**. The build settings come from `vercel.json`
   (build command `npm run build`, output `dist`), so leave them as they are.
4. Under **Environment Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   for Production (and Preview if you want preview deployments to work).

## 6. Deploy

Click **Deploy**. Vercel builds `dist/` (the page, `app/` and a generated
`config.js`) and deploys the `/api/v1/*` functions from `api/`.

After that, every push to `main` deploys automatically, and pull requests
get preview URLs. (This project is live at
https://locked-in-dashboard-nnym.vercel.app/; Supabase's Site URL points there,
and the GitHub Pages address stays in its Redirect URLs.) Then:

1. Put the production URL into Supabase's Site URL and Redirect URLs (step 4).
2. Open the site, sign in, and go to **Settings → Set up my year** once. This
   copies your daily checklists and reports from the original dashboard and
   loads the year plan (quarterly goals, milestones and daily tickets).
3. Check the API: `https://<your-site>/api/v1` should list the endpoints.
4. **Settings → GitHub username**: set it once. On GitHub Pages the account
   is read from the `<user>.github.io` address; on Vercel it isn't.

Local preview: `npm run dev` (serves `dist/` at http://localhost:5173). Add
`?demo=1` to try it with sample data, or `?demo=history` to see your
original tracking history in the new design, with no database.

## 7. Custom domain (later)

1. Vercel → your project → **Settings → Domains** → add e.g. `lockedin.yourname.com`.
2. At your domain registrar, create the DNS record Vercel shows (usually a
   `CNAME` to `cname.vercel-dns.com` for a subdomain, or an `A` record for the
   root domain). HTTPS is issued automatically.
3. In Supabase → Authentication → URL Configuration, change the **Site URL** to
   the new domain and add it to **Redirect URLs**.
4. API clients (Claude tools) should use the new domain's `/api/v1`.

## Backups

* Supabase backs up the database daily on its paid plans. On the free plan,
  use **Settings → Download backup (JSON)** in the app from time to time, or
  `pg_dump` with the database connection string (Supabase → Connect).
* The JSON export contains all tasks, milestones, goals, scores and notes.

## GitHub Pages / claude.ai

GitHub Pages uses the repository's root `config.js`, which holds the project's
Supabase URL and publishable key, so https://ayenew-tadesse.github.io/Locked-in-dashboard/
is a full deployment: add that address to Supabase's Site URL and Redirect URLs
(step 4). If the page is opened without any `config.js` (e.g. the original
Claude artifact), it runs exactly as the original dashboard did, with the
password screen and built-in data.
