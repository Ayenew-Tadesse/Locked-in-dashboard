// Projects on the Overview, under the Activity card (replacing the original
// app buttons): small cards, three in a row, with the name, a short
// description and progress. Tapping one opens its full details (links,
// stage, facts, checklist); the owner can tick checklist items there.
import { state, toggleProjectItem, toast } from "../state.js";
import { esc, progressBar, openModal, scoreTone } from "../ui/dom.js";
import { PROJECT_STATUSES, LINK_LABELS, projectProgress, projectBlurb, safeUrl } from "../core/projects.js";

export function projectCard(p, { canTick = false } = {}) {
  const prog = projectProgress(p);
  const links = Object.entries(LINK_LABELS).map(([k, label]) => [label, safeUrl(p.links?.[k])]).filter(([, u]) => u);
  return `<section class="li-card li-project" data-project="${esc(p.id)}" aria-label="${esc(p.name)}">
    <div class="li-project-head">
      <div class="li-project-title">
        <span class="card-label">Project${p.code ? " · " + esc(p.code) : ""}</span>
        <h3 class="li-project-name">${esc(p.name)}</h3>
        ${projectBlurb(p) ? `<span class="li-sub">${esc(projectBlurb(p))}</span>` : ""}
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

/** The small Overview card: name, description, progress. */
function projectTile(p) {
  const prog = projectProgress(p);
  return `<button type="button" class="li-project-tile" data-open="${esc(p.id)}" aria-label="${esc(p.name)}: ${prog.pct}% done. Show details">
    <span class="li-pt-name">${esc(p.name)}</span>
    <span class="li-pt-desc">${esc(projectBlurb(p)) || "&nbsp;"}</span>
    <span class="li-pt-pct ${scoreTone(prog.pct)}">${prog.pct}<small>%</small></span>
    ${progressBar(prog.pct, "Progress")}
  </button>`;
}

export function renderProjectCards(el) {
  if (!el) return;
  const list = Array.isArray(state.projects) ? state.projects : [];
  document.documentElement.classList.toggle("li-has-projects", Array.isArray(state.projects));
  el.hidden = !list.length;
  el.innerHTML = `<div class="li-project-grid">${list.map(projectTile).join("")}</div>`;
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openProjectDetails(b.dataset.open)));
}

/** Full details in a dialog; the owner can tick checklist items. */
export function openProjectDetails(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  const form = openModal({ eyebrow: p.code ? `Project · ${p.code}` : "Project", title: p.name, body: `<div class="li-project-detail full">${projectCard(p, { canTick: state.isOwner })}</div>`, cancelLabel: "Close", wide: true });
  const box = form.querySelector(".li-project-detail");
  box.addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-item]");
    if (!cb) return;
    await toggleProjectItem(id, cb.dataset.item).then(() => {
      toast(cb.checked ? "Checklist item done" : "Marked not done");
      const fresh = state.projects.find((x) => x.id === id);
      if (fresh && document.contains(box)) box.innerHTML = projectCard(fresh, { canTick: state.isOwner });
    }, () => { cb.checked = !cb.checked; });
  });
}
