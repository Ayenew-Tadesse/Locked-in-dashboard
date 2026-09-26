// Tasks: search and filter everything. Filters live in the URL
// (#/tasks?status=overdue&priority=high) so views can link to them.
import { state } from "../state.js";
import { filterTasks, sortTasks, categoriesOf, STATUSES, PRIORITIES } from "../core/tasks.js";
import { formatDay } from "../core/dates.js";
import { esc, options } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";

const DEADLINES = { "": "Any deadline", overdue: "Overdue", today: "Due today", week: "Due this week", next7: "Due in next 7 days", none: "No deadline" };
const KEYS = ["q", "status", "priority", "category", "milestone", "deadline", "from", "to"];

export function renderTasks(el, params) {
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || ""]));
  const today = state.today;
  const list = sortTasks(filterTasks(state.tasks, f, today), today);
  const active = KEYS.filter((k) => f[k]).length;
  // Group by planned date, newest first; tasks from today onwards first.
  const groups = new Map();
  list.slice().sort((a, b) => (b.date >= today) - (a.date >= today) || (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    .forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Tasks</span><h2 class="li-h2">${list.length} task${list.length === 1 ? "" : "s"}${active ? " match" : ""}</h2></div>
      <button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>
    </header>
    <form class="li-filters" id="li-filters" role="search" autocomplete="off">
      <input type="search" name="q" value="${esc(f.q)}" placeholder="Search title, notes, category…" aria-label="Search tasks" class="li-search">
      <select name="status" aria-label="Status">${options(Object.entries(STATUSES), f.status, { empty: "Any status" })}</select>
      <select name="priority" aria-label="Priority">${options(Object.entries(PRIORITIES).map(([k, v]) => [k, v.label]), f.priority, { empty: "Any priority" })}</select>
      <select name="category" aria-label="Category">${options(categoriesOf(state.tasks).map((c) => [c, c]), f.category, { empty: "Any category" })}</select>
      <select name="milestone" aria-label="Milestone">${options([["none", "No milestone"], ...state.milestones.map((m) => [m.id, m.title])], f.milestone, { empty: "Any milestone" })}</select>
      <select name="deadline" aria-label="Deadline">${options(Object.entries(DEADLINES), f.deadline)}</select>
      <label class="li-inline">From <input type="date" name="from" value="${esc(f.from)}"></label>
      <label class="li-inline">To <input type="date" name="to" value="${esc(f.to)}"></label>
      ${active ? `<a class="li-link" href="#/tasks">Clear filters</a>` : ""}
    </form>
    <div id="li-task-results">
      ${list.length ? [...groups].map(([d, ts]) => `<section class="li-group"><h3 class="li-group-h">${esc(formatDay(d, { weekday: "long", month: "short", day: "numeric", year: "numeric" }))}${d === today ? " · Today" : ""}</h3>${taskList(ts)}</section>`).join("")
        : `<p class="li-empty">${active ? "No tasks match these filters." : "No tasks yet. Add your first one."}</p>`}
    </div>`;

  const form = el.querySelector("#li-filters");
  let t;
  const apply = () => {
    const p = new URLSearchParams();
    for (const k of KEYS) if (form.elements[k].value) p.set(k, form.elements[k].value);
    const next = "#/tasks" + (p.toString() ? "?" + p : "");
    if (location.hash !== next) history.replaceState(null, "", next);
    window.dispatchEvent(new CustomEvent("li:rerender", { detail: { keepFocus: form.elements.q === document.activeElement } }));
  };
  form.addEventListener("change", apply);
  form.addEventListener("input", (e) => { if (e.target.name === "q") { clearTimeout(t); t = setTimeout(apply, 200); } });
  form.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
}
