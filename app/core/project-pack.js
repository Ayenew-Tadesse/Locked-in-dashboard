// A project file: one project (card + checklist), its milestones with their
// tasks, and a portfolio case study, in one JSON file you import from the
// Projects page. Pure functions: checking a file, seeing what's new, and
// turning it into rows. app/project-import.js does the saving.
//
// {
//   "kind": "locked-in.project-pack", "version": 1,
//   "project":   { name, code, description, category, stage, status, facts[], links{web,repo,app}, checklist[{text, done, deadline}] },
//   "milestones": [{ title, description, category, priority, start_date, deadline,
//                    tasks: [{ title, description, date, due_date, status, priority, category, estimated_minutes, actual_minutes }] }],
//   "caseStudy": { id, title, ... the case study as the case editor saves it; images may be data:image/… }
// }

export const PACK_KIND = "locked-in.project-pack";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = ["low", "medium", "high", "urgent"];
const TASK_STATUSES = ["not_started", "in_progress", "completed", "cancelled"];
const PROJECT_STATUS = ["good", "warn", "idle"];
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const day = (v) => (typeof v === "string" && DAY.test(v) ? v : null);
const mins = (v) => (Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null);
const url = (v) => (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null);

/** Reads a project file (text or parsed); throws a plain-language error when it isn't one. */
export function parsePack(input) {
  let p = input;
  if (typeof input === "string") {
    try { p = JSON.parse(input); } catch { throw new Error("This file isn't a project file (it isn't valid JSON)."); }
  }
  if (!p || p.kind !== PACK_KIND) throw new Error("This file isn't a Locked-in project file.");
  if (p.version !== 1) throw new Error("This project file is from a newer version of the dashboard.");
  const out = { project: null, milestones: [], caseStudy: null };

  if (p.project) {
    const name = str(p.project.name, 80);
    if (!name) throw new Error("The project in this file has no name.");
    const links = {};
    for (const k of ["web", "repo", "app"]) { const u = url(p.project.links?.[k]); if (u) links[k] = u; }
    out.project = {
      name, code: str(p.project.code, 8) || null, description: str(p.project.description, 300) || null,
      category: str(p.project.category, 120) || null, stage: str(p.project.stage, 120) || null,
      status: PROJECT_STATUS.includes(p.project.status) ? p.project.status : "idle",
      facts: (Array.isArray(p.project.facts) ? p.project.facts : []).map((f) => str(f, 300)).filter(Boolean).slice(0, 20),
      links,
      checklist: (Array.isArray(p.project.checklist) ? p.project.checklist : []).map((c, i) => ({
        id: `c${i + 1}`, text: str(c?.text, 300), done: !!c?.done, deadline: str(c?.deadline, 40) || null,
      })).filter((c) => c.text).slice(0, 100),
    };
  }

  for (const m of Array.isArray(p.milestones) ? p.milestones : []) {
    const title = str(m?.title, 200);
    if (!title) throw new Error("A milestone in this file has no title.");
    const start = day(m.start_date), deadline = day(m.deadline);
    out.milestones.push({
      title, description: str(m.description, 5000) || null, category: str(m.category, 60) || null,
      priority: PRIORITIES.includes(m.priority) ? m.priority : "medium",
      start_date: start && deadline && start > deadline ? deadline : start, deadline,
      tasks: (Array.isArray(m.tasks) ? m.tasks : []).map((t) => {
        const tt = str(t?.title, 300);
        if (!tt) throw new Error(`A task in "${title}" has no title.`);
        const status = TASK_STATUSES.includes(t.status) ? t.status : "not_started";
        return {
          title: tt, description: str(t.description, 10000) || null, date: day(t.date) || deadline || start, due_date: day(t.due_date),
          status, priority: PRIORITIES.includes(t.priority) ? t.priority : "medium", category: str(t.category, 60) || str(m.category, 60) || null,
          estimated_minutes: mins(t.estimated_minutes), actual_minutes: mins(t.actual_minutes),
        };
      }),
    });
  }
  if (out.milestones.some((m) => m.tasks.some((t) => !t.date))) throw new Error("Every task needs a date (or its milestone a deadline).");

  if (p.caseStudy) {
    const c = p.caseStudy;
    if (!str(c.title, 200)) throw new Error("The case study in this file has no title.");
    out.caseStudy = { ...c, id: str(c.id, 60) || null, title: str(c.title, 200), status: c.status === "progress" ? "progress" : "live" };
  }
  if (!out.project && !out.milestones.length && !out.caseStudy) throw new Error("This project file is empty.");
  return out;
}

/** Every image in a case study (shots, user-flow steps, persona photos), as [holder, key] pairs. */
export function caseImages(c) {
  const out = [];
  for (const s of c?.shots || []) out.push([s, "src"]);
  for (const s of c?.flow?.steps || []) out.push([s, "src"]);
  for (const p of c?.personas?.items || []) out.push([p, "photo"]);
  return out.filter(([o, k]) => typeof o?.[k] === "string" && o[k]);
}

/**
 * What importing would do, given what you already have:
 * { project: "add"|"exists"|"no_team"|"no_permission"|null, milestones: {add, skip}, tasks, case: "add"|"exists"|null, images }.
 */
export function planImport(pack, { projects, canAddProject, milestones, cases }) {
  const lower = (s) => String(s || "").trim().toLowerCase();
  let project = null;
  if (pack.project) {
    if (projects === null || projects === undefined) project = "no_team";
    else if (projects.some((p) => lower(p.name) === lower(pack.project.name) || (pack.project.code && lower(p.code) === lower(pack.project.code)))) project = "exists";
    else project = canAddProject ? "add" : "no_permission";
  }
  const have = new Set((milestones || []).map((m) => lower(m.title)));
  const add = pack.milestones.filter((m) => !have.has(lower(m.title)));
  const caseState = pack.caseStudy ? ((cases || []).some((c) => c.id === pack.caseStudy.id || lower(c.title) === lower(pack.caseStudy.title)) ? "exists" : "add") : null;
  return {
    project, milestones: { add: add.length, skip: pack.milestones.length - add.length },
    tasks: add.reduce((n, m) => n + m.tasks.length, 0), case: caseState,
    images: caseState === "add" ? caseImages(pack.caseStudy).filter(([o, k]) => /^data:image\//i.test(o[k])).length : 0,
    newMilestones: add,
  };
}

/** Rows for the milestones (progress from their tasks) and tasks that are new. */
export function packRows(newMilestones, newId, { projectId = null } = {}) {
  const milestones = [], tasks = [];
  for (const m of newMilestones) {
    const id = newId();
    const done = m.tasks.length > 0 && m.tasks.every((t) => t.status === "completed" || t.status === "cancelled");
    const started = m.tasks.some((t) => t.status !== "not_started");
    milestones.push({
      id, title: m.title, description: m.description, category: m.category, priority: m.priority, start_date: m.start_date, deadline: m.deadline,
      progress_mode: "tasks", target: 100, current_progress: 0, status: done ? "completed" : started ? "in_progress" : "not_started",
    });
    for (const t of m.tasks) {
      tasks.push({
        id: newId(), milestone_id: id, ...(projectId ? { project_id: projectId } : {}), ...t,
        completion_percentage: t.status === "completed" ? 100 : 0,
        completed_at: t.status === "completed" ? new Date(`${t.date}T17:00:00`).toISOString() : null,
      });
    }
  }
  return { milestones, tasks };
}
