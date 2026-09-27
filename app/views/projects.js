// Projects page (☰ menu). The team owner adds, edits, reorders and deletes
// the team's projects; everyone else sees them read-only.
import { state, saveProject, deleteProject, moveProject, toast } from "../state.js";
import { esc, openModal, confirmDialog, progressBar } from "../ui/dom.js";
import { PROJECT_STATUSES, LINK_LABELS, projectProgress } from "../core/projects.js";
import { projectCard } from "./project-cards.js";

export function renderProjects(el) {
  if (state.projects === null) {
    el.innerHTML = `<header class="li-view-head"><div><span class="card-label">Projects</span><h2 class="li-h2">Projects</h2></div></header>
      <p class="li-empty">Projects need one more database update: run <code>supabase/migrations/20260929000000_projects.sql</code> in Supabase's SQL Editor, then refresh.</p>`;
    return;
  }
  const list = state.projects;
  if (!state.isOwner) {
    el.innerHTML = `<header class="li-view-head"><div><span class="card-label">Projects</span><h2 class="li-h2">${list.length} project${list.length === 1 ? "" : "s"}</h2></div></header>
      ${list.length ? list.map((p) => projectCard(p)).join("") : `<p class="li-empty">No projects yet.</p>`}`;
    return;
  }
  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Projects</span><h2 class="li-h2">${list.length} project${list.length === 1 ? "" : "s"}</h2>
        <span class="li-sub">Shown as cards on the Overview, in this order. Your team sees them; only you can change them.</span></div>
      <button type="button" class="li-btn primary" id="li-project-add">+ New project</button>
    </header>
    ${list.length ? `<ul class="li-project-list">${list.map((p, i) => {
      const prog = projectProgress(p);
      return `<li data-project="${esc(p.id)}">
        <div class="li-project-row-main">
          <b class="li-project-row-name">${esc(p.name)}</b>${p.code ? ` <small class="li-muted">${esc(p.code)}</small>` : ""}
          <span class="li-pill pj-${esc(p.status)}">${esc(PROJECT_STATUSES[p.status] || "")}</span>
          <div class="li-progress-line">${progressBar(prog.pct, "Checklist")}<span>${prog.total ? `${prog.done}/${prog.total}` : "No checklist"}</span></div>
        </div>
        <div class="li-btn-row">
          <button type="button" class="li-btn small" data-move="-1" aria-label="Move ${esc(p.name)} up"${i === 0 ? " disabled" : ""}>↑</button>
          <button type="button" class="li-btn small" data-move="1" aria-label="Move ${esc(p.name)} down"${i === list.length - 1 ? " disabled" : ""}>↓</button>
          <button type="button" class="li-btn small" data-edit>Edit</button>
          <button type="button" class="li-btn small danger-ghost" data-delete>Delete</button>
        </div>
      </li>`;
    }).join("")}</ul>` : `<p class="li-empty">No projects yet. Add your first one.</p>`}`;

  el.querySelector("#li-project-add").addEventListener("click", () => openProjectForm());
  el.querySelectorAll("[data-project]").forEach((row) => {
    const p = list.find((x) => x.id === row.dataset.project);
    row.querySelector("[data-edit]").addEventListener("click", () => openProjectForm(p));
    row.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => moveProject(p.id, Number(b.dataset.move)).catch(() => {})));
    row.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!(await confirmDialog(`Delete the project "${p.name}"? Its card and checklist go; tasks aren't affected.`, "Delete"))) return;
      await deleteProject(p.id).then(() => toast(`${p.name} deleted`), () => {});
    });
  });
}

const itemRow = (it = {}) => `<div class="li-cl-row" data-id="${esc(it.id || "")}">
  <input type="checkbox" aria-label="Done"${it.done ? " checked" : ""}>
  <input type="text" class="li-cl-text" maxlength="300" placeholder="Checklist item" value="${esc(it.text || "")}">
  <input type="text" class="li-cl-deadline" maxlength="40" placeholder="Deadline" value="${esc(it.deadline || "")}">
  <button type="button" class="li-icon-btn" data-remove aria-label="Remove item">&#10005;</button>
</div>`;

export function openProjectForm(p = {}) {
  const editing = !!p.id;
  openModal({
    eyebrow: editing ? "Edit project" : "New project",
    title: editing ? p.name : "Add a project",
    submitLabel: editing ? "Save" : "Add project",
    wide: true,
    body: `
        <label class="li-field">Name<input name="name" maxlength="80" required value="${esc(p.name || "")}"></label>
        <label class="li-field">Code<input name="code" maxlength="8" placeholder="e.g. FLT" value="${esc(p.code || "")}"></label>
        <label class="li-field">Category<input name="category" maxlength="120" placeholder="e.g. Flight booking" value="${esc(p.category || "")}"></label>
        <label class="li-field">Stage<input name="stage" maxlength="120" placeholder="e.g. Case study drafted" value="${esc(p.stage || "")}"></label>
        <label class="li-field">Status<select name="status">${Object.entries(PROJECT_STATUSES).map(([k, v]) => `<option value="${k}"${(p.status || "idle") === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="li-field full">Key facts <small class="li-muted">(one per line)</small><textarea name="facts" rows="3" maxlength="3000">${esc((p.facts || []).join("\n"))}</textarea></label>
        ${Object.entries(LINK_LABELS).map(([k, label]) => `<label class="li-field">${label} link<input name="link_${k}" type="url" maxlength="300" placeholder="https://" value="${esc(p.links?.[k] || "")}"></label>`).join("")}
        <div class="li-field full"><span>Checklist</span><div class="li-cl-rows">${(p.checklist || []).map(itemRow).join("")}</div>
          <button type="button" class="li-btn small" data-add-item>+ Add item</button></div>`,
    onReady(form) {
      const rows = form.querySelector(".li-cl-rows");
      form.querySelector("[data-add-item]").addEventListener("click", () => { rows.insertAdjacentHTML("beforeend", itemRow()); rows.lastElementChild.querySelector(".li-cl-text").focus(); });
      rows.addEventListener("click", (e) => { if (e.target.closest("[data-remove]")) e.target.closest(".li-cl-row").remove(); });
    },
    async onSubmit(v, form) {
      if (!v.name.trim()) throw new Error("Give the project a name.");
      const links = {};
      for (const k of Object.keys(LINK_LABELS)) {
        const u = (v["link_" + k] || "").trim();
        if (u && !/^https?:\/\/\S+$/i.test(u)) throw new Error(`The ${LINK_LABELS[k]} link must start with https://`);
        if (u) links[k] = u;
      }
      let n = 0;
      const checklist = [...form.querySelectorAll(".li-cl-row")].map((r) => ({
        id: r.dataset.id || `c${Date.now().toString(36)}${n++}`,
        text: r.querySelector(".li-cl-text").value.trim(),
        done: r.querySelector("input[type=checkbox]").checked,
        deadline: r.querySelector(".li-cl-deadline").value.trim() || null,
      })).filter((it) => it.text);
      await saveProject({
        ...(editing ? { id: p.id } : {}),
        name: v.name.trim(), code: v.code.trim() || null, category: v.category.trim() || null, stage: v.stage.trim() || null,
        status: v.status, facts: v.facts.split("\n").map((s) => s.trim()).filter(Boolean), links, checklist,
      });
      toast(editing ? "Project saved" : "Project added");
    },
  });
}
