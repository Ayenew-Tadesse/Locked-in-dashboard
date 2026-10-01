// A project group's page (#/group/<id>): the project's progress, the people
// and everyone's tasks on the project, so the group can see who's doing what.
// #/group lists the groups you can see. Tasks are read only here; each person
// works on their own from Tasks.
import { state, memberName } from "../state.js";
import { esc } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";
import { isOverdue, sortTasks } from "../core/tasks.js";
import { addDays, dayOf } from "../core/dates.js";
import { projectCard } from "./project-cards.js";

const loaded = new Map(); // project id -> tasks (fetched when the page opens)
let host = null;

const projectOf = (g) => (state.projects || []).find((p) => p.id === g.project_id);

export function renderGroup(el, params, id) {
  host = el;
  const groups = Array.isArray(state.groups) ? state.groups : [];
  if (!id) {
    el.innerHTML = `<header class="li-view-head"><div><span class="card-label">Project groups</span><h2 class="li-h2">Your groups</h2></div></header>
      ${groups.length ? `<section class="li-card"><ul class="li-groups">${groups.map((g) => `<li><div class="li-group-main">
        <a class="li-link" href="#/group/${esc(g.id)}"><b>${esc(g.name)}</b></a> <span class="li-pill">${esc(projectOf(g)?.name || "Project")}</span>
        <div class="li-group-people">${g.members.map((u) => `<span class="li-chip${u === g.lead_id ? " lead" : ""}">${esc(memberName(u))}</span>`).join("")}</div></div></li>`).join("")}</ul></section>`
        : `<p class="li-empty">You're not in a project group yet.</p>`}`;
    return;
  }
  const g = groups.find((x) => x.id === id);
  if (!g) { el.innerHTML = `<p class="li-empty">That group isn't available. <a class="li-link" href="#/group">Your groups</a></p>`; return; }
  const p = projectOf(g);
  const tasks = loaded.get(g.project_id);
  if (!tasks) fetchTasks(g.project_id);
  const today = state.today;
  const mine = (tasks || []).filter((t) => g.members.includes(t.user_id) || state.isManager);
  const open = sortTasks(mine.filter((t) => !["completed", "cancelled"].includes(t.status)), today);
  const done = mine.filter((t) => t.status === "completed" && dayOf(t.completed_at, state.timeZone) >= addDays(today, -14))
    .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
  const per = (u) => {
    const ts = mine.filter((t) => t.user_id === u && t.status !== "cancelled");
    return { open: ts.filter((t) => t.status !== "completed").length, late: ts.filter((t) => isOverdue(t, today)).length };
  };
  el.innerHTML = `
    <header class="li-view-head">
      <div><a class="li-link" href="#/group">&#8249; Groups</a><span class="card-label">Project group</span><h2 class="li-h2">${esc(g.name)}</h2>
        <span class="li-sub">${esc(p?.name || "Project")}${g.lead_id ? ` · Lead: ${esc(memberName(g.lead_id))}` : ""}</span></div>
    </header>
    ${p ? projectCard(p) : ""}
    <section class="li-card" id="li-group-members">
      <div class="li-card-head"><span class="card-label">People</span></div>
      <ul class="li-mini">${g.members.map((u) => { const n = per(u); return `<li><span><b>${esc(memberName(u))}</b>${u === g.lead_id ? ` <span class="li-pill">Lead</span>` : ""}${u === state.me ? ` <small class="li-muted">(you)</small>` : ""}</span>
        <span class="li-muted">${tasks ? `${n.open} open${n.late ? ` · <span class="li-danger">${n.late} overdue</span>` : ""}` : "…"}</span></li>`; }).join("")}</ul>
    </section>
    <section class="li-card" id="li-group-open">
      <div class="li-card-head"><span class="card-label">Open work on ${esc(p?.name || "the project")}</span></div>
      ${tasks ? taskList(open, { showDate: true, showOwner: true, readOnly: true, empty: "Nothing open on this project." }) : `<p class="li-empty">Loading…</p>`}
    </section>
    <section class="li-card" id="li-group-done">
      <div class="li-card-head"><span class="card-label">Done in the last 14 days</span></div>
      ${tasks ? taskList(done, { showDate: true, showOwner: true, readOnly: true, empty: "Nothing finished in the last 14 days." }) : `<p class="li-empty">Loading…</p>`}
    </section>`;
}

async function fetchTasks(projectId) {
  try {
    loaded.set(projectId, await state.store.loadProjectTasks(projectId));
  } catch (e) {
    console.warn("group tasks:", e.message);
    loaded.set(projectId, []);
  }
  // Redraw if the page is still showing.
  if (host && document.contains(host) && !host.hidden && /^#\/group\//.test(location.hash)) window.dispatchEvent(new Event("li:rerender"));
}

/** Forget fetched tasks (after changes elsewhere), so the page loads them fresh. */
export function forgetGroupTasks() { loaded.clear(); }
