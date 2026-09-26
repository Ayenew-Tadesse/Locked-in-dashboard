// Quarter: goals with progress, milestones, score and approaching deadlines.
// ?q=3&y=2026 picks the quarter.
import { state, saveGoal, deleteGoal, toast } from "../state.js";
import { scoreQuarter } from "../core/scoring.js";
import { quarterOf, quarterRange, formatDay, formatRange, addDays } from "../core/dates.js";
import { isClosed } from "../core/tasks.js";
import { milestoneInfo, PACE_LABELS } from "../core/insights.js";
import { esc, tile, scoreValue, scoreTone, progressBar, textBar, openModal, confirmDialog, options } from "../ui/dom.js";
import { barChart } from "../ui/charts.js";

const GOAL_STATUS = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", on_hold: "On Hold", cancelled: "Cancelled" };

export function renderQuarter(el, params) {
  const today = state.today;
  const cur = quarterOf(today);
  const qn = Math.min(4, Math.max(1, Number(params.get("q")) || cur.quarter));
  const year = Number(params.get("y")) || cur.year;
  const { start, end } = quarterRange(qn, year);
  const s = scoreQuarter(state.tasks, state.goals, qn, year, state.cfg, { today, timeZone: state.timeZone });
  const goals = state.goals.filter((g) => g.quarter === qn && g.year === year);
  const goalIds = new Set(goals.map((g) => g.id));
  const ms = state.milestones.filter((m) => goalIds.has(m.goal_id) || (m.deadline && m.deadline >= start && m.deadline <= end));
  const msDone = ms.filter((m) => m.status === "completed"), msLeft = ms.filter((m) => !["completed", "cancelled"].includes(m.status));
  const horizon = addDays(today, 14);
  const approaching = [
    ...state.tasks.filter((t) => !isClosed(t) && t.due_date && t.due_date >= today && t.due_date <= horizon && t.due_date <= end)
      .map((t) => ({ date: t.due_date, title: t.title, kind: "Task" })),
    ...msLeft.filter((m) => m.deadline >= today && m.deadline <= horizon).map((m) => ({ date: m.deadline, title: m.title, kind: "Milestone" })),
    ...goals.filter((g) => g.deadline && g.deadline >= today && g.deadline <= horizon && g.status !== "completed").map((g) => ({ date: g.deadline, title: g.title, kind: "Goal" })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const prev = qn === 1 ? { q: 4, y: year - 1 } : { q: qn - 1, y: year };
  const next = qn === 4 ? { q: 1, y: year + 1 } : { q: qn + 1, y: year };
  const t = s.totals;

  el.innerHTML = `
    <header class="li-view-head">
      <div><span class="card-label">Quarter · ${esc(formatRange(start, end))}</span><h2 class="li-h2">Q${qn} ${year}</h2></div>
      <div class="li-nav-btns">
        <a class="heat-arrow" href="#/quarter?q=${prev.q}&y=${prev.y}" aria-label="Previous quarter">&#8249;</a>
        ${[1, 2, 3, 4].map((n) => `<a class="li-btn small${n === qn ? " on" : ""}" href="#/quarter?q=${n}&y=${year}" aria-current="${n === qn}">Q${n}</a>`).join("")}
        <a class="heat-arrow" href="#/quarter?q=${next.q}&y=${next.y}" aria-label="Next quarter">&#8250;</a>
      </div>
    </header>
    <div class="li-kpis">
      ${tile("Quarter progress", s.goal_progress == null ? "—" : `${Math.round(s.goal_progress)}<small>%</small>`, `Average of ${goals.length} goal${goals.length === 1 ? "" : "s"} · ${s.time_elapsed_pct}% of time elapsed`, scoreTone(s.goal_progress))}
      ${tile("Quarterly score", scoreValue(s.score), "Weekly average + goal progress", scoreTone(s.score))}
      ${tile("Tasks completed", String(t.completed), `of ${t.total} planned`)}
      ${tile("Completion rate", t.completion_rate == null ? "—" : `${t.completion_rate}<small>%</small>`, "", scoreTone(t.completion_rate))}
      ${tile("Avg weekly score", s.average_weekly_score == null ? "—" : String(Math.round(s.average_weekly_score)), "", scoreTone(s.average_weekly_score))}
      ${tile("Milestones", `${msDone.length}<small>/${ms.length}</small>`, `${msLeft.length} remaining`)}
    </div>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Goals</span><button type="button" class="li-btn small" id="li-add-goal">+ Goal</button></div>
      ${goals.length ? `<ul class="li-goals">${goals.map((g) => `<li>
          <pre class="li-textbar" aria-hidden="true">${textBar(g.percentage_complete)}</pre>
          <span class="li-goal-pct">${Math.round(g.percentage_complete)}%</span>
          <button type="button" class="li-goal-title" data-goal="${esc(g.id)}">${esc(g.title)}</button>
          ${progressBar(g.percentage_complete, g.title)}
          <span class="li-goal-meta">${esc(GOAL_STATUS[g.status])} · ${g.progress_mode === "milestones" ? `${state.milestones.filter((m) => m.goal_id === g.id).length} milestones` : `${Number(g.current_progress)} of ${Number(g.target)}`}${g.deadline ? ` · due ${esc(formatDay(g.deadline))}` : ""}</span>
        </li>`).join("")}</ul>` : `<p class="li-empty">No goals for Q${qn} ${year} yet.</p>`}
    </section>
    <section class="li-card">
      <div class="li-card-head"><span class="card-label">Weekly scores this quarter</span></div>
      ${barChart(s.weeks.map((w) => ({ label: formatDay(w.week_start, { month: "numeric", day: "numeric" }), value: w.score, key: w.week_start,
        tip: `Week of ${formatDay(w.week_start)}: ${w.score == null ? "no scored days" : "score " + w.score}` })), { aria: `Weekly scores in Q${qn} ${year}`, height: 120 })}
    </section>
    <div class="li-split">
      <section class="li-card">
        <div class="li-card-head"><span class="card-label">Milestones this quarter</span></div>
        ${ms.length ? `<ul class="li-mini">${[...msLeft, ...msDone].map((m) => { const info = milestoneInfo(m, state.tasks, today, state.timeZone);
          return `<li class="li-mini-ms"><a href="#/milestones/${esc(m.id)}">${m.status === "completed" ? "✓ " : ""}${esc(m.title)}</a>${progressBar(m.percentage_complete, m.title)}<span class="li-mini-r ${["behind", "overdue"].includes(info.pace) ? "warn" : ""}">${Math.round(m.percentage_complete)}% · ${esc(PACE_LABELS[info.pace])}</span></li>`; }).join("")}</ul>`
          : `<p class="li-empty">No milestones linked to this quarter.</p>`}
      </section>
      <section class="li-card">
        <div class="li-card-head"><span class="card-label">Deadlines approaching (14 days)</span></div>
        ${approaching.length ? `<ul class="li-mini">${approaching.map((a) => `<li><span>${esc(a.title)} <small class="li-muted">${a.kind}</small></span><span class="li-mini-r">${esc(formatDay(a.date))}</span></li>`).join("")}</ul>`
          : `<p class="li-empty">Nothing due in the next two weeks.</p>`}
      </section>
    </div>`;

  el.querySelector("#li-add-goal").addEventListener("click", () => openGoalForm({ quarter: qn, year }));
  el.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => openGoalForm(state.goals.find((g) => g.id === b.dataset.goal))));
  el.querySelector(".li-bc")?.addEventListener("click", (e) => {
    const c = e.target.closest("[data-key]");
    if (c) location.hash = `#/week?w=${c.dataset.key}`;
  });
}

