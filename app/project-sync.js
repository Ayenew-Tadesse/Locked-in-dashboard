// Saving or deleting a project, and bringing everything about it along:
// its case studies (and so the portfolio), milestones and tasks
// (core/project-links.js decides what changes). Used by the Projects page.
import { state, saveProject, deleteProject, placeProject, reload, toast } from "./state.js";
import { planProjectSync, planProjectDelete, describeSync, caseOrderFromProjects } from "./core/project-links.js";
import { currentSite, saveSite, portfolioChanged } from "./views/portfolio-site.js";

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

/** Saves a project; its case studies, milestones and tasks follow. Returns what was updated ("" if nothing). */
export async function saveProjectLinked(p) {
  const before = p.id ? state.projects.find((x) => x.id === p.id) : null;
  const saved = await saveProject(p);
  if (!before) return "";
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
