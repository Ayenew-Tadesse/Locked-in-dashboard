// Calendar: a month grid of tasks, deadlines and milestones. Click a day to
// see and edit its tasks.
import { state } from "../state.js";
import { addDays, monthRange, weekRange, formatDay, isDayKey, WEEKDAYS, MONTHS } from "../core/dates.js";
import { isOverdue, sortTasks } from "../core/tasks.js";
import { scoreDay } from "../core/scoring.js";
import { esc, scoreTone } from "../ui/dom.js";
import { taskList, quickAddForm } from "../ui/task-ui.js";

export function renderCalendar(el, params) {
  const today = state.today;
  const selected = isDayKey(params.get("day")) ? params.get("day") : today;
  const month = monthRange(isDayKey(params.get("month") + "-01") ? params.get("month") + "-01" : selected);
  const gridStart = weekRange(month.start).start;
  const gridEnd = weekRange(month.end).end;
  const [y, m] = month.start.split("-").map(Number);
  const prev = addDays(month.start, -1).slice(0, 7), next = addDays(month.end, 1).slice(0, 7);

  const byDate = new Map(), dueBy = new Map(), msBy = new Map();
  for (const t of state.tasks) {
    if (t.date >= gridStart && t.date <= gridEnd) (byDate.get(t.date) || byDate.set(t.date, []).get(t.date)).push(t);
    if (t.due_date && t.due_date >= gridStart && t.due_date <= gridEnd) (dueBy.get(t.due_date) || dueBy.set(t.due_date, []).get(t.due_date)).push(t);
  }
  for (const ms of state.milestones) if (ms.deadline) (msBy.get(ms.deadline) || msBy.set(ms.deadline, []).get(ms.deadline)).push(ms);

  let cells = "";
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const ts = (byDate.get(d) || []).filter((t) => t.status !== "cancelled");
    const done = ts.filter((t) => t.status === "completed").length;
    const late = ts.some((t) => isOverdue(t, today));
    const due = (dueBy.get(d) || []).filter((t) => t.status !== "cancelled");
    const mss = msBy.get(d) || [];
    const score = d <= today && ts.length ? scoreDay(state.tasks, d, state.cfg, { today, timeZone: state.timeZone }).score : null;
    const label = `${formatDay(d, { weekday: "long", month: "long", day: "numeric" })}: ${ts.length} task${ts.length === 1 ? "" : "s"}, ${done} completed` +
      (due.length ? `, ${due.length} deadline${due.length === 1 ? "" : "s"}` : "") + (mss.length ? `, milestone ${mss.map((x) => x.title).join(", ")}` : "");
    cells += `<button type="button" class="li-cal-cell${d.slice(0, 7) !== month.start.slice(0, 7) ? " other" : ""}${d === today ? " today" : ""}${d === selected ? " selected" : ""}"
      data-day="${d}" aria-label="${esc(label)}" aria-pressed="${d === selected}">
      <span class="li-cal-num">${Number(d.slice(8))}</span>
      ${ts.length ? `<span class="li-cal-count ${late ? "late" : done === ts.length ? "done" : ""}">${done}/${ts.length}</span>` : ""}
      <span class="li-cal-marks">${due.length ? `<i class="due" title="Deadline"></i>` : ""}${mss.length ? `<i class="ms" title="Milestone"></i>` : ""}${score != null ? `<i class="sc ${scoreTone(score)}"></i>` : ""}</span>
      <span class="li-cal-titles">${ts.slice(0, 2).map((t) => `<span class="${t.status === "completed" ? "done" : ""}">${esc(t.title)}</span>`).join("")}${ts.length > 2 ? `<span class="more">+${ts.length - 2}</span>` : ""}</span>
    </button>`;
  }

  const dayTasks = sortTasks(state.tasks.filter((t) => t.date === selected), today);
  const dayDue = state.tasks.filter((t) => t.due_date === selected && t.date !== selected);
  const dayMs = msBy.get(selected) || state.milestones.filter((x) => x.deadline === selected);
  const s = scoreDay(state.tasks, selected, state.cfg, { today, timeZone: state.timeZone });

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Calendar</span><h2 class="li-h2">${MONTHS[m - 1]} ${y}</h2></div>
      <div class="li-nav-btns">
        <a class="heat-arrow" href="#/calendar?month=${prev}&day=${esc(selected)}" aria-label="Previous month">&#8249;</a>
        <a class="li-btn small" href="#/calendar">Today</a>
        <a class="heat-arrow" href="#/calendar?month=${next}&day=${esc(selected)}" aria-label="Next month">&#8250;</a>
      </div>
    </header>
    <div class="li-cal" role="grid" aria-label="${MONTHS[m - 1]} ${y}">
      ${WEEKDAYS.map((w) => `<span class="li-cal-wd" aria-hidden="true">${w}</span>`).join("")}
      ${cells}
    </div>
    <p class="li-legend"><span><i class="due"></i>Deadline</span><span><i class="ms"></i>Milestone due</span><span><i class="sc green"></i>Daily score (red &le;40, orange &lt;80, green 80+)</span><span>done/planned tasks</span></p>
    <section class="li-card" id="li-cal-day">
      <div class="li-card-head"><span class="card-label">${esc(formatDay(selected, { weekday: "long", month: "long", day: "numeric", year: "numeric" }))}</span>
        <span class="li-mini-r">${s.score != null ? `Score ${s.score}/100` : ""}</span></div>
      ${dayMs.length ? `<ul class="li-mini">${dayMs.map((x) => `<li><a href="#/milestones/${esc(x.id)}">◆ ${esc(x.title)}</a><span class="li-mini-r">Milestone deadline · ${Math.round(x.percentage_complete)}%</span></li>`).join("")}</ul>` : ""}
      ${taskList(dayTasks, { empty: "No tasks planned for this day." })}
      ${dayDue.length ? `<h3 class="li-group-h">Deadlines on this day</h3>${taskList(dayDue, { showDate: true })}` : ""}
      ${quickAddForm("cal-quick", selected, "Add a task for this day…")}
    </section>`;

  el.querySelector(".li-cal").addEventListener("click", (e) => {
    const c = e.target.closest("[data-day]");
    if (!c) return;
    history.replaceState(null, "", `#/calendar?month=${month.start.slice(0, 7)}&day=${c.dataset.day}`);
    window.dispatchEvent(new CustomEvent("li:rerender"));
    requestAnimationFrame(() => {
      document.querySelector(`.li-cal [data-day="${c.dataset.day}"]`)?.focus();
      if (window.innerWidth < 900) document.getElementById("li-cal-day")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}
