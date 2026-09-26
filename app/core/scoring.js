// Transparent scoring. Every score comes with the components it was built
// from, so the app (and Claude, through the API) can show exactly why a day
// scored what it did. The formula is documented in docs/SCORING.md and in
// the app under Settings -> Scoring formula.
import { addDays, eachDay, quarterRange, weekRange, diffDays } from "./dates.js";
import { completedDay, wasOverdueOn } from "./tasks.js";

export const DEFAULT_SCORING = {
  // Daily score components (relative weights; components with no data are skipped).
  weights: { completion: 40, priority: 20, deadlines: 20, milestones: 10, time: 10 },
  // How much each priority counts in the priority component.
  priorityWeights: { low: 1, medium: 2, high: 3, urgent: 4 },
  // Minutes of logged work that earn full time credit for a day.
  dailyMinutesTarget: 240,
  // Points taken off a day for each task still overdue at the end of it.
  overduePenalty: 5,
  overduePenaltyCap: 25,
  // Weekly/monthly score = average daily score blended with consistency.
  period: { dailyAverageWeight: 70, consistencyWeight: 30, activeDaysPerWeek: 5 },
  // Quarterly score = average weekly score blended with goal progress.
  quarter: { weeklyAverageWeight: 50, goalProgressWeight: 50 },
  // Warnings.
  warnings: { deadlineDays: 2, milestoneDays: 14, quarterEndDays: 14, lowCompletionRate: 50 },
};

export const COMPONENT_LABELS = {
  completion: "Task completion",
  priority: "Priority-weighted completion",
  deadlines: "Deadlines met",
  milestones: "Milestone work",
  time: "Time worked",
};

