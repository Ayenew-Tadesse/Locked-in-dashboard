// Projects (the apps: Guxo Flights, Guxo, Gexi, ...). Shared by the Overview
// cards and the owner's Projects page.

export const PROJECT_STATUSES = { good: "On track", warn: "Needs attention", idle: "Not started" };
export const LINK_LABELS = { web: "Web app", repo: "Repo", app: "App repo" };

/** Checklist progress: { done, total, pct }. */
export function projectProgress(p) {
  const items = p?.checklist || [];
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/**
 * The original dashboard's apps as project rows (copied in once, the first
 * time the owner opens the app with the projects table in place).
 */
export function projectsFromLegacy(legacy) {
  const apps = (legacy && legacy.apps) || [];
  const lists = (legacy && legacy.checklists) || {};
  return apps.map((a, i) => ({
    name: String(a.name || "Project").slice(0, 80),
    code: a.routeCode ? String(a.routeCode).slice(0, 8) : null,
    category: a.category || null,
    description: a.category || null,
    stage: a.stage || null,
    status: ["good", "warn", "idle"].includes(a.statusLevel) ? a.statusLevel : "idle",
    facts: (a.facts || []).filter(Boolean),
    links: Object.fromEntries([["web", a.webAppLink], ["repo", a.repoLink], ["app", a.appRepoLink]].filter(([, v]) => v)),
    checklist: (lists[a.id] || []).filter((t) => t && t.text)
      .map((t, j) => ({ id: t.id || `c${j + 1}`, text: t.text, done: !!t.done, deadline: t.deadline || null })),
    position: i,
  }));
}

/** Only http(s) links are shown as links. */
export function safeUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim()) ? u.trim() : null;
}

/** The card's one-line description (falls back to the category). */
export function projectBlurb(p) {
  return (p?.description || p?.category || "").trim();
}
