// Portfolio for hiring managers: the summary's shape and the numbers built
// from it. The database builds the same summary for share links
// (public.portfolio_view in 20261005000000_portfolio.sql); buildPortfolioData
// makes it in the browser for the owner's preview and for demos.
import { addDays, dayOf } from "./dates.js";

export const PORTFOLIO_SECTIONS = [
  ["cases", "Case studies", "Featured projects and their case-study pages"],
  ["stats", "Stats", "The numbers under your introduction"],
  ["about", "About me", "Your About me paragraphs"],
  ["skillgroups", "Key skills", "Your skill groups"],
  ["contact", "Contact", "Phone, email and LinkedIn cards"],
  ["highlights", "Highlights", "Your best results, near the top"],
  ["experience", "Experience", "Roles and companies, as a timeline"],
  ["skills", "Skills & tools", "Skills, tools and industries"],
  ["process", "Process", "Your process steps and research methods"],
  ["activity", "Activity", "Tasks finished, streak, hours and a 6-month activity map"],
  ["projects", "Projects", "Ongoing and finished projects with progress and links"],
  ["milestones", "Milestones", "Completed and in-progress milestones"],
  ["plan", "Plan", "The yearly objective's quarterly goals"],
  ["logs", "Finished work notes", "Recent finished tasks with what changed, how, and the problem solved"],
];
export const PORTFOLIO_LINKS = [["email", "Email"], ["linkedin", "LinkedIn"], ["behance", "Behance"], ["dribbble", "Dribbble"], ["github", "GitHub"], ["website", "Website"]];
export const INDUSTRIES = ["Travel", "E-commerce", "Fintech", "Health", "SaaS", "Education", "Logistics", "Media"];
export const RESEARCH_METHODS = ["User interviews", "Usability testing", "Surveys", "Analytics", "A/B testing", "Heuristic reviews", "Card sorting", "Competitive analysis"];
// Which detail fields belong to which switchable section (the rest always show).
export const DETAIL_SECTIONS = { highlights: ["highlights"], experience: ["experience"], skills: ["skills", "tools", "industries"], process: ["process", "methods", "collaboration", "different"] };

const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
/** The profile details, cleaned: { title, years, location, open, roles, experience, highlights, ... }. */
export function portfolioDetails(d = {}) {
  return {
    title: d.title || "", years: d.years ?? "", location: d.location || "", roles: d.roles || "",
    open: { remote: !!d.open?.remote, hybrid: !!d.open?.hybrid, relocation: !!d.open?.relocation },
    experience: (Array.isArray(d.experience) ? d.experience : []).map((e) => ({ role: e.role || "", company: e.company || "", from: e.from || "", to: e.to || "", summary: e.summary || "" }))
      .filter((e) => e.role || e.company),
    highlights: list(d.highlights), industries: list(d.industries), process: list(d.process), methods: list(d.methods),
    skills: list(d.skills), tools: list(d.tools), collaboration: d.collaboration || "", different: d.different || "",
  };
}
/** The details a visitor may see: fields of switched-off sections are left out. */
export function visibleDetails(details, show) {
  const d = portfolioDetails(details);
  for (const [section, keys] of Object.entries(DETAIL_SECTIONS)) if (show[section] === false) for (const k of keys) delete d[k];
  return d;
}

// Which site keys belong to which switchable section.
export const SITE_SECTIONS = { cases: "cases", stats: "stats", about: "about", skillgroups: "skills", contact: "contact" };
/** The site a visitor may see: sections switched off are left out. */
export function visibleSite(site, show) {
  if (!site || typeof site !== "object") return {};
  const out = JSON.parse(JSON.stringify(site));
  for (const [section, key] of Object.entries(SITE_SECTIONS)) if (show[section] === false) delete out[key];
  return out;
}

/** The saved choices, with every section shown unless switched off. */
export function portfolioPrefs(preferences) {
  const p = (preferences && preferences.portfolio) || {};
  return {
    headline: p.headline || "", bio: p.bio || "", approach: p.approach || "",
    details: portfolioDetails(p.details),
    links: { ...(p.links || {}) },
    show: Object.fromEntries(PORTFOLIO_SECTIONS.map(([k]) => [k, p.show?.[k] !== false])),
    categories: Array.isArray(p.categories) ? p.categories : [],
    site: p.site && typeof p.site === "object" ? p.site : {},
  };
}

/** Same shape as public.portfolio_view: { about, activity, projects, milestones, plan, work }. */
export function buildPortfolioData({ name, preferences, tasks = [], projects = [], milestones = [], goals = [], weekly = [], today, timeZone, year = null }) {
  const p = portfolioPrefs(preferences);
  const done = tasks.filter((t) => t.status === "completed");
  const doneDay = (t) => dayOf(t.completed_at, timeZone) || t.date;
  const since = (n) => done.filter((t) => doneDay(t) > addDays(today, -n)).length;
  const perDay = new Map();
  for (const t of done) { const d = doneDay(t); if (d > addDays(today, -182)) perDay.set(d, (perDay.get(d) || 0) + 1); }
  const msTitle = (id) => milestones.find((m) => m.id === id)?.title || null;
  return {
    generated_at: new Date().toISOString(),
    site: visibleSite(year ? { ...p.site, year } : p.site, p.show),
    about: { name, headline: p.headline || null, bio: p.bio || null, approach: p.approach || null, links: p.links,
      details: visibleDetails(p.details, p.show) },
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
