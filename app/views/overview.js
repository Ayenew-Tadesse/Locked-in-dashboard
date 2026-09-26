// Overview: the key numbers and milestones first, above the original dashboard
// cards (which stay exactly where they were).
import { state } from "../state.js";
import { scoreDay, scorePeriod, scoreQuarter } from "../core/scoring.js";
import { weekRange, quarterOf, formatMinutes, relativeDay } from "../core/dates.js";
import { isOverdue } from "../core/tasks.js";
import { milestoneInfo, PACE_LABELS } from "../core/insights.js";
import { esc, tile, scoreValue, scoreTone, progressBar, pct } from "../ui/dom.js";

export function renderOverview(el) {
  const today = state.today, opts = { today, timeZone: state.timeZone };
  const day = scoreDay(state.tasks, today, state.cfg, opts);
  const wk = weekRange(today);
  const week = scorePeriod(state.tasks, wk.start, wk.end, state.cfg, opts);
  const q = quarterOf(today);
  const quarter = scoreQuarter(state.tasks, state.goals, q.quarter, q.year, state.cfg, opts);
  const overdue = state.tasks.filter((t) => isOverdue(t, today));
  const c = day.counts;
  const ms = state.milestones.filter((m) => !["completed", "cancelled"].includes(m.status))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")).slice(0, 4);

  el.innerHTML = `
    <div class="li-kpis">
      ${tile("Today's progress", `${c.completed}<small>/${c.total}</small>`, c.total ? `${pct(c.completed, c.total)}% complete · ${c.in_progress} in progress` : "Nothing planned yet", "", 'data-href="#/today"')}
      ${tile("Daily score", scoreValue(day.score), day.score == null ? "Plan a task to get a score" : `Time worked ${formatMinutes(day.minutes)}`, scoreTone(day.score), 'data-href="#/today"')}
      ${tile("Weekly score", scoreValue(week.score), `${week.totals.completed}/${week.totals.total} tasks · ${week.active_days} active day${week.active_days === 1 ? "" : "s"}`, scoreTone(week.score), 'data-href="#/week"')}
      ${tile(`Q${q.quarter} progress`, quarter.goal_progress == null ? "—" : `${Math.round(quarter.goal_progress)}<small>%</small>`, `${quarter.time_elapsed_pct}% of the quarter gone · score ${quarter.score ?? "—"}`, scoreTone(quarter.goal_progress), 'data-href="#/quarter"')}
      ${tile("Overdue", String(overdue.length), overdue.length ? esc(overdue[0].title) : "All caught up", overdue.length ? "red" : "green", 'data-href="#/tasks?deadline=overdue"')}
    </div>
    <section class="li-card">
        <div class="li-card-head"><span class="card-label">Milestones</span><a class="li-link" href="#/milestones">All</a></div>
        ${ms.length ? `<ul class="li-mini">${ms.map((m) => {
          const info = milestoneInfo(m, state.tasks, today, state.timeZone);
          return `<li class="li-mini-ms"><a href="#/milestones/${esc(m.id)}">${esc(m.title)}</a>${progressBar(m.percentage_complete, m.title)}
            <span class="li-mini-r ${info.pace === "behind" || info.pace === "overdue" ? "warn" : ""}">${Math.round(m.percentage_complete)}% · ${esc(m.deadline ? relativeDay(m.deadline, today) : PACE_LABELS[info.pace])}</span></li>`;
        }).join("")}</ul>` : `<p class="li-empty">No open milestones. <a class="li-link" href="#/milestones">Add one</a></p>`}
    </section>`;
}