export function openGoalForm(goal = {}) {
  const g = { progress_mode: "manual", target: 100, current_progress: 0, status: "not_started", ...goal };
  const editing = !!g.id;
  openModal({
    eyebrow: editing ? "Edit goal" : "New quarterly goal",
    title: editing ? g.title : `Q${g.quarter} ${g.year} goal`,
    wide: true,
    body: `
      <label class="li-field full">Title<input name="title" required maxlength="200" value="${esc(g.title || "")}"></label>
      <label class="li-field full">Description<textarea name="description" rows="2">${esc(g.description || "")}</textarea></label>
      <label class="li-field">Quarter<select name="quarter">${options([1, 2, 3, 4].map((n) => [n, "Q" + n]), g.quarter)}</select></label>
      <label class="li-field">Year<input type="number" name="year" min="2000" max="2100" value="${esc(g.year)}"></label>
      <label class="li-field">Deadline<input type="date" name="deadline" value="${esc(g.deadline || "")}"></label>
      <label class="li-field">Status<select name="status">${options(Object.entries(GOAL_STATUS), g.status)}</select></label>
      <label class="li-field full">Progress from<select name="progress_mode">${options([["manual", "A number I update (current ÷ target)"], ["milestones", "Its milestones (average %)"]], g.progress_mode)}</select></label>
      <label class="li-field" data-manual>Target<input type="number" name="target" min="0.01" step="any" value="${esc(g.target)}"></label>
      <label class="li-field" data-manual>Current progress<input type="number" name="current_progress" min="0" step="any" value="${esc(g.current_progress)}"></label>
      <label class="li-field full">Notes<textarea name="notes" rows="2">${esc(g.notes || "")}</textarea></label>`,
    extraButtons: editing ? `<button type="button" class="li-btn danger-ghost" data-del-goal>Delete</button>` : "",
    onReady(form) {
      const sync = () => form.querySelectorAll("[data-manual]").forEach((x) => { x.hidden = form.elements.progress_mode.value !== "manual"; });
      form.elements.progress_mode.addEventListener("change", sync);
      sync();
      form.querySelector("[data-del-goal]")?.addEventListener("click", async () => {
        if (await confirmDialog(`Delete goal "${g.title}"? Its milestones are kept.`)) await deleteGoal(g.id).then(() => toast("Goal deleted"), () => {});
      });
    },
    async onSubmit(v) {
      if (!v.title.trim()) throw new Error("Give the goal a title.");
      await saveGoal({ ...(editing ? { id: g.id } : {}), ...v, title: v.title.trim(), quarter: Number(v.quarter), year: Number(v.year),
        target: Number(v.target) || 100, current_progress: Number(v.current_progress) || 0, deadline: v.deadline || null });
      toast(editing ? "Goal saved" : "Goal added");
    },
  });
}

