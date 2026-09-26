// Read API for assistants such as Claude. Deployed as Vercel functions
// (api/v1/*). Each request carries a personal access token created in the
// app (Settings -> API access). The token is passed to the database's
// api_snapshot / api_create_task functions, which only return the token
// owner's data. No service-role key is used anywhere.
import { addDays, dayOf, isDayKey, monthRange, quarterOf, quarterRange, weekRange, formatDay, formatMinutes } from "../app/core/dates.js";
import { effectiveStatus, filterTasks, isOverdue, sortTasks, STATUSES, PRIORITIES } from "../app/core/tasks.js";
import { resolveScoring, scoreDay, scorePeriod, scoreQuarter, describeFormula } from "../app/core/scoring.js";
import { milestoneInfo, planForDay, buildWarnings, PACE_LABELS } from "../app/core/insights.js";

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const ENDPOINTS = {
  "GET /api/v1/today": "Today's tasks, deadlines, overdue work, daily and weekly score.",
  "GET /api/v1/tasks": "Tasks, filtered by from, to, q, status, priority, category, milestone, deadline.",
  "POST /api/v1/tasks": "Create a task (token needs the write scope). Body: title, date, due_date, priority, category, estimated_minutes, notes, milestone_id.",
  "GET /api/v1/overdue": "All overdue tasks.",
  "GET /api/v1/summary": "Progress summary. period = day | week | month | quarter, date = any day in the period.",
  "GET /api/v1/milestones": "Milestones with progress and pace. pace=behind for ones behind schedule.",
  "GET /api/v1/quarter": "Quarterly goals, milestones and score. quarter = 1-4, year.",
  "GET /api/v1/plan": "Suggested plan for a day (default tomorrow) from unfinished work.",
  "GET /api/v1/scoring": "How scores are calculated, with this user's settings.",
};

function readToken(headers) {
  const h = headers.authorization || headers.Authorization || "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new ApiError(401, "Send your personal access token as: Authorization: Bearer <token>");
  return m[1];
}

async function rpc(env, fn, args, fetchImpl) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new ApiError(500, "The API is not configured (SUPABASE_URL / SUPABASE_ANON_KEY).");
  const res = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      // Legacy anon keys are JWTs and also go in Authorization; new
      // "sb_publishable_" keys must only be sent as apikey.
      ...(env.SUPABASE_ANON_KEY.split(".").length === 3 ? { Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => null);
  if (res.ok) return data;
  const code = data && data.code;
  if (code === "28000") throw new ApiError(401, "Invalid, expired or revoked token (or it lacks the needed scope).");
  if (code === "22023" || code === "22007" || code === "22P02" || code === "23514" || code === "23502") {
    throw new ApiError(400, (data && data.message) || "Invalid request.");
  }
  throw new ApiError(502, "The database request failed.");
}

function taskView(t, today) {
  return {
    id: t.id, title: t.title, description: t.description, date: t.date, due_date: t.due_date,
    priority: t.priority, status: effectiveStatus(t, today), status_label: STATUSES[effectiveStatus(t, today)],
    category: t.category, milestone_id: t.milestone_id, estimated_minutes: t.estimated_minutes,
    actual_minutes: t.actual_minutes, completion_percentage: t.completion_percentage, notes: t.notes,
    completed_at: t.completed_at,
  };
}

function periodRange(period, date) {
  switch (period) {
    case "day": return { start: date, end: date };
    case "week": return weekRange(date);
    case "month": return monthRange(date);
    case "quarter": { const q = quarterOf(date); return quarterRange(q.quarter, q.year); }
    default: throw new ApiError(400, "period must be day, week, month or quarter.");
  }
}

function dateParam(v, fallback) {
  if (v == null || v === "") return fallback;
  if (!isDayKey(String(v))) throw new ApiError(400, "Dates must be YYYY-MM-DD.");
  return String(v);
}

