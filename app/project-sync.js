// Saving or deleting a project, and bringing everything about it along:
// its case studies (and so the portfolio), milestones and tasks
// (core/project-links.js decides what changes). Used by the Projects page.
import { state, saveProject, deleteProject, placeProject, reload, refresh, toast } from "./state.js";
import { planProjectSync, planProjectDelete, describeSync, caseOrderFromProjects, casesOfProject, caseFromProject } from "./core/project-links.js";
import { currentSite, saveSite, portfolioChanged, storeCase } from "./views/portfolio-site.js";
import { hasSite } from "./portfolio/site.js";

/** Applies case-study patches to the saved portfolio in one save. */
async function patchCases(patches) {
  if (!patches.length) return;
  const site = currentSite();
  site.cases = (site.cases || []).map((c) => {
    const p = patches.find((x) => x.id === c.id);
    return p ? { ...c, ...p.patch } : c;
  });
  await saveSite(site);
  portfolioChanged();
}

/**
 * A new project gets its case study: one is created "In progress" (its card shows
 * placeholder screens) from the project's name, category, description, link and
 * facts, in the project's place in the order. One that already has the name is
 * linked instead. Returns "created", "linked" or "" (when it didn't finish).
 */
async function caseForNewProject(p) {
  if (!hasSite(currentSite())) return ""; // a portfolio not set up as a site yet stays as it is
  try {
    const site = currentSite();
    site.cases = site.cases || [];
    const mine = casesOfProject(site.cases, p);
    let result = "linked";
    if (mine.length) {
      mine.forEach((c) => { c.project = p.name; });
      await saveSite(site);
    } else {
      await storeCase({ ...caseFromProject(p), status: "progress" });
      result = "created";
    }
    const after = currentSite();
    const ids = caseOrderFromProjects(after.cases || [], state.projects);
    if (ids) { after.cases = ids.map((id) => after.cases.find((c) => c.id === id)); await saveSite(after); }
    portfolioChanged();
    refresh(); // the Projects page shows the link to it
    return result;
  } catch (e) {
    toast(`The project was added, but its case study wasn't created: ${e.message}`, "error");
    return "";
  }
}

/**
 * Saves a project; its case studies, milestones and tasks follow. Returns what was
 * updated ("" if nothing); for a new project, "created" or "linked" (its case study).
 */
export async function saveProjectLinked(p) {
  const before = p.id ? state.projects.find((x) => x.id === p.id) : null;
  const saved = await saveProject(p);
  if (!before) return caseForNewProject(saved);
  const plan = planProjectSync(before, saved, { cases: currentSite().cases || [], milestones: state.milestones, tasks: state.tasks });
  if (!plan.cases.length && !plan.milestones.length && !plan.tasks.length) return "";
  try {
    await patchCases(plan.cases);
    for (const m of plan.milestones) {
      const cur = state.milestones.find((x) => x.id === m.id);
      if (cur) await state.store.saveMilestone({ ...cur, category: m.category });
    }
    for (const t of plan.tasks) {
      const cur = state.tasks.find((x) => x.id === t.id);
      if (cur) await state.store.saveTask({ ...cur, category: t.category });
    }
    if (plan.milestones.length || plan.tasks.length) await reload();
  } catch (e) {
    toast(`The project was saved, but updating what's linked to it didn't finish: ${e.message}`, "error");
    throw e;
  }
  return describeSync(plan);
}

/** Deletes a project; its case studies stay on the portfolio, unlinked. Returns how many were unlinked. */
export async function deleteProjectLinked(id) {
  const p = state.projects.find((x) => x.id === id);
  const patches = p ? planProjectDelete(p, { cases: currentSite().cases || [] }) : [];
  await deleteProject(id);
  await patchCases(patches);
  return patches.length;
}

/** Moves a project to a place (0 = first); its case studies (and so the portfolio) follow. */
export async function placeProjectLinked(id, to) {
  await placeProject(id, to);
  const site = currentSite();
  const ids = caseOrderFromProjects(site.cases || [], state.projects);
  if (!ids) return false;
  site.cases = ids.map((cid) => site.cases.find((c) => c.id === cid));
  try {
    await saveSite(site);
    portfolioChanged();
  } catch (e) {
    toast(`The projects were reordered, but the case studies didn't follow: ${e.message}`, "error");
    return false;
  }
  return true;
}

/**
 * Once: every project that has no case study gets one ("In progress", placeholder
 * screens), in the projects' order; ones that match by name are linked. Marked
 * done on the portfolio (casesFilled), so a case study you delete later doesn't
 * come back. Only the owner's portfolio (the one who manages the projects).
 */
export async function fillMissingCases() {
  if (!state.isOwner || !Array.isArray(state.projects) || !state.projects.length) return 0;
  const site = currentSite();
  if (site.casesFilled || !hasSite(site)) return 0; // a portfolio not set up as a site yet stays as it is
  site.cases = site.cases || [];
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "case";
  let made = 0;
  for (const p of state.projects) {
    const mine = casesOfProject(site.cases, p);
    if (mine.length) { mine.forEach((c) => { if (!c.project) c.project = p.name; }); continue; }
    let id = slug(p.name);
    while (site.cases.some((c) => c.id === id)) id += "-" + Math.random().toString(36).slice(2, 6);
    site.cases.push({ ...caseFromProject(p), id, status: "progress" });
    made++;
  }
  const ids = caseOrderFromProjects(site.cases, state.projects);
  if (ids) site.cases = ids.map((id) => site.cases.find((c) => c.id === id));
  site.casesFilled = true;
  try {
    await saveSite(site);
  } catch (e) { console.error("Couldn't add case studies for your projects", e); return 0; }
  if (made) { portfolioChanged(); toast(`${made} case stud${made === 1 ? "y" : "ies"} created for your projects`); }
  return made;
}
