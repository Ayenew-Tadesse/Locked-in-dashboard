// Overview: a New task tile and the key numbers first (each with how it
// changed), then this week's tasks as a donut, the open milestones as rings
// and the next tasks as a table, above the original dashboard cards (the
// Tasks card, Activity and the roadmap).
import { state } from "../state.js";
import { scoreDay, scorePeriod } from "../core/scoring.js";
import { weekRange, formatMinutes, addDays, formatDay } from "../core/dates.js";
import { isOverdue, isClosed } from "../core/tasks.js";
import { esc, tile, scoreValue, scoreTone, pct, delta } from "../ui/dom.js";
import { donut, ring } from "../ui/charts.js";
import { ICONS } from "../ui/icons.js";
import { openTaskDetail } from "../ui/task-ui.js";

export function renderOverview(el) {
  const today = state.today, opts = { today, timeZone: state.timeZone };
  const day = scoreDay(state.tasks, today, state.cfg, opts);
  const yday = scoreDay(state.tasks, addDays(today, -1), state.cfg, opts);
  const wk = weekRange(today);
  const week = scorePeriod(state.tasks, wk.start, wk.end, state.cfg, opts);
  const lastWeek = scorePeriod(state.tasks, addDays(wk.start, -7), addDays(wk.end, -7), state.cfg, opts);
  const overdue = state.tasks.filter((t) => isOverdue(t, today));
  const c = day.counts;
  const vs = (now, before, label) => delta(now, before, label);

  el.innerHTML = `
    <div class="li-kpis">
      ${state.canAddTasks ? `<button type="button" class="li-tile li-tile-add" data-new-task="${esc(today)}">
        <span class="li-tile-label">New task</span><span class="li-tile-icon">${ICONS.plus}</span>
        <span class="li-tile-value" aria-hidden="true">+</span>
        <span class="li-tile-sub">Add a task for today</span>
      </button>` : ""}
      ${tile("Today's progress", `${c.completed}<small>/${c.total}</small>`,
        c.total ? `${vs(c.completed, yday.counts.completed, "vs yesterday") || `${pct(c.completed, c.total)}% complete`} · ${c.in_progress} in progress` : "Nothing planned yet", "", 'data-href="#/today"', ICONS.check)}
      ${tile("Daily score", scoreValue(day.score), day.score == null ? "Plan a task to get a score" : `${vs(day.score, yday.score, "vs yesterday") || `Time worked ${formatMinutes(day.minutes)}`}`, scoreTone(day.score), 'data-href="#/today"', ICONS.score)}
      ${tile("Weekly score", scoreValue(week.score), `${vs(week.score, lastWeek.score, "vs last week") || `${week.totals.completed}/${week.totals.total} tasks`} · ${week.active_days} active day${week.active_days === 1 ? "" : "s"}`, scoreTone(week.score), 'data-href="#/week"', ICONS.trend)}
      ${tile("Overdue", String(overdue.length), overdue.length ? esc(overdue[0].title) : "All caught up", overdue.length ? "red" : "green", 'data-href="#/tasks?status=overdue"', ICONS.alert)}
    </div>
    <div class="li-ov-row">
      ${weekCard(week, wk, today)}
      ${milestonesCard()}
    </div>
    ${nextTasksCard(today)}`;
}

// This week's tasks by status, as a donut.
function weekCard(week, wk, today) {
  const tasks = state.tasks.filter((t) => t.status !== "cancelled" && (t.due_date || t.date) >= wk.start && (t.due_date || t.date) <= wk.end);
  const parts = [
    ["Done", tasks.filter((t) => t.status === "completed").length, "var(--gold)"],
    ["In progress", tasks.filter((t) => t.status === "in_progress").length, "var(--accent)"],
    ["Overdue", tasks.filter((t) => isOverdue(t, today)).length, "var(--red)"],
    ["Not started", tasks.filter((t) => t.status === "not_started" && !isOverdue(t, today)).length, "var(--surface-2)"],
  ];
  const total = tasks.length;
  return `<section class="li-ov-card" aria-labelledby="ov-week">
    <h3 id="ov-week">This week's tasks</h3>
    <div class="li-donut-wrap">
      <div>
        <div class="li-ov-big">${total}</div>
        <ul class="li-legend">${parts.map(([l, n, col]) => `<li><i style="background:${col}"></i>${total ? pct(n, total) : 0}% ${esc(l)} (${n})</li>`).join("")}</ul>
      </div>
      ${donut(parts.map(([label, value, color]) => ({ label, value, color })), { aria: `This week: ${parts.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ")}` })}
    </div>
  </section>`;
}

// The open milestones closest to their deadline, each as a ring.
function milestonesCard() {
  const open = state.milestones.filter((m) => !["completed", "cancelled"].includes(m.status))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")).slice(0, 3);
  return `<section class="li-ov-card" aria-labelledby="ov-ms">
    <h3 id="ov-ms"><a href="#/milestones" style="color:inherit;text-decoration:none">Milestones</a></h3>
    ${open.length ? open.map((m) => `<a class="li-ring-row" href="#/milestones/${esc(m.id)}" style="text-decoration:none">
      <span class="li-ring-name">${esc(m.title)}<small>${m.deadline ? `Due ${esc(formatDay(m.deadline))}` : "No deadline"}</small></span>
      ${ring(m.percentage_complete, { color: (m.percentage_complete || 0) >= 50 ? "var(--good)" : "var(--accent)" })}
    </a>`).join("") : `<p class="li-ov-sub">No open milestones.</p>`}
  </section>`;
}

const ST = { completed: ["Done", "done"], in_progress: ["In progress", "doing"], not_started: ["Not started", "todo"], on_hold: ["On hold", "todo"] };
// The next open tasks (overdue first), like an orders table.
function nextTasksCard(today) {
  const open = state.tasks.filter((t) => !isClosed(t))
    .sort((a, b) => (isOverdue(b, today) - isOverdue(a, today)) || (a.due_date || a.date || "9999").localeCompare(b.due_date || b.date || "9999"))
    .slice(0, 6);
  if (!open.length) return "";
  return `<section class="li-ov-card" style="margin-top:16px" aria-labelledby="ov-next">
    <h3 id="ov-next"><a href="#/tasks" style="color:inherit;text-decoration:none">Coming up</a></h3>
    <table class="li-table">
      <thead><tr><th>Task</th><th class="li-hide-sm">Project</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>${open.map((t) => {
        const [label, cls] = isOverdue(t, today) ? ["Overdue", "late"] : ST[t.status] || [t.status, "todo"];
        const due = t.due_date || t.date;
        return `<tr><td><button type="button" class="li-link-btn" data-ov-task="${esc(t.id)}">${esc(t.title)}</button></td><td class="li-hide-sm">${esc(t.category || "—")}</td>` +
          `<td>${due ? esc(formatDay(due)) : "—"}</td><td><span class="li-st ${cls}">${esc(label)}</span></td></tr>`;
      }).join("")}</tbody>
    </table>
  </section>`;
}

// A task in the table opens its details.
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ov-task]");
  if (!b) return;
  const t = state.tasks.find((x) => x.id === b.dataset.ovTask);
  if (t) openTaskDetail(t);
});
