// Tasks card on the Overview, under the score rings (replaces the original
// "Today's checklist" card). Only the team owner sees it. Switches between
// the day, week, month and quarter, shows the whole team's tasks grouped as
// Available / Ongoing / Completed with who's in charge of each (filterable by
// person), how much of that period's work is done, and opens the daily report.
import { state } from "../state.js";
import { weekRange, monthRange, quarterOf, quarterRange, formatDay, formatRange, MONTHS } from "../core/dates.js";
import { isOverdue, sortTasks } from "../core/tasks.js";
import { esc, progressBar, pct } from "../ui/dom.js";
import { taskList, quickAddForm } from "../ui/task-ui.js";

const PERIODS = { day: "Day", week: "Week", month: "Month", quarter: "Quarter" };
const SHOW = 8; // tasks listed before "Show all"

let period = "day";
try { if (PERIODS[localStorage.getItem("li_tasks_period")]) period = localStorage.getItem("li_tasks_period"); } catch { /* per-device convenience only */ }
let expanded = false;

function range(today) {
  if (period === "week") return weekRange(today);
  if (period === "month") return monthRange(today);
  if (period === "quarter") { const q = quarterOf(today); return quarterRange(q.quarter, q.year); }
  return { start: today, end: today };
}

function label(today, r) {
  if (period === "day") return formatDay(today, { weekday: "long", month: "short", day: "numeric" });
  if (period === "week") return formatRange(r.start, r.end);
  if (period === "month") { const [y, m] = r.start.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; }
  const q = quarterOf(today);
  return `Q${q.quarter} ${q.year} · ${formatRange(r.start, r.end)}`;
}

// Whose tasks the card shows: "all" (the whole team), or one person's user id.
let person = "all";

const GROUPS = [
  ["not_started", "Available"],
  ["in_progress", "Ongoing"],
  ["completed", "Completed"],
];

export function renderTasksCard(el) {
  const today = state.today;
  const r = range(today);
  // The owner sees the whole team's tasks (the card is only shown to the owner).
  const people = state.members.length > 1 ? state.members : [];
  if (person !== "all" && person !== state.me && !people.some((m) => m.user_id === person)) person = "all";
  const everyone = [...state.tasks, ...state.teamTasks];
  const all = everyone.filter((t) => t.date >= r.start && t.date <= r.end && t.status !== "cancelled"
    && (person === "all" || (t.user_id || state.me) === person));
  const done = all.filter((t) => t.status === "completed").length;
  const overdue = all.filter((t) => isOverdue(t, today)).length;
  // Longer periods read best in date order; a day is ordered by urgency.
  const order = (list) => period === "day" ? sortTasks(list, today)
    : sortTasks(list, today).sort((a, b) => a.date.localeCompare(b.date));
  // Available (not started), Ongoing (in progress) and Completed; longer
  // periods start with a few of each.
  let truncated = false;
  const groups = GROUPS.map(([status, title]) => {
    const list = order(all.filter((t) => t.status === status));
    const shown = period === "day" || expanded ? list : list.slice(0, SHOW);
    if (shown.length < list.length) truncated = true;
    return { status, title, list, shown };
  });
  const p = pct(done, all.length);
  const reportOpen = document.getElementById("report-btn")?.getAttribute("aria-expanded") === "true";
  const whoLabel = person === "all" ? "Everyone" : person === state.me ? "Me" : state.members.find((m) => m.user_id === person)?.name;

  el.innerHTML = `
    <div class="li-tc-top">
      <span class="card-label">Tasks</span>
      <div class="li-seg li-tc-seg" role="group" aria-label="Period">
        ${Object.entries(PERIODS).map(([k, v]) => `<button type="button" class="li-btn small${k === period ? " on" : ""}" data-period="${k}" aria-pressed="${k === period}">${v}</button>`).join("")}
      </div>
    </div>
    ${people.length ? `<label class="li-tc-who">Whose tasks
      <select data-person aria-label="Whose tasks">
        <option value="all"${person === "all" ? " selected" : ""}>Everyone</option>
        ${people.map((m) => `<option value="${esc(m.user_id)}"${m.user_id === person ? " selected" : ""}>${esc(m.user_id === state.me ? "Me" : m.name)}</option>`).join("")}
      </select></label>` : ""}
    <div class="li-tc-head">
      <span class="ring-title">${esc(label(today, r))}</span>
      <span class="today-progress">${done}/${all.length}</span>
    </div>
    <div class="li-progress-line li-tc-progress">${progressBar(p, "Completion")}<span>${all.length ? `${p}% complete` : "No tasks yet"}${overdue ? ` · <span class="li-danger">${overdue} overdue</span>` : ""}</span></div>
    ${all.length ? groups.map((g) => `<div class="li-tc-group" data-group="${g.status}">
        <h3 class="li-tc-group-title">${g.title} <span class="li-muted">(${g.list.length})</span></h3>
        ${taskList(g.shown, { compact: true, showDate: period !== "day", showOwner: people.length > 0, empty: "None." })}
      </div>`).join("")
      : `<p class="li-empty">${esc(period === "day" ? `Nothing planned for today${person === "all" ? "" : ` for ${whoLabel}`} yet.` : "No tasks in this period.")}</p>`}
    ${truncated ? `<button type="button" class="li-link li-tc-more" data-more>Show all ${all.length} tasks</button>` : ""}
    ${quickAddForm("tasks-card-quick", today, "Add a task for today…")}
    <div class="li-tc-foot">
      ${period === "week" ? `<a class="li-link" href="#/week">Open week view</a>` : period === "quarter" ? `<a class="li-link" href="#/quarter">Open quarter view</a>` : period === "month" ? `<a class="li-link" href="#/analytics">Open analytics</a>` : `<a class="li-link" href="#/today">Open Today</a>`}
      <button type="button" class="report-btn" data-report aria-expanded="${reportOpen}" aria-controls="report-card">Daily report</button>
    </div>`;
  el.hidden = false;

  el.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => {
    period = b.dataset.period;
    expanded = false;
    try { localStorage.setItem("li_tasks_period", period); } catch { /* per-device convenience only */ }
    renderTasksCard(el);
  }));
  el.querySelector("[data-person]")?.addEventListener("change", (e) => { person = e.target.value; expanded = false; renderTasksCard(el); });
  el.querySelector("[data-more]")?.addEventListener("click", () => { expanded = true; renderTasksCard(el); });
  // The daily report is the original dashboard's card; its button lives in the
  // (hidden) checklist card, so this one presses it.
  el.querySelector("[data-report]").addEventListener("click", (e) => {
    document.getElementById("report-btn")?.click();
    e.currentTarget.setAttribute("aria-expanded", document.getElementById("report-btn")?.getAttribute("aria-expanded") || "false");
  });
}
