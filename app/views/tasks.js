// Tasks: every task grouped by planned day, with buttons to show one status
// at a time (#/tasks?status=ongoing). The Overview's Overdue tile opens
// #/tasks?status=overdue.
import { state } from "../state.js";
import { effectiveStatus, sortTasks } from "../core/tasks.js";
import { formatDay } from "../core/dates.js";
import { esc } from "../ui/dom.js";
import { taskList } from "../ui/task-ui.js";

// [key, button label, which tasks, message when there are none]
const TABS = [
  ["all", "All", () => true, "No tasks yet."],
  ["available", "Available", (eff) => eff === "not_started", "Nothing waiting to be started."],
  ["ongoing", "Ongoing", (eff) => eff === "in_progress", "Nothing in progress right now."],
  ["completed", "Completed", (eff) => eff === "completed", "Nothing completed yet."],
  ["overdue", "Overdue", (eff) => eff === "overdue", "Nothing overdue. All caught up."],
];

export function renderTasks(el, params) {
  const today = state.today;
  // Older links used ?deadline=overdue.
  const key = params.get("deadline") === "overdue" ? "overdue" : params.get("status");
  const tab = TABS.find(([k]) => k === key) || TABS[0];
  const counts = Object.fromEntries(TABS.map(([k, , keep]) => [k, state.tasks.filter((t) => keep(effectiveStatus(t, today))).length]));
  const list = sortTasks(state.tasks.filter((t) => tab[2](effectiveStatus(t, today))), today);
  // Group by planned date, newest first; tasks from today onwards first.
  const groups = new Map();
  list.slice().sort((a, b) => (b.date >= today) - (a.date >= today) || (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    .forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  const empty = tab[0] === "all" && state.canAddTasks ? "No tasks yet. Add your first one." : tab[3];

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Tasks</span><h2 class="li-h2">${list.length}${tab[0] === "all" ? "" : " " + tab[1].toLowerCase()} task${list.length === 1 ? "" : "s"}</h2></div>
      ${state.canAddTasks ? `<button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>` : ""}
    </header>
    <nav class="li-seg li-status-tabs" aria-label="Show tasks by status">
      ${TABS.map(([k, label]) => `<a class="li-btn small${k === tab[0] ? " on" : ""}${k === "overdue" && counts.overdue ? " li-st-overdue" : ""}" href="#/tasks${k === "all" ? "" : "?status=" + k}"${k === tab[0] ? ' aria-current="true"' : ""}>${label} <span class="li-count">${counts[k]}</span></a>`).join("")}
    </nav>
    <div id="li-task-results">
      ${list.length ? [...groups].map(([d, ts]) => `<section class="li-group"><h3 class="li-group-h">${esc(formatDay(d, { weekday: "long", month: "short", day: "numeric", year: "numeric" }))}${d === today ? " · Today" : ""}</h3>${taskList(ts)}</section>`).join("")
        : `<p class="li-empty">${esc(empty)}</p>`}
    </div>`;
}
