// Tasks: every task, grouped by planned day. The Overdue tile links to
// #/tasks?deadline=overdue to show just the overdue ones.
import { state } from "../state.js";
import { filterTasks, sortTasks } from "../core/tasks.js";
import { formatDay } from "../core/dates.js";
import { esc } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";

export function renderTasks(el, params) {
  const today = state.today;
  const overdueOnly = params.get("deadline") === "overdue";
  const list = sortTasks(filterTasks(state.tasks, overdueOnly ? { deadline: "overdue" } : {}, today), today);
  // Group by planned date, newest first; tasks from today onwards first.
  const groups = new Map();
  list.slice().sort((a, b) => (b.date >= today) - (a.date >= today) || (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    .forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Tasks</span><h2 class="li-h2">${list.length}${overdueOnly ? " overdue" : ""} task${list.length === 1 ? "" : "s"}</h2></div>
      ${state.canAddTasks ? `<button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>` : ""}
    </header>
    ${overdueOnly ? `<p class="li-tasks-showing">Showing overdue tasks · <a class="li-link" href="#/tasks">Show all</a></p>` : ""}
    <div id="li-task-results">
      ${list.length ? [...groups].map(([d, ts]) => `<section class="li-group"><h3 class="li-group-h">${esc(formatDay(d, { weekday: "long", month: "short", day: "numeric", year: "numeric" }))}${d === today ? " · Today" : ""}</h3>${taskList(ts)}</section>`).join("")
        : `<p class="li-empty">${overdueOnly ? "Nothing overdue. All caught up." : state.canAddTasks ? "No tasks yet. Add your first one." : "No tasks yet."}</p>`}
    </div>`;
}
