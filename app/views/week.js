// Week: Monday-Sunday totals, score, a daily chart, best day, days that need
// work, milestone progress and notes. Navigate with ?w=<any day in the week>.
import { state, saveWeekNote, toast } from "../state.js";
import { scorePeriod } from "../core/scoring.js";
import { addDays, weekRange, formatDay, formatRange, formatMinutes, isDayKey, WEEKDAYS, dayOf } from "../core/dates.js";
import { esc, tile, scoreValue, scoreTone, progressBar } from "../ui/dom.js";
import { barChart } from "../ui/charts.js";

export function renderWeek(el, params) {
  const today = state.today;
  const { start, end } = weekRange(isDayKey(params.get("w")) ? params.get("w") : today);
  const p = scorePeriod(state.tasks, start, end, state.cfg, { today, timeZone: state.timeZone });
  const t = p.totals;
  const isCurrent = today >= start && today <= end;
  // Milestones that had tasks planned or completed this week.
  const touched = state.milestones.map((m) => {
    const ts = state.tasks.filter((x) => x.milestone_id === m.id);
    const doneThisWeek = ts.filter((x) => { const d = dayOf(x.completed_at, state.timeZone); return x.status === "completed" && d >= start && d <= end; }).length;
    const planned = ts.filter((x) => x.date >= start && x.date <= end).length;
    return { m, doneThisWeek, planned };
  }).filter((x) => x.doneThisWeek || x.planned);
  const note = state.weekly[start]?.notes || "";

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Week${isCurrent ? " · this week" : ""}</span><h2 class="li-h2">${esc(formatRange(start, end))}</h2></div>
      <div class="li-nav-btns">
        <a class="heat-arrow" href="#/week?w=${addDays(start, -7)}" aria-label="Previous week">&#8249;</a>
        <a class="li-btn small" href="#/week">This week</a>
        <a class="heat-arrow" href="#/week?w=${addDays(start, 7)}" aria-label="Next week">&#8250;</a>
      </div>
    </header>
    <div class="li-kpis">
      ${tile("Weekly score", scoreValue(p.score), p.score == null ? "No scored days yet" : `${p.average_daily_score} avg daily · ${p.active_days}/${p.active_days_target} active days`, scoreTone(p.score))}
      ${tile("Tasks", String(t.total), `${t.completed} completed · ${t.in_progress} in progress`)}
      ${tile("Completion", t.completion_rate == null ? "—" : `${t.completion_rate}<small>%</small>`, "", scoreTone(t.completion_rate))}
      ${tile("Overdue", String(t.overdue), "", t.overdue ? "red" : "")}
      ${tile("Avg daily score", p.average_daily_score == null ? "—" : String(Math.round(p.average_daily_score)), "", scoreTone(p.average_daily_score))}
      ${tile("Time spent", esc(formatMinutes(t.minutes)))}
    </div>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Daily scores</span></div>
      ${barChart(p.days.map((d, i) => ({
        label: WEEKDAYS[i], sub: d.counts.total ? `${d.counts.completed}/${d.counts.total}` : "", value: d.score, key: d.date,
        tip: `${formatDay(d.date)}: ${d.score == null ? (d.date > today ? "upcoming" : "nothing planned") : `score ${d.score}`} · ${d.counts.completed}/${d.counts.total} tasks · ${formatMinutes(d.minutes)}`,
      })), { aria: `Daily scores for the week of ${formatRange(start, end)}` })}
      <div class="li-split tight">
        <div><span class="li-sub">Best day</span><p>${p.best_day ? `${esc(formatDay(p.best_day.date, { weekday: "long", month: "short", day: "numeric" }))}: <b>${p.best_day.score}</b>` : "—"}</p></div>
        <div><span class="li-sub">Needs improvement</span><p>${p.needs_improvement.length ? p.needs_improvement.map((d) => `<a class="li-link" href="#/calendar?day=${d.date}">${esc(formatDay(d.date, { weekday: "short" }))} (${d.score})</a>`).join(", ") : "None, nice work."}</p></div>
      </div>
    </section>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Milestone progress this week</span></div>
      ${touched.length ? `<ul class="li-mini">${touched.map(({ m, doneThisWeek, planned }) => `<li class="li-mini-ms"><a href="#/milestones/${esc(m.id)}">${esc(m.title)}</a>${progressBar(m.percentage_complete, m.title)}<span class="li-mini-r">${Math.round(m.percentage_complete)}% · ${doneThisWeek} done, ${planned} planned this week</span></li>`).join("")}</ul>`
        : `<p class="li-empty">No milestone work this week.</p>`}
    </section>
    <section class="li-card">
      <form class="li-note-form" id="li-week-note">
        <label class="li-field full">Notes on this week's score<textarea name="notes" rows="3" maxlength="10000" placeholder="Wins, blockers, what to change next week…">${esc(note)}</textarea></label>
        <button type="submit" class="li-btn small">Save note</button>
      </form>
    </section>`;

  el.querySelector("#li-week-note").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveWeekNote(start, e.target.elements.notes.value.trim()).then(() => toast("Note saved"), () => {});
  });
  el.querySelector(".li-bc").addEventListener("click", (e) => {
    const c = e.target.closest("[data-key]");
    if (c) location.hash = `#/calendar?day=${c.dataset.key}`;
  });
}
