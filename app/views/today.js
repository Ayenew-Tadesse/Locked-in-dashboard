// Today: counts, score (with its breakdown and your notes), and every task
// that matters today.
import { state, saveDayNote, updateTask, toast } from "../state.js";
import { scoreDay } from "../core/scoring.js";
import { formatDay, formatMinutes } from "../core/dates.js";
import { isOverdue, isClosed, sortTasks } from "../core/tasks.js";
import { esc, tile, scoreValue, scoreTone, pct, progressBar } from "../ui/dom.js";
import { taskList, quickAddForm } from "../ui/task-ui.js";

export function scoreBreakdown(s) {
  if (s.score == null) return `<p class="li-empty">No score yet: plan at least one task for this day.</p>`;
  return `<table class="li-breakdown">
    <thead><tr><th>Component</th><th>Weight</th><th>Result</th><th>Why</th></tr></thead>
    <tbody>${s.components.map((c) => `<tr class="${c.value == null ? "skipped" : ""}"><td>${esc(c.label)}</td><td>${c.weight}</td>
      <td>${c.value == null ? "skipped" : Math.round(c.value) + "%"}</td><td>${esc(c.detail)}</td></tr>`).join("")}
    <tr><td>Overdue penalty</td><td></td><td>${s.penalty ? "−" + s.penalty : "0"}</td><td>${s.overdue} overdue task${s.overdue === 1 ? "" : "s"}</td></tr></tbody>
    <tfoot><tr><td>Score</td><td></td><td><b>${s.score}</b></td><td>Weighted average ${s.base} − penalty ${s.penalty}. <a class="li-link" href="#/settings">How this works</a></td></tr></tfoot>
  </table>`;
}

export function renderToday(el) {
  const today = state.today;
  const s = scoreDay(state.tasks, today, state.cfg, { today, timeZone: state.timeZone });
  const c = s.counts;
  const planned = sortTasks(state.tasks.filter((t) => t.date === today), today);
  const due = sortTasks(state.tasks.filter((t) => t.due_date === today && t.date !== today), today);
  const overdue = sortTasks(state.tasks.filter((t) => isOverdue(t, today) && t.date !== today), today);
  const carry = state.tasks.filter((t) => !isClosed(t) && t.date < today && !isOverdue(t, today));
  const ms = state.milestones.filter((m) => m.deadline === today ||
    (m.status !== "completed" && planned.some((t) => t.milestone_id === m.id)));
  const note = state.daily[today]?.notes || "";

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Today</span><h2 class="li-h2">${esc(formatDay(today, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}</h2></div>
      <button type="button" class="li-btn primary" data-new-task="${today}">+ New task</button>
    </header>
    <div class="li-kpis">
      ${tile("Tasks", String(c.total), `${c.completed} completed · ${c.in_progress} in progress · ${c.not_started} not started`)}
      ${tile("Remaining", String(c.total - c.completed), c.total ? `${pct(c.completed, c.total)}% complete` : "")}
      ${tile("Overdue", String(state.tasks.filter((t) => isOverdue(t, today)).length), "", state.tasks.some((t) => isOverdue(t, today)) ? "red" : "")}
      ${tile("Daily score", scoreValue(s.score), "", scoreTone(s.score))}
      ${tile("Time worked", esc(formatMinutes(s.minutes)), `Target ${formatMinutes(state.cfg.dailyMinutesTarget)}`)}
    </div>
    <div class="li-progress-line">${progressBar(c.total ? pct(c.completed, c.total) : 0, "Today's completion")}<span>Completion ${c.total ? pct(c.completed, c.total) : 0}%</span></div>

    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Today's tasks</span></div>
      ${taskList(planned, { empty: "Nothing planned for today yet." })}
      ${quickAddForm("today-quick", today, "Add a task for today…")}
    </section>
    ${due.length ? `<section class="li-card"><div class="li-card-head"><span class="card-label">Also due today</span></div>${taskList(due, { showDate: true })}</section>` : ""}
    ${overdue.length ? `<section class="li-card danger"><div class="li-card-head"><span class="card-label">Overdue</span>
      <button type="button" class="li-btn small" data-move-today="overdue">Move all to today</button></div>${taskList(overdue, { showDate: true })}</section>` : ""}
    ${carry.length ? `<section class="li-card"><div class="li-card-head"><span class="card-label">Unfinished from earlier days (${carry.length})</span>
      <button type="button" class="li-btn small" data-move-today="carry">Move all to today</button></div>${taskList(sortTasks(carry, today), { showDate: true })}</section>` : ""}
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Today's milestones</span></div>
      ${ms.length ? `<ul class="li-mini">${ms.map((m) => `<li class="li-mini-ms"><a href="#/milestones/${esc(m.id)}">${esc(m.title)}</a>${progressBar(m.percentage_complete, m.title)}<span class="li-mini-r">${Math.round(m.percentage_complete)}%${m.deadline === today ? " · due today" : ""}</span></li>`).join("")}</ul>`
        : `<p class="li-empty">No milestone work planned today.</p>`}
    </section>
    <section class="li-card">
      <details class="li-details"><summary><span class="card-label">How today's score is calculated</span></summary>${scoreBreakdown(s)}</details>
      <form class="li-note-form" data-day-note="${today}">
        <label class="li-field full">Notes on today's score<textarea name="notes" rows="2" maxlength="10000" placeholder="What helped or got in the way?">${esc(note)}</textarea></label>
        <button type="submit" class="li-btn small">Save note</button>
      </form>
    </section>`;

  el.querySelectorAll("[data-move-today]").forEach((b) => b.addEventListener("click", async () => {
    const list = b.dataset.moveToday === "overdue" ? overdue : carry;
    b.disabled = true;
    try {
      for (const t of list) await updateTask(t.id, { date: today });
      toast(`Moved ${list.length} task${list.length === 1 ? "" : "s"} to today`);
    } catch { b.disabled = false; }
  }));
}

// Notes forms (Today and Calendar) share this handler.
document.addEventListener("submit", async (e) => {
  const f = e.target.closest("form[data-day-note]");
  if (!f) return;
  e.preventDefault();
  await saveDayNote(f.dataset.dayNote, f.elements.notes.value.trim()).then(() => toast("Note saved"), () => {});
});

