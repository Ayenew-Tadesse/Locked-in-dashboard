// Milestone/goal progress, warnings and planning. Pure functions shared by
// the app and the API.
import { addDays, diffDays, dayOf, quarterOf, quarterRange, formatDay, relativeDay } from "./dates.js";
import { isOverdue, isClosed, sortTasks, PRIORITIES } from "./tasks.js";

const round = (n) => Math.round(n * 100) / 100;

/**
 * Mirrors the database triggers (see the migration): tasks-mode milestones
 * take progress from their related tasks; manual ones from current/target.
 * Used by demo mode, and to show fresh numbers before the database replies.
 */
export function computeMilestone(m, tasks) {
  const out = { ...m };
  if (m.progress_mode !== "manual") {
    const related = tasks.filter((t) => t.milestone_id === m.id);
    out.target = Math.max(1, related.filter((t) => t.status !== "cancelled").length);
    out.current_progress = related.filter((t) => t.status === "completed").length;
  }
  const target = Number(out.target) > 0 ? Number(out.target) : 100;
  out.percentage_complete = round(Math.min(100, (Number(out.current_progress) || 0) / target * 100));
  if (!["cancelled", "on_hold"].includes(out.status)) {
    if (out.percentage_complete >= 100) out.status = "completed";
    else if (out.status === "completed" && out.progress_mode !== "manual") out.status = "in_progress";
    else if (out.percentage_complete > 0 && out.status === "not_started") out.status = "in_progress";
  }
  out.completed_at = out.status === "completed" ? (m.completed_at || new Date().toISOString()) : null;
  return out;
}

export function computeGoal(g, milestones) {
  const out = { ...g };
  if (g.progress_mode === "milestones") {
    const ms = milestones.filter((m) => m.goal_id === g.id && m.status !== "cancelled");
    out.percentage_complete = ms.length ? round(ms.reduce((s, m) => s + Number(m.percentage_complete || 0), 0) / ms.length) : 0;
  } else {
    const target = Number(out.target) > 0 ? Number(out.target) : 100;
    out.percentage_complete = round(Math.min(100, (Number(out.current_progress) || 0) / target * 100));
  }
  if (!["cancelled", "on_hold"].includes(out.status)) {
    if (out.percentage_complete >= 100) out.status = "completed";
    else if (out.status === "completed" && g.progress_mode === "milestones") out.status = "in_progress";
    else if (out.percentage_complete > 0 && out.status === "not_started") out.status = "in_progress";
  }
  return out;
}

/**
 * Where a milestone stands: related task counts, and whether progress is
 * keeping pace with the time elapsed between its start and deadline.
 * pace: done | on_track | behind | overdue | no_deadline
 */
export function milestoneInfo(m, tasks, today, timeZone) {
  const related = tasks.filter((t) => t.milestone_id === m.id && t.status !== "cancelled");
  const done = related.filter((t) => t.status === "completed").length;
  const pct = Number(m.percentage_complete) || 0;
  const start = m.start_date || dayOf(m.created_at, timeZone) || today;
  let expected = null, pace = "no_deadline";
  if (m.status === "completed" || pct >= 100) pace = "done";
  else if (m.status === "cancelled") pace = "cancelled";
  else if (m.deadline) {
    if (m.deadline < today) pace = "overdue";
    else {
      const span = Math.max(1, diffDays(start, m.deadline));
      expected = Math.round(Math.max(0, Math.min(1, diffDays(start, today) / span)) * 100);
      // Allow a 10-point cushion before calling it behind.
      pace = pct + 10 < expected ? "behind" : "on_track";
    }
  }
  return {
    total_tasks: related.length, completed_tasks: done, remaining_tasks: related.length - done,
    overdue_tasks: related.filter((t) => isOverdue(t, today)).length,
    expected_pct: expected, pace,
    days_left: m.deadline ? diffDays(today, m.deadline) : null,
  };
}

export const PACE_LABELS = {
  done: "Done", on_track: "On track", behind: "Behind schedule", overdue: "Past deadline",
  no_deadline: "No deadline", cancelled: "Cancelled",
};

/**
 * Useful, low-noise warnings. Each: { id, level: danger|warn|info, text, route }.
 * One warning per kind (never one per task) to avoid alert fatigue.
 */
