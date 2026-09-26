// Analytics: trends over a chosen range. A few charts, each answering one
// question: how are my days going, how are my weeks going, where does time go.
import { state } from "../state.js";
import { scorePeriod, scoreQuarter } from "../core/scoring.js";
import { addDays, weekRange, formatDay, formatMinutes, quarterOf, dayOf } from "../core/dates.js";
import { isOverdue } from "../core/tasks.js";
import { esc, tile, scoreTone } from "../ui/dom.js";
import { barChart, lineChart, hBars } from "../ui/charts.js";

const RANGES = { 30: "30 days", 90: "90 days", 365: "12 months" };

export function renderAnalytics(el, params) {
  const today = state.today, opts = { today, timeZone: state.timeZone };
  const days = RANGES[params.get("range")] ? Number(params.get("range")) : 30;
  const start = addDays(today, -(days - 1));
  const p = scorePeriod(state.tasks, start, today, state.cfg, opts);
  const t = p.totals;

  // Weekly scores (last 12 weeks, or all weeks in range if longer).
  const weeks = [];
  const nWeeks = Math.max(8, Math.min(52, Math.ceil(days / 7)));
  for (let w = addDays(weekRange(today).start, -(nWeeks - 1) * 7); w <= today; w = addDays(w, 7)) {
    const s = scorePeriod(state.tasks, w, addDays(w, 6), state.cfg, opts);
    weeks.push({ w, s });
  }
  // Rolling 7-day average smooths the daily line for longer ranges.
  const daily = p.days;
  const points = daily.map((d, i) => {
    const win = daily.slice(Math.max(0, i - 6), i + 1).filter((x) => x.score != null);
    const value = days > 30 ? (win.length ? Math.round(win.reduce((s, x) => s + x.score, 0) / win.length) : null) : d.score;
    return { label: formatDay(d.date, { month: "short", day: "numeric" }), value,
      tip: `${formatDay(d.date)}: ${d.score == null ? "no score" : "score " + d.score}${days > 30 && value != null ? ` · 7-day avg ${value}` : ""} · ${d.counts.completed}/${d.counts.total} tasks` };
  });

  const byCat = new Map();
  for (const x of state.tasks.filter((x) => x.date >= start && x.date <= today && x.status !== "cancelled")) {
    const k = x.category || "Uncategorised";
    const c = byCat.get(k) || { total: 0, done: 0, minutes: 0 };
    c.total++; if (x.status === "completed") c.done++; c.minutes += Number(x.actual_minutes) || 0;
    byCat.set(k, c);
  }
  const cats = [...byCat].sort((a, b) => b[1].minutes - a[1].minutes || b[1].total - a[1].total).slice(0, 8);
  const q = quarterOf(today);
  const qs = scoreQuarter(state.tasks, state.goals, q.quarter, q.year, state.cfg, opts);
  const goals = state.goals.filter((g) => g.quarter === q.quarter && g.year === q.year);
  const msAll = state.milestones.filter((m) => m.status !== "cancelled");
  const msDone = msAll.filter((m) => m.status === "completed");
  const msInRange = msDone.filter((m) => { const d = dayOf(m.completed_at, state.timeZone); return d && d >= start; }).length;

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Analytics</span><h2 class="li-h2">Last ${RANGES[days]}</h2></div>
      <nav class="li-seg" aria-label="Range">${Object.entries(RANGES).map(([k, l]) => `<a class="li-btn small${Number(k) === days ? " on" : ""}" href="#/analytics?range=${k}" aria-current="${Number(k) === days}">${l}</a>`).join("")}</nav>
    </header>
    <div class="li-kpis">
      ${tile("Completion rate", t.completion_rate == null ? "—" : `${t.completion_rate}<small>%</small>`, `${t.completed} of ${t.total} tasks`, scoreTone(t.completion_rate))}
      ${tile("Average daily score", p.average_daily_score == null ? "—" : String(Math.round(p.average_daily_score)), `${p.active_days} active days`, scoreTone(p.average_daily_score))}
      ${tile("Overdue now", String(state.tasks.filter((x) => isOverdue(x, today)).length), "", state.tasks.some((x) => isOverdue(x, today)) ? "red" : "")}
      ${tile("Time spent", esc(formatMinutes(t.minutes)), t.minutes ? `${formatMinutes(t.minutes / Math.max(1, p.active_days))} per active day` : "Log actual minutes on tasks")}
      ${tile("Milestones", `${msDone.length}<small>/${msAll.length}</small>`, `${msInRange} completed in this range`)}
    </div>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Daily productivity${days > 30 ? " (7-day average)" : ""}</span></div>
      ${lineChart(points, { aria: `Daily score over the last ${RANGES[days]}` })}
    </section>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Weekly productivity</span></div>
      ${barChart(weeks.map(({ w, s }) => ({ label: formatDay(w, { month: "numeric", day: "numeric" }), value: s.score, key: w,
        tip: `Week of ${formatDay(w)}: ${s.score == null ? "no scored days" : "score " + s.score} · ${s.totals.completed}/${s.totals.total} tasks · ${formatMinutes(s.totals.minutes)}` })),
        { aria: "Weekly scores", height: 130 })}
    </section>
    <div class="li-split">
      <section class="li-card">
        <div class="li-card-head"><span class="card-label">By category</span></div>
        ${cats.length ? hBars(cats.map(([k, c]) => ({ label: k, value: c.total ? c.done / c.total * 100 : 0,
          detail: `${c.done}/${c.total} done · ${formatMinutes(c.minutes)}` })), { aria: "Completion by category" }) : `<p class="li-empty">No tasks in this range.</p>`}
      </section>
      <section class="li-card">
        <div class="li-card-head"><span class="card-label">Q${q.quarter} ${q.year} goals</span><a class="li-link" href="#/quarter">Quarter</a></div>
        ${goals.length ? hBars(goals.map((g) => ({ label: g.title, value: Number(g.percentage_complete) })), { aria: "Goal progress" })
          : `<p class="li-empty">No goals this quarter.</p>`}
        <p class="li-sub">Quarterly score ${qs.score ?? "—"} · ${qs.time_elapsed_pct}% of the quarter elapsed</p>
      </section>
    </div>`;
  el.querySelectorAll(".li-bc").forEach((c) => c.addEventListener("click", (e) => {
    const b = e.target.closest("[data-key]");
    if (b) location.hash = `#/week?w=${b.dataset.key}`;
  }));
}