/** Loads the owner's data for a range (with a one-day margin for time zones). */
async function load(env, token, from, to, fetchImpl) {
  const snap = await rpc(env, "api_snapshot", { p_token: token, p_from: addDays(from, -1), p_to: addDays(to, 1) }, fetchImpl);
  const timeZone = snap.profile?.timezone || "UTC";
  return {
    ...snap,
    timeZone,
    today: dayOf(new Date(), timeZone),
    cfg: resolveScoring(snap.settings),
    dailyNotes: Object.fromEntries((snap.daily_notes || []).map((n) => [n.date, n.notes])),
    weeklyNotes: Object.fromEntries((snap.weekly_notes || []).map((n) => [n.week_start, n.notes])),
  };
}

function milestoneView(m, ctx) {
  const info = milestoneInfo(m, ctx.tasks, ctx.today, ctx.timeZone);
  return {
    id: m.id, title: m.title, category: m.category, priority: m.priority, status: m.status,
    start_date: m.start_date, deadline: m.deadline, percentage_complete: Number(m.percentage_complete),
    target: Number(m.target), current_progress: Number(m.current_progress), progress_mode: m.progress_mode,
    goal_id: m.goal_id, pace: info.pace, pace_label: PACE_LABELS[info.pace], expected_pct: info.expected_pct,
    days_left: info.days_left, related_tasks: { total: info.total_tasks, completed: info.completed_tasks, remaining: info.remaining_tasks },
  };
}

function scoreView(s) {
  return s && {
    score: s.score, base: s.base, overdue_penalty: s.penalty, counts: s.counts, minutes: s.minutes,
    components: s.components.map((c) => ({ component: c.label, weight: c.weight, value: c.value, detail: c.detail })),
  };
}

