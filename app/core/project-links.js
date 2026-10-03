// How a project and the things about it stay together. A project is the
// source; these follow it:
//   case studies  linked by the project's name (case.project, or a case whose
//                 title is the project's name)
//   milestones    whose category is the project's name
//   tasks         on the project (project_id) or whose category is its name
// When a project is saved, planProjectSync works out what has to change so
// everything stays linked and up to date; project-sync.js saves it.

const key = (s) => String(s || "").trim().toLowerCase();
const trimSlash = (u) => String(u || "").trim().replace(/\/+$/, "");

/** The case studies about a project. */
export function casesOfProject(cases, project) {
  const name = key(project?.name);
  if (!name) return [];
  return (cases || []).filter((c) => (c.project ? key(c.project) === name : key(c.title) === name));
}
export const milestonesOfProject = (milestones, project) =>
  (milestones || []).filter((m) => key(project?.name) && key(m.category) === key(project.name));
export const tasksOfProject = (tasks, project) =>
  (tasks || []).filter((t) => (project?.id && t.project_id === project.id) || (key(project?.name) && key(t.category) === key(project.name)));

/** A link that started from the project's old web address moves to the new one, keeping its path (e.g. /login). */
function moveLink(url, from, to) {
  const u = String(url || "").trim(), a = trimSlash(from), b = trimSlash(to);
  if (!a || !b || a === b) return null;
  if (u === a || u.startsWith(a + "/") || u.startsWith(a + "?") || u.startsWith(a + "#")) return b + u.slice(a.length);
  return null;
}

/**
 * What follows a project when it's saved (before → after).
 * Returns { cases: [{ id, patch }], milestones: [{ id, category }], tasks: [{ id, category }] }.
 */
export function planProjectSync(before, after, { cases = [], milestones = [], tasks = [] } = {}) {
  const out = { cases: [], milestones: [], tasks: [] };
  if (!before || !after) return out;
  const renamed = key(before.name) !== key(after.name) || before.name !== after.name;
  for (const c of casesOfProject(cases, before)) {
    const patch = {};
    if (renamed) patch.project = after.name;
    const live = moveLink(c.liveUrl, before.links?.web, after.links?.web);
    if (live) patch.liveUrl = live;
    else if (!String(c.liveUrl || "").trim() && after.links?.web && !before.links?.web) patch.liveUrl = after.links.web;
    const desc = String(after.description || "").trim();
    if (desc && desc !== String(before.description || "").trim() && (!String(c.cardDesc || "").trim() || c.cardDesc.trim() === String(before.description || "").trim())) patch.cardDesc = desc;
    if (Object.keys(patch).length) out.cases.push({ id: c.id, patch });
  }
  if (renamed) {
    for (const m of milestonesOfProject(milestones, before)) out.milestones.push({ id: m.id, category: after.name.slice(0, 60) });
    for (const t of tasks) if (key(t.category) === key(before.name)) out.tasks.push({ id: t.id, category: after.name.slice(0, 60) });
  }
  return out;
}

/** When a project is deleted, its case studies stay on the portfolio but no longer point at it. */
export function planProjectDelete(project, { cases = [] } = {}) {
  return casesOfProject(cases, project).map((c) => ({ id: c.id, patch: { project: "" } }));
}

/** "1 case study, 7 milestones and 32 tasks" (only the ones that are there). */
export function describeSync(plan) {
  const bits = [[plan.cases?.length, "case study", "case studies"], [plan.milestones?.length, "milestone", "milestones"], [plan.tasks?.length, "task", "tasks"]]
    .filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}` : bits[0] || "";
}

/** A case study started from a project: its name, description and link filled in. */
export function caseFromProject(p) {
  return {
    id: "", title: p.name, project: p.name, status: "live", tag: p.category || "", cardDesc: p.description || "",
    subtitle: p.description || "", liveUrl: p.links?.web || "", shots: [],
    meta: [{ label: "Type", value: p.category || "" }].filter((m) => m.value),
    overview: (p.facts || []).length ? `Key facts:\n\n${p.facts.join("\n\n")}` : "",
  };
}
