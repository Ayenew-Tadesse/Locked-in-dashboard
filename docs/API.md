# API for Claude (and other assistants)

A small read API, with one write endpoint, that lets an assistant answer
questions like *"What are my tasks today?"* or *"Which milestones are behind
schedule?"* without having direct access to the database.

## How access works

```
Claude ──HTTPS + personal token──► /api/v1/* (Vercel function)
                                     │  uses only the public anon key
                                     ▼
                         Postgres function api_snapshot(token, from, to)
                         · hashes the token, looks it up in api_tokens
                         · checks it isn't revoked or expired, and its scope
                         · returns ONLY that user's rows
```

* Create tokens in the app: **Settings → API access for Claude → New token**.
  A token is shown once, and only its SHA-256 fingerprint is stored.
* Scopes: `read` (always), and optionally `write`, which only allows creating tasks.
* Revoke a token at any time and it stops working immediately. Tokens can expire
  (30/90/365 days or never).
* The service-role key is never used. Even the API server can't read data
  without a valid token.

## Endpoints

All requests need `Authorization: Bearer <token>`. Dates are `YYYY-MM-DD`.
"Today" uses the time zone saved in your profile, which the app sets from your
device.

| Endpoint | Answers | Parameters |
| --- | --- | --- |
| `GET /api/v1` | Lists endpoints (no token needed) | |
| `GET /api/v1/today` | "What are my tasks today?" Counts, tasks, due today, overdue, daily score with breakdown, weekly score, warnings, your note | |
| `GET /api/v1/tasks` | Search and filter tasks | `from`, `to` (default: 30 days either side), `q`, `status` (not_started, in_progress, completed, overdue, cancelled), `priority`, `category`, `milestone` (id or `none`), `deadline` (overdue, today, week, next7, none) |
| `GET /api/v1/overdue` | "What tasks are overdue?" | |
| `GET /api/v1/summary` | "What did I accomplish this week?", "How did I score?", "Summarise this month" | `period` = day, week, month or quarter; `date` = any day in it |
| `GET /api/v1/milestones` | "What milestones are behind schedule?" | `pace` = behind, on_track, overdue, done; `status` |
| `GET /api/v1/quarter` | "What is my quarterly progress?" | `quarter` (1–4), `year` |
| `GET /api/v1/plan` | "Create a plan for tomorrow" (suggestion only) | `date` (default tomorrow) |
| `GET /api/v1/scoring` | "How is my score calculated?" | |
| `POST /api/v1/tasks` | Add a task (needs `write` scope) | JSON: `title` (required), `date`, `due_date`, `priority`, `category`, `estimated_minutes`, `notes`, `milestone_id` |

Errors return `{ "error": "..." }` with status 400 (bad input), 401 (missing,
invalid, revoked or expired token, or missing scope), 404 or 405.

### Examples

```bash
TOKEN=lki_...   # from Settings
curl -H "Authorization: Bearer $TOKEN" https://your-domain/api/v1/today
curl -H "Authorization: Bearer $TOKEN" "https://your-domain/api/v1/summary?period=week"
curl -H "Authorization: Bearer $TOKEN" "https://your-domain/api/v1/milestones?pace=behind"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"Draft the case study","date":"2026-09-27","priority":"high"}' \
     https://your-domain/api/v1/tasks
```

`/summary` includes a one-line `text` field, e.g. *"Sep 21 to Sep 27: 15 of 22
planned tasks completed (68%), 18h 45m logged, score 71/100, 4 overdue."*, plus
the numbers behind it.

## Connecting Claude later

The API is shaped so each endpoint maps to one tool. Two common routes:

1. **Tools in your own Claude app (Claude API).** Define one tool per endpoint
   (e.g. `get_today`, `get_summary(period, date)`, `get_milestones(pace)`,
   `create_task(...)`). Your code calls the endpoint with the token and
   returns the JSON as the tool result. Keep the token on your server, never
   in the prompt.
2. **An MCP server.** Wrap the same endpoints in a small MCP server so Claude
   Desktop / Claude Code can use them. The MCP server holds the token in an
   environment variable.

Either way, give Claude a **read-only** token unless you want it to add
tasks, and revoke it if a device is lost.

## Limits and notes

* Date ranges are limited to 400 days per request.
* There's no per-token rate limiting yet. Vercel's platform limits apply, and
  tokens are 256-bit random, so they can't be guessed.
* The API reads live data and calculates scores with the same code as the app.