const handlers = {
  async today(ctx) {
    const t = ctx.today;
    const planned = sortTasks(ctx.tasks.filter((x) => x.date === t), t);
    const day = scoreDay(ctx.tasks, t, ctx.cfg, ctx);
    const week = scorePeriod(ctx.tasks, weekRange(t).start, weekRange(t).end, ctx.cfg, ctx);
    return {
      date: t, date_label: formatDay(t, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      counts: { ...day.counts, overdue: ctx.tasks.filter((x) => isOverdue(x, t)).length },
      completion_pct: day.counts.total ? Math.round(day.counts.completed / day.counts.total * 100) : null,
      time_worked: formatMinutes(day.minutes),
      daily_score: scoreView(day), weekly_score: week.score,
      tasks: planned.map((x) => taskView(x, t)),
      due_today: ctx.tasks.filter((x) => x.due_date === t).map((x) => taskView(x, t)),
      overdue: sortTasks(ctx.tasks.filter((x) => isOverdue(x, t)), t).map((x) => taskView(x, t)),
      milestones_due_soon: ctx.milestones.filter((m) => m.deadline && m.deadline >= t && m.deadline <= addDays(t, 14) && m.status !== "completed")
        .map((m) => milestoneView(m, ctx)),
      warnings: buildWarnings(ctx).map((w) => w.text),
      notes: ctx.dailyNotes[t] || null,
    };
  },

  async tasks(ctx, q) {
    const from = dateParam(q.from, addDays(ctx.today, -30));
    const to = dateParam(q.to, addDays(ctx.today, 30));
    const filters = { q: q.q, status: q.status, priority: q.priority, category: q.category, milestone: q.milestone, deadline: q.deadline, from, to };
    if (filters.status && !STATUSES[filters.status]) throw new ApiError(400, "Unknown status.");
    if (filters.priority && !PRIORITIES[filters.priority]) throw new ApiError(400, "Unknown priority.");
    const list = sortTasks(filterTasks(ctx.tasks, filters, ctx.today), ctx.today);
    return { from, to, count: list.length, tasks: list.map((x) => taskView(x, ctx.today)) };
  },

  async overdue(ctx) {
    const list = sortTasks(ctx.tasks.filter((x) => isOverdue(x, ctx.today)), ctx.today);
    return { date: ctx.today, count: list.length, tasks: list.map((x) => taskView(x, ctx.today)) };
  },

  async summary(ctx, q) {
    const period = q.period || "week";
    const date = dateParam(q.date, ctx.today);
    const { start, end } = periodRange(period, date);
    const p = scorePeriod(ctx.tasks, start, end, ctx.cfg, ctx);
    const completed = ctx.tasks.filter((t) => t.status === "completed" && dayOf(t.completed_at, ctx.timeZone) >= start && dayOf(t.completed_at, ctx.timeZone) <= end);
    let quarter = null;
    if (period === "quarter") {
      const qq = quarterOf(date);
      const s = scoreQuarter(ctx.tasks, ctx.goals, qq.quarter, qq.year, ctx.cfg, ctx);
      quarter = { score: s.score, average_weekly_score: s.average_weekly_score, goal_progress: s.goal_progress, time_elapsed_pct: s.time_elapsed_pct };
    }
    const score = period === "day" ? scoreDay(ctx.tasks, start, ctx.cfg, ctx).score : quarter ? quarter.score : p.score;
    const t = p.totals;
    const text = `${formatDay(start)} to ${formatDay(end)}: ${t.completed} of ${t.total} planned tasks completed` +
      (t.completion_rate != null ? ` (${t.completion_rate}%)` : "") + `, ${formatMinutes(t.minutes)} logged` +
      (score != null ? `, score ${score}/100` : "") + (t.overdue ? `, ${t.overdue} overdue` : "") + ".";
    return {
      period, start, end, score, text, totals: t, average_daily_score: p.average_daily_score,
      active_days: p.active_days, active_days_target: p.active_days_target,
      best_day: p.best_day, needs_improvement: p.needs_improvement, quarter,
      days: p.days.filter((d) => d.date <= ctx.today).map((d) => ({ date: d.date, score: d.score, completed: d.counts.completed, total: d.counts.total, minutes: d.minutes })),
      completed_tasks: completed.map((x) => ({ title: x.title, completed_on: dayOf(x.completed_at, ctx.timeZone), category: x.category, milestone_id: x.milestone_id })),
      milestones: ctx.milestones.filter((m) => m.status !== "cancelled").map((m) => milestoneView(m, ctx)),
      notes: { daily: Object.fromEntries(Object.entries(ctx.dailyNotes).filter(([d]) => d >= start && d <= end)), weekly: ctx.weeklyNotes },
    };
  },

  async milestones(ctx, q) {
    let list = ctx.milestones.map((m) => milestoneView(m, ctx));
    if (q.pace) list = list.filter((m) => m.pace === q.pace);
    if (q.status) list = list.filter((m) => m.status === q.status);
    return { date: ctx.today, count: list.length, milestones: list };
  },

  async quarter(ctx, q) {
    const cur = quarterOf(ctx.today);
    const quarter = q.quarter ? Number(q.quarter) : cur.quarter;
    const year = q.year ? Number(q.year) : cur.year;
    if (!(quarter >= 1 && quarter <= 4) || !(year >= 2000 && year <= 2100)) throw new ApiError(400, "quarter must be 1-4 and year a 4-digit year.");
    const { start, end } = quarterRange(quarter, year);
    const s = scoreQuarter(ctx.tasks, ctx.goals, quarter, year, ctx.cfg, ctx);
    const goalIds = new Set(ctx.goals.filter((g) => g.quarter === quarter && g.year === year).map((g) => g.id));
    const ms = ctx.milestones.filter((m) => goalIds.has(m.goal_id) || (m.deadline && m.deadline >= start && m.deadline <= end));
    return {
      quarter: `Q${quarter} ${year}`, start, end, score: s.score, average_weekly_score: s.average_weekly_score,
      goal_progress: s.goal_progress, time_elapsed_pct: s.time_elapsed_pct, totals: s.totals,
      goals: ctx.goals.filter((g) => g.quarter === quarter && g.year === year).map((g) => ({
        id: g.id, title: g.title, status: g.status, deadline: g.deadline, percentage_complete: Number(g.percentage_complete),
        target: Number(g.target), current_progress: Number(g.current_progress), progress_mode: g.progress_mode })),
      milestones: { completed: ms.filter((m) => m.status === "completed").map((m) => milestoneView(m, ctx)),
        remaining: ms.filter((m) => !["completed", "cancelled"].includes(m.status)).map((m) => milestoneView(m, ctx)) },
      deadlines_approaching: sortTasks(ctx.tasks.filter((t) => !["completed", "cancelled"].includes(t.status) && t.due_date &&
        t.due_date >= ctx.today && t.due_date <= addDays(ctx.today, 14)), ctx.today).map((t) => taskView(t, ctx.today)),
      weeks: s.weeks,
    };
  },

  async scoring(ctx) {
    return { formula: describeFormula(ctx.cfg), settings: ctx.cfg };
  },

  async plan(ctx, q) {
    const date = dateParam(q.date, addDays(ctx.today, 1));
    return planForDay(ctx.tasks, date, ctx.cfg, ctx.today);
  },
};

// How much history each endpoint needs.
function rangeFor(endpoint, q, todayUtc) {
  const date = dateParam(q.date, todayUtc);
  switch (endpoint) {
    case "today": return { from: weekRange(todayUtc).start, to: addDays(todayUtc, 14) };
    case "tasks": return { from: dateParam(q.from, addDays(todayUtc, -30)), to: dateParam(q.to, addDays(todayUtc, 30)) };
    case "overdue": return { from: todayUtc, to: todayUtc };
    case "summary": {
      const r = periodRange(q.period || "week", date);
      // quarter scores include the partial weeks at either end
      return q.period === "quarter" ? { from: addDays(r.start, -6), to: addDays(r.end, 6) } : { from: r.start, to: r.end };
    }
    case "milestones": return { from: addDays(todayUtc, -365), to: addDays(todayUtc, 30) };
    case "quarter": {
      const cur = quarterOf(todayUtc);
      const r = quarterRange(Number(q.quarter) || cur.quarter, Number(q.year) || cur.year);
      return { from: addDays(r.start, -6), to: addDays(r.end, 6) };
    }
    case "scoring": return { from: todayUtc, to: todayUtc };
    case "plan": return { from: addDays(todayUtc, -60), to: addDays(date, 7) };
    default: return null;
  }
}

/**
 * Handles one request. Returns { status, body }. `env` holds SUPABASE_URL and
 * SUPABASE_ANON_KEY; `fetchImpl` is injectable for tests.
 */
export async function handleRequest(endpoint, { method = "GET", query = {}, body = null, headers = {} }, env, fetchImpl = fetch) {
  try {
    if (!endpoint || endpoint === "index") {
      return { status: 200, body: { name: "Locked in API", version: 1, auth: "Authorization: Bearer <personal access token>", endpoints: ENDPOINTS } };
    }
    const token = readToken(headers);
    if (endpoint === "tasks" && method === "POST") {
      const input = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
      const allowed = ["title", "description", "date", "due_date", "priority", "category", "estimated_minutes", "notes", "milestone_id"];
      const task = Object.fromEntries(Object.entries(input).filter(([k]) => allowed.includes(k)));
      if (!task.title || typeof task.title !== "string") throw new ApiError(400, "title is required.");
      const created = await rpc(env, "api_create_task", { p_token: token, p_task: task }, fetchImpl);
      return { status: 201, body: { task: created } };
    }
    if (method !== "GET") throw new ApiError(405, "Method not allowed.");
    if (!handlers[endpoint]) throw new ApiError(404, "Unknown endpoint. GET /api/v1 lists them.");
    const range = rangeFor(endpoint, query, dayOf(new Date(), "UTC"));
    if (range.to < range.from) throw new ApiError(400, "'to' must not be before 'from'.");
    const ctx = await load(env, token, range.from, range.to, fetchImpl);
    return { status: 200, body: await handlers[endpoint](ctx, query) };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.message } };
    if (e instanceof SyntaxError) return { status: 400, body: { error: "Body must be JSON." } };
    console.error(e);
    return { status: 500, body: { error: "Unexpected error." } };
  }
}
