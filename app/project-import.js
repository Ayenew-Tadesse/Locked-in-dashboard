// Importing a project file (app/core/project-pack.js): pick the file, see
// what it adds, then add it as you, through the same store as everything
// else (your sign-in and the database's rules). Nothing is added twice.
import { state, saveProject, reload, toast, can } from "./state.js";
import { esc, openModal } from "./ui/dom.js";
import { parsePack, planImport, packRows, caseImages } from "./core/project-pack.js";
import { currentSite, storeCase, portfolioChanged } from "./views/portfolio-site.js";

const MAX_BYTES = 15 * 1024 * 1024;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function planFor(pack) {
  return planImport(pack, {
    projects: state.team ? state.projects : null,
    canAddProject: !!state.team && state.isManager && can("edit_projects"),
    milestones: state.milestones,
    cases: currentSite().cases || [],
  });
}

function previewHtml(pack, plan) {
  const row = (ok, text) => `<li class="${ok ? "" : "li-muted"}">${ok ? "&#10003;" : "&#8212;"} ${text}</li>`;
  const project = {
    add: `Project <b>${esc(pack.project?.name)}</b> with ${plural(pack.project?.checklist.length || 0, "checklist item")}`,
    exists: `Project <b>${esc(pack.project?.name)}</b> is already on your Projects page (kept as it is)`,
    no_team: "The project card needs a team: skipped (everything else is added)",
    no_permission: "Only the team owner can add projects: the project card is skipped",
  }[plan.project];
  return `<ul class="li-import-list">
    ${project ? row(plan.project === "add", project) : ""}
    ${pack.milestones.length ? row(plan.milestones.add > 0, `${plural(plan.milestones.add, "milestone")} with ${plural(plan.tasks, "task")}${plan.milestones.skip ? ` (${plan.milestones.skip} you already have, skipped)` : ""}`) : ""}
    ${plan.case ? row(plan.case === "add", plan.case === "add"
      ? `Case study <b>${esc(pack.caseStudy.title)}</b>${plan.images ? ` with ${plural(plan.images, "picture")}` : ""}, on your portfolio`
      : `Case study <b>${esc(pack.caseStudy.title)}</b> is already in your portfolio (kept as it is)`) : ""}
  </ul>`;
}

/** Copies the case study, uploading any pictures carried in the file into your portfolio storage. */
async function uploadImages(c, onStep) {
  const copy = JSON.parse(JSON.stringify(c));
  let n = 0;
  for (const [holder, key] of caseImages(copy)) {
    if (!/^data:image\//i.test(holder[key])) continue;
    onStep(++n);
    const blob = await (await fetch(holder[key])).blob();
    const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
    holder[key] = await state.store.uploadPortfolioImage(blob, `${copy.id || "case"}-${n}.${ext}`);
  }
  return copy;
}

/** Adds what's new from the file. Returns a short summary of what was added. */
export async function importPack(pack, onStep = () => {}) {
  const plan = planFor(pack);
  const added = [];
  let projectId = null;
  if (plan.project === "add") {
    onStep("Adding the project…");
    projectId = (await saveProject(pack.project)).id;
    added.push("project");
  } else if (plan.project === "exists") {
    projectId = state.projects.find((p) => p.name.toLowerCase() === pack.project.name.toLowerCase())?.id || null;
  }
  if (plan.newMilestones.length) {
    onStep("Adding milestones and tasks…");
    const rows = packRows(plan.newMilestones, state.store.newId, { projectId });
    try {
      await state.store.importData(rows);
    } catch (e) {
      // Without project access (or before the project migration), add the tasks without linking them to the project.
      if (!projectId || !/project/i.test(e.message)) throw e;
      await state.store.importData(packRows(plan.newMilestones, state.store.newId));
    }
    added.push(plural(plan.milestones.add, "milestone"), plural(plan.tasks, "task"));
  }
  if (plan.case === "add") {
    const c = await uploadImages(pack.caseStudy, (n) => onStep(`Uploading picture ${n} of ${plan.images}…`));
    onStep("Adding the case study…");
    await storeCase(c, null);
    portfolioChanged();
    added.push("case study");
  }
  await reload();
  return added;
}

/** The "Import project file" dialog. */
export function openImportDialog() {
  let pack = null;
  openModal({
    eyebrow: "Projects", title: "Import a project file", submitLabel: "Import", wide: true,
    body: `
      <p class="li-sub full">A project file (.json) brings in a project card, its milestones and tasks, and a case study for your portfolio. You'll see what it adds before anything is saved, and nothing you already have is added twice.</p>
      <label class="li-field full">Project file<input type="file" name="file" accept=".json,application/json" data-pack-file></label>
      <div class="full" data-pack-preview aria-live="polite"></div>`,
    onReady(form) {
      const preview = form.querySelector("[data-pack-preview]");
      form.querySelector("[data-pack-file]").addEventListener("change", async (e) => {
        pack = null;
        preview.innerHTML = "";
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          if (file.size > MAX_BYTES) throw new Error("This file is too large (over 15 MB).");
          pack = parsePack(await file.text());
          const plan = planFor(pack);
          const nothing = plan.project !== "add" && !plan.milestones.add && plan.case !== "add";
          preview.innerHTML = `<p><b>${nothing ? "Everything in this file is already in your dashboard." : "This will add:"}</b></p>${previewHtml(pack, plan)}`;
        } catch (err) {
          preview.innerHTML = `<p class="li-form-error">${esc(err.message)}</p>`;
        }
      });
    },
    async onSubmit(_v, form) {
      if (!pack) throw new Error("Choose a project file first.");
      const preview = form.querySelector("[data-pack-preview]");
      const added = await importPack(pack, (msg) => { preview.innerHTML = `<p>${esc(msg)}</p>`; });
      toast(added.length ? `Imported: ${added.join(", ")}` : "Nothing new to import");
    },
  });
}