function num(v, fallback, min = 0, max = 100000) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Default settings with the user's overrides applied (and sanitised). */
export function resolveScoring(overrides) {
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const d = DEFAULT_SCORING;
  const pick = (group, key, max = 1000) => num(o[group]?.[key], d[group][key], 0, max);
  return {
    weights: Object.fromEntries(Object.keys(d.weights).map((k) => [k, pick("weights", k)])),
    priorityWeights: Object.fromEntries(Object.keys(d.priorityWeights).map((k) => [k, pick("priorityWeights", k)])),
    dailyMinutesTarget: num(o.dailyMinutesTarget, d.dailyMinutesTarget, 0, 1440),
    overduePenalty: num(o.overduePenalty, d.overduePenalty, 0, 100),
    overduePenaltyCap: num(o.overduePenaltyCap, d.overduePenaltyCap, 0, 100),
    period: {
      dailyAverageWeight: pick("period", "dailyAverageWeight"),
      consistencyWeight: pick("period", "consistencyWeight"),
      activeDaysPerWeek: num(o.period?.activeDaysPerWeek, d.period.activeDaysPerWeek, 1, 7),
    },
    quarter: {
      weeklyAverageWeight: pick("quarter", "weeklyAverageWeight"),
      goalProgressWeight: pick("quarter", "goalProgressWeight"),
    },
    warnings: {
      deadlineDays: num(o.warnings?.deadlineDays, d.warnings.deadlineDays, 0, 60),
      milestoneDays: num(o.warnings?.milestoneDays, d.warnings.milestoneDays, 0, 365),
      quarterEndDays: num(o.warnings?.quarterEndDays, d.warnings.quarterEndDays, 0, 92),
      lowCompletionRate: num(o.warnings?.lowCompletionRate, d.warnings.lowCompletionRate, 0, 100),
    },
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Credit for one task: 1 when completed, otherwise its completion % (0-1). */
export function taskCredit(t) {
  if (t.status === "completed") return 1;
  return Math.max(0, Math.min(100, Number(t.completion_percentage) || 0)) / 100;
}

/** Weighted blend of parts [{ weight, value (0-100) | null }]; null parts are skipped. */
function blend(parts) {
  const used = parts.filter((p) => p.value != null && p.weight > 0);
  const w = used.reduce((s, p) => s + p.weight, 0);
  return w ? used.reduce((s, p) => s + p.weight * p.value, 0) / w : null;
}

/**
 * Scores one day. Tasks "belong" to the day in their `date` field.
 * Returns { date, score (0-100 or null), counts, minutes, components, penalty }.
 * `score` is null when nothing was planned or the day is in the future.
 */
export function scoreDay(allTasks, day, cfg, { today, timeZone } = {}) {
  const planned = allTasks.filter((t) => t.date === day && t.status !== "cancelled");
  const completed = planned.filter((t) => t.status === "completed");
  const counts = {
    total: planned.length,
    completed: completed.length,
    in_progress: planned.filter((t) => t.status === "in_progress").length,
    not_started: planned.filter((t) => t.status === "not_started").length,
  };
  const minutes = planned.reduce((s, t) => s + (Number(t.actual_minutes) || 0), 0);
  const overdueTasks = allTasks.filter((t) => wasOverdueOn(t, day, timeZone));
  const result = { date: day, score: null, counts, minutes, overdue: overdueTasks.length, components: [], penalty: 0 };
  if (today && day > today) return result;
  if (!planned.length) return result;

  const credit = planned.reduce((s, t) => s + taskCredit(t), 0);
  const pw = (t) => cfg.priorityWeights[t.priority] ?? 1;
  const pSum = planned.reduce((s, t) => s + pw(t), 0);
  const pCredit = planned.reduce((s, t) => s + pw(t) * taskCredit(t), 0);

  const due = allTasks.filter((t) => t.due_date === day && t.status !== "cancelled");
  const dueMet = due.filter((t) => { const d = completedDay(t, timeZone); return d && d <= t.due_date; });

  const linked = planned.filter((t) => t.milestone_id);
  const linkedCredit = linked.reduce((s, t) => s + taskCredit(t), 0);
  const timeLogged = planned.some((t) => t.actual_minutes != null && t.actual_minutes !== "");

  const c = [
    { key: "completion", value: (credit / planned.length) * 100,
      detail: `${counts.completed} of ${counts.total} done` + (credit > counts.completed ? ` (+ partial credit ${round1(credit - counts.completed)})` : "") },
    { key: "priority", value: pSum ? (pCredit / pSum) * 100 : null,
      detail: `${round1(pCredit)} of ${round1(pSum)} priority points` },
    { key: "deadlines", value: due.length ? (dueMet.length / due.length) * 100 : null,
      detail: due.length ? `${dueMet.length} of ${due.length} due today met on time` : "Nothing due this day (skipped)" },
    { key: "milestones", value: linked.length ? (linkedCredit / linked.length) * 100 : null,
      detail: linked.length ? `${round1(linkedCredit)} of ${linked.length} milestone tasks` : "No milestone tasks (skipped)" },
    { key: "time", value: timeLogged && cfg.dailyMinutesTarget > 0 ? Math.min(1, minutes / cfg.dailyMinutesTarget) * 100 : null,
      detail: timeLogged ? `${minutes} of ${cfg.dailyMinutesTarget} min target` : "No time logged (skipped)" },
  ].map((p) => ({ ...p, label: COMPONENT_LABELS[p.key], weight: cfg.weights[p.key] ?? 0,
                  value: p.value == null ? null : round1(p.value) }));

  const base = blend(c) ?? 0;
  const penalty = Math.min(cfg.overduePenaltyCap, overdueTasks.length * cfg.overduePenalty);
  result.components = c;
  result.base = round1(base);
  result.penalty = penalty;
  result.score = Math.round(Math.max(0, Math.min(100, base - penalty)));
  return result;
}

/**
 * Scores a range of days (a week, a month, or any span). Future days are
 * ignored. score = dailyAverageWeight x average daily score
 *                + consistencyWeight x (active days / target active days).
 * Active day = at least one planned task completed.
 */
export function scorePeriod(tasks, start, end, cfg, { today, timeZone } = {}) {
  const lastDay = today && end > today ? today : end;
  const days = eachDay(start, end).map((d) => scoreDay(tasks, d, cfg, { today, timeZone }));
  const elapsed = days.filter((d) => d.date <= lastDay);
  const scored = elapsed.filter((d) => d.score != null);
  const active = elapsed.filter((d) => d.counts.completed > 0).length;
  const avg = scored.length ? scored.reduce((s, d) => s + d.score, 0) / scored.length : null;
  const lengthDays = diffDays(start, end) + 1;
  const activeTarget = Math.max(1, Math.round(cfg.period.activeDaysPerWeek * lengthDays / 7));
  const consistency = Math.min(1, active / activeTarget) * 100;

  const inRange = tasks.filter((t) => t.date >= start && t.date <= end && t.status !== "cancelled");
  const totals = {
    total: inRange.length,
    completed: inRange.filter((t) => t.status === "completed").length,
    in_progress: inRange.filter((t) => t.status === "in_progress").length,
    not_started: inRange.filter((t) => t.status === "not_started").length,
    overdue: tasks.filter((t) => wasOverdueOn(t, lastDay, timeZone) && t.date <= end).length,
    minutes: inRange.reduce((s, t) => s + (Number(t.actual_minutes) || 0), 0),
  };
  totals.completion_rate = totals.total ? Math.round(totals.completed / totals.total * 100) : null;

  const score = avg == null ? null : Math.round(blend([
    { weight: cfg.period.dailyAverageWeight, value: avg },
    { weight: cfg.period.consistencyWeight, value: consistency },
  ]));
  const best = scored.reduce((b, d) => (!b || d.score > b.score ? d : b), null);
  return {
    start, end, score, days, totals,
    average_daily_score: avg == null ? null : round1(avg),
    active_days: active, active_days_target: activeTarget,
    consistency: round1(consistency),
    best_day: best ? { date: best.date, score: best.score } : null,
    // Days below 60, or planned days where under half the tasks got done.
    needs_improvement: elapsed.filter((d) => d.score != null && (d.score < 60 || d.counts.completed / d.counts.total < 0.5))
      .map((d) => ({ date: d.date, score: d.score })),
  };
}

export function scoreWeek(tasks, anyDayInWeek, cfg, opts) {
  const { start, end } = weekRange(anyDayInWeek);
  return scorePeriod(tasks, start, end, cfg, opts);
}

/**
 * Quarterly score = weeklyAverageWeight x average weekly score (weeks that
 * overlap the quarter, up to today) + goalProgressWeight x average
 * progress of that quarter's goals. A missing part is skipped.
 */
export function scoreQuarter(tasks, goals, quarter, year, cfg, { today, timeZone } = {}) {
  const { start, end } = quarterRange(quarter, year);
  const period = scorePeriod(tasks, start, end, cfg, { today, timeZone });
  const weeks = [];
  for (let w = weekRange(start).start; w <= end; w = addDays(w, 7)) {
    if (today && w > today) break;
    const s = scorePeriod(tasks, w, addDays(w, 6), cfg, { today, timeZone });
    weeks.push({ week_start: w, score: s.score });
  }
  const scoredWeeks = weeks.filter((w) => w.score != null);
  const weeklyAvg = scoredWeeks.length ? scoredWeeks.reduce((s, w) => s + w.score, 0) / scoredWeeks.length : null;
  const qGoals = goals.filter((g) => g.quarter === quarter && g.year === year && g.status !== "cancelled");
  const goalAvg = qGoals.length ? qGoals.reduce((s, g) => s + Number(g.percentage_complete || 0), 0) / qGoals.length : null;
  const score = blend([
    { weight: cfg.quarter.weeklyAverageWeight, value: weeklyAvg },
    { weight: cfg.quarter.goalProgressWeight, value: goalAvg },
  ]);
  const elapsed = today ? Math.max(0, Math.min(1, (diffDays(start, today) + 1) / (diffDays(start, end) + 1))) : null;
  return {
    quarter, year, start, end,
    score: score == null ? null : Math.round(score),
    average_weekly_score: weeklyAvg == null ? null : round1(weeklyAvg),
    goal_progress: goalAvg == null ? null : round1(goalAvg),
    time_elapsed_pct: elapsed == null ? null : Math.round(elapsed * 100),
    weeks, totals: period.totals, period,
  };
}

/** Plain-language description of the formula with the given settings. */
export function describeFormula(cfg) {
  const w = cfg.weights;
  return [
    `Daily score (0–100) = weighted average of: task completion ×${w.completion}, priority-weighted completion ×${w.priority}, ` +
      `deadlines met ×${w.deadlines}, milestone work ×${w.milestones}, time worked ×${w.time}; ` +
      `minus ${cfg.overduePenalty} points per overdue task (max ${cfg.overduePenaltyCap}).`,
    `A component with nothing to measure that day (e.g. nothing due, no time logged) is skipped and the other weights are scaled up.`,
    `Completed tasks earn full credit; unfinished tasks earn their completion % as partial credit. Priority weights: ` +
      Object.entries(cfg.priorityWeights).map(([k, v]) => `${k} ${v}`).join(", ") + `.`,
    `Time credit = logged minutes ÷ ${cfg.dailyMinutesTarget} min (capped at 100%).`,
    `Weekly / monthly score = ${cfg.period.dailyAverageWeight}% average daily score + ${cfg.period.consistencyWeight}% consistency ` +
      `(active days ÷ ${cfg.period.activeDaysPerWeek} per week). An active day has at least one completed task.`,
    `Quarterly score = ${cfg.quarter.weeklyAverageWeight}% average weekly score + ${cfg.quarter.goalProgressWeight}% average goal progress.`,
  ];
}