export function buildWarnings({ tasks, milestones, goals, today, cfg }) {
  const w = [];
  const overdue = tasks.filter((t) => isOverdue(t, today));
  if (overdue.length) {
    const first = sortTasks(overdue, today)[0];
    w.push({ id: `overdue:${today}:${overdue.length}`, level: "danger", route: "tasks?deadline=overdue",
      text: overdue.length === 1 ? `"${first.title}" is overdue (was due ${relativeDay(first.due_date, today)}).`
        : `${overdue.length} tasks are overdue, including "${first.title}".` });
  }
  const soon = tasks.filter((t) => !isClosed(t) && t.due_date && t.due_date >= today && t.due_date <= addDays(today, cfg.warnings.deadlineDays));
  if (soon.length) {
    const first = sortTasks(soon, today)[0];
    w.push({ id: `soon:${today}:${soon.length}`, level: "warn", route: "tasks?deadline=next7",
      text: soon.length === 1 ? `"${first.title}" is due ${relativeDay(first.due_date, today)}.`
        : `${soon.length} tasks are due in the next ${cfg.warnings.deadlineDays} days.` });
  }
  const msSoon = milestones.filter((m) => !["completed", "cancelled"].includes(m.status) && m.deadline &&
    m.deadline <= addDays(today, cfg.warnings.milestoneDays));
  for (const m of msSoon.slice(0, 2)) {
    const pct = Math.round(Number(m.percentage_complete) || 0);
    w.push({ id: `ms:${m.id}:${today}`, level: m.deadline < today ? "danger" : "warn", route: `milestones/${m.id}`,
      text: m.deadline < today ? `Milestone "${m.title}" passed its deadline at ${pct}%.`
        : `Milestone "${m.title}" is due ${relativeDay(m.deadline, today)} and is ${pct}% complete.` });
  }
  const q = quarterOf(today);
  const qEnd = quarterRange(q.quarter, q.year).end;
  const left = diffDays(today, qEnd);
  const openGoals = goals.filter((g) => g.quarter === q.quarter && g.year === q.year && !["completed", "cancelled"].includes(g.status));
  if (left <= cfg.warnings.quarterEndDays && openGoals.length) {
    w.push({ id: `qend:${q.year}Q${q.quarter}`, level: "info", route: "quarter",
      text: `Q${q.quarter} ends in ${left} day${left === 1 ? "" : "s"} with ${openGoals.length} goal${openGoals.length === 1 ? "" : "s"} still open.` });
  }
  const recent = tasks.filter((t) => t.date >= addDays(today, -7) && t.date < today && t.status !== "cancelled");
  if (recent.length >= 5) {
    const rate = Math.round(recent.filter((t) => t.status === "completed").length / recent.length * 100);
    if (rate < cfg.warnings.lowCompletionRate) {
      w.push({ id: `low:${today}`, level: "warn", route: "analytics",
        text: `Only ${rate}% of last week's tasks were completed. Consider planning fewer, smaller tasks.` });
    }
  }
  return w;
}

/**
 * Suggests a plan for `day` from unfinished work: overdue first, then by
 * priority and deadline, until the daily time target is reached (unestimated
 * tasks count as 30 minutes).
 */
export function planForDay(tasks, day, cfg, today) {
  const candidates = sortTasks(tasks.filter((t) => !isClosed(t) && (t.date <= day || (t.due_date && t.due_date <= addDays(day, 2)))), today)
    .sort((a, b) =>
      (isOverdue(b, today) - isOverdue(a, today)) ||
      ((PRIORITIES[b.priority]?.rank || 0) - (PRIORITIES[a.priority]?.rank || 0)) ||
      (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const budget = cfg.dailyMinutesTarget || 240;
  const plan = [], later = [];
  let used = 0;
  for (const t of candidates) {
    const est = Number(t.estimated_minutes) || 30;
    const remaining = Math.round(est * (1 - (Number(t.completion_percentage) || 0) / 100)) || est;
    // Fill in priority order until the budget is used up (the last task may run
    // over); overdue and urgent work is always included.
    if (used < budget || isOverdue(t, today) || t.priority === "urgent") {
      plan.push({ id: t.id, title: t.title, priority: t.priority, due_date: t.due_date, minutes: remaining,
        reason: isOverdue(t, today) ? "overdue" : t.due_date && t.due_date <= day ? "due" : t.date < day ? "carried over" : "planned" });
      used += remaining;
    } else later.push({ id: t.id, title: t.title, priority: t.priority, due_date: t.due_date });
  }
  return { date: day, label: formatDay(day, { weekday: "long", month: "long", day: "numeric" }),
    planned_minutes: used, budget_minutes: budget, tasks: plan, deferred: later };
}
