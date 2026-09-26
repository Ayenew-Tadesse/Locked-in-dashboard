// Overview: a New task tile and the key numbers first, above the original
// dashboard cards (the Tasks card, Activity and the roadmap).
import { state } from "../state.js";
import { scoreDay, scorePeriod, scoreQuarter } from "../core/scoring.js";
import { weekRange, quarterOf, formatMinutes } from "../core/dates.js";
import { isOverdue } from "../core/tasks.js";
import { esc, tile, scoreValue, scoreTone, pct } from "../ui/dom.js";

export function renderOverview(el) {
  const today = state.today, opts = { today, timeZone: state.timeZone };
  const day = scoreDay(state.tasks, today, state.cfg, opts);
  const wk = weekRange(today);
  const week = scorePeriod(state.tasks, wk.start, wk.end, state.cfg, opts);
  const q = quarterOf(today);
  const quarter = scoreQuarter(state.tasks, state.goals, q.quarter, q.year, state.cfg, opts);
  const overdue = state.tasks.filter((t) => isOverdue(t, today));
  const c = day.counts;

  el.innerHTML = `
    <div class="li-kpis">
      <button type="button" class="li-tile li-tile-add" data-new-task="${esc(today)}">
        <span class="li-tile-label">New task</span>
        <span class="li-tile-value" aria-hidden="true">+</span>
        <span class="li-tile-sub">Add a task for today</span>
      </button>
      ${tile("Today's progress", `${c.completed}<small>/${c.total}</small>`, c.total ? `${pct(c.completed, c.total)}% complete · ${c.in_progress} in progress` : "Nothing planned yet", "", 'data-href="#/today"')}
      ${tile("Daily score", scoreValue(day.score), day.score == null ? "Plan a task to get a score" : `Time worked ${formatMinutes(day.minutes)}`, scoreTone(day.score), 'data-href="#/today"')}
      ${tile("Weekly score", scoreValue(week.score), `${week.totals.completed}/${week.totals.total} tasks · ${week.active_days} active day${week.active_days === 1 ? "" : "s"}`, scoreTone(week.score), 'data-href="#/week"')}
      ${tile(`Q${q.quarter} progress`, quarter.goal_progress == null ? "—" : `${Math.round(quarter.goal_progress)}<small>%</small>`, `${quarter.time_elapsed_pct}% of the quarter gone · score ${quarter.score ?? "—"}`, scoreTone(quarter.goal_progress), 'data-href="#/quarter"')}
      ${tile("Overdue", String(overdue.length), overdue.length ? esc(overdue[0].title) : "All caught up", overdue.length ? "red" : "green", 'data-href="#/tasks?deadline=overdue"')}
    </div>`;
}
