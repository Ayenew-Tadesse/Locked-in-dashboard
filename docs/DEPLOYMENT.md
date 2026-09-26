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
3. Deploy (step 6), open the site, choose **Create an account**, confirm the email, sign in.
4. **Recommended:** once your own account exists, turn off **Allow new users
   to sign up** (Authentication → Sign In / Providers). Other people couldn't
   see your data anyway, but this keeps the app to you alone.

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
get preview URLs. Then:

1. Put the production URL into Supabase's Site URL and Redirect URLs (step 4).
2. Open the site, sign in, and go to **Settings → Import the original
   dashboard's history** once. This copies your existing daily checklists,
   daily reports and quarterly roadmap into the database.
3. Check the API: `https://<your-site>/api/v1` should list the endpoints.

Local preview: `npm run dev` (serves `dist/` at http://localhost:5173). Add
`?demo=1` to try it with sample data and no database.

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

If the page is opened without `config.js` (e.g. GitHub Pages, or the original
Claude artifact), it runs exactly as the original dashboard did, with the
password screen and built-in data. The new features appear only on the
deployed site with Supabase configured.
