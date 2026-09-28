// Portfolio for hiring managers: the summary's shape and the numbers built
// from it. The database builds the same summary for share links
// (public.portfolio_view in 20261005000000_portfolio.sql); buildPortfolioData
// makes it in the browser for the owner's preview and for demos.
import { addDays, dayOf } from "./dates.js";

export const PORTFOLIO_SECTIONS = [
  ["activity", "Activity", "Tasks finished, streak, hours and a 6-month activity map"],
  ["projects", "Projects", "Ongoing and finished projects with progress and links"],
  ["milestones", "Milestones", "Completed and in-progress milestones"],
  ["plan", "Plan", "The yearly objective's quarterly goals"],
  ["logs", "How I work", "Recent finished tasks with what changed, how, and the problem solved"],
];
export const PORTFOLIO_LINKS = [["email", "Email"], ["linkedin", "LinkedIn"], ["github", "GitHub"], ["website", "Website"]];

/** The saved choices, with every section shown unless switched off. */
export function portfolioPrefs(preferences) {
  const p = (preferences && preferences.portfolio) || {};
  return {
    headline: p.headline || "", bio: p.bio || "", approach: p.approach || "",
    links: { ...(p.links || {}) },
    show: Object.fromEntries(PORTFOLIO_SECTIONS.map(([k]) => [k, p.show?.[k] !== false])),
    categories: Array.isArray(p.categories) ? p.categories : [],
  };
}

/** Same shape as public.portfolio_view: { about, activity, projects, milestones, plan, work }. */
export function buildPortfolioData({ name, preferences, tasks = [], projects = [], milestones = [], goals = [], weekly = [], today, timeZone }) {
  const p = portfolioPrefs(preferences);
  const done = tasks.filter((t) => t.status === "completed");
  const doneDay = (t) => dayOf(t.completed_at, timeZone) || t.date;
  const since = (n) => done.filter((t) => doneDay(t) > addDays(today, -n)).length;
  const perDay = new Map();
  for (const t of done) { const d = doneDay(t); if (d > addDays(today, -182)) perDay.set(d, (perDay.get(d) || 0) + 1); }
  const msTitle = (id) => milestones.find((m) => m.id === id)?.title || null;
  return {
    generated_at: new Date().toISOString(),
    about: { name, headline: p.headline || null, bio: p.bio || null, approach: p.approach || null, links: p.links },
    activity: !p.show.activity ? null : {
      completed_total: done.length, completed_30: since(30), completed_90: since(90),
      minutes_total: done.reduce((s, t) => s + (Number(t.actual_minutes) || 0), 0),
      today,
      days: [...perDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, done: n })),
      weeks: weekly.filter((w) => w.score != null).sort((a, b) => a.week_start.localeCompare(b.week_start)).slice(-12)
        .map((w) => ({ week_start: w.week_start, score: Number(w.score) })),
    },
    projects: !p.show.projects ? null : (projects || []).map((x) => ({ name: x.name, code: x.code, description: x.description, category: x.category,
      stage: x.stage, status: x.status, links: x.links || {}, checklist: x.checklist || [] })),
    milestones: !p.show.milestones ? null : milestones.filter((m) => m.status !== "cancelled").map((m) => ({ title: m.title, description: m.description,
      category: m.category, status: m.status, pct: Math.round(Number(m.percentage_complete) || 0), start_date: m.start_date, deadline: m.deadline, completed_at: m.completed_at })),
    plan: !p.show.plan ? null : goals.filter((g) => g.status !== "cancelled").sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .map((g) => ({ title: g.title, quarter: g.quarter, year: g.year, status: g.status, pct: Math.round(Number(g.percentage_complete) || 0) })),
    work: !p.show.logs ? null : done
      .filter((t) => t.learning_changed || t.learning_how || t.learning_solved)
      .filter((t) => !p.categories.length || p.categories.includes(t.category))
      .sort((a, b) => String(b.completed_at || b.date).localeCompare(String(a.completed_at || a.date)))
      .slice(0, 12)
      .map((t) => ({ title: t.title, category: t.category, day: doneDay(t), milestone: msTitle(t.milestone_id), minutes: t.actual_minutes,
        changed: t.learning_changed, how: t.learning_how, solved: t.learning_solved })),
  };
}

/** Active days in the last 90 days and the current streak (days in a row with something finished). */
export function activityStats(activity) {
  const days = new Set((activity?.days || []).filter((d) => d.done > 0).map((d) => d.date));
  const today = activity?.today;
  if (!today) return { activeDays90: 0, streak: 0 };
  let activeDays90 = 0;
  for (let i = 0; i < 90; i++) if (days.has(addDays(today, -i))) activeDays90++;
  let streak = 0, d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  return { activeDays90, streak };
}
