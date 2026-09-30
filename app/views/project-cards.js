// Projects on the Overview, under the Activity card (replacing the original
// app buttons): small cards, three in a row, with the name, a short
// description and progress. Tapping one opens its full details (links,
// stage, facts, checklist); the owner can tick checklist items there.
import { state, toggleProjectItem, toast } from "../state.js";
import { esc, openModal } from "../ui/dom.js";
import { PROJECT_STATUSES, LINK_LABELS, projectProgress, projectBlurb, safeUrl } from "../core/projects.js";
import { projectPlan, PLAN_LABELS, PACE_LABELS } from "../core/insights.js";
import { formatDay } from "../core/dates.js";

// Is the project going as planned? Green on plan, red behind, grey not started
// (its milestones and quarterly goal decide; without milestones, its own status).
export function planOf(p) {
  const plan = projectPlan(p, { milestones: state.milestones, goals: state.goals, tasks: state.tasks, today: state.today, timeZone: state.timeZone, quarter: state.quarterAt() });
  if (plan.state === "manual") {
    const st = p.status || "idle";
    return { ...plan, tone: st === "good" ? "green" : st === "warn" ? "red" : "idle", label: PROJECT_STATUSES[st] || PROJECT_STATUSES.idle, reason: PROJECT_STATUSES[st] || "" };
  }
  return { ...plan, tone: plan.state === "on_plan" ? "green" : plan.state === "behind" ? "red" : "idle", label: PLAN_LABELS[plan.state] };
}
const bar = (pct, tone, label) => {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `<span class="li-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${esc(label)}"><b class="${tone}" style="width:${v}%"></b></span>`;
};

export function projectCard(p, { canTick = false } = {}) {
  const prog = projectProgress(p);
  const plan = planOf(p);
  const links = Object.entries(LINK_LABELS).map(([k, label]) => [label, safeUrl(p.links?.[k])]).filter(([, u]) => u);
  return `<section class="li-card li-project" data-project="${esc(p.id)}" aria-label="${esc(p.name)}">
    <div class="li-project-head">
      <div class="li-project-title">
        <span class="card-label">Project${p.code ? " · " + esc(p.code) : ""}</span>
        <h3 class="li-project-name">${esc(p.name)}</h3>
        ${projectBlurb(p) ? `<span class="li-sub">${esc(projectBlurb(p))}</span>` : ""}
      </div>
      <span class="li-pill plan-${plan.tone}">${esc(plan.label)}</span>
    </div>
    ${plan.state !== "manual" ? `<div class="li-project-plan">
      <p class="li-plan-reason ${plan.tone}">${esc(plan.reason)}</p>
      <ul class="li-plan-list">${plan.milestones.map(({ m, info, started }) => {
        const tone = ["behind", "overdue"].includes(info.pace) && started ? "red" : info.pace === "done" || (started && info.pace === "on_track") ? "green" : "idle";
        return `<li><a href="#/milestones/${esc(m.id)}" class="li-link">${esc(m.title)}</a>
          <span class="li-plan-pace ${tone}">${Math.round(Number(m.percentage_complete) || 0)}%${info.expected_pct != null && started && info.pace !== "done" ? ` of ${info.expected_pct}% expected` : ""} · ${esc(!started && info.pace !== "done" ? `starts ${formatDay(m.start_date, { month: "short", day: "numeric" })}` : PACE_LABELS[info.pace])}</span></li>`;
      }).join("")}</ul>
      ${plan.goals.map(({ g, pct, expected, behind }) => `<p class="li-plan-goal ${behind ? "red" : "green"}">This quarter's goal: <a href="#/quarter" class="li-link">${esc(g.title)}</a> · ${pct}%${expected != null ? ` with ${expected}% of the quarter gone` : ""}</p>`).join("")}
    </div>` : ""}
    ${p.stage ? `<p class="li-project-stage"><span class="li-muted">Stage</span> ${esc(p.stage)}</p>` : ""}
    ${(p.facts || []).length ? `<ul class="li-project-facts">${p.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${links.length ? `<div class="li-btn-row li-project-links">${links.map(([label, u]) => `<a class="li-btn small" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join("")}</div>` : ""}
    ${prog.total ? `<div class="li-project-check">
      <div class="li-progress-line">${bar(prog.pct, plan.tone, "Checklist")}<span>${prog.done} of ${prog.total} done</span></div>
      <ul class="li-project-items">${p.checklist.map((it) => `<li class="${it.done ? "done" : ""}">
        <label><input type="checkbox" data-item="${esc(it.id)}"${it.done ? " checked" : ""}${canTick ? "" : " disabled"}><span>${esc(it.text)}</span></label>
        ${it.deadline ? `<span class="li-meta">${esc(it.deadline)}</span>` : ""}</li>`).join("")}</ul>
    </div>` : ""}
  </section>`;
}

/** The small Overview card: name, description, progress. */
function projectTile(p) {
  const prog = projectProgress(p);
  const plan = planOf(p);
  return `<button type="button" class="li-project-tile plan-${plan.tone}" data-open="${esc(p.id)}" data-plan="${esc(plan.state === "manual" ? "manual" : plan.state)}" title="${esc(plan.reason)}" aria-label="${esc(p.name)}: ${prog.pct}% done, ${esc(plan.reason || plan.label)}. Show details">
    <span class="li-pt-name">${esc(p.name)}</span>
    <span class="li-pt-desc">${esc(projectBlurb(p)) || "&nbsp;"}</span>
    <span class="li-pt-pct ${plan.tone}">${prog.pct}<small>%</small></span>
    ${bar(prog.pct, plan.tone, "Progress")}
    <span class="li-pt-plan ${plan.tone}">${esc(plan.label)}</span>
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
  const form = openModal({ eyebrow: p.code ? `Project · ${p.code}` : "Project", title: p.name, body: `<div class="li-project-detail full">${projectCard(p, { canTick: state.isManager })}</div>`, cancelLabel: "Close", wide: true });
  const box = form.querySelector(".li-project-detail");
  box.addEventListener("change", async (e) => {
    const cb = e.target.closest("[data-item]");
    if (!cb) return;
    await toggleProjectItem(id, cb.dataset.item).then(() => {
      toast(cb.checked ? "Checklist item done" : "Marked not done");
      const fresh = state.projects.find((x) => x.id === id);
      if (fresh && document.contains(box)) box.innerHTML = projectCard(fresh, { canTick: state.isManager });
    }, () => { cb.checked = !cb.checked; });
  });
}
