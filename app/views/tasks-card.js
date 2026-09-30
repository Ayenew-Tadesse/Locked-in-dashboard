// Tasks card on the Overview, under the score rings (replaces the original
// "Today's checklist" card). Switches between the day, week, month and
// quarter. The owner sees the whole team's tasks grouped as Available /
// Ongoing / Completed with who's in charge of each, how much of that
// period's work is done, and downloads the week's, month's or quarter's
// report (the daily report is in the ☰ menu). A colleague sees their
// own tasks as Available / Completed, read-only.
import { state, toast } from "../state.js";
import { weekRange, monthRange, quarterOf, quarterRange, formatDay, formatRange, MONTHS } from "../core/dates.js";
import { isOverdue, sortTasks } from "../core/tasks.js";
import { esc, progressBar, pct } from "../ui/dom.js";
import { taskList, quickAddForm } from "../ui/task-ui.js";
import { downloadReport } from "../report/download.js";
import { PERIOD_NAMES } from "../report/daily-report.js";

const PERIODS = { day: "Day", week: "Week", month: "Month", quarter: "Quarter" };
const SHOW = 8; // tasks listed before "Show all"

let period = "day";
try { if (PERIODS[localStorage.getItem("li_tasks_period")]) period = localStorage.getItem("li_tasks_period"); } catch { /* per-device convenience only */ }
let expanded = false;

function range(today) {
  if (period === "week") return weekRange(today);
  if (period === "month") return monthRange(today);
  if (period === "quarter") { const q = state.quarterAt(today); return { start: q.start, end: q.end }; }
  return { start: today, end: today };
}

function label(today, r) {
  if (period === "day") return formatDay(today, { weekday: "long", month: "short", day: "numeric" });
  if (period === "week") return formatRange(r.start, r.end);
  if (period === "month") { const [y, m] = r.start.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; }
  return state.quarterAt(today).long;
}

const GROUPS = [
  ["not_started", "Available"],
  ["in_progress", "Ongoing"],
  ["completed", "Completed"],
];

// A colleague's card: what's still to do, and what's done.
const COLLEAGUE_GROUPS = [
  ["open", "Available"],
  ["completed", "Completed"],
];
const inGroup = (t, status) => status === "open" ? t.status === "not_started" || t.status === "in_progress" : t.status === status;

export function renderTasksCard(el) {
  const today = state.today;
  const r = range(today);
  const readOnly = state.isColleague;
  // The owner sees the whole team's tasks; a colleague sees their own.
  const people = !readOnly && state.members.length > 1 ? state.members : [];
  const everyone = readOnly ? state.tasks : [...state.tasks, ...state.teamTasks];
  const all = everyone.filter((t) => t.date >= r.start && t.date <= r.end && t.status !== "cancelled");
  const done = all.filter((t) => t.status === "completed").length;
  const overdue = all.filter((t) => isOverdue(t, today)).length;
  // Longer periods read best in date order; a day is ordered by urgency.
  const order = (list) => period === "day" ? sortTasks(list, today)
    : sortTasks(list, today).sort((a, b) => a.date.localeCompare(b.date));
  // Available (not started), Ongoing (in progress) and Completed; longer
  // periods start with a few of each.
  let truncated = false;
  const groups = (readOnly ? COLLEAGUE_GROUPS : GROUPS).map(([status, title]) => {
    const list = order(all.filter((t) => inGroup(t, status)));
    const shown = period === "day" || expanded ? list : list.slice(0, SHOW);
    if (shown.length < list.length) truncated = true;
    return { status, title, list, shown };
  });
  const p = pct(done, all.length);

  el.innerHTML = `
    <div class="li-tc-top">
      <span class="card-label">Tasks</span>
      <div class="li-seg li-tc-seg" role="group" aria-label="Period">
        ${Object.entries(PERIODS).map(([k, v]) => `<button type="button" class="li-btn small${k === period ? " on" : ""}" data-period="${k}" aria-pressed="${k === period}">${v}</button>`).join("")}
      </div>
    </div>
    <div class="li-tc-head">
      <span class="ring-title">${esc(label(today, r))}</span>
      <span class="today-progress">${done}/${all.length}</span>
    </div>
    <div class="li-progress-line li-tc-progress">${progressBar(p, "Completion")}<span>${all.length ? `${p}% complete` : "No tasks yet"}${overdue ? ` · <span class="li-danger">${overdue} overdue</span>` : ""}</span></div>
    ${all.length ? groups.map((g) => `<div class="li-tc-group" data-group="${g.status}">
        <h3 class="li-tc-group-title">${g.title} <span class="li-muted">(${g.list.length})</span></h3>
        ${taskList(g.shown, { compact: true, showDate: period !== "day", showOwner: people.length > 0, readOnly, empty: "None." })}
      </div>`).join("")
      : `<p class="li-empty">${esc(period === "day" ? "Nothing planned for today yet." : "No tasks in this period.")}</p>`}
    ${truncated ? `<button type="button" class="li-link li-tc-more" data-more>Show all ${all.length} tasks</button>` : ""}
    ${quickAddForm("tasks-card-quick", today, "Add a task for today…")}
    ${period === "day" ? "" : `<div class="li-tc-foot">
      ${period === "week" ? `<a class="li-link" href="#/week">Open week view</a>` : period === "quarter" ? `<a class="li-link" href="#/quarter">Open quarter view</a>` : `<a class="li-link" href="#/analytics">Open analytics</a>`}
      ${readOnly ? "" : `<button type="button" class="report-btn" data-report-pdf title="Download the ${PERIOD_NAMES[period].toLowerCase()} report as a PDF">${PERIOD_NAMES[period]} report ⤓</button>`}
    </div>`}`;
  el.hidden = false;

  el.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => {
    period = b.dataset.period;
    expanded = false;
    try { localStorage.setItem("li_tasks_period", period); } catch { /* per-device convenience only */ }
    renderTasksCard(el);
  }));
  el.querySelector("[data-more]")?.addEventListener("click", () => { expanded = true; renderTasksCard(el); });
  // Week, month and quarter: download that period's report straight away.
  el.querySelector("[data-report-pdf]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget, text = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparing…";
    try {
      await downloadReport({ period, start: r.start, end: r.end, label: label(today, r) });
      toast(`${PERIOD_NAMES[period]} report downloaded`);
    } catch (err) {
      console.error(err);
      toast("Couldn't make the PDF: " + err.message, "error");
    } finally { btn.disabled = false; btn.textContent = text; }
  });
}
