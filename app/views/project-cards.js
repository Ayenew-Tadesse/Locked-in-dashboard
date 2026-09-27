// One card per project on the Overview, under the Activity card (replacing
// the original app buttons). Everyone on the team sees them; the owner can
// tick checklist items straight from the card.
import { state, toggleProjectItem, toast } from "../state.js";
import { esc, progressBar } from "../ui/dom.js";
import { PROJECT_STATUSES, LINK_LABELS, projectProgress, safeUrl } from "../core/projects.js";

export function projectCard(p, { canTick = false } = {}) {
  const prog = projectProgress(p);
  const links = Object.entries(LINK_LABELS).map(([k, label]) => [label, safeUrl(p.links?.[k])]).filter(([, u]) => u);
  return `<section class="li-card li-project" data-project="${esc(p.id)}" aria-label="${esc(p.name)}">
    <div class="li-project-head">
      <div class="li-project-title">
        <span class="card-label">Project${p.code ? " · " + esc(p.code) : ""}</span>
        <h3 class="li-project-name">${esc(p.name)}</h3>
        ${p.category ? `<span class="li-sub">${esc(p.category)}</span>` : ""}
      </div>
      <span class="li-pill pj-${esc(p.status || "idle")}">${esc(PROJECT_STATUSES[p.status] || PROJECT_STATUSES.idle)}</span>
    </div>
    ${p.stage ? `<p class="li-project-stage"><span class="li-muted">Stage</span> ${esc(p.stage)}</p>` : ""}
    ${(p.facts || []).length ? `<ul class="li-project-facts">${p.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${links.length ? `<div class="li-btn-row li-project-links">${links.map(([label, u]) => `<a class="li-btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("")}</div>` : ""}
    ${prog.total ? `<div class="li-project-check">
      <div class="li-progress-line">${progressBar(prog.pct, "Checklist")}<span>${prog.done} of ${prog.total} done</span></div>
      <ul class="li-project-items">${p.checklist.map((it) => `<li class="${it.done ? "done" : ""}">
        <label><input type="checkbox" data-item="${esc(it.id)}"${it.done ? " checked" : ""}${canTick ? "" : " disabled"}><span>${esc(it.text)}</span></label>
        ${it.deadline ? `<span class="li-meta">${esc(it.deadline)}</span>` : ""}</li>`).join("")}</ul>
    </div>` : ""}
  </section>`;
}

export function renderProjectCards(el) {
  if (!el) return;
  const list = Array.isArray(state.projects) ? state.projects : [];
  document.documentElement.classList.toggle("li-has-projects", Array.isArray(state.projects));
  el.hidden = !list.length;
  el.innerHTML = list.map((p) => projectCard(p, { canTick: state.isOwner })).join("")
    + (state.isOwner && list.length ? `<p class="li-project-manage"><a class="li-link" href="#/projects">Manage projects</a></p>` : "");
  el.querySelectorAll("[data-item]").forEach((box) => box.addEventListener("change", async () => {
    const id = box.closest("[data-project]").dataset.project;
    await toggleProjectItem(id, box.dataset.item).then(() => toast(box.checked ? "Checklist item done" : "Marked not done"), () => { box.checked = !box.checked; });
  }));
}
